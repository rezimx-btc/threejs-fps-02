// SANDLINE — a round-based tactical FPS in three.js. Boot, the one loop, and the
// wiring between the modules: a fixed 60 Hz simulation feeding a render at the
// display's rate. Vanguard (you + 3 bots) attacks; Ember (4 bots) defends the
// Foundry and the Crane Yard. Plant the charge or wipe the defence — first to 5.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap, buildGraph, MAP } from './map.js';
import { createAudio } from './audio.js';
import { WEAPONS, GRENADE } from './weapons.js';
import { createPlayer } from './player.js';
import { createActor } from './actors.js';
import { createBots, assignRound, updateBots, botCountAlive } from './bots.js';
import { raycastShot, hasLineOfSight, fireHitscan, createTracers, createGrenades, createObjective } from './combat.js';
import { createMatch, PHASE, BUY_SECONDS, START_MONEY } from './state.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createViewmodel } from './viewmodel.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// --- World and systems ---
const world = createMap(scene);
const graph = buildGraph();
const audio = createAudio();
const hud = createHud({ minimapWalls: world.minimapWalls, sites: MAP.sites });
const match = createMatch();
const player = createPlayer(world.colliders, MAP.attackerSpawn);
const bots = createBots(scene, createActor, graph, MAP.sites);
const objective = createObjective(MAP.sites);
const tracers = createTracers(scene);
const grenades = createGrenades(scene, world.colliders, world.shootables);
const viewmodel = createViewmodel(camera);
const input = createInput(renderer.domElement, onLockChange);
const shootables = world.shootables.slice();
for (const bot of bots) shootables.push(...bot.actor.hitMeshes);

