// Combat: the hitscan core, line-of-sight tests, grenades, smoke-aware vision
// and the charge objective. One shared Raycaster, reused every shot, so the hot
// path allocates nothing. A shot is a ray against world meshes and actor hit
// meshes; the first hit decides — a wall stops a bullet, a head pays more (see
// weapons.js). Smoke blocks SIGHT but not bullets: a bot cannot see or shoot
// through a cloud, yet a bullet flies straight through it.
// The objective is the round: attackers plant in 3 seconds, the charge blows in
// 35, defenders defuse in 5 (2.5 with a kit). The charge is carried by the
// player — or, if the player is down, by the IGL bot, who plants it alone. A
// defuse channel breaks the moment the defuser takes damage or moves off.
import * as THREE from 'three';
import { weaponDamage, PLANT_SECONDS, DETONATE_SECONDS, DEFUSE_SECONDS, DEFUSE_KIT_SECONDS } from './weapons.js';

const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _probe = new THREE.Box3();

export function raycastShot(origin, direction, shootables, maxDist = 90) {
  _ray.set(origin, direction);
  _ray.far = maxDist;
  const hits = _ray.intersectObjects(shootables, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const userData = hit.object.userData || {};
  return {
    point: hit.point,
    distance: hit.distance,
    actor: userData.actor || null,
    part: userData.part || null,
    object: hit.object,
  };
}

// Line of sight: no wall in the way AND no smoke cloud in the way. The smoke
// test is a caller-supplied `blocksSight(from, to)`; without it, plain walls.
export function hasLineOfSight(from, to, worldMeshes, blocksSight = null) {
  if (blocksSight && blocksSight(from, to)) return false;
  _to.copy(to).sub(from);
  const dist = _to.length();
  if (dist < 0.01) return true;
  _dir.copy(_to).normalize();
  _ray.set(from, _dir);
  _ray.far = dist;
  const hits = _ray.intersectObjects(worldMeshes, false);
  return hits.length === 0 || hits[0].distance > dist - 0.45;
}

// Fire one hitscan shot from a weapon. Returns a report the caller turns into
// damage, hitmarkers, tracers and sound. `spread` is the cone half-angle; ADS,
// crouch and stillness are already folded into it by the caller.
export function fireHitscan(opts) {
  const { origin, yaw, pitch, def, spread, random, shootables, moving } = opts;
  const results = [];
  const pellets = def.pellets || 1;
  const totalSpread = spread + (moving ? def.moveSpread : 0);
  for (let i = 0; i < pellets; i += 1) {
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _dir.x += (random() * 2 - 1) * totalSpread;
    _dir.y += (random() * 2 - 1) * totalSpread;
    _dir.z += (random() * 2 - 1) * totalSpread;
    _dir.normalize();
    const hit = raycastShot(origin, _dir, shootables, 100);
    if (hit) {
      const head = hit.part === 'head';
      results.push({
        hit,
        damage: hit.actor ? weaponDamage(def, hit.distance, head) : 0,
        head,
        killed: false,
      });
    } else {
      results.push({ hit: null, damage: 0, head: false, killed: false });
    }
  }
  return results;
}

// --- Tracers: a pooled LineSegments set, one segment per shot, fading fast. ---
export function createTracers(scene) {
  const MAX = 32;
  const positions = new Float32Array(MAX * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  scene.add(lines);
  const lives = new Float32Array(MAX);
  let cursor = 0;

  function add(from, to) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    positions[i * 6] = from.x;
    positions[i * 6 + 1] = from.y;
    positions[i * 6 + 2] = from.z;
    positions[i * 6 + 3] = to.x;
    positions[i * 6 + 4] = to.y;
    positions[i * 6 + 5] = to.z;
    lives[i] = 0.07;
    geometry.attributes.position.needsUpdate = true;
  }

  function step(dt) {
    let any = false;
    for (let i = 0; i < MAX; i += 1) {
      if (lives[i] > 0) {
        lives[i] -= dt;
        if (lives[i] <= 0) {
          positions[i * 6 + 3] = positions[i * 6];
          positions[i * 6 + 4] = positions[i * 6 + 1];
          positions[i * 6 + 5] = positions[i * 6 + 2];
          geometry.attributes.position.needsUpdate = true;
        }
        any = true;
      }
    }
    material.opacity = any ? 0.9 : 0;
  }

  return { add, step };
}

// --- Impact sparks: one pooled Points cloud, a spark burst where a bullet
// lands on the world, so a miss still reads on screen. ---
export function createImpacts(scene) {
  const MAX = 48;
  const positions = new Float32Array(MAX * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.14, transparent: true, opacity: 0.95, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const lives = new Float32Array(MAX);
  let cursor = 0;

  function add(at) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    positions[i * 3] = at.x;
    positions[i * 3 + 1] = at.y;
    positions[i * 3 + 2] = at.z;
    lives[i] = 0.18;
    geometry.attributes.position.needsUpdate = true;
  }

  function step(dt) {
    let any = false;
    for (let i = 0; i < MAX; i += 1) {
      if (lives[i] > 0) {
        lives[i] -= dt;
        if (lives[i] <= 0) {
          positions[i * 3 + 1] = -50;
          geometry.attributes.position.needsUpdate = true;
        }
        any = true;
      }
    }
    material.opacity = any ? 0.95 : 0;
  }

  return { add, step };
}

// --- Grenades: thrown with an arc, bounce once off the world, burst on fuse. ---
export function createGrenades(scene, colliders, worldMeshes) {
  const live = [];
  const meshGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.5, metalness: 0.6 });
  const flashGeo = new THREE.SphereGeometry(1, 12, 10);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  scene.add(flash);
  let flashLife = 0;

  function throwGrenade(origin, direction, speed) {
    if (live.length >= 4) return false;
    const mesh = new THREE.Mesh(meshGeo, meshMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: 1.6,
      bounced: 0,
    });
    return true;
  }

  function overlapsAt(p) {
    _probe.min.set(p.x - 0.12, p.y - 0.12, p.z - 0.12);
    _probe.max.set(p.x + 0.12, p.y + 0.12, p.z + 0.12);
    for (const collider of colliders) if (_probe.intersectsBox(collider)) return collider;
    return null;
  }

  // Step the live grenades; `onExplode(pos)` is called for each burst.
  function step(dt, onExplode) {
    flashLife = Math.max(0, flashLife - dt);
    flashMat.opacity = flashLife > 0 ? flashLife * 6 : 0;
    if (flashLife > 0) {
      const s = 1 + (0.25 - flashLife) * 26;
      flash.scale.set(s, s, s);
    }
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.velocity.y -= 12 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      const hit = overlapsAt(next);
      if (hit) {
        // Bounce: kill the velocity component into the surface, lose energy.
        const cx = (hit.min.x + hit.max.x) / 2;
        const cy = (hit.min.y + hit.max.y) / 2;
        const cz = (hit.min.z + hit.max.z) / 2;
        const px = Math.abs(next.x - cx) / ((hit.max.x - hit.min.x) / 2 + 0.12);
        const py = Math.abs(next.y - cy) / ((hit.max.y - hit.min.y) / 2 + 0.12);
        const pz = Math.abs(next.z - cz) / ((hit.max.z - hit.min.z) / 2 + 0.12);
        if (px >= py && px >= pz) g.velocity.x *= -0.45;
        else if (py >= px && py >= pz) g.velocity.y *= -0.45;
        else g.velocity.z *= -0.45;
        g.velocity.multiplyScalar(0.85);
        g.bounced += 1;
        next.copy(g.mesh.position);
      }
      if (next.y < 0.12) {
        next.y = 0.12;
        g.velocity.y = Math.abs(g.velocity.y) * 0.45;
        g.velocity.x *= 0.8;
        g.velocity.z *= 0.8;
        g.bounced += 1;
      }
      g.mesh.position.copy(next);
      if (g.fuse <= 0 || g.bounced > 3) {
        flash.position.copy(g.mesh.position);
        flashLife = 0.25;
        scene.remove(g.mesh);
        live.splice(i, 1);
        onExplode(g.mesh.position);
      }
    }
  }

  return { throwGrenade, step, count: () => live.length };
}

