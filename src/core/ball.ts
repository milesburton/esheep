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
