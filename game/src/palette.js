// SANDLINE palette: a dusk industrial yard — warm sand, gunmetal, teal Vanguard
// against ember-orange opposition, one amber accent. Every colour in the game and
// the HUD comes from this table, so the scene reads as one chosen palette.
export const PALETTE = {
  canvas: 0x171a20, // sky / background
  ground: 0x97876a, // sand-packed yard
  groundDark: 0x6e6049,
  wall: 0x3a3f47, // gunmetal walls
  wallLight: 0x4a505a,
  crate: 0x5d4a33, // timber crates
  crateDark: 0x4a3a28,
  metal: 0x2c323a, // containers and pipes
  metalLight: 0x565e68,
  accent: 0xf0a830, // amber: HUD accent, site markers
  teamA: 0x35c4b5, // Vanguard (player team) teal
  teamB: 0xe4572e, // Ember (opposition) orange-red
  ink: 0xece7db,
  muted: 0x9aa0a8,
  danger: 0xe5484d,
  grass: 0x55663f, // scrub patches at the yard edges
};

export const CSS = {
  canvas: '#171a20',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#ece7db',
  muted: '#9aa0a8',
  accent: '#f0a830',
  teamA: '#35c4b5',
  teamB: '#e4572e',
  danger: '#e5484d',
};
