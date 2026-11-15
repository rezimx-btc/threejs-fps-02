[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/rezimx-btc/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/rezimx-btc/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# SANDLINE — a three.js tactical FPS

[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/threejs-fps-02)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A round-based tactical first-person shooter in the browser, built on three.js
0.187.0 with no build step and no network request. Vanguard (you + three bot
teammates) attacks; Ember (four bots) defends the Foundry and the Crane Yard.
Plant the charge or wipe the defence — first to 5 rounds takes the match.

## How to play

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to capture the pointer) |
| Click | Fire |
| R | Reload |
| 1–4 | Carbine / DMR / Shotgun / Sidearm |
| B | Buy menu (buy phase) |
| G | Throw a Spark Frag grenade |
| E | Plant the charge (hold, inside a site) |
| Ctrl | Crouch |
| Space | Jump |

## The game

- **Rounds:** 15-second buy phase, then a 100-second round. Win by planting
  the charge and defending it until detonation, by eliminating the Ember team,
  or — for the defence — by running the clock out or defusing the charge.
  First to 5 rounds wins the match (9 rounds max).
- **Economy:** $800 to start, $300 a kill, $300 to plant, $3,250 for a round
  win, $1,900 for a loss. Spend it in the buy menu on the VK-9 Carbine, the
  Longbow DMR, the Scatter-12 shotgun and Spark Frag grenades. Bought guns
  stay bought; ammo refills every round.
- **Gunplay:** hitscan against body and head hitboxes (headshots pay more),
  recoil and spread that punish firing on the move, acceleration-based
  movement with crouching and jumping, and AABB collision with the map — so
  stopping to aim pays.
- **Bots:** waypoint navigation over the map graph, site holds, rotations,
  reaction delays, burst fire with distance-based spread, strafing in a
  firefight, and a defuse push when the charge is planted. They react to
  gunfire and to what they see.
- **The map:** Foundry Yard, an original 46 × 36 m dusk industrial yard —
  A-long, mid through the double doors, B-long past the containers, with
  crates, furnace blocks and stacked containers for cover, and a live minimap.
- **Sound:** every effect is synthesised with WebAudio (no audio assets):
  per-weapon shots, reload clicks, hit and kill ticks, plant beeps, the
  detonation, and round win/lose stingers.

## Layout

```
game/
  index.html            HUD, overlays, import map
  src/
    main.js             boot, fixed-step loop, round flow, player shooting
    map.js              Foundry Yard geometry, colliders, waypoint graph
    bots.js             bot AI: routes, holds, engages, defuses
    actors.js           bot bodies, hitboxes, shared movement
    combat.js           hitscan, line of sight, grenades, the charge, tracers
    state.js            match state: phases, rounds, money, loadout
    hud.js              HUD, minimap, buy menu, overlays
    player.js           movement: accel, friction, crouch, jump, collision
    weapons.js          weapon and grenade definitions
    audio.js            synthesised WebAudio effects
    viewmodel.js        first-person gun, recoil, muzzle flash
    input.js            keyboard, pointer lock, firing
    palette.js          the one chosen palette
  vendor/three/        three.js 0.187.0, vendored byte for byte
screenshots/           real renders of the game's own code (headless Chromium)
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
