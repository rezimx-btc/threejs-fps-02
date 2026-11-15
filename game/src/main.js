// BREAKLINE — a 5v5 round-based tactical FPS in three.js. Boot, the one loop, and
// the wiring between the modules: a fixed 60 Hz simulation feeding a render at the
// display's rate. Kestrel (you + 4 bots) attacks; Vulture (5 bots) defends the
// Depot and the Silos at the Kestrel Terminal. Plant the charge or wipe the
// defence — first to 5 rounds takes the match. Defenders can defuse a planted
// charge, so a plant is never safe until it blows.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap, buildGraph, MAP } from './map.js';
import { createAudio } from './audio.js';
import { WEAPONS, GRENADE, DEFUSE_SECONDS } from './weapons.js';
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
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 180);
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
let nextDefuseBeepAt = 0;
let buyOpen = false;
let buyMenu = null;
const seenEnemies = []; // {x, z, at} for the minimap
const botStepAt = new Map(); // bot -> last footstep time
let playerStepAcc = 0;
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
  // ADS narrows the field of view; it eases, it never snaps.
  const targetFov = body.aiming ? 57 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.18;
    camera.updateProjectionMatrix();
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
  attackers.forEach((bot, i) => bot.actor.reset(-4 + i * 2, 16.5, 0));
  defenders.forEach((bot, i) => bot.actor.reset(-8 + i * 4, -16.5, Math.PI));
  const plan = assignRound(bots, random, match.round, (line) => match.addCallout(line));
  match.plan = plan;
  hud.setPlan(`Hit ${plan.site} — ${plan.fake} fake, then commit. First to 5.`);
  objective.reset();
  buyOpen = false;
  nextBeepAt = 0;
  nextDefuseBeepAt = 0;
}

function startMatch() {
  match.resetMatch();
  resetActors();
  match.startRound();
  hud.setScore(0, 0, 1);
  hud.setMoney(match.money);
  hud.setWeapon(WEAPONS.sidearm.name, 0);
  hud.setAmmo(12, 48, false);
  hud.setHealth(100, 0);
  hud.showOverlay('buy');
  buyOpen = true;
  buyMenu.refresh(match.owned, match.money, match.armor, match.hasHelmet, match.grenades);
  hud.setObjective('Buy phase — press B to open the shop, then deploy.');
  viewmodel.setWeapon('sidearm');
  started = true;
}

function beginLive() {
  match.beginLive();
  buyOpen = false;
  hud.showOverlay('none');
  hud.setObjective('Plant the charge at A (Depot) or B (Silos) — or wipe the Vulture team.');
  if (!shot) input.requestLock();
}

function scoreboardRows() {
  const rows = [{ name: 'You', team: 'A', kills: match.kills, alive: body.alive }];
  for (const bot of bots) {
    rows.push({
      name: bot.actor.name,
      team: bot.team,
      kills: match.killsBy[bot.actor.name] || 0,
      alive: bot.actor.alive,
    });
  }
  return rows.sort((a, b) => b.kills - a.kills || (a.team < b.team ? -1 : 1));
}

function scoreboardHtml() {
  return scoreboardRows()
    .map((r) => `<div>${r.name} — ${r.kills} kill${r.kills === 1 ? '' : 's'}${r.alive ? '' : ' (down)'}</div>`)
    .join('');
}

function showRoundOverlay(title, sub) {
  hud.showOverlay('round', { title, sub, board: scoreboardHtml() });
  roundOverlayShown = true;
  roundEndTimer = 4;
}

function endRound(winner, reason) {
  match.endRound(winner, reason);
  hud.setScore(match.winsA, match.winsB, match.round);
  hud.setMoney(match.money);
  if (winner === 'A') audio.roundWin();
  else audio.roundLose();
  const mvp = match.mvp();
  const mvpLine = mvp ? ` MVP: ${mvp.name} (${mvp.kills}).` : '';
  if (match.phase === PHASE.MATCH_END) {
    showRoundOverlay(
      winner === 'A' ? 'KESTREL TAKES THE ROUND' : 'VULTURE TAKES THE ROUND',
      `${reason} — Match over: ${match.winsA}–${match.winsB}.${mvpLine}`,
    );
  } else {
    showRoundOverlay(
      winner === 'A' ? 'KESTREL TAKES THE ROUND' : 'VULTURE TAKES THE ROUND',
      `${reason} — next round in a moment. +$${winner === 'A' ? '3,250' : '1,900'}.${mvpLine}`,
    );
  }
  if (input.locked) input.exitLock();
}

