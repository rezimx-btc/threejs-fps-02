// Weapon and gear definitions: every gun is data, so the buy menu, the HUD, the
// viewmodel and the shooting code all read the same numbers. Damage falls off past
// `range`; headshots multiply it. Standing still and aiming down sights pays —
// spread grows with movement and shrinks hard while aiming, and each weapon kicks
// in its own climb pattern, so bursts beat holding the trigger down.
// Gear: a vest absorbs half the damage until its plates break; a defuse kit
// halves the time a defender needs on the charge.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm',
    name: 'P9 Sidearm',
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
    recoil: 0.011,
    climb: 0.0016,
    range: 42,
    falloff: 0.55,
  },
  smg: {
    id: 'smg',
    name: 'Hail SMG',
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
    recoil: 0.009,
    climb: 0.0022,
    range: 30,
    falloff: 0.5,
  },
  carbine: {
    id: 'carbine',
    name: 'VK-9 Carbine',
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
    recoil: 0.013,
    climb: 0.0018,
    range: 55,
    falloff: 0.6,
  },
  dmr: {
    id: 'dmr',
    name: 'Longbow DMR',
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
    recoil: 0.032,
    climb: 0.004,
    range: 95,
    falloff: 0.85,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Scatter-12',
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
    recoil: 0.045,
    climb: 0.006,
    range: 18,
    falloff: 0.25,
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

// Split incoming damage between armour plates and health.
export function applyArmor(damage, armor) {
  if (!armor || armor <= 0) return { absorbed: 0, health: damage, armorLeft: 0 };
  const absorbed = Math.min(armor, damage * ARMOR.absorb);
  return { absorbed, health: damage - absorbed, armorLeft: Math.max(0, armor - absorbed) };
}
