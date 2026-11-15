[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/threejs-fps-02)
[![Built on make.fun](https://make.fun/badge.svg)](https://make.fun)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# BREAKLINE — a three.js tactical FPS

A 5v5 round-based tactical first-person shooter in the browser, built on three.js
0.187.0 with no build step and no network request. Kestrel (you + four bot
teammates) attacks; Vulture (five bots) defends the Depot and the Silos at the
Kestrel Terminal. Plant the charge or wipe the defence — first to 5 rounds takes
the match. A planted charge can be defused, so a plant is never safe until it blows.

## What is new over a plain round shooter

- **5v5 squad play.** The IGL calls a round plan (hit A, fake B) and the squad
  executes it: entry first in, support trading, lurker faking the other site,
  AWPer holding the long angle. Defenders anchor their sites and retake together.
- **Real defuse.** Defenders push the planted charge as a pair; the closest one
  channels the defuse while the rest hold the retake angles.
- **Aim down sights.** Right mouse steadies the gun, narrows the field of view
  and tightens the spread — at the cost of movement speed.
- **Recoil with a climb pattern.** Bursts climb; the trigger resting resets the
  climb. Bursts beat holding the trigger down.
- **Hearing and direction.** Footsteps grow louder as enemies close in, and a
  red arc at the screen edge points at whoever just shot you.
- **Economy with gear.** Five guns, frag grenades, a plate vest that soaks half
  of every hit, and a Kevlar helmet that halves headshot damage.
- **Scoreboard and compass.** Tab shows kills per fighter; a compass strip shows
  the site bearings. The round plan, radio callouts and the MVP are all on screen.

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
| E | Plant the charge (hold, inside a site) |
| Tab | Scoreboard (hold) |
| Ctrl | Crouch |
| Space | Jump |

## Layout

```
game/
  index.html            HUD, overlays, import map
  src/
    main.js             boot, fixed-step loop, round flow, player shooting
    map.js              Kestrel Terminal geometry, colliders, waypoint graph
    bots.js             bot AI: roles, round plan, retake, defuse, callouts
    actors.js           bot bodies, hitboxes, armour, shared movement
    combat.js           hitscan, line of sight, grenades, the charge, tracers
    state.js            match state: phases, rounds, money, loadout, MVP
    hud.js              HUD, compass, minimap, buy menu, scoreboard, overlays
    player.js           movement: accel, friction, crouch, jump, ADS, collision
    weapons.js          weapon, grenade, armour and helmet definitions
    audio.js            synthesised WebAudio effects, footsteps
    viewmodel.js        first-person gun, recoil, ADS, muzzle flash
    input.js            keyboard, pointer lock, firing, ADS
    palette.js          the one chosen palette
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
