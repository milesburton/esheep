import { TOL, overlapsX } from './geometry.js';
import { stepBallistic, type Body } from './physics.js';

/** A kick-about ball: a square body for physics (drawn as a circle) with the same shape as a thrown sheep. */
export type Ball = Body;

export const BALL_GRAVITY = 2600; // px / s²
export const BALL_RESTITUTION = 0.72;
/** Rolling friction on a floor (1 / s): speed decays by e^(-k t). */
export const ROLL_FRICTION = 1.4;
/** A ball rolling slower than this (px/s) stops. */
export const ROLL_STOP = 12;

export const ballRect = (b: Ball, size: number): Rect => ({
  x: b.x,
  y: b.y,
  width: size,
  height: size,
});

/** Is the ball resting on a display bottom or a window top? */
export const onFloor = (b: Ball, size: number, world: World): boolean => {
  const feet = b.y + size;
  return (
    world.windows.some((w) => Math.abs(feet - w.y) <= TOL && overlapsX(size, b.x, w)) ||
    world.areas.some((a) => Math.abs(feet - (a.y + a.height)) <= TOL && overlapsX(size, b.x, a))
  );
};

/** Advance the ball by `dtSec`: bouncing in the air, rolling (with friction) on floors. */
export const stepBall = (b: Ball, world: World, size: number, dtSec: number): Ball => {
  const opts = { size, gravity: BALL_GRAVITY, restitution: BALL_RESTITUTION };
  if (b.vy === 0 && onFloor(b, size, world)) {
    // Rolling: slide horizontally (walls and edges still reflect), then check we still have a floor.
    const moved = stepBallistic(b, world, { ...opts, gravity: 0 }, dtSec).body;
    const vx = moved.vx * Math.exp(-ROLL_FRICTION * dtSec);
    return { ...moved, y: b.y, vx: Math.abs(vx) < ROLL_STOP ? 0 : vx, vy: 0 };
  }
  return stepBallistic(b, world, opts, dtSec).body;
};

/** A kick replaces the ball's velocity (so repeated kicks never pile up) and lifts it off the floor. */
export const kickBall = (b: Ball, k: { vx: number; vy: number }): Ball => ({
  ...b,
  vx: k.vx,
  vy: k.vy,
});

/** A ball that has not moved for this long is taken to be stuck (on a perch nobody can reach, say). */
export const REST_RESET_MS = 6000;

/** Milliseconds the ball has now been at rest: `prev` plus this step if it is still, else back to zero. */
export const restTime = (prev: number, b: Ball, dtMs: number): number =>
  Math.hypot(b.vx, b.vy) <= ROLL_STOP ? prev + Math.max(0, dtMs) : 0;

/**
 * Where to (re)start a ball: dropped from near the top of the primary display, in the column closest to
 * the middle that has no window anywhere in it, so it falls to the floor and not onto a window top where
 * no sheep can reach it (it used to come to rest on the demo's windows for half a minute at a time).
 * If windows cover every column it falls back to the middle.
 */
export const dropSpot = (
  areas: readonly Rect[],
  windows: readonly Rect[],
  size: number,
): { x: number; y: number } => {
  const a = areas[0] ?? { x: 0, y: 0, width: 800, height: 600 };
  const middle = Math.round(a.x + a.width / 2 - size / 2);
  const clear = (x: number): boolean =>
    !windows.some(
      (w) => x < w.x + w.width && x + size > w.x && w.y < a.y + a.height && w.y + w.height > a.y,
    );
  const step = Math.max(1, size * 2);
  for (let k = 0; k * step <= a.width / 2; k++)
    for (const side of k === 0 ? [0] : [1, -1]) {
      const x = middle + side * k * step;
      if (x >= a.x && x + size <= a.x + a.width && clear(x)) return { x, y: a.y + 20 };
    }
  return { x: middle, y: a.y + 20 };
};
