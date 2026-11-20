import { kickBall, stepBall, type Ball } from '../core/ball';
import { clampIntoAreas } from '../core/geometry';

/** How long a kick-about lasts before the ball quietly goes away (it is opt-in, never permanent). */
export const KICK_ABOUT_MS = 120_000;
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
  start(): void;
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
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

export const createKickAbout = (deps: KickAboutDeps): KickAbout => {
  let ball: Ball | null = null;
  let held = false;
  let elapsed = 0;
  let kicks = 0;

  const stop = (): void => {
    ball = null;
    held = false;
  };

  return {
    start: () => {
      if (ball) return;
      const area = deps.areas()[0] ?? { x: 0, y: 0, width: 800, height: 600 };
      ball = { x: area.x + area.width / 2, y: area.y + 20, vx: 140, vy: 0 };
      held = false;
      elapsed = 0;
      kicks = 0;
    },
    stop,
    active: () => ball !== null,
    state: () => (ball ? { ...ball, size: deps.size() } : null),
    tick: (dtMs) => {
      if (!ball) return false;
      const dt = Math.min(Math.max(0, finite(dtMs)), MAX_STEP_MS);
      elapsed += dt;
      if (elapsed >= KICK_ABOUT_MS) {
        stop();
        return false;
      }
      if (!held) {
        ball = stepBall(ball, deps.world(), deps.size(), (dt * (deps.speed?.() ?? 1)) / 1000);
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
      if (ball) held = true;
    },
    move: (x, y) => {
      if (!ball || !held) return;
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
      if (ball) ball = { x, y, vx: 0, vy: 0 };
    },
  };
};
