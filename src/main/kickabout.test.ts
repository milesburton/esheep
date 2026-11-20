import { describe, expect, it } from 'vitest';
import { KICK_ABOUT_MS, createKickAbout } from './kickabout.js';
import { world } from '../test/fixtures.js';

const make = (over: Partial<Parameters<typeof createKickAbout>[0]> = {}) =>
  createKickAbout({
    size: () => 14,
    world: () => world(),
    areas: () => world().areas,
    ...over,
  });
const run = (k: ReturnType<typeof createKickAbout>, ms: number, step = 16): void => {
  for (let t = 0; t < ms; t += step) k.tick(step);
};

describe('kick-about controller', () => {
  it('has no ball until started, and stop removes it', () => {
    const k = make();
    expect(k.active()).toBe(false);
    expect(k.state()).toBeNull();
    expect(k.tick(16)).toBe(false);
    k.start();
    expect(k.active()).toBe(true);
    expect(k.state()).toMatchObject({ size: 14 });
    k.stop();
    expect(k.state()).toBeNull();
  });

  it('drops in at the top centre of the primary display and settles on the floor', () => {
    const k = make();
    k.start();
    expect(k.state()).toMatchObject({ x: 500, y: 20 });
    run(k, 8000);
    expect(k.state()?.y).toBe(600 - 14);
  });

  it('start is idempotent (does not reset a ball in play)', () => {
    const k = make();
    k.start();
    run(k, 500);
    const before = k.state();
    k.start();
    expect(k.state()).toEqual(before);
  });

  it('a kick sets the ball moving and is counted; kicks are ignored without a ball', () => {
    const k = make();
    k.kick({ vx: 10, vy: 10 });
    expect(k.kicks()).toBe(0);
    k.start();
    run(k, 8000);
    k.kick({ vx: 600, vy: -300 });
    expect(k.kicks()).toBe(1);
    expect(k.state()).toMatchObject({ vx: 600, vy: -300 });
    const before = k.state();
    run(k, 300);
    expect(k.state()?.x).not.toBe(before?.x);
    expect(k.state()?.y).toBeLessThan(before?.y ?? 0); // lifted off the floor
  });

  it('can be picked up, carried (staying inside the playfield) and thrown', () => {
    const k = make();
    k.start();
    run(k, 8000);
    k.grab();
    expect(k.held()).toBe(true);
    k.kick({ vx: 999, vy: 0 }); // sheep can't kick a held ball
    expect(k.kicks()).toBe(0);
    k.move(300, 200);
    expect(k.state()).toMatchObject({ x: 300, y: 200, vx: 0, vy: 0 });
    run(k, 1000);
    expect(k.state()).toMatchObject({ x: 300, y: 200 }); // frozen while held
    k.move(5000, -900); // dragged way out: clamped onto the display
    expect(k.state()?.x).toBeLessThanOrEqual(1000 - 14);
    expect(k.state()?.y).toBeGreaterThanOrEqual(0);
    k.release(400, -200);
    expect(k.held()).toBe(false);
    expect(k.state()).toMatchObject({ vx: 400, vy: -200 });
  });

  it('move and release do nothing unless the ball is held', () => {
    const k = make();
    k.start();
    const before = k.state();
    k.move(10, 10);
    k.release(1, 1);
    expect(k.state()).toEqual(before);
  });

  it('stops itself after the time limit', () => {
    const k = make();
    k.start();
    run(k, KICK_ABOUT_MS - 100);
    expect(k.active()).toBe(true);
    run(k, 200);
    expect(k.active()).toBe(false);
  });

  it('caps a huge or bad step so the ball cannot teleport', () => {
    const k = make();
    k.start();
    k.tick(10_000);
    expect(k.state()?.y).toBeLessThan(200); // one 50ms step, not ten seconds of falling
    k.tick(Number.NaN);
    k.tick(-5);
    expect(k.active()).toBe(true);
  });

  it('honours the speed preference', () => {
    const slow = make({ speed: () => 0.5 });
    const fast = make({ speed: () => 2 });
    slow.start();
    fast.start();
    run(slow, 500);
    run(fast, 500);
    expect(fast.state()?.y).toBeGreaterThan(slow.state()?.y ?? 0);
  });

  it('place puts the ball somewhere with no velocity; sanitises non-finite kicks', () => {
    const k = make();
    k.place(1, 1); // no ball yet
    expect(k.state()).toBeNull();
    k.start();
    k.place(200, 300);
    expect(k.state()).toMatchObject({ x: 200, y: 300, vx: 0, vy: 0 });
    k.kick({ vx: Number.NaN, vy: Number.POSITIVE_INFINITY });
    expect(k.state()).toMatchObject({ vx: 0, vy: 0 });
  });

  it('falls back to a default area if there are no displays', () => {
    const k = make({ areas: () => [] });
    k.start();
    expect(k.state()).toMatchObject({ x: 400 });
  });
});
