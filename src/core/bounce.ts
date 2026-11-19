import { intersects, onScreen } from './geometry.js';

/**
 * The built-in "bounce" sheep: drifts in a straight line, reflecting off display edges and other
 * windows. Can be grabbed and thrown; a throw decays back to cruising speed.
 */

export const BASE_SPEED = 120; // px / s at speed multiplier 1.0
const FRAMES = 8;
const FRAME_MS = 100;
const DECAY_PER_SEC = 2;
const MIN_TOSS_SPEED = 250;

export interface BounceState {
  readonly x: number;
  readonly y: number;
  /** Unit direction. */
  readonly dx: number;
  readonly dy: number;
  /** Current speed in px/s (above cruise right after a throw). */
  readonly speed: number;
  readonly frame: number;
  readonly frameMs: number;
  readonly held: boolean;
}

export const bounceStart = (x: number, y: number): BounceState => {
  const n = Math.hypot(1, 0.6);
  return { x, y, dx: 1 / n, dy: 0.6 / n, speed: BASE_SPEED, frame: 0, frameMs: 0, held: false };
};

export interface BounceUpdate {
  readonly state: BounceState;
  readonly bounced: boolean;
}

/** Push the sprite out of `r` along the axis of least penetration and reflect that axis. */
const resolveWindow = (s: BounceState, r: Rect, size: number): BounceState => {
  const left = s.x + size - r.x;
  const right = r.x + r.width - s.x;
  const top = s.y + size - r.y;
  const bottom = r.y + r.height - s.y;
  if (Math.min(left, right) < Math.min(top, bottom)) {
    return left < right
      ? { ...s, x: r.x - size, dx: -Math.abs(s.dx) }
      : { ...s, x: r.x + r.width, dx: Math.abs(s.dx) };
  }
  return top < bottom
    ? { ...s, y: r.y - size, dy: -Math.abs(s.dy) }
    : { ...s, y: r.y + r.height, dy: Math.abs(s.dy) };
};

export const bounceUpdate = (
  s: BounceState,
  world: World,
  size: number,
  speedPref: number,
  dtSec: number,
): BounceUpdate => {
  const animated = ((): BounceState => {
    const ms = s.frameMs + dtSec * 1000;
    const adv = ms >= FRAME_MS / speedPref;
    return { ...s, frameMs: adv ? 0 : ms, frame: adv ? (s.frame + 1) % FRAMES : s.frame };
  })();
  if (s.held) return { state: animated, bounced: false };

  const cruise = BASE_SPEED * speedPref;
  const speed = s.speed + (cruise - s.speed) * (1 - Math.exp(-DECAY_PER_SEC * dtSec));

  // Screen edges, axis by axis: a step that would leave every display reflects instead.
  const nx = s.x + s.dx * speed * dtSec;
  const xOk = onScreen(world.areas, size, nx, s.y);
  const ny = s.y + s.dy * speed * dtSec;
  const yOk = onScreen(world.areas, size, xOk ? nx : s.x, ny);
  const edged: BounceState = {
    ...animated,
    speed,
    x: xOk ? nx : s.x,
    y: yOk ? ny : s.y,
    dx: xOk ? s.dx : -s.dx,
    dy: yOk ? s.dy : -s.dy,
  };

  const resolved = world.windows.reduce<BounceState>(
    (acc, w) => (intersects(acc.x, acc.y, size, w) ? resolveWindow(acc, w, size) : acc),
    edged,
  );
  return {
    state: resolved,
    bounced: !xOk || !yOk || resolved.dx !== edged.dx || resolved.dy !== edged.dy,
  };
};

export const bounceGrab = (s: BounceState, x: number, y: number): BounceState => ({
  ...s,
  x,
  y,
  held: true,
});

export const bounceMoveHeld = (s: BounceState, x: number, y: number): BounceState => ({
  ...s,
  x,
  y,
});

/** Release with pointer velocity (px/s): a flick sets direction and a burst of speed. */
export const bounceRelease = (s: BounceState, vx: number, vy: number): BounceState => {
  const v = Math.hypot(vx, vy);
  return v < MIN_TOSS_SPEED
    ? { ...s, held: false }
    : { ...s, held: false, dx: vx / v, dy: vy / v, speed: v };
};
