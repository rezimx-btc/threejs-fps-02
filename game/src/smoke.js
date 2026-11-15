// Drift Smoke: thrown clouds that block SIGHT, not bullets. One pooled set of
// translucent spheres per cloud; a segment of sight is blocked when it passes
// through any live cloud, so bots lose their target (and will not shoot what
// they cannot see) while a bullet still flies straight through. Clouds grow
// over 0.8 s, hold, then thin out and die after SMOKE.duration.
import * as THREE from 'three';
import { SMOKE } from './weapons.js';

const PUFFS_PER_CLOUD = 9;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export function createSmoke(scene) {
  const clouds = []; // {center: Vector3, radius, born, life, puffs: Mesh[]}
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xbfc8cc, roughness: 1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false,
  });

  // Deterministic puff offsets per cloud, so the same throw looks the same.
  const offsets = [];
  let seed = 1234567;
  function nextRand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  for (let i = 0; i < PUFFS_PER_CLOUD; i += 1) {
    offsets.push([(nextRand() * 2 - 1) * 0.55, nextRand() * 0.5 - 0.1, (nextRand() * 2 - 1) * 0.55]);
  }

  function throwSmoke(origin, time) {
    if (clouds.length >= 3) return false;
    const cloudMat = puffMat.clone();
    const puffs = [];
    for (let i = 0; i < PUFFS_PER_CLOUD; i += 1) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(
        origin.x + offsets[i][0] * SMOKE.radius,
        Math.max(0.6, origin.y + offsets[i][1] * SMOKE.radius * 0.5),
        origin.z + offsets[i][2] * SMOKE.radius,
      );
      const scale = SMOKE.radius * (0.55 + (i % 3) * 0.18);
      puff.scale.set(scale, scale * 0.75, scale);
      puff.visible = false;
      scene.add(puff);
      puffs.push(puff);
    }
    clouds.push({ center: origin.clone(), radius: SMOKE.radius, born: time, life: SMOKE.duration, puffs, mat: cloudMat });
    return true;
  }

  // True when the segment from->to crosses any live cloud's sphere.
  function blocksSight(from, to) {
    for (const cloud of clouds) {
      _a.copy(to).sub(from);
      const lenSq = _a.lengthSq();
      if (lenSq < 1e-9) continue;
      _b.copy(cloud.center).sub(from);
      const t = Math.max(0, Math.min(1, _b.dot(_a) / lenSq));
      _c.copy(from).addScaledVector(_a, t);
      if (_c.distanceToSquared(cloud.center) < cloud.radius * cloud.radius) return true;
    }
    return false;
  }

  function step(dt, time) {
    void dt;
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      const age = time - cloud.born;
      const grow = Math.min(1, age / 0.8);
      const fade = Math.max(0, 1 - Math.max(0, age - (SMOKE.duration - 3)) / 3);
      const opacity = 0.55 * grow * fade;
      for (const puff of cloud.puffs) {
        puff.visible = opacity > 0.02;
        puff.scale.y = puff.scale.x * 0.75 * (0.7 + grow * 0.3);
      }
      cloud.mat.opacity = opacity;
      if (age >= SMOKE.duration) {
        for (const puff of cloud.puffs) scene.remove(puff);
        cloud.mat.dispose();
        clouds.splice(i, 1);
      }
    }
  }

  return { throwSmoke, blocksSight, step, count: () => clouds.length };
}
