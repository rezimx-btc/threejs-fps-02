// Actors: the visible bodies every combatant shares — player teammates and the
// opposition. One group per actor: torso with a plate vest, a helmeted head with
// a team-coloured visor, legs and a gun. The torso and head meshes are the
// raycast hit targets; their userData names the actor and the body part, so
// headshots pay more. Armour is worn on the body: damage splits between plates
// and health before the actor falls. Legs swing while the actor walks, so a
// moving bot reads as moving from across the quay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ARMOR } from './weapons.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;
export const STEP_UP = 0.38; // low ledges and ramp steps a body can climb

export function createActorMesh(scene, team) {
  const group = new THREE.Group();
  const teamColor = team === 'A' ? PALETTE.teamA : PALETTE.teamB;
  const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0.08 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2129, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });
  const helmMat = new THREE.MeshStandardMaterial({ color: 0x2e3742, roughness: 0.55, metalness: 0.35 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), torsoMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.38), helmMat);
  vest.position.y = 1.1;
  vest.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), helmMat);
  helmet.position.y = 1.62;
  helmet.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), torsoMat);
  visor.position.set(0, 1.6, 0.18);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), darkMat);
  pack.position.set(0, 1.12, -0.26);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.24), darkMat);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), darkMat);
  gun.position.set(0.28, 1.25, 0.3);
  group.add(torso, vest, head, helmet, visor, pack, legL, legR, gun);
  scene.add(group);
  return { group, torso, head, legL, legR };
}

// Axis-separated AABB movement shared by every bot, with a step-up: a low ledge
// (a ramp step, a crate edge) is climbed instead of blocking the body, so bots
// can take the gantry ramps up to the walkway. Returns true when blocked.
export function moveBox(position, velocity, dt, colliders, height = HEIGHT) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }
  function tryStep(x, y, z) {
    // Grounded step-up: if the feet are blocked but the space STEP_UP above is
    // free, lift the body onto the ledge instead of stopping.
    if (y > 0.05) return false;
    if (!overlaps(x, STEP_UP, z, 0.04)) return true;
    return false;
  }
  const nextX = position.x + velocity.x * dt;
  if (!overlaps(nextX, position.y, position.z, 0.04)) {
    position.x = nextX;
  } else if (tryStep(nextX, position.y, position.z)) {
    position.x = nextX;
    position.y += STEP_UP;
  } else {
    velocity.x = 0;
  }
  const nextZ = position.z + velocity.z * dt;
  if (!overlaps(position.x, position.y, nextZ, 0.04)) {
    position.z = nextZ;
  } else if (tryStep(position.x, position.y, nextZ)) {
    position.z = nextZ;
    position.y += STEP_UP;
  } else {
    velocity.z = 0;
  }
  if (position.y < 0) position.y = 0;
}

export function createActor(scene, opts) {
  const mesh = createActorMesh(scene, opts.team);
  const actor = {
    name: opts.name,
    team: opts.team,
    isPlayer: false,
    position: new THREE.Vector3(opts.x, 0, opts.z),
    velocity: new THREE.Vector3(),
    yaw: opts.yaw ?? 0,
    health: 100,
    armor: 0,
    alive: true,
    eyeHeight: EYE,
    mesh,
    hitMeshes: [mesh.torso, mesh.head],
    onDeath: null,
    walkPhase: 0,
  };
  mesh.torso.userData = { actor, part: 'body' };
  mesh.head.userData = { actor, part: 'head' };
  mesh.group.position.copy(actor.position);
  mesh.group.rotation.y = actor.yaw;

  actor.eyePos = function eyePos(out) {
    out.set(actor.position.x, actor.position.y + EYE, actor.position.z);
    return out;
  };
  actor.chestPos = function chestPos(out) {
    out.set(actor.position.x, actor.position.y + 1.15, actor.position.z);
    return out;
  };
  // Damage goes to the plate vest first: half of every hit is absorbed until
  // the plates break. Returns true when this damage killed the actor.
  actor.damage = function damage(amount) {
    if (!actor.alive) return false;
    let remaining = amount;
    if (actor.armor > 0) {
      const absorbed = Math.min(actor.armor, amount * ARMOR.absorb);
      actor.armor -= absorbed;
      remaining = amount - absorbed;
    }
    actor.health -= remaining;
    if (actor.health <= 0) {
      actor.health = 0;
      actor.alive = false;
      mesh.group.rotation.x = -Math.PI / 2;
      mesh.group.position.y = 0.25;
      if (actor.onDeath) actor.onDeath(actor);
      return true;
    }
    return false;
  };
  actor.reset = function reset(x, z, yaw) {
    actor.position.set(x, 0, z);
    actor.velocity.set(0, 0, 0);
    actor.yaw = yaw;
    actor.health = 100;
    actor.armor = 0;
    actor.alive = true;
    actor.walkPhase = 0;
    mesh.group.rotation.set(0, yaw, 0);
    mesh.group.position.copy(actor.position);
    mesh.legL.rotation.x = 0;
    mesh.legR.rotation.x = 0;
  };
  actor.syncMesh = function syncMesh() {
    if (!actor.alive) return;
    mesh.group.position.copy(actor.position);
    mesh.group.rotation.y = actor.yaw;
    // Walk cycle: legs swing with distance covered, nothing allocated.
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    actor.walkPhase += speed * 0.09;
    const swing = speed > 0.5 ? Math.sin(actor.walkPhase) * 0.55 : 0;
    mesh.legL.rotation.x = swing;
    mesh.legR.rotation.x = -swing;
  };
  return actor;
}
