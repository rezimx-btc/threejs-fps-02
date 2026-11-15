// CROSSCURRENT palette: a dawn harbour quay — cold blue dark, low amber sun,
// rust and sea-green containers, one signal-amber accent for the objective.
// Every colour in the game and the HUD comes from this table, so the dawn scene
// and the interface read as one chosen look.
export const PALETTE = {
  canvas: 0x141c26, // dawn sky / background
  ground: 0x33383c, // damp concrete quay
  groundDark: 0x23272b, // worn patches, oil stains
  wall: 0x3d454e, // gunmetal perimeter
  wallLight: 0x525d68,
  crate: 0x7a5a30, // timber crates
  crateDark: 0x54401f,
  metal: 0x252c34, // containers, dark steel
  metalLight: 0x4e5a66,
  rust: 0x96502a, // rust-red containers
  tealBox: 0x2f7a6e, // sea-green containers
  ochreBox: 0xb08a35, // ochre containers
  accent: 0xffb02e, // amber: HUD accent, site beacons
  lamp: 0xffc46b, // dawn lamp glow
  sun: 0xffd9a0, // low sun
  water: 0x1d3a4a, // harbour water beyond the north wall
  teamA: 0x2fd4c0, // Meridian (player team) teal
  teamB: 0xff5a3c, // Breakwater (opposition) signal orange
  ink: 0xf2ede2,
  muted: 0x9aa4ae,
  danger: 0xff4d5e,
  smoke: 0xbfc8cc, // drift-smoke grey
  grass: 0x37452c, // scrub at the yard edges
};

export const CSS = {
  canvas: '#141c26',
  surface: '#182029',
  hairline: '#2c3540',
  ink: '#f2ede2',
  muted: '#9aa4ae',
  accent: '#ffb02e',
  teamA: '#2fd4c0',
  teamB: '#ff5a3c',
  danger: '#ff4d5e',
};
