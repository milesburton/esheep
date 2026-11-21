import { REST_RESET_MS, dropSpot, kickBall, restTime, stepBall, type Ball } from '../core/ball';
import { clampIntoAreas } from '../core/geometry';

/** How long a kick-about lasts before the ball quietly goes away (it is opt-in, never permanent). */
export const KICK_ABOUT_MS = 120_000;
/** A held ball nobody has moved for this long is dropped (a lost mouse-up must not freeze it for good). */
export const HELD_TIMEOUT_MS = 8000;
/** Cap on one simulation step, so a stalled timer can't teleport the ball. */
const MAX_STEP_MS = 50;

export interface BallState extends Ball {
  readonly size: number;
}

export interface KickAboutDeps {
  /** The ball's side in px (depends on the sprite scale). */
  size: () => number;
  /** What the ball can roll on and bounce off. */
  world: () => World;
  /** Display work areas, primary first (where a new ball appears). */
  areas: () => readonly Rect[];
  /** Speed preference multiplier. */
  speed?: () => number;
}

export interface KickAbout {
  /** Put a ball in play; it goes away after `limitMs` (default: the kick-about time limit). */
  start(limitMs?: number): void;
  stop(): void;
  active(): boolean;
  /** Current ball (a copy), or null when there is no kick-about. */
  state(): BallState | null;
  /** Advance by `dtMs`; returns true if the ball is still in play. Stops itself after the time limit. */
  tick(dtMs: number): boolean;
  /** A sheep kicked it (ignored while you are holding the ball). */
  kick(k: { vx: number; vy: number }): void;
  /** Pick the ball up: it stops and follows `grab` / `move` until `release`. */
  grab(): void;
  move(x: number, y: number): void;
  release(vx: number, vy: number): void;
  held(): boolean;
  /** Total kicks delivered since the last start (handy for tests and stats). */
  kicks(): number;
  /** Put the ball somewhere (tests, and "reset"). */
  place(x: number, y: number): void;
  /** How many times a ball that had come to rest was put back in play, and held balls dropped. */
  resets(): number;
  autoReleases(): number;
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

export const createKickAbout = (deps: KickAboutDeps): KickAbout => {
  let ball: Ball | null = null;
  let held = false;
  let elapsed = 0;
  let limit = KICK_ABOUT_MS;
  let kicks = 0;
  let restMs = 0; // how long it has been lying still
  let heldMs = 0; // how long it has been held without being moved
  let resets = 0;
  let autoReleases = 0;

  const stop = (): void => {
    ball = null;
    held = false;
  };

  /** Drop the ball in again, over a clear stretch of floor. */
  const redrop = (): void => {
    const spot = dropSpot(deps.areas(), deps.world().windows, deps.size());
    ball = { x: spot.x, y: spot.y, vx: 0, vy: 0 };
    restMs = 0;
  };

  return {
    start: (limitMs = KICK_ABOUT_MS) => {
      if (ball) return;
      limit = limitMs;
      const spot = dropSpot(deps.areas(), deps.world().windows, deps.size());
      ball = { x: spot.x, y: spot.y, vx: 140, vy: 0 };
      held = false;
      elapsed = 0;
      kicks = 0;
      restMs = 0;
      heldMs = 0;
      resets = 0;
      autoReleases = 0;
    },
    stop,
    active: () => ball !== null,
    state: () => (ball ? { ...ball, size: deps.size() } : null),
    tick: (dtMs) => {
      if (!ball) return false;
      const dt = Math.min(Math.max(0, finite(dtMs)), MAX_STEP_MS);
      elapsed += dt;
      if (elapsed >= limit) {
        stop();
        return false;
      }
      if (!held) {
        ball = stepBall(ball, deps.world(), deps.size(), (dt * (deps.speed?.() ?? 1)) / 1000);
        restMs = restTime(restMs, ball, dt);
        if (restMs >= REST_RESET_MS) {
          // Lying still this long means nobody can get at it (a window top, the far side of the screen).
          redrop();
          resets += 1;
        }
      } else {
        heldMs += dt;
        if (heldMs >= HELD_TIMEOUT_MS) {
          held = false; // the mouse-up was lost: let go
          heldMs = 0;
          autoReleases += 1;
        }
      }
      return true;
    },
    kick: (k) => {
      if (ball && !held) {
        ball = kickBall(ball, { vx: finite(k.vx), vy: finite(k.vy) });
        kicks += 1;
      }
    },
    grab: () => {
      if (ball) {
        held = true;
        heldMs = 0;
      }
    },
    move: (x, y) => {
      if (!ball || !held) return;
      heldMs = 0;
      const at = clampIntoAreas(deps.world().areas, deps.size(), finite(x), finite(y));
      ball = { ...ball, ...at, vx: 0, vy: 0 };
    },
    release: (vx, vy) => {
      if (!ball || !held) return;
      held = false;
      ball = { ...ball, vx: finite(vx), vy: finite(vy) };
    },
    held: () => held,
    kicks: () => kicks,
    place: (x, y) => {
      if (ball) {
        ball = { x, y, vx: 0, vy: 0 };
        restMs = 0;
      }
    },
    resets: () => resets,
    autoReleases: () => autoReleases,
  };
};