// --- Mutable run state (kept in one place, here) ---
const body = player.state;
const markerHoldMs = shot ? 60000 : 110; // staged captures outlive the virtual-time budget
let time = 0;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let started = false;
let roundEndTimer = 0;
let roundOverlayShown = false;
let shakeAmp = 0;
let nextBeepAt = 0;
let buyOpen = false;
let buyMenu = null;
const seenEnemies = []; // {x, z, at} for the minimap
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _end = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _eye = new THREE.Vector3();

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shakeAmp > 0.001) {
    camera.position.x += (random() * 2 - 1) * shakeAmp;
    camera.position.y += (random() * 2 - 1) * shakeAmp;
    camera.rotation.z = (random() * 2 - 1) * shakeAmp * 0.4;
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// --- Round / match flow ---
function resetActors() {
  player.reset(MAP.attackerSpawn.x, MAP.attackerSpawn.z, 0);
  const attackers = bots.filter((b) => b.team === 'A');
  const defenders = bots.filter((b) => b.team === 'B');
  attackers.forEach((bot, i) => bot.actor.reset(-3 + i * 3, 13.5, 0));
  defenders.forEach((bot, i) => bot.actor.reset(-7 + i * 4.5, -14.5, Math.PI));
  assignRound(bots, random, match.round);
  objective.reset();
  buyOpen = false;
  nextBeepAt = 0;
}

function startMatch() {
  match.resetMatch();
  resetActors();
  match.startRound();
  hud.setScore(0, 0, 1);
  hud.setMoney(match.money);
  hud.setWeapon(WEAPONS.sidearm.name, 0);
  hud.setAmmo(12, 48, false);
  hud.setHealth(100);
  hud.showOverlay('buy');
  buyOpen = true;
  buyMenu.refresh(match.owned, match.money);
  hud.setObjective('Buy phase — press B to open the shop, then deploy.');
  viewmodel.setWeapon('sidearm');
  started = true;
}

function beginLive() {
  match.beginLive();
  buyOpen = false;
  hud.showOverlay('none');
  hud.setObjective('Plant the charge at A (Foundry) or B (Crane Yard) — or wipe the Ember team.');
  if (!shot) input.requestLock();
}

function showRoundOverlay(title, sub) {
  hud.showOverlay('round', { title, sub });
  roundOverlayShown = true;
  roundEndTimer = 3;
}

function endRound(winner, reason) {
  match.endRound(winner, reason);
  hud.setScore(match.winsA, match.winsB, match.round);
  hud.setMoney(match.money);
  if (winner === 'A') audio.roundWin();
  else audio.roundLose();
  if (match.phase === PHASE.MATCH_END) {
    showRoundOverlay(
      winner === 'A' ? 'VANGUARD TAKES THE ROUND' : 'EMBER TAKES THE ROUND',
      `${reason} — Match over: ${match.winsA}–${match.winsB}.`,
    );
  } else {
    showRoundOverlay(
      winner === 'A' ? 'VANGUARD TAKES THE ROUND' : 'EMBER TAKES THE ROUND',
      `${reason} — next round in a moment. +$${winner === 'A' ? '3,250' : '1,900'}.`,
    );
  }
  if (input.locked) input.exitLock();
}

function checkRoundEnd() {
  if (match.phase !== PHASE.LIVE) return;
  const attackersAlive = botCountAlive(bots, 'A') + (body.alive ? 1 : 0);
  const defendersAlive = botCountAlive(bots, 'B');
  if (defendersAlive === 0) endRound('A', 'Ember team eliminated.');
  else if (attackersAlive === 0) endRound('B', 'Vanguard eliminated.');
}

function onPlayerDeath(killerName) {
  match.deaths += 1;
  match.addFeed(`${killerName} ▸ You`, 'B');
  if (input.locked) input.exitLock();
  hud.setObjective('You are down — your squad fights on.');
  checkRoundEnd();
}

// --- Shooting ---
function currentWeapon() {
  return { def: WEAPONS[match.current], state: match.weapons[match.current] };
}

function shoot(nowMs) {
  if (match.phase !== PHASE.LIVE || !body.alive) return;
  const { def, state } = currentWeapon();
  if (state.reloading > 0 || nowMs - state.lastShot < def.rateMs) return;
  if (state.mag <= 0) {
    audio.dryFire();
    state.lastShot = nowMs;
    return;
  }
  state.lastShot = nowMs;
  state.mag -= 1;
  scene.updateMatrixWorld(true); // meshes moved since the last render (staged shots)
  _origin.copy(camera.position);
  const results = fireHitscan({
    origin: _origin,
    yaw: body.yaw,
    pitch: body.pitch,
    def,
    spread: def.spread,
    random,
    shootables,
    moving: player.groundSpeed() > 1.5,
  });
  _dir.set(-Math.sin(body.yaw) * Math.cos(body.pitch), Math.sin(body.pitch), -Math.cos(body.yaw) * Math.cos(body.pitch));
  _muzzle.copy(camera.position).addScaledVector(_dir, 0.6);
  _muzzle.y -= 0.12;
  let anyHit = false;
  for (const result of results) {
    const end = result.hit ? result.hit.point : _end.copy(_origin).addScaledVector(_dir, 60);
    tracers.add(_muzzle, end);
    if (!result.hit) continue;
    anyHit = true;
    if (result.hit.actor) {
      const victim = result.hit.actor;
      const died = victim.damage(result.damage);
      result.killed = died;
      if (died) {
        match.awardKill();
        match.addFeed(`You ▸ ${victim.name}${result.head ? ' (headshot)' : ''}`, 'A');
        hud.setMoney(match.money);
        audio.kill();
      } else {
        audio.hit();
      }
      hud.hitMarker(died, markerHoldMs);
      checkRoundEnd();
    }
  }
  if (!anyHit) { /* shot into the sky; the tracer still shows */ }
  audio.shot(def.kind);
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * def.recoil * 0.3);
  viewmodel.onShot();
  hud.setAmmo(state.mag, state.reserve, false);
  hud.setWeapon(def.name, match.grenades);
}

function reloadWeapon() {
  const { def, state } = currentWeapon();
  if (state.reloading > 0 || state.mag >= def.mag || state.reserve <= 0) return;
  state.reloading = def.reloadMs;
  audio.reload();
  viewmodel.onReload();
  hud.setAmmo(state.mag, state.reserve, true);
}

