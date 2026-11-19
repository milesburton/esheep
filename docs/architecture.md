# Architecture

## Layers

```text
                +-----------------+
                |    src/core     |  pure functions over immutable state
                +--------+--------+
                         |
                +--------v--------+
                |    src/web      |  Stage: pointer -> grab/drag/throw, draw, place
                +--------+--------+
                   |           |
          +--------v--+   +----v--------+
          |  src/app  |   |  src/demo   |
          | (Electron)|   | (GitHub     |
          |           |   |  Pages)     |
          +-----+-----+   +-------------+
                |
          src/preload -> src/main (tray, prefs, packs, windows, auto-launch)
```

Only `src/main` touches native APIs. The renderer reaches it through the narrow `window.electronAPI`
exposed by the preload script (context isolation on, sandbox on, no Node integration).

## The core

- `rng.ts`: seeded mulberry32 that returns `[value, nextSeed]`, so state is threaded through pure
  functions and any run replays exactly from its seed.
- `expr.ts`: an arithmetic evaluator for pack expressions. Packs are untrusted data, so no `eval`.
- `geometry.ts`: display union tests, overlap tests, "stop exactly at the edge" search.
- `physics.ts`: sub-stepped ballistic motion for tossed sheep (gravity, restitution, floors, walls).
- `pointer.ts`: grab offset, a short ring of pointer samples, and release velocity.
- `engine.ts`: the classic-pack state machine (weighted `next`/`border`/`gravity` transitions with
  `only` contexts: taskbar, window, vertical, horizontal+, windowSide) plus grab, release and thrown
  modes.
- `bounce.ts`: the built-in bouncing sheep, with the same grab/toss interaction.

## Sheep modes

`walk` follows the pack's animation graph. `held` pins the sheep to the pointer and loops the `drag`
animation. `thrown` hands motion to `physics.ts` while looping the `toss` animation, then returns to
`walk` through a landing animation chosen by the hardest impact (`fall hard` / `fall soft` / `land`).

## Click-through

The sheep window ignores mouse events, but forwards mouse moves to the renderer. The renderer checks
the alpha of the canvas pixel under the pointer and asks main to stop ignoring events only while it is
over the sheep. Linux cannot forward moves, so grabbing is disabled there.
