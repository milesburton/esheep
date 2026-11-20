import { describe, expect, it } from 'vitest';
import { ROLL_STOP, ballRect, kickBall, onFloor, stepBall, type Ball } from './ball.js';
import { world } from '../test/fixtures.js';

const SIZE = 14;
const FLOOR = 600 - SIZE;
const run = (b: Ball, w: World, seconds: number, dt = 1 / 60): Ball =>
  Array.from({ length: Math.round(seconds / dt) }).reduce<Ball>(
    (acc) => stepBall(acc, w, SIZE, dt),
    b,
  );

describe('ball', () => {
  it('drops, bounces and settles on the floor', () => {
    const b = run({ x: 400, y: 100, vx: 0, vy: 0 }, world(), 6);
    expect(b.y).toBe(FLOOR);
    expect(b.vy).toBe(0);
  });

  it('bounces back up (a ball, not a sheep)', () => {
    let b: Ball = { x: 400, y: 100, vx: 0, vy: 0 };
    let peaked = false;
    let hit = false;
    for (let i = 0; i < 240; i++) {
      const prev = b;
      b = stepBall(b, world(), SIZE, 1 / 60);
      if (prev.vy > 0 && b.vy < 0) hit = true;
      if (hit && b.vy > 0) peaked = true;
    }
    expect(hit).toBe(true);
    expect(peaked).toBe(true);
  });

  it('rolls along the floor and slows to a stop by friction', () => {
    const start: Ball = { x: 100, y: FLOOR, vx: 600, vy: 0 };
    const early = run(start, world(), 0.3);
    expect(early.x).toBeGreaterThan(200);
    expect(early.y).toBe(FLOOR);
    expect(early.vx).toBeLessThan(600);
    expect(early.vx).toBeGreaterThan(ROLL_STOP);
    const late = run(start, world(), 8);
    expect(late.vx).toBe(0);
    expect(late.y).toBe(FLOOR);
  });

  it('bounces off the screen edge while rolling', () => {
    const b = run({ x: 900, y: FLOOR, vx: 800, vy: 0 }, world(), 0.5);
    expect(b.x + SIZE).toBeLessThanOrEqual(1000);
    expect(b.vx).toBeLessThan(0);
  });

  it('rolls off the end of a window and falls to the floor below', () => {
    const w = world({ windows: [{ x: 300, y: 300, width: 200, height: 300 }] });
    const b = run({ x: 450, y: 300 - SIZE, vx: 300, vy: 0 }, w, 6);
    expect(b.y).toBe(FLOOR);
    expect(b.x).toBeGreaterThan(500 - SIZE);
  });

  it('lands and stays on top of a window', () => {
    const w = world({ windows: [{ x: 300, y: 300, width: 300, height: 300 }] });
    const b = run({ x: 400, y: 50, vx: 0, vy: 0 }, w, 5);
    expect(b.y).toBe(300 - SIZE);
  });

  it('a kick replaces the velocity and lifts the ball off the floor', () => {
    const rolling: Ball = { x: 100, y: FLOOR, vx: 50, vy: 0 };
    const kicked = kickBall(rolling, { vx: -500, vy: -300 });
    expect(kicked).toMatchObject({ x: 100, y: FLOOR, vx: -500, vy: -300 });
    const next = stepBall(kicked, world(), SIZE, 1 / 60);
    expect(next.y).toBeLessThan(FLOOR);
    expect(next.vx).toBeCloseTo(-500, -1);
  });

  it('knows when it is on a floor, and its rectangle', () => {
    expect(onFloor({ x: 100, y: FLOOR, vx: 0, vy: 0 }, SIZE, world())).toBe(true);
    expect(onFloor({ x: 100, y: 200, vx: 0, vy: 0 }, SIZE, world())).toBe(false);
    expect(ballRect({ x: 5, y: 6, vx: 0, vy: 0 }, SIZE)).toEqual({
      x: 5,
      y: 6,
      width: SIZE,
      height: SIZE,
    });
  });
});
