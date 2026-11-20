# eSheep

A modern take on the classic desktop sheep. A small animated sheep wanders around your screen, bounces
off the edges and other windows, and can be **grabbed and tossed** with the mouse. Electron and
TypeScript, with a functional, fully tested core that also powers a
[live demo you can try in your browser](https://milesburton.github.io/esheep/).

<!-- metrics:start -->

[![CI](https://github.com/milesburton/esheep/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/esheep/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-yellow.svg)](LICENSE)
[![unit tests: 205/205 passing](https://img.shields.io/badge/unit_tests-205%2F205_passing-brightgreen)](https://github.com/milesburton/esheep/actions/workflows/ci.yml)
[![e2e tests: 35/35 passing](https://img.shields.io/badge/e2e_tests-35%2F35_passing-brightgreen)](https://github.com/milesburton/esheep/actions/workflows/ci.yml)
[![line coverage: 99.7%](https://img.shields.io/badge/line_coverage-99.7%25-brightgreen)](https://github.com/milesburton/esheep/actions/workflows/ci.yml)
[![branch coverage: 96.4%](https://img.shields.io/badge/branch_coverage-96.4%25-brightgreen)](https://github.com/milesburton/esheep/actions/workflows/ci.yml)
![source: 2,632 lines TypeScript](https://img.shields.io/badge/source-2%2C632_lines_TypeScript-blue)
[![demo size: 241 kB](https://img.shields.io/badge/demo_size-241_kB-blue)](https://milesburton.github.io/esheep/)

<!-- metrics:end -->

<!-- screenshots:start -->

<figure>
  <img src="docs/screenshots/demo-walk.png" alt="The woolly sheep walking along the bottom of a display, next to two windows" width="720" />
  <figcaption>The live demo: a sheep that walks, falls, sleeps and lands on windows.</figcaption>
</figure>

<figure>
  <img src="docs/screenshots/demo-grab.png" alt="The sheep held mid-air by the mouse pointer" width="720" />
  <figcaption>Grab the sheep with the mouse...</figcaption>
</figure>

<figure>
  <img src="docs/screenshots/demo-dual.png" alt="Two side-by-side monitors with the sheep on the right-hand one" width="720" />
  <figcaption>...and it wanders across multiple monitors.</figcaption>
</figure>

<figure>
  <img src="docs/screenshots/app-settings.png" alt="The settings window with a speed slider, sprite pack picker and sound option" width="720" />
  <figcaption>The desktop app's settings window.</figcaption>
</figure>

<!-- screenshots:end -->

## Try it

**[Open the live demo](https://milesburton.github.io/esheep/)**: a fake desktop with draggable
windows and an optional second monitor. Grab the sheep, fling it, and watch it land on a window.

## Features

- Transparent, always-on-top, click-through window, one per sheep and sized to it (52 × 52 px for the 40 px classic sprite), that
  only catches the mouse over the
  sheep's own pixels.
- **Grab and toss**: pick the sheep up, drop it, or flick it. A throw uses your pointer's recent
  velocity, then the sheep tumbles, bounces off walls, windows and floors, and lands (harder throws
  land harder).
- **Multi-monitor**: the walkable area is the union of every display; the sheep crosses between them.
- **Window collisions** on Windows and macOS (via `node-window-manager`): the sheep walks on top of
  windows, hops up onto them and bounces off their sides. Windows bounds are converted from physical
  pixels to DIPs, so high-DPI and mixed-DPI desktops line up. macOS asks for the Accessibility
  permission (without it, or on Linux, the sheep uses screen edges only).
- **Sprite packs**: two bundled, plus any desktopPet/eSheep-format `animations.xml`.
- **Kick-about** (demo): press _Kick-about_ and a ball drops in; the sheep notice it, run over and
  kick it around. Grab and throw the ball yourself and they chase it. Packs without a kick animation
  borrow the run skid.
- **High resolution**: the canvas is rendered at the display's physical resolution with smoothing off,
  so the pixel art stays crisp on retina and 4K screens (and follows a window between monitors of
  different density). A **Size** setting draws the sheep ×1 to ×4 (whole numbers look best); speed
  scales with it.
- **A flock**: run 1 to 12 sheep at once (one transparent window each). Add and remove them from the
  tray or Settings, or with the demo's Add sheep button.
- **Sheep meet**: a sheep that walks into another at the same level stops to greet it (the pack's
  `sync` animation) or leaps over it and lands on the far side. Sheep standing side by side also
  unlock the pack's `petSide` behaviours. In the app this uses shared window positions.
- Tray menu (Pause / Resume, Add / Remove sheep, Settings…, Quit), persisted preferences (speed,
  sound, pack, sheep count) and start-at-login.

## Run it

Requires Node 22 or newer.

```bash
npm install
npm run dev          # compile and launch the desktop app
npm run demo         # build and serve the browser demo on http://localhost:4173
```

| Command                   | What it does                                         |
| :------------------------ | :--------------------------------------------------- |
| `npm run build`           | Compile and package installers with electron-builder |
| `npm test`                | Unit tests (Vitest)                                  |
| `npm run test:coverage`   | Unit tests with coverage thresholds                  |
| `npm run test:e2e`        | Playwright: browser demo, plus the real app (below)  |
| `npm run lint` / `format` | ESLint / Prettier                                    |
| `npm run readme`          | Refresh the pills and screenshots above from reports |
| `npm run fetch-original`  | Re-download the original eSheep pack                 |

The Electron end-to-end tests need a display. On a headless Linux box run them under Xvfb:
`xvfb-run -a npx playwright test --project=electron`. If your shell sets `ELECTRON_RUN_AS_NODE`
(some editors do), unset it first.

## Using it

- **Tray icon**: Pause / Resume, Add sheep, Remove sheep, Start / Stop kick-about, Settings…, Quit.
- **Grab**: press on the sheep and hold. It dangles. Move to carry it.
- **Drop**: release while the pointer is still, and it falls under gravity.
- **Toss**: release mid-flick. Throw speed is capped at 3,200 px/s.
- **Settings**: speed (0.5 to 2×), sound, which sprite pack to use, size (×1 to ×4) and how many sheep.

> **Linux:** grabbing is unavailable because Electron cannot forward mouse-move events through a
> click-through window there. The sheep still wanders; it just cannot be picked up. The browser demo
> works everywhere.

## Sprite packs

| Pack      | Behaviour                                                                                                                                                                          |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builtin` | The original brief: a sheep that drifts in straight lines and bounces.                                                                                                             |
| `woolly`  | A classic-style sheep using all 56 classic animations: it walks, turns, sleeps, wees, grazes, climbs walls, walks the ceiling, hops onto windows, takes a bath, falls and tumbles. |

Both are generated by [`scripts/make-assets.mjs`](scripts/make-assets.mjs) and are original work under
the MIT licence. Drop another pack into `assets/packs/<name>/animations.xml` (the desktopPet format:
tile sheet, probability-weighted transitions, `border` and `gravity` hooks) and choose it in Settings.

### The original eSheep art

The classic eSheep artwork (the `esheep64` pack from
[Adrianotiger/desktopPet](https://github.com/Adrianotiger/desktopPet), sheep by Tatsutoshi Nomura for
Fuji Television, image rip by LiL_Stenly) is bundled as `assets/packs/original/` and is the demo's
default. It is included under the repository owner's licence; see
[`assets/packs/original/NOTICE.md`](assets/packs/original/NOTICE.md). The desktopPet code is MIT.
Every classic pack, original or generated, is livened up at load time by
[`src/main/tune.ts`](src/main/tune.ts) (faster tempo and stride, tuned transition weights).
`npm run fetch-original` re-downloads the pack.

## How it works

```text
src/core      pure, immutable logic: seeded rng, expression evaluator, geometry, physics,
              pointer/throw velocity, the bounce sheep, and the pack animation engine
src/web       thin DOM shell shared by app and demo: Stage (drag, throw, draw), sprites, sound
src/app       Electron renderer (sheep window and settings page)
src/demo      the GitHub Pages demo
src/main      Electron main: window, tray, prefs, pack parsing, window enumeration, auto-launch
src/preload   the narrow contextBridge API (no Node in the renderer)
```

The core has no DOM, Electron or clock access: time, the world and the random seed go in, a new state
comes out. That is what makes it deterministic, easy to test exhaustively, and reusable by the demo.
See [docs/architecture.md](docs/architecture.md) and [docs/decisions.md](docs/decisions.md).

## Testing

- **Unit** (Vitest): the core, pack parsing, window filtering, the stage and the README tooling, with
  coverage thresholds enforced in CI.
- **End to end** (Playwright): the built demo in Chromium (grab, toss, landing on windows, two
  monitors, pause, speed) and the real Electron app under Xvfb (window flags, API surface, tray menu,
  settings persistence, pack switching, grabbing).
- **Soak**: `npm run sim` runs the engine headlessly over many spawns across two monitors.

## The README updates itself

On every push to `main`, CI runs all suites, regenerates the screenshots from the built demo, and runs
`npm run readme`, which rewrites the pills and gallery above (and `docs/badges/*.json`) from the real
test and coverage reports. A bot commit pushes the result. Nothing in those blocks is edited by hand.

## Known gaps

- Linux has no window enumeration (EWMH on X11 could do it; Wayland exposes no global geometry).
- macOS and Windows window enumeration, the Windows DPI conversion and the macOS permission flow are
  covered by unit tests with fakes but have not been run on real machines.
- Mixed-DPI multi-monitor positioning of the sheep windows themselves can still drift (an Electron
  limitation).
- Packaging (`npm run build`) is configured for NSIS, DMG and AppImage and builds on all three OSes
  in the manual **Package** workflow; only the Linux build has been launched.

## Licence

[MIT](LICENSE)
