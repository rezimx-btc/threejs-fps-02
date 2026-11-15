// Bot AI: a 5v5 squad with roles, not five lone wolves. Each round the IGL
// calls a plan — which site the squad hits, which lane the lurker fakes — and
// the squad executes it together: the entry goes in first, support trades the
// entry's death, the lurker draws defenders to the other site with noise and
// smoke, the AWPer holds the long angle with a DMR. Defenders anchor their
// sites and a mid roamer, and when the charge is planted they retake together
// instead of trickling in one by one. Bots radio what they do, so the player
// reads the plan in the feed instead of guessing.
// Fights: a reaction delay, then bursts with spread that grows with distance
// and movement, so a bot that catches you sprinting across mid still has to
// earn the kill. Bots HEAR: a gunshot or an explosion within 26 m pulls a bot
// with no target over to investigate. Bots USE smoke: the lurker screens the
// fake site, defenders smoke the retake, the carrier smokes the plant.
// The charge has a carrier: while the player attacks and lives, the player
// carries it; if the player is down — or after the half-time side swap, when
// the player defends — the IGL bot carries it and plants it alone, so a round
// is never unwinnable because the carrier died. Difficulty climbs with the
// round: defenders sharpen a little every round the player loses.
import * as THREE from 'three';
import { findPath, groundHeightAt } from './map.js';
import { moveBox } from './actors.js';

const BOT_NAMES_A = ['Rook', 'Sable', 'Iris', 'Hawk', 'Wren']; // Meridian attackers
const BOT_NAMES_B = ['Cinder', 'Ash', 'Flint', 'Onyx', 'Ember']; // Breakwater defenders
const ROLES_A = ['igl', 'entry', 'support', 'lurker', 'awper'];
const ROLES_B = ['anchor', 'anchor', 'anchor', 'roamer', 'anchor'];

const CALLS = {
  plan: (site, fake) => `Plan: hit ${site} — ${fake} fake, then commit`,
  push: (name, site) => `${name}: pushing ${site}`,
  rotate: (name, site) => `${name}: rotating to ${site}`,
  planted: (site) => `Charge planted at ${site} — hold the crossfire`,
  defuse: (name) => `${name}: defusing the charge`,
  retake: 'Retake together — two in, two hold the flank',
  lurker: (name, site) => `${name}: making noise at ${site}`,
  smoke: (name, site) => `${name}: smoke out at ${site}`,
  swap: 'Sides swap — Meridian defends now. Hold the sites.',
  investigate: (name) => `${name}: checking that noise`,
};

function makeBot(actor, team, skill, role) {
  return {
    actor,
    team,
    skill, // 0.6 (green) to 1.0 (sharp)
    role, // 'igl' | 'entry' | 'support' | 'lurker' | 'awper' | 'anchor' | 'roamer'
    state: 'advance',
    site: null,
    path: [],
    pathIndex: 0,
    holdUntil: 0,
    holdNode: -1,
    target: null, // actor or 'player'
    targetPos: new THREE.Vector3(),
    lastSeenAt: -1e9,
    lastSeenPos: new THREE.Vector3(),
    reactUntil: 0,
    burstLeft: 0,
    nextShotAt: 0,
    pauseUntil: 0,
    strafeDir: 1,
    strafeUntil: 0,
    defusing: false,
    defuseProgress: 0,
    grenadeThrown: false,
    smokeThrown: false,
    planting: false,
    plantProgress: 0,
    investigateUntil: 0,
    investigatePos: new THREE.Vector3(),
    speed: 3.1 + skill * 1.1,
  };
}

export function createBots(scene, createActor, graph, sites) {
  const bots = [];
  BOT_NAMES_A.forEach((name, i) => {
    const actor = createActor(scene, { team: 'A', name, x: -4 + i * 2, z: 16 });
    bots.push(makeBot(actor, 'A', 0.66 + i * 0.06, ROLES_A[i]));
  });
  BOT_NAMES_B.forEach((name, i) => {
    const actor = createActor(scene, { team: 'B', name, x: -8 + i * 4, z: -16 });
    bots.push(makeBot(actor, 'B', 0.6 + (i % 3) * 0.08, ROLES_B[i]));
  });
  return bots;
}