function checkRoundEnd() {
  if (match.phase !== PHASE.LIVE) return;
  const attackersAlive = botCountAlive(bots, 'A') + (body.alive ? 1 : 0);
  const defendersAlive = botCountAlive(bots, 'B');
  if (defendersAlive === 0) endRound('A', 'Vulture team eliminated.');
  else if (attackersAlive === 0) endRound('B', 'Kestrel eliminated.');
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
  // Recoil climbs while a burst runs and settles when the trigger rests: the
  // climb term grows with consecutive shots and resets after 0.6 s of silence.
  if (nowMs - state.lastShot > 600) state.shotsFired = 0;
  state.lastShot = nowMs;
  state.mag -= 1;
  state.shotsFired += 1;
  match.shotsFired += 1;
  scene.updateMatrixWorld(true); // meshes moved since the last render (staged shots)
  _origin.copy(camera.position);
  const burstShots = state.shotsFired;
  const spread = body.aiming ? def.adsSpread : def.spread;
  const results = fireHitscan({
    origin: _origin,
    yaw: body.yaw,
    pitch: body.pitch,
    def,
    spread,
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
      match.shotsHit += 1;
      const victim = result.hit.actor;
      const died = victim.damage(result.damage);
      result.killed = died;
      if (died) {
        match.awardKill('You');
        match.recordBotKill('You');
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
  if (!anyHit) { /* shot into the night; the tracer still shows */ }
  audio.shot(def.kind);
  // Kick: the base recoil plus a climb that grows through the burst.
  const climb = def.climb * Math.min(burstShots, 12);
  player.recoil(def.recoil * (0.9 + random() * 0.2) + climb, (random() * 2 - 1) * def.recoil * 0.3);
  viewmodel.onShot();
  hud.setAmmo(state.mag, state.reserve, false);
  hud.setWeapon(def.name, match.grenades);
}

function reloadWeapon() {
  const { def, state } = currentWeapon();
  if (state.reloading > 0 || state.mag >= def.mag || state.reserve <= 0) return;
  state.reloading = def.reloadMs;
  state.shotsFired = 0;
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

function throwBotGrenade(actor, tx, tz) {
  _origin.set(actor.position.x, actor.position.y + 1.4, actor.position.z);
  _dir.set(tx - actor.position.x, 0, tz - actor.position.z).normalize();
  grenades.throwGrenade(_origin, _dir, 12);
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
      const died = player.damage(damage);
      hud.setHealth(body.health, body.armor);
      hud.damageFlash();
      audio.hurt();
      if (died) onPlayerDeath('Spark Frag');
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
    match.recordBotKill(bot.actor.name);
    checkRoundEnd();
  }
}

// The player is not an actor object, so bot shots at the player resolve here.
// A headshot is halved by the Kevlar helmet; the HUD shows which way the shot
// came from, so the player can turn on the shooter.
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
  const isHead = hit.part === 'head';
  let damage = 24 * (isHead ? 2.2 : 1) * (hit.distance > 30 ? 0.7 : 1);
  if (isHead && match.hasHelmet) damage *= 0.5;
  const died = player.damage(damage);
  // Direction indicator: the shooter's bearing relative to where the player looks.
  const dx = actor.position.x - body.position.x;
  const dz = actor.position.z - body.position.z;
  const bearing = Math.atan2(dx, dz);
  const facing = Math.atan2(-Math.sin(body.yaw), -Math.cos(body.yaw));
  let rel = ((bearing - facing) * 180) / Math.PI;
  rel = ((rel + 540) % 360) - 180;
  hud.damageDirection(rel);
  hud.setHealth(body.health, body.armor);
  hud.damageFlash();
  audio.hurt();
  if (died) onPlayerDeath(bot.actor.name);
}

// --- Bot context: the world the AI reads each step ---
const botCtx = {
  time: 0,
  random,
  graph,
  sites: MAP.sites,
  colliders: world.colliders,
  player,
  planted: false,
  plantPos: null,
  plantSite: null,
  defuseBot: null,
  hasLineOfSight: (from, to) => hasLineOfSight(from, to, world.shootables),
  fireBotShot: (bot, spread) => {
    if (bot.target === 'player') fireBotShotAtPlayer(bot, spread);
    else fireBotShot(bot, spread);
  },
  throwBotGrenade: (actor, tx, tz) => throwBotGrenade(actor, tx, tz),
  onPlantCall: (line) => match.addCallout(line),
  onRotateCall: (line) => match.addCallout(line),
};

function botContext() {
  botCtx.time = time;
  botCtx.planted = objective.state.planted;
  botCtx.plantPos = objective.state.planted ? objective.state.plantPos : null;
  botCtx.plantSite = objective.state.plantSite;
  botCtx.defuseBot = null; // refreshed by updateBots every step
  return botCtx;
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
    hud.setHealth(body.health, match.armor);
    body.armor = match.armor;
  } else {
    audio.dryFire();
  }
  hud.setMoney(match.money);
  buyMenu.refresh(match.owned, match.money, match.armor, match.hasHelmet, match.grenades);
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
    buyMenu.refresh(match.owned, match.money, match.armor, match.hasHelmet, match.grenades);
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
        const mvp = match.mvp();
        const accuracy = match.shotsFired > 0 ? Math.round((match.shotsHit / match.shotsFired) * 100) : 0;
        hud.showOverlay('match', {
          title: match.matchWinner === 'A' ? 'KESTREL WINS THE MATCH' : match.matchWinner === 'B' ? 'VULTURE WINS THE MATCH' : 'DRAW',
          sub: `Final score ${match.winsA}–${match.winsB}. The terminal is yours to run again.`,
          stats: `Kills ${match.kills} · Deaths ${match.deaths} · Accuracy ${accuracy}% · MVP ${mvp ? `${mvp.name} (${mvp.kills})` : '—'} · $${match.money.toLocaleString('en-US')} banked`,
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
        hud.setHealth(100, match.armor);
        body.armor = match.armor;
        buyOpen = true;
        buyMenu.refresh(match.owned, match.money, match.armor, match.hasHelmet, match.grenades);
        hud.showOverlay('buy');
        hud.setObjective('Buy phase — press B to open the shop, then deploy.');
      }
    }
  }

  // Player movement and weapon timers.
  player.step(dt, input.keys);
  body.aiming = input.aiming && match.phase === PHASE.LIVE && body.alive;
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

  // Footsteps: the player's own steps tick softly; an enemy bot's steps grow
  // louder the closer it is, so a flank is heard before it is seen.
  const speed = player.groundSpeed();
  if (body.alive && speed > 2 && body.onGround) {
    playerStepAcc += speed * dt;
    if (playerStepAcc > 2.6) {
      playerStepAcc = 0;
      audio.step(0.7);
    }
  }
  for (const bot of bots) {
    if (bot.team !== 'B' || !bot.actor.alive) continue;
    const moving = Math.hypot(bot.actor.velocity.x, bot.actor.velocity.z) > 0.5;
    if (!moving) continue;
    const dist = Math.hypot(bot.actor.position.x - body.position.x, bot.actor.position.z - body.position.z);
    if (dist > 18) continue;
    const last = botStepAt.get(bot) || 0;
    if (time - last > 0.45) {
      botStepAt.set(bot, time);
      audio.step(1 - dist / 18);
    }
  }

  // Bots move and fight in buy and live phases; the defuser reports through ctx.
  if (match.phase === PHASE.BUY || match.phase === PHASE.LIVE) {
    updateBots(bots, dt, botContext());
  }

  // Objective: planting, the planted charge's countdown and beeps, and a
  // defender's defuse channel. It runs while the round is live even if the
  // player is down, so a planted charge still blows while the squad fights on.
  if (match.phase === PHASE.LIVE) {
    const defuser = botCtx.defuseBot;
    const result = objective.step(dt, {
      playerX: body.position.x,
      playerZ: body.position.z,
      holdingPlant: body.alive && input.keys.has('KeyE'),
      hasCharge: match.hasCharge,
      defuse: defuser ? { active: true, seconds: DEFUSE_SECONDS, who: defuser.actor.name } : null,
    });
    if (result === 'planted') {
      match.hasCharge = false;
      match.money += 300;
      match.addFeed('You planted the charge', 'A');
      match.addCallout(`Charge planted at ${objective.state.plantSite} — hold the crossfire`);
      hud.setMoney(match.money);
      audio.plantBeep(true);
      hud.setObjective('CHARGE PLANTED — defend it until it blows!');
      nextBeepAt = time + 1;
    } else if (result === 'detonated') {
      onExplode(objective.state.plantPos);
      endRound('A', 'Charge detonated at the site.');
    } else if (result === 'defused') {
      endRound('B', 'Charge defused.');
    }
    if (objective.state.planted && time >= nextBeepAt) {
      audio.plantBeep(false);
      nextBeepAt = time + Math.max(0.25, objective.state.plantTimeLeft / 35);
    }
    if (objective.state.defuseProgress > 0 && time >= nextDefuseBeepAt) {
      audio.defuseTick();
      nextDefuseBeepAt = time + 0.5;
    }
  }

  grenades.step(dt, onExplode);
  tracers.step(dt);
  viewmodel.step(dt, body.aiming);

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
  if (objective.state.planted && objective.state.defuseProgress > 0) {
    hud.setPlant(objective.state.defuseProgress, `DEFUSING — ${objective.state.defuser || 'Vulture'} on the charge!`);
  } else {
    hud.setPlant(
      match.phase === PHASE.LIVE && objective.state.plantProgress > 0 && !objective.state.planted
        ? objective.state.plantProgress
        : objective.state.planted
          ? 1 - objective.state.plantTimeLeft / 35
          : null,
      objective.state.planted ? 'CHARGE — detonation in progress' : 'PLANTING… hold E',
    );
  }
  const spreadPx = 6 + ((body.aiming ? def.adsSpread : def.spread) + player.groundSpeed() * 0.004) * 900;
  hud.setCrosshair(Math.min(34, spreadPx), body.aiming);
  hud.setCompass(body.yaw);
  hud.renderFeed(match.feed);
  hud.renderCallouts(match.callouts);
  hud.showScoreboard(input.scoreboardOpen && match.phase !== PHASE.MENU, scoreboardRows());
  const teammates = bots.filter((b) => b.team === 'A' && b.actor.alive).map((b) => ({ x: b.actor.position.x, z: b.actor.position.z }));
  hud.drawMinimap(body.position, body.yaw, teammates, seenEnemies, time, objective.state.planted ? objective.state.plantPos : null);
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
      const digitMap = { Digit1: 'sidearm', Digit2: 'smg', Digit3: 'carbine', Digit4: 'dmr', Digit5: 'shotgun' };
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
    body.position.set(0, 0, 15);
    body.yaw = -0.12;
    body.pitch = 0.01;
    match.timer = BUY_SECONDS;
    settle(20);
    hud.showOverlay('start');
    hud.setHealth(100, 0);
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
    body.position.set(2.5, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    // Hold one defender still in the lane west of the gantry, so the staged
    // shots land on a visible target instead of a bot that walked away.
    // (The east lane is blocked by the gantry leg from this camera.)
    const defender = bots.find((b) => b.team === 'B');
    defender.actor.reset(-3.5, -3, Math.PI);
    defender.state = 'hold';
    defender.path = [];
    defender.pathIndex = 0;
    defender.holdNode = 5;
    defender.holdUntil = 1e9;
    const mate = bots.find((b) => b.team === 'A');
    mate.actor.reset(4.5, 9, 0);
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
    hud.setHealth(100, 0);
  } else if (name === 'buy') {
    startMatch();
    buyMenu.refresh(match.owned, match.money, match.armor, match.hasHelmet, match.grenades);
    hud.showOverlay('buy');
    body.position.set(0, 0, 16);
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
    endRound('A', 'Vulture team eliminated.');
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
hud.setHealth(100, 0);
hud.setAmmo(12, 48, false);
hud.setWeapon('P9 Sidearm', 0);
hud.setMoney(START_MONEY);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS);
hud.setObjective('Plant the charge at A (Depot) or B (Silos) — or wipe the Vulture team.');
hud.showOverlay('start');
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
