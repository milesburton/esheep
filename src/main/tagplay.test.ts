import { describe, expect, it } from 'vitest';
import { TAG_WAIT_MS, type Sprite } from '../core/tag';
import { createTagPlay } from './tagplay.js';

const S = 40;
const sprite = (id: number, x: number): Sprite => ({
  id,
  rect: { x, y: 560, width: S, height: S },
});

const make = (sprites: Sprite[]) => {
  let now = 0;
  const play = createTagPlay({ sprites: () => sprites, size: () => S, now: () => now });
  return {
    play,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('tag play controller', () => {
  it('has no game until started, and nothing to say to anybody', () => {
    const { play } = make([sprite(1, 0), sprite(2, 500)]);
    expect(play.active()).toBe(false);
    expect(play.state()).toBeNull();
    expect(play.view(1)).toBeNull();
    expect(play.tick()).toBeNull();
  });

  it('start deals an "it" (idempotent), stop ends the game', () => {
    const { play } = make([sprite(1, 0), sprite(2, 500)]);
    play.start(1);
    expect(play.active()).toBe(true);
    expect(play.state()).toEqual({ it: 2, tags: 0 });
    play.start(0); // already running: the deal is not redone
    expect(play.state()?.it).toBe(2);
    play.stop();
    expect(play.active()).toBe(false);
  });

  it('tells "it" to wait, then to chase; and tells a runner to flee', () => {
    const { play, advance } = make([sprite(1, 100), sprite(2, 300)]);
    play.start(0); // sheep 1 is it
    expect(play.view(1)).toMatchObject({ role: 'it', wait: true });
    advance(TAG_WAIT_MS);
    expect(play.view(1)).toMatchObject({ role: 'it', wait: false });
    expect(play.view(2)).toMatchObject({ role: 'runner' });
    expect(play.view(2)?.target).toEqual(sprite(1, 100).rect);
  });

  it('swaps "it" when it touches somebody, once the head start is over', () => {
    const { play, advance } = make([sprite(1, 100), sprite(2, 130)]);
    play.start(0);
    expect(play.tick()).toBeNull(); // still counting
    advance(TAG_WAIT_MS);
    expect(play.tick()).toEqual({ from: 1, to: 2 });
    expect(play.state()).toEqual({ it: 2, tags: 1 });
    expect(play.tick()).toBeNull(); // the new "it" has to count first
  });

  it('copes with too few sheep (no "it") and picks up when more arrive', () => {
    const sprites: Sprite[] = [sprite(1, 0)];
    let now = 0;
    const play = createTagPlay({ sprites: () => sprites, size: () => S, now: () => now });
    play.start();
    expect(play.state()?.it).toBeNull();
    sprites.push(sprite(2, 400));
    now += 10;
    play.tick();
    expect(play.state()?.it).toBe(1);
  });
});