// --- The charge objective: plant in a site, defend the beeping charge, win or
// lose it to a defuse. Returns 'planted' / 'detonated' / 'defused' / null. ---
// The planter is whoever carries the charge: the player (holdingPlant), or an
// attacker bot standing in the site (botPlant = {x, z, active}). A kit makes
// the defuse channel run in DEFUSE_KIT_SECONDS instead of DEFUSE_SECONDS.
export function createObjective(sites) {
  const state = {
    planted: false,
    plantSite: null,
    plantPos: new THREE.Vector3(),
    plantProgress: 0, // 0..1 while channelling
    plantTimeLeft: DETONATE_SECONDS,
    defuseProgress: 0, // 0..1 while a defender channels on the charge
    defuser: null, // bot currently defusing, or 'player'
    beepAt: 0,
  };

  function siteAt(x, z) {
    for (const key of Object.keys(sites)) {
      const s = sites[key];
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return key;
    }
    return null;
  }

  function step(dt, input) {
    if (!state.planted) {
      const planting = (input.holdingPlant && input.hasCharge && siteAt(input.playerX, input.playerZ))
        || (input.botPlant && input.botPlant.active && siteAt(input.botPlant.x, input.botPlant.z));
      const site = planting
        ? siteAt(input.playerX, input.playerZ) || siteAt(input.botPlant.x, input.botPlant.z)
        : null;
      if (planting && site) {
        state.plantProgress += dt / PLANT_SECONDS;
        if (state.plantProgress >= 1) {
          state.planted = true;
          state.plantSite = site;
          const px = input.botPlant && input.botPlant.active ? input.botPlant.x : input.playerX;
          const pz = input.botPlant && input.botPlant.active ? input.botPlant.z : input.playerZ;
          state.plantPos.set(px, 0, pz);
          state.plantTimeLeft = DETONATE_SECONDS;
          state.plantProgress = 0;
          return 'planted';
        }
      } else {
        state.plantProgress = Math.max(0, state.plantProgress - dt * 2);
      }
      return null;
    }
    // Planted: count down, and track a defuse channel if one is running.
    state.plantTimeLeft -= dt;
    if (input.defuse && input.defuse.active) {
      state.defuser = input.defuse.who || 'player';
      const seconds = input.defuse.hasKit ? DEFUSE_KIT_SECONDS : (input.defuse.seconds || DEFUSE_SECONDS);
      state.defuseProgress += dt / seconds;
      if (state.defuseProgress >= 1) {
        state.defuseProgress = 0;
        state.defuser = null;
        return 'defused';
      }
    } else {
      state.defuseProgress = 0;
      state.defuser = null;
    }
    if (state.plantTimeLeft <= 0) return 'detonated';
    return null;
  }

  function reset() {
    state.planted = false;
    state.plantSite = null;
    state.plantProgress = 0;
    state.plantTimeLeft = DETONATE_SECONDS;
    state.defuseProgress = 0;
    state.defuser = null;
  }

  return { state, siteAt, step, reset };
}
