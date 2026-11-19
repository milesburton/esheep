import { TOL, intersects, onScreen, overlapsX } from './geometry.js';

export interface Body {
  readonly x: number;
  readonly y: number;
  readonly vx: number; // px per second
  readonly vy: number;
}

export interface BallisticOpts {
  readonly size: number;
  readonly gravity: number; // px / s²
  readonly restitution: number; // 0..1 energy kept on each bounce
}

export interface BallisticResult {
  readonly body: Body;
  readonly landed: boolean;
  /** Downward speed at the moment of the last floor contact (0 if none). */
  readonly impact: number;
}

/** Below this vertical speed after a bounce the body comes to rest. */
export const REST_SPEED = 120;
const MAX_STEP_PX = 8;
const MAX_SUBSTEPS = 40;

const floorsBetween = (
  world: World,
  size: number,
  x: number,
  feetBefore: number,
  feetAfter: number,
): number[] =>
  [
    ...world.windows.filter((w) => overlapsX(size, x, w)).map((w) => w.y),
    ...world.areas.filter((a) => overlapsX(size, x, a)).map((a) => a.y + a.height),
  ].filter((fy) => feetBefore <= fy + TOL && feetAfter >= fy);

const substep = (b: Body, world: World, o: BallisticOpts, dt: number): BallisticResult => {
  const vy = b.vy + o.gravity * dt;

  // Horizontal: screen edges and window walls reflect.
  const nx = b.x + b.vx * dt;
  const blockedX =
    !onScreen(world.areas, o.size, nx, b.y) ||
    world.windows.some((w) => intersects(nx, b.y, o.size, w) && b.y + o.size > w.y + TOL * 2);
  const x = blockedX ? b.x : nx;
  const vx = blockedX ? -b.vx * o.restitution : b.vx;

  // Vertical: floors (display bottoms, window tops) catch; ceilings and window undersides reflect.
  const ny = b.y + vy * dt;
  if (vy > 0) {
    const floors = floorsBetween(world, o.size, x, b.y + o.size, ny + o.size);
    if (floors.length > 0) {
      const rebound = -vy * o.restitution;
      const landed = Math.abs(rebound) < REST_SPEED;
      return {
        body: {
          x,
          y: Math.min(...floors) - o.size,
          vx: landed ? vx * 0.5 : vx,
          vy: landed ? 0 : rebound,
        },
        landed,
        impact: vy,
      };
    }
  } else if (
    vy < 0 &&
    (!onScreen(world.areas, o.size, x, ny) ||
      world.windows.some((w) => intersects(x, ny, o.size, w)))
  ) {
    return { body: { x, y: b.y, vx, vy: -vy * o.restitution }, landed: false, impact: 0 };
  }
  return { body: { x, y: ny, vx, vy }, landed: false, impact: 0 };
};

/**
 * Advance a thrown body by `dtSec`. Motion is sub-stepped so a fast throw can't tunnel through
 * a thin window edge or the floor.
 */
export const stepBallistic = (
  body: Body,
  world: World,
  opts: BallisticOpts,
  dtSec: number,
): BallisticResult => {
  const travel = Math.max(Math.abs(body.vx), Math.abs(body.vy)) * dtSec;
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(travel / MAX_STEP_PX)));
  const dt = dtSec / n;
  let result: BallisticResult = { body, landed: false, impact: 0 };
  let impact = 0;
  for (let i = 0; i < n && !result.landed; i++) {
    result = substep(result.body, world, opts, dt);
    impact = Math.max(impact, result.impact);
  }
  return { ...result, impact };
};