function throwGrenade() {
  if (match.phase !== PHASE.LIVE || !body.alive || match.grenades <= 0) return;
  _dir.set(-Math.sin(body.yaw) * Math.cos(body.pitch), Math.sin(body.pitch), -Math.cos(body.yaw) * Math.cos(body.pitch));
  _origin.copy(camera.position);
  if (grenades.throwGrenade(_origin, _dir, 14)) {
    match.grenades -= 1;
    audio.click();
    hud.setWeapon(WEAPONS[match.current].name, match.grenades);
  }
}

function onExplode(pos) {
  audio.explosion();
  const distToPlayer = Math.hypot(pos.x - body.position.x, pos.z - body.position.z);
  if (distToPlayer < 14) shakeAmp = Math.max(shakeAmp, 0.12 * (1 - distToPlayer / 14));
  const victims = [];
  if (body.alive) victims.push({ ref: 'player', pos: body.position, eye: body.eye });
  for (const bot of bots) if (bot.actor.alive) victims.push({ ref: bot.actor, pos: bot.actor.position, eye: bot.actor.eyeHeight });
  for (const victim of victims) {
    const dist = Math.hypot(pos.x - victim.pos.x, pos.y - victim.pos.y - 1, pos.z - victim.pos.z);
    if (dist > GRENADE.radius) continue;
    _eye.set(pos.x, pos.y + 0.2, pos.z);
    _chest.set(victim.pos.x, victim.pos.y + 1.1, victim.pos.z);
    if (!hasLineOfSight(_eye, _chest, world.shootables)) continue;
    const damage = GRENADE.damage * (1 - (dist / GRENADE.radius) * 0.75);
    if (victim.ref === 'player') {
      body.health -= damage;
      hud.setHealth(body.health);
      hud.damageFlash();
      audio.hurt();
      if (body.health <= 0) {
        body.health = 0;
        body.alive = false;
        onPlayerDeath('Spark Frag');
      }
    } else {
      const died = victim.ref.damage(damage);
      if (died) {
        match.addFeed(`Spark Frag ▸ ${victim.ref.name}`, 'A');
        checkRoundEnd();
      }
    }
  }
}

// Bot fire: a ray from the bot's eye toward where it last saw its target, with
// spread. The same raycast the player uses, so walls stop bot bullets too.
function fireBotShot(bot, spread) {
  const actor = bot.actor;
  scene.updateMatrixWorld(true);
  actor.eyePos(_origin);
  _dir.copy(bot.targetPos).sub(_origin).normalize();
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  const hit = raycastShot(_origin, _dir, shootables, 60);
  _muzzle.copy(_origin).addScaledVector(_dir, 0.6);
  const end = hit ? hit.point : _end.copy(_origin).addScaledVector(_dir, 55);
  tracers.add(_muzzle, end);
  audio.shot('carbine');
  if (shot) return; // staged captures: tracers and sound, but no damage
  if (!hit || !hit.actor) return;
  if (hit.actor.team === bot.team) return; // never shoot a teammate through a lane
  const damage = 24 * (hit.part === 'head' ? 2.2 : 1) * (hit.distance > 30 ? 0.7 : 1);
  const died = hit.actor.damage(damage);
  if (died) {
    match.addFeed(`${bot.actor.name} ▸ ${hit.actor.name}`, bot.team);
    checkRoundEnd();
  }
}

// The player is not an actor object, so bot shots at the player resolve here.
function fireBotShotAtPlayer(bot, spread) {
  const actor = bot.actor;
  scene.updateMatrixWorld(true);
  actor.eyePos(_origin);
  _chest.set(body.position.x, body.position.y + 1.1, body.position.z);
  _dir.copy(_chest).sub(_origin).normalize();
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  const hit = raycastShot(_origin, _dir, shootables, 60);
  _muzzle.copy(_origin).addScaledVector(_dir, 0.6);
  const end = hit ? hit.point : _end.copy(_origin).addScaledVector(_dir, 55);
  tracers.add(_muzzle, end);
  audio.shot('carbine');
  if (shot) return; // staged captures: tracers and sound, but no damage
  if (!hit) return;
  // A wall between the bot and the player stops the bullet.
  if (hit.distance < _origin.distanceTo(_chest) - 0.6) return;
  if (!body.alive) return;
  const damage = 24 * (hit.part === 'head' ? 2.2 : 1) * (hit.distance > 30 ? 0.7 : 1);
  body.health -= damage;
  hud.setHealth(body.health);
  hud.damageFlash();
  audio.hurt();
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    onPlayerDeath(bot.actor.name);
  }
}

