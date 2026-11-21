import { describe, expect, it } from 'vitest';
import { HELD_TIMEOUT_MS, KICK_ABOUT_MS, createKickAbout } from './kickabout.js';
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
    expect(k.state()).toMatchObject({ x: 493, y: 20 }); // centred: 500 minus half the 14px ball
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

  it('takes its own time limit when started with one (a match outlasts a kick-about)', () => {
    const k = make();
    k.start(KICK_ABOUT_MS * 3);
    run(k, KICK_ABOUT_MS + 1000);
    expect(k.active()).toBe(true);
    run(k, KICK_ABOUT_MS * 2);
    expect(k.active()).toBe(false);
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
    expect(k.state()).toMatchObject({ x: 393 });
  });
});

describe('a ball that gets stuck', () => {
  const windowsUnderTheMiddle = [{ x: 380, y: 300, width: 240, height: 300 }];
  const withWindows = (windows: Rect[]) =>
    createKickAbout({
      size: () => 14,
      world: () => world({ windows }),
      areas: () => world().areas,
    });

  it('is put back in play once it has lain still for a while, not left for ever', () => {
    const k = make();
    k.start();
    run(k, 3000); // it has landed and is just coming to rest
    expect(k.resets()).toBe(0);
    const before = k.state();
    expect(before?.y).toBeGreaterThan(550); // down on the floor (still settling)
    run(k, 4500);
    expect(k.resets()).toBe(0); // lying still, but not for long enough yet
    run(k, 3000);
    expect(k.resets()).toBe(1);
    const after = k.state();
    expect(after?.y).toBeLessThan((before?.y ?? 0) - 100); // dropped in from the top again
  });

  it('a ball that is moving is never reset', () => {
    const k = make();
    k.start();
    for (let t = 0; t < 30_000; t += 500) {
      k.kick({ vx: 400, vy: -200 }); // somebody keeps kicking it
      run(k, 500);
    }
    expect(k.resets()).toBe(0);
  });

  it('a ball resting on top of a window (out of reach) is re-dropped, in a column with no window', () => {
    const k = withWindows(windowsUnderTheMiddle);
    k.start();
    run(k, 4000);
    // Put it on the window top by hand and leave it: nobody can get to it.
    k.place(480, 300 - 14);
    run(k, 7000);
    expect(k.resets()).toBeGreaterThanOrEqual(1);
    run(k, 5000);
    const b = k.state();
    // It lands on the floor beside the window, not on the window.
    expect(b?.y).toBe(600 - 14);
    expect((b?.x ?? 0) + 14 <= 380 || (b?.x ?? 0) >= 620).toBe(true);
  });

  it('starts over open floor even when a window is under the middle of the screen', () => {
    const k = withWindows(windowsUnderTheMiddle);
    k.start();
    const x = k.state()?.x ?? 0;
    expect(x + 14 <= 380 || x >= 620).toBe(true);
    run(k, 8000);
    expect(k.state()?.y).toBe(600 - 14); // on the floor, not perched on the window
  });

  it('a held ball that is forgotten is let go, but a held ball that keeps moving is not', () => {
    const k = make();
    k.start();
    run(k, 8000);
    k.grab();
    for (let t = 0; t < HELD_TIMEOUT_MS * 2; t += 500) {
      k.move(300 + (t % 100), 200); // still being carried
      run(k, 500);
    }
    expect(k.held()).toBe(true);
    expect(k.autoReleases()).toBe(0);
    run(k, HELD_TIMEOUT_MS + 500); // the mouse-up never came
    expect(k.held()).toBe(false);
    expect(k.autoReleases()).toBe(1);
    run(k, 3000);
    expect(k.state()?.y).toBeGreaterThan(200); // under physics again: it falls
  });

  it('resets its counters when a new ball is started', () => {
    const k = make();
    k.start();
    run(k, 16_000);
    expect(k.resets()).toBeGreaterThan(0);
    k.stop();
    k.start();
    expect(k.resets()).toBe(0);
    expect(k.autoReleases()).toBe(0);
  });
});