// Swap the two squads' teams at half-time: the first five bots become the
// defence, the second five become the attack. Roles travel with the bot.
export function swapTeams(bots) {
  for (const bot of bots) {
    bot.team = bot.team === 'A' ? 'B' : 'A';
    bot.actor.team = bot.team;
  }
}

// The IGL calls the round: attackers hit one site together, the lurker fakes
// the other, the AWPer posts up on the long angle into the site. Defenders
// split: two anchor A, two anchor B, the roamer holds mid and swings to noise.
// From round 2 the defence buys plate vests; from round 3 the attack does too.
export function assignRound(bots, random, roundNumber, callout) {
  const sitePick = random() < 0.55 ? 'A' : 'B';
  const fakeSite = sitePick === 'A' ? 'B' : 'A';
  for (const bot of bots) {
    bot.state = bot.role === 'anchor' || bot.role === 'roamer' ? 'hold' : 'advance';
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.defusing = false;
    bot.defuseProgress = 0;
    bot.grenadeThrown = false;
    bot.smokeThrown = false;
    bot.planting = false;
    bot.plantProgress = 0;
    bot.investigateUntil = 0;
    bot.holdUntil = 0;
    // Difficulty curve: every round sharpens the defence a touch.
    const curve = Math.min(0.15, (roundNumber - 1) * 0.025);
    bot.skill = Math.min(0.98, bot.skill + (bot.team === 'B' ? curve : curve * 0.5));
    bot.speed = 3.1 + bot.skill * 1.1;
    // Economy: vests appear as the match wears on.
    bot.actor.armor = (bot.team === 'B' && roundNumber >= 2) || (bot.team === 'A' && roundNumber >= 3) ? 50 : 0;
    if (bot.team === 'A') {
      if (bot.role === 'lurker') bot.site = fakeSite;
      else if (bot.role === 'awper') bot.site = sitePick;
      else bot.site = sitePick;
    } else {
      const anchors = bots.filter((b) => b.team === 'B' && b.role === 'anchor');
      const index = anchors.indexOf(bot);
      if (bot.role === 'roamer') bot.site = 'mid';
      else bot.site = index < 2 ? 'A' : 'B';
    }
  }
  if (callout) callout(CALLS.plan(sitePick, fakeSite));
  return { site: sitePick, fake: fakeSite };
}