// --- Bot context: the world the AI reads each step ---
function botContext() {
  return {
    time,
    random,
    graph,
    sites: MAP.sites,
    colliders: world.colliders,
    player,
    planted: objective.state.planted,
    plantPos: objective.state.planted ? objective.state.plantPos : null,
    hasLineOfSight: (from, to) => hasLineOfSight(from, to, world.shootables),
    fireBotShot: (bot, spread) => {
      if (bot.target === 'player') fireBotShotAtPlayer(bot, spread);
      else fireBotShot(bot, spread);
    },
    onDefused: () => {
      if (match.phase === PHASE.LIVE) endRound('B', 'Charge defused.');
    },
  };
}

// --- HUD wiring ---
hud.onPlay(() => {
  if (shot) return;
  audio.ensure();
  if (match.phase === PHASE.MENU || match.phase === PHASE.MATCH_END) startMatch();
  else if (match.phase === PHASE.BUY || match.phase === PHASE.LIVE) input.requestLock();
});
hud.onResume(() => {
  if (!shot) input.requestLock();
});
hud.onAgain(() => {
  if (shot) return;
  audio.ensure();
  startMatch();
  input.requestLock();
});
buyMenu = hud.buildBuyMenu((id) => {
  const result = match.buy(id);
  if (result === 'ok') {
    audio.buy();
    if (WEAPONS[id]) {
      viewmodel.setWeapon(WEAPONS[id].kind);
      hud.setWeapon(WEAPONS[id].name, match.grenades);
      hud.setAmmo(match.weapons[id].mag, match.weapons[id].reserve, false);
    }
    hud.setWeapon(WEAPONS[match.current].name, match.grenades);
  } else {
    audio.dryFire();
  }
  hud.setMoney(match.money);
  buyMenu.refresh(match.owned, match.money);
}, () => {
  buyOpen = false;
  hud.showOverlay('none');
  if (!shot) input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    if (match.phase === PHASE.MENU) hud.showOverlay('none');
    else if (!buyOpen) hud.showOverlay('none');
  } else if (match.phase === PHASE.LIVE || match.phase === PHASE.BUY) {
    if (buyOpen) hud.showOverlay('buy');
    else hud.showOverlay('paused');
  }
}

function toggleBuy() {
  if (match.phase !== PHASE.BUY) return;
  buyOpen = !buyOpen;
  if (buyOpen) {
    buyMenu.refresh(match.owned, match.money);
    hud.showOverlay('buy');
    input.exitLock();
  } else {
    hud.showOverlay('none');
    input.requestLock();
  }
}

