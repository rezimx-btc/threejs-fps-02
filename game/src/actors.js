// Actors: the visible bodies every combatant shares — player teammates and the
// opposition. One group per actor: torso, head with a team-coloured visor, legs
// and a gun. The torso and head meshes are the raycast hit targets; their
// userData names the actor and the body part, so headshots pay more.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;

export function createActorMesh(scene, team) {
  const group = new THREE.Group();
  const teamColor = team === 'A' ? PALETTE.teamA : PALETTE.teamB;
  const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.75, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), torsoMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.36), darkMat);
  vest.position.y = 1.1;
  vest.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), torsoMat);
  visor.position.set(0, 1.6, 0.18);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.24), darkMat);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), darkMat);
  gun.position.set(0.28, 1.25, 0.3);
  group.add(torso, vest, head, visor, legL, legR, gun);
  scene.add(group);
  return { group, torso, head };
}

// Axis-separated AABB movement shared by every bot. Returns true when blocked.
export function moveBox(position, velocity, dt, colliders, height = HEIGHT) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }
  const nextX = position.x + velocity.x * dt;
  if (!overlaps(nextX, position.y, position.z, 0.04)) position.x = nextX;
  else velocity.x = 0;
  const nextZ = position.z + velocity.z * dt;
  if (!overlaps(position.x, position.y, nextZ, 0.04)) position.z = nextZ;
  else velocity.z = 0;
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
    alive: true,
    eyeHeight: EYE,
    mesh,
    hitMeshes: [mesh.torso, mesh.head],
    onDeath: null,
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
  actor.damage = function damage(amount) {
    if (!actor.alive) return false;
    actor.health -= amount;
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
    actor.alive = true;
    mesh.group.rotation.set(0, yaw, 0);
    mesh.group.position.copy(actor.position);
  };
  actor.syncMesh = function syncMesh() {
    if (!actor.alive) return;
    mesh.group.position.copy(actor.position);
    mesh.group.rotation.y = actor.yaw;
  };
  return actor;
}
