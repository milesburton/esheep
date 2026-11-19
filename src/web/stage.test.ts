import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { parsePackXml } from '../main/pack.js';
import { fakeCtx } from '../test/fakeCanvas.js';
import { world } from '../test/fixtures.js';
import { PAD, createStage, type StageOptions } from './stage.js';

const woolly = parsePackXml(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'assets', 'packs', 'woolly', 'animations.xml'),
    'utf8',
  ),
  'woolly',
);
const bounce: Pack = { kind: 'bounce', name: 'builtin' };

const make = (pack: Pack, over: Partial<StageOptions> = {}, alpha = 255) => {
  const ctx = fakeCtx(alpha);
  const place = vi.fn();
  const onSound = vi.fn();
  const stage = createStage({
    pack,
    sheet: {} as CanvasImageSource,
    sheetSize: { width: 512, height: 128 },
    ctx,
    seed: 3,
    getWorld: () => world(),
    getPrefs: () => ({ speed: 1, sound: false }),
    place,
    onSound,
    ...over,
  });
  return { stage, ctx, place, onSound };
};

/** A quick left-to-right flick that ends right at release. */
const flick = (s: ReturnType<typeof make>['stage']): void => {
  s.down({ x: 100, y: 100 }, 0);
  s.move({ x: 160, y: 100 }, 40);
  s.move({ x: 260, y: 100 }, 80);
  s.up(85);
};

/** Advance in 16ms frames (the stage clamps large steps, like a real animation frame would). */
const settle = (s: ReturnType<typeof make>['stage'], ms: number): void => {
  for (let t = 0; t < ms; t += 16) s.tick(16);
};