// --- Fixed-step simulation ---
function step(dt) {
  time += dt;
  elapsed += dt;
  shakeAmp = Math.max(0, shakeAmp - dt * 0.5);

  if (match.phase === PHASE.BUY) {
    match.timer -= dt;
    if (match.timer <= 0) beginLive();
  } else if (match.phase === PHASE.LIVE) {
    match.timer -= dt;
    if (match.timer <= 0 && !objective.state.planted) {
      endRound('B', 'Time expired — the charge was never planted.');
    }
  }

  if (match.phase === PHASE.ROUND_END || match.phase === PHASE.MATCH_END) {
    roundEndTimer -= dt;
    if (roundEndTimer <= 0 && roundOverlayShown) {
      roundOverlayShown = false;
      if (match.phase === PHASE.MATCH_END) {
        hud.showOverlay('match', {
          title: match.matchWinner === 'A' ? 'VANGUARD WINS THE MATCH' : match.matchWinner === 'B' ? 'EMBER WINS THE MATCH' : 'DRAW',
          sub: `Final score ${match.winsA}–${match.winsB}. The yard is yours to run again.`,
          stats: `Kills ${match.kills} · Deaths ${match.deaths} · $${match.money.toLocaleString('en-US')} banked`,
        });
      } else {
        match.nextRound();
        resetActors();
        match.startRound();
        hud.setScore(match.winsA, match.winsB, match.round);
        hud.setMoney(match.money);
        hud.setWeapon(WEAPONS[match.current].name, match.grenades);
        const w = match.weapons[match.current];
        hud.setAmmo(w.mag, w.reserve, false);
        hud.setHealth(100);
        buyOpen = true;
        buyMenu.refresh(match.owned, match.money);
        hud.showOverlay('buy');
        hud.setObjective('Buy phase — press B to open the shop, then deploy.');
      }
    }
  }

  // Player movement and weapon timers.
  player.step(dt, input.keys);
  const { def, state } = currentWeapon();
  if (state.reloading > 0) {
    state.reloading -= dt * 1000;
    if (state.reloading <= 0) {
      state.reloading = 0;
      const need = def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
      hud.setAmmo(state.mag, state.reserve, false);
    }
  }

  // Objective: planting, and the planted charge's countdown + beeps.
  if (match.phase === PHASE.LIVE && body.alive) {
    const result = objective.step(dt, {
      playerX: body.position.x,
      playerZ: body.position.z,
      holdingPlant: input.keys.has('KeyE'),
      hasCharge: match.hasCharge,
    });
    if (result === 'planted') {
      match.hasCharge = false;
      match.money += 300;
      match.addFeed('You planted the charge', 'A');
      hud.setMoney(match.money);
      audio.plantBeep(true);
      hud.setObjective('CHARGE PLANTED — defend it until it blows!');
      nextBeepAt = time + 1;
    } else if (result === 'detonated') {
      onExplode(objective.state.plantPos);
      endRound('A', 'Charge detonated at the site.');
    }
    if (objective.state.planted && time >= nextBeepAt) {
      audio.plantBeep(false);
      nextBeepAt = time + Math.max(0.25, objective.state.plantTimeLeft / 40);
    }
  }

  // Bots move and fight in buy and live phases.
  if (match.phase === PHASE.BUY || match.phase === PHASE.LIVE) {
    updateBots(bots, dt, botContext());
  }

  grenades.step(dt, onExplode);
  tracers.step(dt);
  viewmodel.step(dt);

  // Track enemies the player can see, for the minimap.
  for (const bot of bots) {
    if (bot.team !== 'B' || !bot.actor.alive) continue;
    camera.getWorldPosition(_eye);
    bot.actor.chestPos(_chest);
    if (hasLineOfSight(_eye, _chest, world.shootables)) {
      const found = seenEnemies.find((e) => e.bot === bot);
      if (found) {
        found.x = bot.actor.position.x;
        found.z = bot.actor.position.z;
        found.at = time;
      } else {
        seenEnemies.push({ bot, x: bot.actor.position.x, z: bot.actor.position.z, at: time });
      }
    }
  }

  // HUD refresh.
  hud.setTimer(match.timer);
  hud.setPlant(
    match.phase === PHASE.LIVE && objective.state.plantProgress > 0 && !objective.state.planted
      ? objective.state.plantProgress
      : objective.state.planted
        ? 1 - objective.state.plantTimeLeft / 40
        : null,
    objective.state.planted ? 'CHARGE — detonation in progress' : 'PLANTING… hold E',
  );
  const spreadPx = 6 + (def.spread + player.groundSpeed() * 0.004) * 900;
  hud.setCrosshair(Math.min(34, spreadPx));
  hud.renderFeed(match.feed);
  const teammates = bots.filter((b) => b.team === 'A' && b.actor.alive).map((b) => ({ x: b.actor.position.x, z: b.actor.position.z }));
  hud.drawMinimap(body.position, body.yaw, teammates, seenEnemies, time);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (started && match.phase !== PHASE.MENU) player.look(look.x, look.y);
    if (input.keys.has('KeyB')) {
      toggleBuy();
      input.keys.delete('KeyB');
    }
    if (match.phase === PHASE.LIVE && body.alive) {
      const { def } = currentWeapon();
      const wantFire = def.auto ? input.firing : input.takeFiringEdge();
      if (wantFire) shoot(performance.now());
      if (input.keys.has('KeyR')) reloadWeapon();
      if (input.keys.has('KeyG')) {
        throwGrenade();
        input.keys.delete('KeyG');
      }
      const digitMap = { Digit1: 'carbine', Digit2: 'dmr', Digit3: 'shotgun', Digit4: 'sidearm' };
      for (const code of Object.keys(digitMap)) {
        if (input.keys.has(code)) {
          const id = digitMap[code];
          if (match.owned.includes(id) && match.current !== id) {
            match.selectWeapon(id);
            viewmodel.setWeapon(WEAPONS[id].kind);
            hud.setWeapon(WEAPONS[id].name, match.grenades);
            const w = match.weapons[id];
            hud.setAmmo(w.mag, w.reserve, w.reloading > 0);
            audio.click();
          }
          input.keys.delete(code);
        }
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

// --- Deterministic captures: stage a frame, render twice, freeze. ---
function runShot(name) {
  hud.showOverlay('none');
  if (name === 'start') {
    body.position.set(0, 0, 12);
    body.yaw = -0.12;
    body.pitch = 0.01;
    match.timer = BUY_SECONDS;
    settle(20);
    hud.showOverlay('start');
    hud.setHealth(100);
    hud.setAmmo(12, 48, false);
    hud.setWeapon('P9 Sidearm', 0);
    hud.setMoney(800);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS);
  } else if (name === 'play') {
    startMatch();
    match.money = 5400;
    match.buy('carbine');
    match.grenades = 1;
    match.money = 2700;
    beginLive();
    hud.showOverlay('none');
    body.position.set(2.5, 0, 6);
    body.yaw = 0;
    body.pitch = 0;
    // Hold one defender still in the lane east of the mid pillar, so the staged
    // shots land on a visible target instead of a bot that walked away.
    const defender = bots.find((b) => b.team === 'B');
    defender.actor.reset(3.5, -3, Math.PI);
    defender.state = 'hold';
    defender.path = [];
    defender.pathIndex = 0;
    defender.holdNode = 5;
    defender.holdUntil = 1e9;
    const mate = bots.find((b) => b.team === 'A');
    mate.actor.reset(-3.5, 7, 0);
    settle(4);
    const target = new THREE.Vector3();
    for (let round = 0; round < 3; round += 1) {
      defender.actor.chestPos(target);
      if (round === 2) target.y = 1.58; // third shot goes for the head
      aimAt(target);
      shoot(1000 + round * 200);
      settle(2);
    }
    settle(6);
    hud.setMoney(match.money);
    hud.setHealth(100);
  } else if (name === 'buy') {
    startMatch();
    buyMenu.refresh(match.owned, match.money);
    hud.showOverlay('buy');
    body.position.set(0, 0, 13);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
  } else if (name === 'end') {
    startMatch();
    beginLive();
    match.winsA = 2;
    match.winsB = 1;
    match.round = 3;
    match.kills = 7;
    endRound('A', 'Ember team eliminated.');
    settle(5);
  }
  hud.setScore(match.winsA, match.winsB, match.round);
  hud.setMoney(match.money);
  hud.setTimer(match.timer);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Menu is the opening state; the player starts the match from it.
hud.setHealth(100);
hud.setAmmo(12, 48, false);
hud.setWeapon('P9 Sidearm', 0);
hud.setMoney(START_MONEY);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS);
hud.setObjective('Plant the charge at A (Foundry) or B (Crane Yard) — or wipe the Ember team.');
hud.showOverlay('start');
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
