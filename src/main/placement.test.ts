import { describe, expect, it } from 'vitest';
import { clampWindow } from './placement.js';

const one: Rect[] = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const two: Rect[] = [
  { x: 0, y: 0, width: 1920, height: 1040 },
  { x: 1920, y: 100, width: 1280, height: 900 },
];

describe('clampWindow', () => {
  it('leaves a window whose sprite is on a display exactly where it is', () => {
    expect(clampWindow(one, 500, 900, 52, 6)).toEqual({ x: 500, y: 900 });
    expect(clampWindow(one, 0 - 6, 1040 - 52 + 6, 52, 6)).toEqual({ x: -6, y: 994 }); // margin may hang off
  });

  it('pulls a sprite that went off the right, left or bottom back onto the display', () => {
    const right = clampWindow(one, 5000, 500, 52, 6);
    expect(right.x + 6 + 40).toBeLessThanOrEqual(1920);
    expect(right.y).toBe(500);
    const left = clampWindow(one, -3000, 500, 52, 6);
    expect(left.x + 6).toBeGreaterThanOrEqual(0);
    const bottom = clampWindow(one, 500, 9000, 52, 6);
    expect(bottom.y + 6 + 40).toBeLessThanOrEqual(1040);
  });

  it('puts it on the nearest of several displays', () => {
    const p = clampWindow(two, 4000, 500, 52, 6); // off the right end of the second monitor
    expect(p.x + 6 + 40).toBeLessThanOrEqual(3200);
    expect(p.x + 6).toBeGreaterThanOrEqual(1920);
    // and a spot in the gap above the shorter monitor goes onto a display
    const q = clampWindow(two, 2500, -500, 52, 6);
    expect(q.y + 6).toBeGreaterThanOrEqual(100);
  });

  it('allows a head above the display for a sheep standing near the top, but not the whole sprite', () => {
    expect(clampWindow(one, 500, -20, 52, 6)).toEqual({ x: 500, y: -20 }); // head poking out: lower body is on screen
    const gone = clampWindow(one, 500, -400, 52, 6);
    expect(gone.y + 6).toBeGreaterThanOrEqual(0);
  });

  it('works for the bouncing sheep (no margin) and big sprites', () => {
    const b = clampWindow(one, 5000, 5000, 128, 0);
    expect(b).toEqual({ x: 1920 - 128, y: 1040 - 128 });
    const big = clampWindow(one, 5000, 5000, 172, 6); // x4 classic sprite: 160px
    expect(big.x + 6 + 160).toBeLessThanOrEqual(1920);
  });

  it('copes with no display information at all (it cannot judge, so it does not move anything)', () => {
    expect(clampWindow([], 123, 456, 52, 6)).toEqual({ x: 123, y: 456 });
  });
});
