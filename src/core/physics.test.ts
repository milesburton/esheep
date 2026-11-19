import { describe, expect, it } from 'vitest';
import { REST_SPEED, stepBallistic, type Body } from './physics.js';
import { world } from '../test/fixtures.js';

const opts = { size: 100, gravity: 2600, restitution: 0.5 };
const run = (b: Body, w: World, seconds: number, dt = 1 / 60) =>
  Array.from({ length: Math.round(seconds / dt) }).reduce<{
    body: Body;
    landed: boolean;
    impact: number;
  }>(
    (acc) => {
      if (acc.landed) return acc;
      const r = stepBallistic(acc.body, w, opts, dt);
      return { ...r, impact: Math.max(acc.impact, r.impact) };
    },
    {
      body: b,
      landed: false,
      impact: 0,
    },
  );

describe('stepBallistic', () => {
  it('accelerates downward under gravity', () => {
    const r = stepBallistic({ x: 400, y: 100, vx: 0, vy: 0 }, world(), opts, 0.1);
    expect(r.body.vy).toBeCloseTo(260);
    expect(r.body.y).toBeGreaterThan(100);
    expect(r.landed).toBe(false);
  });

  it('lands on the bottom of the display, bouncing then resting exactly on the floor', () => {
    const r = run({ x: 400, y: 100, vx: 0, vy: 0 }, world(), 5);
    expect(r.landed).toBe(true);
    expect(r.body.y).toBe(600 - opts.size);
    expect(r.body.vy).toBe(0);
    expect(r.impact).toBeGreaterThan(REST_SPEED);
  });

  it('reports impact speed on the hardest floor contact', () => {
    const r = run({ x: 400, y: 0, vx: 0, vy: 0 }, world(), 5);
    // fell ~500px: v = sqrt(2*g*h) ≈ 1612 px/s
    expect(r.impact).toBeGreaterThan(1400);
    expect(r.impact).toBeLessThan(1800);
  });

  it('lands on top of a window', () => {
    const w = world({ windows: [{ x: 300, y: 300, width: 300, height: 200 }] });
    const r = run({ x: 400, y: 50, vx: 0, vy: 0 }, w, 5);
    expect(r.landed).toBe(true);
    expect(r.body.y).toBe(300 - opts.size);
  });

  it('reflects off the left and right screen edges with restitution', () => {
    const left = stepBallistic(
      { x: 2, y: 100, vx: -600, vy: 0 },
      world(),
      { ...opts, gravity: 0 },
      0.05,
    );
    expect(left.body.vx).toBeCloseTo(300);
    expect(left.body.x).toBeGreaterThanOrEqual(0);
    const right = stepBallistic(
      { x: 898, y: 100, vx: 600, vy: 0 },
      world(),
      { ...opts, gravity: 0 },
      0.05,
    );
    expect(right.body.vx).toBeCloseTo(-300);
    expect(right.body.x + opts.size).toBeLessThanOrEqual(1000);
  });

  it('reflects off the ceiling', () => {
    const r = stepBallistic(
      { x: 400, y: 2, vx: 0, vy: -800 },
      world(),
      { ...opts, gravity: 0 },
      0.05,
    );
    expect(r.body.vy).toBeCloseTo(400); // reflected at half speed, then drifting back down
    expect(r.body.y).toBeGreaterThanOrEqual(0);
  });

  it('reflects off a window side and underside', () => {
    const w = world({ windows: [{ x: 500, y: 100, width: 200, height: 300 }] });
    const side = stepBallistic(
      { x: 395, y: 250, vx: 400, vy: 0 },
      w,
      { ...opts, gravity: 0 },
      0.05,
    );
    expect(side.body.vx).toBeLessThan(0);
    const under = stepBallistic(
      { x: 550, y: 405, vx: 0, vy: -400 },
      w,
      { ...opts, gravity: 0 },
      0.05,
    );
    expect(under.body.vy).toBeGreaterThan(0);
  });

  it('does not tunnel through the floor at extreme speed', () => {
    const r = stepBallistic({ x: 400, y: 400, vx: 0, vy: 9000 }, world(), opts, 0.1);
    expect(r.body.y + opts.size).toBeLessThanOrEqual(600);
  });

  it('crosses between adjacent displays', () => {
    const w: World = {
      areas: [
        { x: 0, y: 0, width: 500, height: 600 },
        { x: 500, y: 0, width: 500, height: 600 },
      ],
      windows: [],
    };
    const r = stepBallistic({ x: 450, y: 100, vx: 400, vy: 0 }, w, { ...opts, gravity: 0 }, 0.1);
    expect(r.body.x).toBeGreaterThan(450);
    expect(r.body.vx).toBe(400);
  });
});
