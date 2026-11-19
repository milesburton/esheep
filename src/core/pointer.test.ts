import { describe, expect, it } from 'vitest';
import { MAX_THROW_SPEED, moveDrag, releaseVelocity, startDrag, type Drag } from './pointer.js';

const dragWith = (points: Array<[number, number, number]>): Drag =>
  points
    .slice(1)
    .reduce(
      (d, [x, y, t]) => moveDrag(d, { x, y }, t).drag,
      startDrag({ x: 0, y: 0 }, { x: points[0][0], y: points[0][1] }, points[0][2]),
    );

describe('pointer', () => {
  it('keeps the grab offset so the sprite does not jump under the pointer', () => {
    const d = startDrag({ x: 100, y: 200 }, { x: 130, y: 220 }, 0);
    expect(d.grabDX).toBe(30);
    expect(d.grabDY).toBe(20);
    expect(moveDrag(d, { x: 300, y: 300 }, 16).sprite).toEqual({ x: 270, y: 280 });
  });

  it('only keeps the most recent samples', () => {
    const d = dragWith(Array.from({ length: 20 }, (_, i) => [i, 0, i * 10]));
    expect(d.samples).toHaveLength(8);
    expect(d.samples[7].x).toBe(19);
  });

  it('computes throw velocity from recent motion', () => {
    const d = dragWith([
      [0, 0, 0],
      [50, 25, 50],
      [100, 50, 100],
    ]);
    const v = releaseVelocity(d, 105);
    expect(v.vx).toBeCloseTo(1000);
    expect(v.vy).toBeCloseTo(500);
  });

  it('ignores samples older than the velocity window', () => {
    const d = dragWith([
      [0, 0, 0],
      [1000, 0, 50],
      [1010, 0, 400],
      [1020, 0, 440],
    ]);
    const v = releaseVelocity(d, 445);
    expect(v.vx).toBeCloseTo(250); // 20px over 80ms, not the earlier 1000px jump
  });

  it('returns zero if the pointer had stopped before release', () => {
    const d = dragWith([
      [0, 0, 0],
      [100, 0, 50],
    ]);
    expect(releaseVelocity(d, 500)).toEqual({ vx: 0, vy: 0 });
  });

  it('returns zero with a single sample or identical timestamps', () => {
    expect(releaseVelocity(dragWith([[0, 0, 0]]), 10)).toEqual({ vx: 0, vy: 0 });
    expect(
      releaseVelocity(
        dragWith([
          [0, 0, 5],
          [10, 0, 5],
        ]),
        6,
      ),
    ).toEqual({ vx: 0, vy: 0 });
  });

  it('clamps absurd speeds while keeping direction', () => {
    const d = dragWith([
      [0, 0, 0],
      [3000, 4000, 10],
    ]);
    const v = releaseVelocity(d, 12);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(MAX_THROW_SPEED);
    expect(v.vy / v.vx).toBeCloseTo(4 / 3);
  });
});
