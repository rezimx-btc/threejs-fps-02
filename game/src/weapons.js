// Weapon and gear definitions: every gun is data, so the buy menu, the HUD, the
// viewmodel and the shooting code all read the same numbers. Damage falls off past
// `range`; headshots multiply it. Standing still and aiming down sights pays —
// spread grows with movement and shrinks hard while aiming, crouching steadies
// the gun further, and the FIRST shot from a standstill is nearly perfect.
//
// Recoil is a pattern, not a dice roll: `pattern` lists the [pitch, yaw] kick of
// each shot in a burst (radians, before the small random wobble the shooter
// adds). Learn the pattern and you can pull the spray back down; hold the
// trigger and the climb runs away from you. Bursts beat mag-dumps.
// Gear: a vest absorbs half the damage until its plates break; a defuse kit
// halves the time a defender needs on the charge; smoke hides movement, not
// bullets.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm',
    name: 'Anchor P9',
    kind: 'sidearm',
    desc: 'Reliable pistol. Free, always with you.',
    price: 0,
    damage: 34,
    headMult: 2.5,
    rateMs: 150,
    auto: false,
    mag: 12,
    reserve: 48,
    reloadMs: 1300,
    spread: 0.006,
    adsSpread: 0.0025,
    moveSpread: 0.02,
    crouchSpread: 0.6,
    stillSpread: 0.7,
    recoil: 0.011,
    climb: 0.0016,
    range: 42,
    falloff: 0.55,
    pattern: [[1, 0], [1, 0.2], [1, -0.2], [1.1, 0.3], [1.1, -0.3], [1.2, 0.2]],
  },
  smg: {
    id: 'smg',
    name: 'Gull SMG',
    kind: 'smg',
    desc: 'Cheap bullet hose. Shreds up close, sprays far away.',
    price: 1500,
    damage: 24,
    headMult: 2.4,
    rateMs: 78,
    auto: true,
    mag: 28,
    reserve: 84,
    reloadMs: 1900,
    spread: 0.013,
    adsSpread: 0.006,
    moveSpread: 0.03,
    crouchSpread: 0.6,
    stillSpread: 0.75,
    recoil: 0.009,
    climb: 0.0022,
    range: 30,
    falloff: 0.5,
    pattern: [[1, 0], [1, 0.4], [1, -0.4], [1, 0.6], [1, -0.6], [1.2, 0.5], [1.2, -0.5], [1.3, 0.7]],
  },
  carbine: {
    id: 'carbine',
    name: 'Current Carbine',
    kind: 'carbine',
    desc: 'Full-auto workhorse. Steady, forgiving, honest.',
    price: 2700,
    damage: 33,
    headMult: 2.5,
    rateMs: 100,
    auto: true,
    mag: 30,
    reserve: 90,
    reloadMs: 2200,
    spread: 0.008,
    adsSpread: 0.0035,
    moveSpread: 0.026,
    crouchSpread: 0.55,
    stillSpread: 0.7,
    recoil: 0.013,
    climb: 0.0018,
    range: 55,
    falloff: 0.6,
    pattern: [[1, 0], [1, 0.15], [1, -0.15], [1.1, 0.3], [1.1, -0.3], [1.2, 0.45], [1.2, -0.3], [1.3, 0.5]],
  },
  dmr: {
    id: 'dmr',
    name: 'Harbor DMR',
    kind: 'dmr',
    desc: 'Semi-auto marksman rifle. One headshot, one kill.',
    price: 3200,
    damage: 78,
    headMult: 2.2,
    rateMs: 450,
    auto: false,
    mag: 10,
    reserve: 30,
    reloadMs: 2800,
    spread: 0.0015,
    adsSpread: 0.0006,
    moveSpread: 0.045,
    crouchSpread: 0.5,
    stillSpread: 0.6,
    recoil: 0.032,
    climb: 0.004,
    range: 95,
    falloff: 0.85,
    pattern: [[1, 0], [1, 0.1], [1, -0.1]],
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breaker-12',
    kind: 'shotgun',
    desc: 'Pump shotgun. Devastating up close, useless far away.',
    price: 1800,
    damage: 11,
    headMult: 2.0,
    pellets: 9,
    rateMs: 800,
    auto: false,
    mag: 6,
    reserve: 24,
    reloadMs: 2600,
    spread: 0.035,
    adsSpread: 0.028,
    moveSpread: 0.05,
    crouchSpread: 0.7,
    stillSpread: 0.8,
    recoil: 0.045,
    climb: 0.006,
    range: 18,
    falloff: 0.25,
    pattern: [[1, 0], [1, 0.2]],
  },
};

export const GRENADE = {
  id: 'grenade',
  name: 'Spark Frag',
  desc: 'Fragmentation grenade. Bounces, then bursts.',
  price: 300,
  maxCarry: 2,
  fuseMs: 1600,
  radius: 6.5,
  damage: 110,
};

// Drift Smoke: a thick grey cloud that blocks SIGHT, not bullets. Enemies
// cannot see through it and bots will not shoot what they cannot see — but a
// bullet still flies straight through, so a smoke is a screen, never a wall.
export const SMOKE = {
  id: 'smoke',
  name: 'Drift Smoke',
  desc: 'Smoke screen. Blocks sight for 14 s, bullets still fly through.',
  price: 400,
  maxCarry: 1,
  radius: 4.2,
  duration: 14,
};

export const DEFUSE_KIT = {
  id: 'kit',
  name: 'Defuse Kit',
  desc: 'Halves defuse time: 5 s down to 2.5 s. Kept all match.',
  price: 350,
};

export const ARMOR = {
  id: 'armor',
  name: 'Plate Vest',
  desc: '50 armour. Soaks half of every hit until it breaks.',
  price: 650,
  points: 50,
  absorb: 0.5,
};

export const HELMET = {
  id: 'helmet',
  name: 'Kevlar Helmet',
  desc: 'Halves headshot damage you take. Bots love the head.',
  price: 400,
};

export const DEFUSE_SECONDS = 5;
export const DEFUSE_KIT_SECONDS = 2.5;
export const PLANT_SECONDS = 3;
export const DETONATE_SECONDS = 35;

// A weapon instance: mutable ammo state kept apart from the shared definition.
export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, reloading: 0, lastShot: -1e9, shotsFired: 0 };
}

export function weaponDamage(def, distance, head) {
  const falloff = distance > def.range ? def.falloff : 1;
  return def.damage * falloff * (head ? def.headMult : 1);
}

// The recoil kick of the Nth shot in a burst, from the weapon's pattern table:
// the pattern repeats from its last entry once the burst runs past it.
export function patternKick(def, shotsFired) {
  const table = def.pattern;
  const step = table[Math.min(shotsFired - 1, table.length - 1)];
  return { pitch: step[0], yaw: step[1] };
}

// Split incoming damage between armour plates and health.
export function applyArmor(damage, armor) {
  if (!armor || armor <= 0) return { absorbed: 0, health: damage, armorLeft: 0 };
  const absorbed = Math.min(armor, damage * ARMOR.absorb);
  return { absorbed, health: damage - absorbed, armorLeft: Math.max(0, armor - absorbed) };
}
