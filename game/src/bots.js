// Bot AI: a 5v5 squad with roles, not five lone wolves. Each round the IGL
// (the first attacker bot) calls a plan — which site the squad hits, which lane
// the lurker fakes — and the squad executes it together: the entry goes in
// first, support trades the entry's death, the lurker draws defenders to the
// other site, the AWPer holds the long angle with a DMR. Defenders anchor their
// sites and a mid roamer, and when the charge is planted they retake together
// instead of trickling in one by one. Bots radio what they do, so the player
// reads the plan in the feed instead of guessing.
// Fights: a reaction delay, then bursts with spread that grows with distance and
// movement, so a bot that catches you sprinting across mid still has to earn the
// kill. Difficulty climbs with the round: defenders sharpen a little every round
// the player loses, so a match that snowballs still stays honest.
import * as THREE from 'three';
import { findPath } from './map.js';
import { moveBox } from './actors.js';

const BOT_NAMES_A = ['Rook', 'Sable', 'Iris', 'Hawk', 'Wren']; // Kestrel attackers
const BOT_NAMES_B = ['Cinder', 'Ash', 'Flint', 'Onyx', 'Ember']; // Vulture defenders
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

// The IGL calls the round: attackers hit one site together, the lurker fakes
// the other, the AWPer posts up on the long angle into the site. Defenders
// split: two anchor A, two anchor B, the roamer holds mid and swings to noise.
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
    bot.holdUntil = 0;
    // Difficulty curve: every round sharpens the defence a touch.
    const curve = Math.min(0.15, (roundNumber - 1) * 0.025);
    bot.skill = Math.min(0.98, bot.skill + (bot.team === 'B' ? curve : curve * 0.5));
    bot.speed = 3.1 + bot.skill * 1.1;
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
function holdNodeFor(graph, site, sites) {
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
    planted, plantPos, plantSite, onDefused, onPlantCall, onRotateCall,
    throwBotGrenade, hasKit,
  } = ctx;

  for (const bot of bots) {
    const actor = bot.actor;
    if (!actor.alive) continue;

    // --- Pick the nearest living enemy the bot can see. ---
    const enemies = [];
    if (player.state.alive) enemies.push({ ref: 'player', pos: player.state.position, eye: player.state.eye });
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

    // --- The lurker fires a grenade at the fake site, to sell the bluff. ---
    if (bot.role === 'lurker' && !bot.grenadeThrown && bot.state === 'advance' && throwBotGrenade) {
      const site = sites[bot.site];
      const dx = site.cx - actor.position.x;
      const dz = site.cz - actor.position.z;
      if (Math.hypot(dx, dz) < 18) {
        bot.grenadeThrown = true;
        throwBotGrenade(actor, site.cx, site.cz);
        if (onRotateCall) onRotateCall(CALLS.lurker(actor.name, bot.site));
      }
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
          continue;
        }
        bot.state = 'rotate';
        bot.site = null;
        if (bot.target && time >= bot.reactUntil) {
          // A defender who sees an enemy on the way in fights first: fall
          // through to the combat section below instead of walking on.
        } else {
          moveAlong(bot, plantPos.x, plantPos.z, dt, ctx);
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
        if (time >= bot.nextShotAt && bot.burstLeft > 0) {
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
      continue;
    }
    if (bot.target) {
      // Seen but still reacting: track the target, hold still.
      const dx = bot.targetPos.x - actor.position.x;
      const dz = bot.targetPos.z - actor.position.z;
      actor.yaw = Math.atan2(-dx, -dz);
      actor.velocity.set(0, 0, 0);
      actor.syncMesh();
      continue;
    }
    bot.reactUntil = 0;

    // --- Navigation: follow the path, or hold a position. ---
    if (bot.state === 'hold') {
      if (bot.holdNode === -1) {
        bot.holdNode = holdNodeFor(graph, bot.site, sites);
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
      continue;
    }

    // defuse state handled above; anything else stands and scans.
    actor.velocity.set(0, 0, 0);
    actor.syncMesh();
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
}

export function botCountAlive(bots, team) {
  let count = 0;
  for (const bot of bots) if (bot.team === team && bot.actor.alive) count += 1;
  return count;
}
