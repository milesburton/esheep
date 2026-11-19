export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Sample extends Point {
  readonly t: number; // ms
}

export interface Drag {
  /** Pointer offset inside the sprite at the moment of the grab. */
  readonly grabDX: number;
  readonly grabDY: number;
  readonly samples: readonly Sample[];
}

const KEEP_SAMPLES = 8;
const VELOCITY_WINDOW_MS = 120;
/** A pointer that stopped this long before release means the user is just putting the sheep down. */
const STALE_MS = 60;
export const MAX_THROW_SPEED = 3200;

export const startDrag = (sprite: Point, pointer: Point, t: number): Drag => ({
  grabDX: pointer.x - sprite.x,
  grabDY: pointer.y - sprite.y,
  samples: [{ ...pointer, t }],
});

export const moveDrag = (d: Drag, pointer: Point, t: number): { drag: Drag; sprite: Point } => ({
  drag: { ...d, samples: [...d.samples, { ...pointer, t }].slice(-KEEP_SAMPLES) },
  sprite: { x: pointer.x - d.grabDX, y: pointer.y - d.grabDY },
});

/** Throw velocity (px/s) from the recent pointer motion; zero if the pointer had stopped. */
export const releaseVelocity = (d: Drag, t: number): { vx: number; vy: number } => {
  const recent = d.samples.filter((s) => s.t >= t - VELOCITY_WINDOW_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last === first || t - last.t > STALE_MS || last.t <= first.t) {
    return { vx: 0, vy: 0 };
  }
  const dtSec = (last.t - first.t) / 1000;
  const vx = (last.x - first.x) / dtSec;
  const vy = (last.y - first.y) / dtSec;
  const speed = Math.hypot(vx, vy);
  const k = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1;
  return { vx: vx * k, vy: vy * k };
};
