import { describe, expect, it } from 'vitest';
import {
  clamp,
  farthestValid,
  insideAny,
  intersects,
  isMaximised,
  obstaclesFrom,
  onScreen,
  onScreenLower,
  overlapsX,
} from './geometry.js';

const left: Rect = { x: 0, y: 0, width: 100, height: 100 };
const right: Rect = { x: 100, y: 0, width: 100, height: 100 };

describe('geometry', () => {
  it('insideAny uses half-open bounds', () => {
    expect(insideAny([left], 0, 0)).toBe(true);
    expect(insideAny([left], 99, 99)).toBe(true);
    expect(insideAny([left], 100, 50)).toBe(false);
    expect(insideAny([left, right], 100, 50)).toBe(true);
    expect(insideAny([], 0, 0)).toBe(false);
  });

  it('onScreen needs the whole sprite on some display, and spans adjacent displays', () => {
    expect(onScreen([left], 20, 10, 10)).toBe(true);
    expect(onScreen([left], 20, 90, 10)).toBe(false);
    expect(onScreen([left, right], 20, 90, 10)).toBe(true);
    expect(onScreen([left, right], 20, 90, 90)).toBe(false);
  });

  it('onScreenLower ignores the top row so a sheep on a high window is not "off screen"', () => {
    expect(onScreen([left], 40, 10, -20)).toBe(false);
    expect(onScreenLower([left], 40, 10, -20)).toBe(true);
    expect(onScreenLower([left], 40, 80, 10)).toBe(false); // sticks out the side
    expect(onScreenLower([left], 40, 10, 90)).toBe(false); // sinks below the bottom
  });

  it('overlapsX only counts the middle half of the sprite', () => {
    const win: Rect = { x: 100, y: 0, width: 100, height: 10 };
    expect(overlapsX(40, 100, win)).toBe(true);
    expect(overlapsX(40, 62, win)).toBe(false); // right edge barely touching
    expect(overlapsX(40, 140, win)).toBe(true);
    expect(overlapsX(40, 195, win)).toBe(false);
  });

  it('intersects is strict at the edges', () => {
    expect(intersects(0, 0, 10, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(intersects(0, 0, 10, { x: 9, y: 0, width: 5, height: 5 })).toBe(true);
  });

  it('treats near-maximised windows as non-obstacles', () => {
    const area: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
    const big: Rect = { x: 0, y: 0, width: 950, height: 950 };
    const small: Rect = { x: 10, y: 10, width: 300, height: 300 };
    expect(isMaximised(big, [area])).toBe(true);
    expect(isMaximised(small, [area])).toBe(false);
    const infos: WindowInfo[] = [
      { id: 1, title: 'a', bounds: big },
      { id: 2, title: 'b', bounds: small },
    ];
    expect(obstaclesFrom(infos, [area])).toEqual([small]);
  });

  it('farthestValid slides right up to the limit', () => {
    expect(farthestValid(0, 100, (v) => v <= 37)).toBeCloseTo(37, 1);
    expect(farthestValid(0, 100, () => true)).toBeCloseTo(100, 1);
    expect(farthestValid(50, 0, (v) => v >= 20)).toBeCloseTo(20, 1);
    expect(farthestValid(10, 100, (v) => v <= 10)).toBeCloseTo(10, 1);
  });

  it('clamp bounds a value', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
