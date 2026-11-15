[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/rezimx-btc/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/rezimx-btc/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# CROSSCURRENT — a three.js tactical FPS

A 5v5 round-based tactical first-person shooter in the browser, built on three.js
0.187.0 with no build step and no network request. Meridian (you + four bot
teammates) attacks first; Breakwater (five bots) defends the Crane Yard and the
Fuel Dock at the Crosscurrent Quay. Plant the charge or wipe the defence — first
to 5 rounds takes the match. After round 4 the sides swap: you defend, an
attacker bot carries the charge, and your defuse kit halves the defuse time. A
planted charge can be defused, so a plant is never safe until it blows.

## What is new over a plain round shooter

- **Half-time side swap.** You attack rounds 1–4, then defend rounds 5–9. The
  defuse kit ($350, defuse 5 s → 2.5 s) only matters because you actually defuse.
- **The carrier bot plants.** If you go down while attacking — or while you
  defend — the IGL bot carries the charge to the site and plants it alone, so a
  round is never unwinnable because the carrier died.
- **Drift Smoke (F).** A $400 smoke screen that blocks SIGHT, not bullets. Bots
  cannot see or shoot through it; bullets still fly straight through it. The
  lurker smokes the fake site, defenders smoke the retake, the carrier smokes
  the plant.
- **Recoil patterns, not dice.** Every weapon has a pattern table: the Nth shot
  of a burst kicks along a fixed [pitch, yaw] pattern you can learn and pull
  down. Standing still steadies the gun, crouching steadies it further, and the
  first shot from a standstill is nearly perfect.
- **A second floor.** The gantry walkway overlooks both sites, reached by two
  stepped staircases (step-up movement for player and bots). The AWPer
  sometimes takes the high ground; the underpass runs beneath the deck.
- **Bots that hear.** Gunfire and explosions within 26 m pull a bot with no
  target over to investigate. Bots also lose their target in smoke and refuse
  to shoot what they cannot see.
- **Loss-bonus economy.** Losing rounds in a row grows the loss bonus ($1,900 →
  $2,400 → $2,900), so a losing streak never strands the team on pistols.
- **Round history + eco toast.** A W/L chip per finished round and the payout
  of the last round, always on screen.

## How to play

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | ------ |
| W A S D | Move |
| Mouse | Look (click to capture the pointer) |
| Right mouse | Aim down sights |
| Click | Fire |
| R | Reload |
| 1–5 | Sidearm / SMG / Carbine / DMR / Shotgun |
| B | Buy menu (buy phase) |
| G | Throw a Spark Frag grenade |
| F | Throw Drift Smoke |
| E | Plant the charge (hold, inside a site) / defuse (hold, on the charge) |
| Tab | Scoreboard (hold) |
| Ctrl | Crouch |
| Space | Jump |

## Layout

```
game/
  index.html            HUD, overlays, import map
  src/
    main.js             boot, fixed-step loop, round flow, half-time swap, shooting
    map.js              Crosscurrent Quay geometry, walkway, colliders, waypoint graph
    bots.js             bot AI: roles, round plan, retake, defuse, carrier plant, hearing, smoke
    actors.js           bot bodies, hitboxes, armour, step-up movement, walk cycle
    combat.js           hitscan, line of sight (smoke-aware), grenades, the charge, tracers, impacts
    smoke.js            drift-smoke clouds that block sight, not bullets
    state.js            match state: phases, rounds, money, loss bonus, loadout, MVP
    hud.js              HUD, compass, minimap, buy menu, scoreboard, round history, eco toast
    player.js           movement: accel, friction, crouch, jump, ADS, collision, step-up
    weapons.js          weapon, grenade, smoke, kit, armour and helmet definitions, recoil patterns
    audio.js            synthesised WebAudio effects, footsteps (concrete / steel)
    viewmodel.js        first-person gun, recoil, ADS, muzzle flash, movement sway
    input.js            keyboard, pointer lock, firing, ADS, one-shot keys
    palette.js          the one chosen palette (dawn quay)
  vendor/three/         three.js 0.187.0, vendored byte for byte
screenshots/            real renders of the game's own code (headless Chromium)
main.ts                 hands game/ + screenshots/ to /output with a dossier
```

## Handing in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with `buildDossier` from `vendor/makefun-threejs.ts`
(the kit's copy, unchanged).

## Originality

Everything here is original: the map, the team and weapon names, the art
(procedural geometry and one palette) and the sounds (synthesised). It is a
Counter-Strike-*style* game — rounds, economy, an objective — never a copy of
any commercial game's map, characters, art or names.

## License

MIT — see [LICENSE](LICENSE).
