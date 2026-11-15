// Bot AI: waypoint navigation, holding, rotating, engaging and defusing. Bots
// pick a route through the map graph, walk it, and fight what they can see: a
// reaction delay, then bursts with spread that grows with distance and movement,
// so a bot that catches you sprinting across mid still has to earn the kill.
// Defenders hold their site; when the charge is planted the nearest defender
// pushes in to defuse. Attackers push a site together, then hold it.
import * as THREE from 'three';
import { findPath } from './map.js';
import { moveBox } from './actors.js';

const BOT_NAMES_A = ['Rook', 'Sable', 'Iris'];
const BOT_NAMES_B = ['Cinder', 'Ash', 'Flint', 'Onyx'];

function makeBot(actor, team, skill, role) {
  return {
    actor,
    team,
    skill, // 0.6 (green) to 1.0 (sharp)
    role, // 'attack' | 'defend'
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
    investigate: null,
    defusing: false,
    defuseProgress: 0,
    speed: 3.1 + skill * 1.1,
  };
}

export function createBots(scene, createActor, graph, sites) {
  const bots = [];
  BOT_NAMES_A.forEach((name, i) => {
    const actor = createActor(scene, { team: 'A', name, x: -2 + i * 2, z: 14 });
    bots.push(makeBot(actor, 'A', 0.68 + i * 0.07, 'attack'));
  });
  BOT_NAMES_B.forEach((name, i) => {
    const actor = createActor(scene, { team: 'B', name, x: -6 + i * 4, z: -14 });
    bots.push(makeBot(actor, 'B', 0.62 + (i % 3) * 0.09, 'defend'));
  });
  return bots;
}

// Assign each bot a job for the round: attackers pick a site to hit together,
// defenders split across the two sites and mid.
export function assignRound(bots, random, roundNumber) {
  const sitePick = random() < 0.55 ? 'A' : 'B';
  for (const bot of bots) {
    bot.state = bot.role === 'attack' ? 'advance' : 'hold';
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.defusing = false;
    bot.defuseProgress = 0;
    bot.investigate = null;
    bot.holdUntil = 0;
    if (bot.role === 'attack') {
      // The whole attack squad hits one site; the odd round out, one bot fakes mid.
      bot.site = roundNumber % 2 === 0 && bot.actor.name === 'Iris' ? (sitePick === 'A' ? 'B' : 'A') : sitePick;
    } else {
      const index = bots.filter((b) => b.role === 'defend').indexOf(bot);
      bot.site = index < 2 ? 'A' : index === 2 ? 'B' : 'mid';
    }
  }
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
  const { time, random, graph, sites, colliders, player, hasLineOfSight, fireBotShot, onBotKilled, planted, plantPos } = ctx;

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

    // --- Defuse: a defender with a planted charge pushes the site and channels. ---
    if (bot.role === 'defend' && planted && plantPos) {
      const dx = plantPos.x - actor.position.x;
      const dz = plantPos.z - actor.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.6) {
        bot.state = 'defuse';
        bot.defuseProgress += dt;
        actor.velocity.set(0, 0, 0);
        actor.yaw = Math.atan2(-dx, -dz);
        if (bot.defuseProgress >= 4) ctx.onDefused(bot);
        continue;
      }
      bot.state = 'rotate';
      bot.site = null;
      moveAlong(bot, plantPos.x, plantPos.z, dt, ctx);
      continue;
    }

    // --- Combat: face the target, strafe, and fire in bursts after reacting. ---
    if (bot.target && time >= bot.reactUntil) {
      const dx = bot.targetPos.x - actor.position.x;
      const dz = bot.targetPos.z - actor.position.z;
      actor.yaw = Math.atan2(-dx, -dz);
      const moving = Math.hypot(actor.velocity.x, actor.velocity.z) > 0.5;
      if (time >= bot.pauseUntil) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.pauseUntil = time + 0.55 + random() * 0.45;
        }
        if (time >= bot.nextShotAt && bot.burstLeft > 0) {
          bot.nextShotAt = time + 0.115;
          bot.burstLeft -= 1;
          const dist = Math.hypot(dx, dz);
          const spread = (0.014 + dist * 0.0009 + (moving ? 0.02 : 0)) * (1.35 - bot.skill * 0.5);
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

    // advance / rotate: walk the route to the site.
    if (bot.state === 'advance' || bot.state === 'rotate') {
      if (!bot.path.length) {
        const site = bot.site ? sites[bot.site] : null;
        const tx = site ? site.cx : 0;
        const tz = site ? site.cz : -7;
        bot.path = findPath(graph, actor.position.x, actor.position.z, tx, tz);
        bot.pathIndex = 0;
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