describe('classic stage', () => {
  it('draws and positions the sheep immediately', () => {
    const { ctx, place } = make(woolly);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('advances, redraws and repositions on tick', () => {
    const { stage, ctx, place } = make(woolly);
    const before = stage.snapshot();
    stage.tick(2000);
    expect(stage.snapshot()).not.toEqual(before);
    expect(place.mock.calls.length).toBeGreaterThan(1);
    expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(1);
  });

  it('plays a named animation on request and lists what is available', () => {
    const { stage } = make(woolly);
    expect(stage.animations()).toContain('rotate1a');
    expect(stage.play('rotate1a')).toBe(true);
    expect(stage.snapshot().animation).toBe('rotate1a');
    expect(stage.play('no such animation')).toBe(false);
  });

  it('exposes the sprite rectangle, and asks for the other sheep each tick', () => {
    const getOthers = vi.fn(() => [] as Rect[]);
    const { stage } = make(woolly, { getOthers });
    stage.tick(16);
    expect(getOthers).toHaveBeenCalled();
    const r = stage.rect();
    expect(r).toMatchObject({ x: stage.snapshot().x, y: stage.snapshot().y });
    expect(r?.width).toBe(r?.height);
  });

  it('sizes its window to the sprite plus a small margin, and the canvas to match', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const ctx = Object.assign(fakeCtx(), { canvas }) as unknown as CanvasRenderingContext2D;
    const { stage } = make(woolly, { ctx });
    const r = stage.rect();
    expect(stage.windowSize()).toBe((r?.width ?? 0) + 2 * PAD);
    expect(canvas).toMatchObject({ width: stage.windowSize(), height: stage.windowSize() });
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('keeps the bounce sheep in its fixed 128px window', () => {
    expect(make(bounce).stage.windowSize()).toBe(128);
  });

  it('draws classic sprites at the requested whole-number scale (clamped to 1-4)', () => {
    const base = make(woolly).stage.rect()?.width ?? 0;
    const at = (scale: number) => make(woolly, { scale }).stage;
    expect(at(2).rect()?.width).toBe(base * 2);
    expect(at(2).windowSize()).toBe(base * 2 + 2 * PAD);
    expect(at(9).rect()?.width).toBe(base * 4);
    expect(at(0).rect()?.width).toBe(base);
  });

  it('renders the canvas at device resolution and maps hit-tests to it', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const ctx = Object.assign(fakeCtx(), { canvas }) as unknown as CanvasRenderingContext2D;
    const { stage } = make(woolly, { ctx, pixelRatio: 2 });
    const css = stage.windowSize();
    expect(canvas).toMatchObject({ width: css * 2, height: css * 2 });
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    stage.hit(10.5, 7);
    expect(ctx.getImageData).toHaveBeenLastCalledWith(21, 14, 1, 1);
  });

  it('re-renders at the new resolution when the pixel ratio changes, and ignores no-ops', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const ctx = Object.assign(fakeCtx(), { canvas }) as unknown as CanvasRenderingContext2D;
    const { stage } = make(woolly, { ctx });
    const css = stage.windowSize();
    stage.setPixelRatio(3);
    expect(canvas.width).toBe(css * 3);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, 0);
    const calls = (ctx.setTransform as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    stage.setPixelRatio(3);
    expect((ctx.setTransform as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      calls,
    );
    stage.setPixelRatio(0.5); // never below 1
    expect(canvas.width).toBe(css);
  });

  it('has no rectangle for the bounce sheep', () => {
    expect(make(bounce).stage.rect()).toBeNull();
  });

  it('does nothing while paused, and resumes', () => {
    const { stage } = make(woolly);
    stage.setPaused(true);
    const before = stage.snapshot();
    stage.tick(5000);
    expect(stage.snapshot()).toEqual(before);
    stage.down({ x: 1, y: 1 }, 0);
    expect(stage.dragging()).toBe(false);
    stage.setPaused(false);
    stage.tick(5000);
    expect(stage.snapshot()).not.toEqual(before);
  });

  it('scales dt by the speed preference', () => {
    const slow = make(woolly, { getPrefs: () => ({ speed: 0.5, sound: false }) });
    const fast = make(woolly, { getPrefs: () => ({ speed: 2, sound: false }) });
    settle(slow.stage, 1500);
    settle(fast.stage, 1500);
    // Both fall in from above; the faster one has fallen further in the same wall time.
    expect(fast.stage.snapshot().y).toBeGreaterThan(slow.stage.snapshot().y);
  });

  it('hit() reads the alpha of the canvas pixel', () => {
    expect(make(woolly, {}, 255).stage.hit(10.7, 20.2)).toBe(true);
    expect(make(woolly, {}, 0).stage.hit(10, 20)).toBe(false);
    const { stage, ctx } = make(woolly);
    stage.hit(10.7, 20.2);
    expect(ctx.getImageData).toHaveBeenCalledWith(10, 20, 1, 1);
  });

  it('grab → held with the drag animation, pinned under the pointer', () => {
    const { stage, place } = make(woolly);
    const at = stage.snapshot();
    stage.down({ x: at.x + 30, y: at.y + 40 }, 0);
    expect(stage.dragging()).toBe(true);
    expect(stage.snapshot()).toMatchObject({ mode: 'held', animation: 'drag' });
    place.mockClear();
    stage.move({ x: 500, y: 300 }, 16);
    expect(stage.snapshot()).toMatchObject({ x: 470, y: 260 });
    expect(place).toHaveBeenCalled();
  });

  it('a flick throws the sheep; a gentle release drops it', () => {
    const a = make(woolly);
    a.stage.tick(3000);
    flick(a.stage);
    expect(a.stage.dragging()).toBe(false);
    expect(a.stage.snapshot()).toMatchObject({ mode: 'thrown', animation: 'toss' });

    const b = make(woolly);
    b.stage.down({ x: 100, y: 100 }, 0);
    b.stage.up(500); // pointer idle: put down, not thrown
    expect(b.stage.snapshot()).toMatchObject({ mode: 'walk', animation: 'fall' });
  });

  it('ignores move/up when nothing is grabbed', () => {
    const { stage } = make(woolly);
    const before = stage.snapshot();
    stage.move({ x: 5, y: 5 }, 1);
    stage.up(2);
    expect(stage.snapshot()).toEqual(before);
  });

  it('mirrors the sprite when flipped', () => {
    const { stage, ctx } = make(woolly);
    settle(stage, 3000); // let it fall in from above onto the display
    flick(stage); // thrown to the right => flipped
    stage.tick(100);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
  });

  it('plays the sound hook for boing animations when sound is on', () => {
    const boingPack: ClassicPack = {
      ...woolly,
      animations: woolly.animations.map((a) => (a.id === 1 ? { ...a, name: 'boing' } : a)),
    };
    const on = make(boingPack, { getPrefs: () => ({ speed: 1, sound: true }) });
    for (let i = 0; i < 80; i++) on.stage.tick(100);
    expect(on.onSound).toHaveBeenCalled();
    const off = make(boingPack);
    for (let i = 0; i < 80; i++) off.stage.tick(100);
    expect(off.onSound).not.toHaveBeenCalled();
  });
});

describe('bounce play', () => {
  it('has no animations to play', () => {
    const { stage } = make(bounce);
    expect(stage.animations()).toEqual([]);
    expect(stage.play('walk')).toBe(false);
  });
});

describe('bounce stage', () => {
  it('starts mid-display and moves', () => {
    const { stage } = make(bounce);
    const a = stage.snapshot();
    expect(a).toMatchObject({ animation: 'bounce', mode: 'walk', x: 500, y: 300 });
    stage.tick(500);
    expect(stage.snapshot().x).not.toBe(a.x);
  });

  it('grab holds, flick throws, then it settles back to walking', () => {
    const { stage } = make(bounce);
    stage.down({ x: 500, y: 300 }, 0);
    expect(stage.snapshot().mode).toBe('held');
    stage.tick(500);
    expect(stage.snapshot()).toMatchObject({ x: 500, y: 300 });
    stage.move({ x: 600, y: 300 }, 50);
    stage.move({ x: 800, y: 300 }, 90);
    stage.up(95);
    expect(stage.snapshot().mode).toBe('thrown');
    for (let i = 0; i < 400; i++) stage.tick(50);
    expect(stage.snapshot().mode).toBe('walk');
  });

  it('beeps on bounces when sound is on', () => {
    const { stage, onSound } = make(bounce, { getPrefs: () => ({ speed: 2, sound: true }) });
    for (let i = 0; i < 400; i++) stage.tick(50);
    expect(onSound).toHaveBeenCalled();
  });

  it('mirrors when heading left', () => {
    const { stage, ctx } = make(bounce);
    stage.down({ x: 500, y: 300 }, 0);
    stage.move({ x: 400, y: 300 }, 40);
    stage.move({ x: 200, y: 300 }, 80);
    stage.up(85);
    stage.tick(50);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
  });
});