function nearestNode(graph, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const dx = graph.nodes[i][0] - x;
    const dz = graph.nodes[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Pick a hold spot near a site: a node inside the site, or the closest to it.
// The AWPer sometimes takes the gantry deck instead, for the high ground.
function holdNodeFor(graph, site, sites, random, preferDeck) {
  if (preferDeck && random() < 0.45) {
    const deckNodes = [30, 31, 32];
    const target = sites[site];
    let best = deckNodes[0];
    let bestD = Infinity;
    for (const n of deckNodes) {
      const d = Math.abs(graph.nodes[n][0] - target.cx);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }
  if (site === 'mid') return nearestNode(graph, 0, -7);
  const target = sites[site];
  return nearestNode(graph, target.cx, target.cz);
}

const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function updateBots(bots, dt, ctx) {
  const {
    time, random, graph, sites, colliders, player, hasLineOfSight, fireBotShot,
    planted, plantPos, plantSite, onPlantCall, onRotateCall,
    throwBotGrenade, throwBotSmoke, noiseEvents, playerTeam, canFight,
  } = ctx;
  ctx.plantingBot = null;
  ctx.defuseBot = null;

  // The carrier: the IGL attacker bot carries the charge whenever the player
  // is not carrying it (player down, or player defending after the swap).
  const carrier = bots.find((b) => b.team === 'A' && b.role === 'igl' && b.actor.alive)
    || bots.find((b) => b.team === 'A' && b.actor.alive);

  for (const bot of bots) {
    const actor = bot.actor;
    if (!actor.alive) continue;

    // --- Pick the nearest living enemy the bot can see (smoke blocks sight). ---
    const enemies = [];
    // The player is an enemy ONLY when this bot is on the other team.
    // (A teammate bot must never target or shoot the player.)
    if (player.state.alive && bot.team !== playerTeam) enemies.push({ ref: 'player', pos: player.state.position, eye: player.state.eye });
    for (const other of bots) {
      if (other.team !== bot.team && other.actor.alive) enemies.push({ ref: other.actor, pos: other.actor.position, eye: other.actor.eyeHeight });
    }
    let visible = null;
    let visibleDist = Infinity;
    for (const enemy of enemies) {
      actor.eyePos(_eye);
      _to.set(enemy.pos.x, enemy.pos.y + enemy.eye * 0.75, enemy.pos.z);
      const dist = _eye.distanceTo(_to);
      if (dist > 46) continue;
      if (hasLineOfSight(_eye, _to)) {
        if (dist < visibleDist) { visibleDist = dist; visible = enemy; }
      }
    }
    if (visible) {
      bot.target = visible.ref;
      bot.targetPos.set(visible.pos.x, visible.pos.y + 1.1, visible.pos.z);
      bot.lastSeenAt = time;
      bot.lastSeenPos.copy(bot.targetPos);
      if (bot.reactUntil === 0) bot.reactUntil = time + (0.55 - bot.skill * 0.3) + random() * 0.25;
    } else if (time - bot.lastSeenAt > 2.5) {
      bot.target = null;
    }

    // --- Hear: a recent loud noise with no target pulls the bot over. ---
    if (!bot.target && noiseEvents) {
      for (const noise of noiseEvents) {
        if (time - noise.at > 3) continue;
        const dist = Math.hypot(noise.x - actor.position.x, noise.z - actor.position.z);
        if (dist < 26 && dist > 4) {
          bot.investigatePos.set(noise.x, 0, noise.z);
          bot.investigateUntil = time + 3;
          if (onRotateCall) onRotateCall(CALLS.investigate(actor.name));
          break;
        }
      }
    }

    // --- The lurker fires a grenade and a smoke at the fake site, to sell it. ---
    if (bot.role === 'lurker' && bot.state === 'advance') {
      const site = sites[bot.site];
      const distToSite = Math.hypot(site.cx - actor.position.x, site.cz - actor.position.z);
      if (!bot.grenadeThrown && distToSite < 18 && throwBotGrenade) {
        bot.grenadeThrown = true;
        throwBotGrenade(actor, site.cx, site.cz);
        if (onRotateCall) onRotateCall(CALLS.lurker(actor.name, bot.site));
      }
      if (!bot.smokeThrown && distToSite < 14 && throwBotSmoke) {
        bot.smokeThrown = true;
        throwBotSmoke(actor, site.cx, site.cz);
        if (onRotateCall) onRotateCall(CALLS.smoke(actor.name, bot.site));
      }
    }

    // --- Plant: the carrier plants the charge when the player is not carrying. ---
    const playerCarries = playerTeam === 'A' && player.state.alive;
    if (bot.team === 'A' && carrier === bot && !playerCarries && !planted) {
      const site = sites[bot.site || 'A'];
      const dist = Math.hypot(site.cx - actor.position.x, site.cz - actor.position.z);
      if (dist < 3.5) {
        // In the site: smoke the approach, then channel the plant.
        if (!bot.smokeThrown && throwBotSmoke) {
          bot.smokeThrown = true;
          throwBotSmoke(actor, site.cx, site.cz + 4);
        }
        bot.planting = true;
        bot.state = 'plant';
        actor.velocity.set(0, 0, 0);
        actor.yaw = Math.atan2(-(site.cx - actor.position.x), -(site.cz - actor.position.z));
        ctx.plantingBot = bot;
        actor.syncMesh();
        settleHeight(actor, dt);
        continue;
      }
      bot.planting = false;
      bot.state = 'advance';
      bot.site = bot.site || 'A';
    } else {
      bot.planting = false;
    }

    // --- Defuse: when the charge is planted, defenders retake as a pair. ---
    if (bot.team === 'B' && planted && plantPos) {
      const dx = plantPos.x - actor.position.x;
      const dz = plantPos.z - actor.position.z;
      const dist = Math.hypot(dx, dz);
      // The closest defender defuses; the rest hold the retake angles.
      const defenders = bots.filter((b) => b.team === 'B' && b.actor.alive);
      const closest = defenders.reduce((best, b) => {
        const d = Math.hypot(plantPos.x - b.actor.position.x, plantPos.z - b.actor.position.z);
        return !best || d < best.d ? { bot: b, d } : best;
      }, null);
      if (closest && closest.bot === bot) {
        // Smoke the site on the way in, once, to screen the defuse.
        if (!bot.smokeThrown && dist < 12 && throwBotSmoke) {
          bot.smokeThrown = true;
          throwBotSmoke(actor, plantPos.x, plantPos.z);
          if (onRotateCall) onRotateCall(CALLS.smoke(actor.name, plantSite || 'A'));
        }
        if (dist < 1.6) {
          if (!bot.defusing && onPlantCall) onPlantCall(CALLS.defuse(actor.name));
          bot.state = 'defuse';
          bot.defusing = true;
          bot.defuseProgress += dt;
          actor.velocity.set(0, 0, 0);
          actor.yaw = Math.atan2(-dx, -dz);
          actor.syncMesh();
          // The channel itself is reported to main.js through ctx.defuseBot.
          ctx.defuseBot = bot;
          settleHeight(actor, dt);
          continue;
        }
        bot.state = 'rotate';
        bot.site = null;
        if (bot.target && time >= bot.reactUntil) {
          // A defender who sees an enemy on the way in fights first: fall
          // through to the combat section below instead of walking on.
        } else {
          moveAlong(bot, plantPos.x, plantPos.z, dt, ctx);
          settleHeight(actor, dt);
          continue;
        }
      }
      // Not the defuser: push to a retake angle near the site and fight.
      if (!bot.target) {
        const angle = sites[plantSite] || sites.A;
        const holdX = angle.cx + (bot.actor.name.charCodeAt(0) % 2 === 0 ? -4 : 4);
        const holdZ = angle.cz + 5;
        if (Math.hypot(holdX - actor.position.x, holdZ - actor.position.z) > 1.5) {
          moveAlong(bot, holdX, holdZ, dt, ctx);
          settleHeight(actor, dt);
          continue;
        }
      }
    }

    // --- Combat: face the target, strafe, and fire in bursts after reacting. ---
    if (bot.target && time >= bot.reactUntil) {
      const dx = bot.targetPos.x - actor.position.x;
      const dz = bot.targetPos.z - actor.position.z;
      actor.yaw = Math.atan2(-dx, -dz);
      const moving = Math.hypot(actor.velocity.x, actor.velocity.z) > 0.5;
      if (time >= bot.pauseUntil) {
        if (bot.burstLeft <= 0) {
          // The AWPer fires slow, heavy single shots; the rest burst.
          bot.burstLeft = bot.role === 'awper' ? 1 : 3 + Math.floor(random() * 3);
          bot.pauseUntil = time + (bot.role === 'awper' ? 0.9 : 0.55) + random() * 0.45;
        }
        // Buy phase is safe: bots hold and aim, but nobody fires until live.
        if (time >= bot.nextShotAt && bot.burstLeft > 0 && canFight) {
          bot.nextShotAt = time + (bot.role === 'awper' ? 0.5 : 0.115);
          bot.burstLeft -= 1;
          const dist = Math.hypot(dx, dz);
          const spread = (0.014 + dist * 0.0009 + (moving ? 0.02 : 0)) * (1.35 - bot.skill * 0.5) * (bot.role === 'awper' ? 0.55 : 1);
          fireBotShot(bot, spread);
        }
      }
      // Strafe sideways while fighting, so bots are not standing targets.
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.7 + random() * 0.9;
      }
      const strafeSpeed = 1.6 * bot.strafeDir;
      const sin = Math.sin(actor.yaw);
      const cos = Math.cos(actor.yaw);
      actor.velocity.x = cos * strafeSpeed;
      actor.velocity.z = -sin * strafeSpeed;
      moveBox(actor.position, actor.velocity, dt, colliders);
      actor.syncMesh();
      settleHeight(actor, dt);
      continue;
    }
    if (bot.target) {
      // Seen but still reacting: track the target, hold still.
      const dx = bot.targetPos.x - actor.position.x;
      const dz = bot.targetPos.z - actor.position.z;
      actor.yaw = Math.atan2(-dx, -dz);
      actor.velocity.set(0, 0, 0);
      actor.syncMesh();
      settleHeight(actor, dt);
      continue;
    }
    bot.reactUntil = 0;

    // --- Investigate a noise: walk to it, look around, then resume. ---
    if (time < bot.investigateUntil && bot.state !== 'defuse') {
      if (moveAlong(bot, bot.investigatePos.x, bot.investigatePos.z, dt, ctx)) {
        bot.investigateUntil = 0;
        actor.yaw += dt * 1.2;
      }
      actor.syncMesh();
      settleHeight(actor, dt);
      continue;
    }

    // --- Navigation: follow the path, or hold a position. ---
    if (bot.state === 'hold') {
      if (bot.holdNode === -1) {
        bot.holdNode = holdNodeFor(graph, bot.site, sites, random, bot.role === 'awper');
        bot.path = findPath(graph, actor.position.x, actor.position.z, graph.nodes[bot.holdNode][0], graph.nodes[bot.holdNode][1]);
        bot.pathIndex = 0;
      }
      if (bot.pathIndex < bot.path.length) {
        const node = graph.nodes[bot.path[bot.pathIndex]];
        if (moveAlong(bot, node[0], node[1], dt, ctx)) bot.pathIndex += 1;
      } else {
        // On station: scan the lane, occasionally shift to a nearby node.
        actor.velocity.set(0, 0, 0);
        actor.yaw += Math.sin(time * 0.4 + bot.skill * 9) * dt * 0.5;
        if (time > bot.holdUntil) {
          bot.holdUntil = time + 6 + random() * 6;
          const neighbours = graph.adjacency[bot.holdNode];
          const next = neighbours[Math.floor(random() * neighbours.length)];
          bot.path = [next];
          bot.pathIndex = 0;
          bot.holdNode = next;
        }
      }
      actor.syncMesh();
      settleHeight(actor, dt);
      continue;
    }

    // advance / rotate: walk the route to the site. The entry leads, support
    // trails a step behind, the AWPer stops at the long angle instead of
    // walking into the site.
    if (bot.state === 'advance' || bot.state === 'rotate') {
      if (!bot.path.length) {
        const site = bot.site ? sites[bot.site] : null;
        const tx = site ? site.cx : 0;
        const tz = site ? site.cz : -7;
        bot.path = findPath(graph, actor.position.x, actor.position.z, tx, tz);
        bot.pathIndex = 0;
      }
      if (bot.role === 'awper' && bot.state === 'advance' && bot.pathIndex >= Math.max(1, bot.path.length - 2)) {
        bot.state = 'hold';
        bot.holdNode = -1;
        bot.holdUntil = time + 4;
        actor.velocity.set(0, 0, 0);
        actor.syncMesh();
        settleHeight(actor, dt);
        continue;
      }
      if (bot.pathIndex < bot.path.length) {
        const node = graph.nodes[bot.path[bot.pathIndex]];
        if (moveAlong(bot, node[0], node[1], dt, ctx)) bot.pathIndex += 1;
      } else {
        bot.state = 'hold';
        bot.holdNode = -1;
        bot.holdUntil = time + 2 + random() * 3;
      }
      actor.syncMesh();
      settleHeight(actor, dt);
      continue;
    }

    // defuse / plant state handled above; anything else stands and scans.
    actor.velocity.set(0, 0, 0);
    actor.syncMesh();
    settleHeight(actor, dt);
  }

  function moveAlong(bot, tx, tz, dt, ctx2) {
    const actor = bot.actor;
    const dx = tx - actor.position.x;
    const dz = tz - actor.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const speed = bot.speed;
    actor.velocity.x = (dx / dist) * speed;
    actor.velocity.z = (dz / dist) * speed;
    actor.yaw = Math.atan2(-dx, -dz);
    moveBox(actor.position, actor.velocity, dt, ctx2.colliders);
    return false;
  }

  // Keep the bot on the floor it stands on: snap up onto a step or the deck,
  // fall back to the quay when it walks off an edge.
  function settleHeight(actor, dt) {
    const support = groundHeightAt(actor.position.x, actor.position.z);
    if (actor.position.y > support + 0.05) {
      actor.position.y = Math.max(support, actor.position.y - 12 * dt);
    } else if (actor.position.y < support - 0.02) {
      actor.position.y = support;
    }
  }
}

export function botCountAlive(bots, team) {
  let count = 0;
  for (const bot of bots) if (bot.team === team && bot.actor.alive) count += 1;
  return count;
}
