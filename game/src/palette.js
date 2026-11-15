// BREAKLINE palette: a night container terminal — deep blue dark, sodium-orange
// lamps, rust and teal containers, one amber accent for the objective. Every
// colour in the game and the HUD comes from this table, so the night scene and
// the interface read as one chosen look.
export const PALETTE = {
  canvas: 0x0d1218, // night sky / background
  ground: 0x2b2f36, // wet asphalt yard
  groundDark: 0x1e2228, // worn patches, oil stains
  wall: 0x39404a, // gunmetal perimeter
  wallLight: 0x4b545f,
  crate: 0x6b4e2e, // timber crates
  crateDark: 0x4e3822,
  metal: 0x232a33, // containers, dark steel
  metalLight: 0x4a5560,
  rust: 0x8a4a28, // rust-red containers
  tealBox: 0x2e6b66, // teal containers
  ochreBox: 0xa8873a, // ochre containers
  accent: 0xffb02e, // amber: HUD accent, site beacons
  lamp: 0xffc46b, // sodium lamp glow
  teamA: 0x2fd4c0, // Kestrel (player team) teal
  teamB: 0xff5a3c, // Vulture (opposition) signal orange
  ink: 0xf2ede2,
  muted: 0x9aa4ae,
  danger: 0xff4d5e,
  grass: 0x2e4028, // scrub at the yard edges
};

export const CSS = {
  canvas: '#0d1218',
  surface: '#161c24',
  hairline: '#2a323d',
  ink: '#f2ede2',
  muted: '#9aa4ae',
  accent: '#ffb02e',
  teamA: '#2fd4c0',
  teamB: '#ff5a3c',
  danger: '#ff4d5e',
};
