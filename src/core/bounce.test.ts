import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED,
  bounceGrab,
  bounceMoveHeld,
  bounceRelease,
  bounceStart,
  bounceUpdate,
} from './bounce.js';
import { world } from '../test/fixtures.js';

const SIZE = 128;
const w = world();

describe('bounce sheep', () => {
  it('starts at the given spot moving at base speed along a unit direction', () => {
    const s = bounceStart(10, 20);
    expect(s).toMatchObject({ x: 10, y: 20, speed: BASE_SPEED, held: false });
    expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1);
  });

  it('moves along its direction', () => {
    const s = bounceStart(100, 100);
    const r = bounceUpdate(s, w, SIZE, 1, 1);
    expect(r.state.x).toBeCloseTo(100 + s.dx * BASE_SPEED);
    expect(r.state.y).toBeCloseTo(100 + s.dy * BASE_SPEED);
    expect(r.bounced).toBe(false);
  });

  it('scales cruise speed by the speed preference', () => {
    const s = { ...bounceStart(100, 100), speed: BASE_SPEED * 2 };
    const r = bounceUpdate(s, w, SIZE, 2, 1);
    expect(r.state.speed).toBeCloseTo(BASE_SPEED * 2);
  });

  it.each([
    ['left', { x: 1, y: 200, dx: -1, dy: 0 }, 'dx', 1],
    ['right', { x: 870, y: 200, dx: 1, dy: 0 }, 'dx', -1],
    ['top', { x: 400, y: 1, dx: 0, dy: -1 }, 'dy', 1],
    ['bottom', { x: 400, y: 471, dx: 0, dy: 1 }, 'dy', -1],
  ] as const)('reflects off the %s screen edge', (_n, start, axis, sign) => {
    const s = { ...bounceStart(0, 0), ...start };
    const r = bounceUpdate(s, w, SIZE, 1, 0.2);
    expect(r.bounced).toBe(true);
    expect(Math.sign(r.state[axis])).toBe(sign);
  });

  it.each([
    ['left face', { x: 380, y: 250, dx: 1, dy: 0 }, 'dx', -1],
    ['right face', { x: 705, y: 250, dx: -1, dy: 0 }, 'dx', 1],
    ['top face', { x: 500, y: 150, dx: 0, dy: 1 }, 'dy', -1],
    ['bottom face', { x: 500, y: 395, dx: 0, dy: -1 }, 'dy', 1],
  ] as const)('reflects off a window %s', (_n, start, axis, sign) => {
    const win = world({ windows: [{ x: 500, y: 200, width: 200, height: 200 }] });
    const s = { ...bounceStart(0, 0), ...start };
    const r = bounceUpdate(s, win, SIZE, 1, 0.1);
    expect(r.bounced).toBe(true);
    expect(Math.sign(r.state[axis])).toBe(sign);
    expect(
      r.state.x + SIZE <= 500 || r.state.x >= 700 || r.state.y + SIZE <= 200 || r.state.y >= 400,
    ).toBe(true);
  });

  it('advances animation frames over time, faster at higher speed', () => {
    let s = bounceStart(100, 100);
    s = bounceUpdate(s, w, SIZE, 1, 0.1).state;
    expect(s.frame).toBe(1);
    const fast = bounceUpdate(bounceStart(100, 100), w, SIZE, 2, 0.06).state;
    expect(fast.frame).toBe(1);
    const slow = bounceUpdate(bounceStart(100, 100), w, SIZE, 1, 0.06).state;
    expect(slow.frame).toBe(0);
  });

  it('wraps the frame counter', () => {
    const s = { ...bounceStart(100, 100), frame: 7 };
    expect(bounceUpdate(s, w, SIZE, 1, 0.1).state.frame).toBe(0);
  });

  describe('grab and toss', () => {
    it('stays put while held but keeps animating', () => {
      const held = bounceGrab(bounceStart(100, 100), 300, 300);
      const r = bounceUpdate(held, w, SIZE, 1, 0.1);
      expect(r.state).toMatchObject({ x: 300, y: 300, held: true });
      expect(r.bounced).toBe(false);
    });

    it('follows the pointer while held', () => {
      expect(bounceMoveHeld(bounceGrab(bounceStart(0, 0), 1, 1), 50, 60)).toMatchObject({
        x: 50,
        y: 60,
      });
    });

    it('a flick sets direction and speed; a gentle release keeps the old direction', () => {
      const held = bounceGrab(bounceStart(100, 100), 100, 100);
      const flick = bounceRelease(held, 0, -1500);
      expect(flick).toMatchObject({ held: false, dx: 0, dy: -1, speed: 1500 });
      const gentle = bounceRelease(held, 10, 10);
      expect(gentle).toMatchObject({ held: false, dx: held.dx, dy: held.dy, speed: BASE_SPEED });
    });

    it('a thrown sheep slows back to cruising speed', () => {
      const thrown = { ...bounceStart(100, 100), dx: 0, dy: 0.0001, speed: 2000 };
      const later = Array.from({ length: 300 }).reduce<typeof thrown>(
        (s) => bounceUpdate({ ...s, y: 100 }, w, SIZE, 1, 1 / 60).state,
        thrown,
      );
      expect(later.speed).toBeCloseTo(BASE_SPEED, 0);
    });
  });
});
