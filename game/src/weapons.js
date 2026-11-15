// Weapon definitions: every gun is data, so the buy menu, the HUD, the viewmodel
// and the shooting code all read the same numbers. Damage falls off past `range`.
// Headshots multiply damage; moving and firing widen the spread, so stopping to aim
// pays — the core of the gunplay the bounty asks for.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm',
    name: 'P9 Sidearm',
    kind: 'sidearm',
    desc: 'Reliable pistol. Free, always with you.',
    price: 0,
    damage: 34,
    headMult: 2.5,
    rateMs: 160,
    auto: false,
    mag: 12,
    reserve: 48,
    reloadMs: 1400,
    spread: 0.006,
    moveSpread: 0.02,
    recoil: 0.011,
    range: 42,
    falloff: 0.55,
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
    moveSpread: 0.026,
    recoil: 0.013,
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
    moveSpread: 0.045,
    recoil: 0.032,
    range: 90,
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
    moveSpread: 0.05,
    recoil: 0.045,
    range: 18,
    falloff: 0.25,
  },
};

export const GRENADE = {
  id: 'grenade',
  name: 'Spark Frag',
  desc: 'Fragmentation grenade. Bounces once, then bursts.',
  price: 300,
  maxCarry: 2,
  fuseMs: 1600,
  radius: 6.5,
  damage: 110,
};

// A weapon instance: mutable ammo state kept apart from the shared definition.
export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, reloading: 0, lastShot: -1e9, cooldown: 0 };
}

export function weaponDamage(def, distance, head) {
  const falloff = distance > def.range ? def.falloff : 1;
  return def.damage * falloff * (head ? def.headMult : 1);
}
