// Viewmodel: the gun the player sees in first person, built from boxes and
// attached to the camera. Each weapon family gets its own silhouette and length.
// Recoil kicks it back, reloading dips it down, and a muzzle flash fires on
// every shot — all driven from main.js, no per-frame allocation.
import * as THREE from 'three';

export function createViewmodel(camera) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.55, metalness: 0.5 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, metalness: 0.3 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), bodyMat);
  barrel.position.set(0, 0.03, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gripMat);
  grip.position.set(0, -0.13, 0.12);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), accentMat);
  sight.position.set(0, 0.09, -0.1);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.03, -0.68);
  group.add(body, barrel, grip, sight, flash);
  group.position.set(0.28, -0.26, -0.55);
  camera.add(group);

  let kick = 0;
  let dip = 0;
  let flashLife = 0;

  function setWeapon(kind) {
    const long = kind === 'dmr' || kind === 'shotgun';
    const wide = kind === 'shotgun';
    body.scale.set(wide ? 1.5 : 1, 1, long ? 1.25 : 1);
    barrel.scale.set(wide ? 1.6 : 1, 1, long ? 1.5 : 1);
    barrel.position.z = long ? -0.52 : -0.42;
    flash.position.z = long ? -0.85 : -0.68;
  }

  function onShot() {
    kick = 1;
    flashLife = 0.05;
  }

  function onReload() {
    dip = 1;
  }

  function step(dt) {
    kick = Math.max(0, kick - dt * 9);
    dip = Math.max(0, dip - dt * 1.6);
    flashLife = Math.max(0, flashLife - dt);
    flashMat.opacity = flashLife > 0 ? 0.95 : 0;
    flash.rotation.z = Math.random() * Math.PI;
    group.position.z = -0.55 + kick * 0.09;
    group.position.y = -0.26 - dip * 0.14;
    group.rotation.x = kick * 0.06 + dip * 0.5;
  }

  return { setWeapon, onShot, onReload, step };
}
