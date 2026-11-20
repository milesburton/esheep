import { describe, expect, it } from 'vitest';
import {
  FLEE_RANGE,
  SEEK_RANGE,
  TAG_WAIT_MS,
  startTag,
  stepTag,
  touching,
  viewFor,
  type Sprite,
  type TagGame,
} from './tag.js';

const S = 40;
const at = (id: number, x: number, bottom = 600): Sprite => ({
  id,
  rect: { x, y: bottom - S, width: S, height: S },
});

describe('tag', () => {
  it('starts with one sheep "it" (needs at least two sheep), chosen by `pick`', () => {
    const three = [at(1, 0), at(2, 100), at(3, 200)];
    expect(startTag(three, 1000, 0).it).toBe(1);
    expect(startTag(three, 1000, 4).it).toBe(2);
    expect(startTag(three, 1000, -2).it).toBe(3);
    expect(startTag([at(1, 0)], 1000).it).toBeNull();
    expect(startTag(three, 1000).waitUntil).toBe(1000 + TAG_WAIT_MS);
  });

  it('knows when two sheep are touching: same level, no gap', () => {
    expect(touching(at(1, 100).rect, at(2, 130).rect, S)).toBe(true); // overlapping
    expect(touching(at(1, 100).rect, at(2, 142).rect, S)).toBe(true); // 2px gap
    expect(touching(at(1, 100).rect, at(2, 200).rect, S)).toBe(false); // far apart
    expect(touching(at(1, 100).rect, at(2, 130, 400).rect, S)).toBe(false); // other level
    expect(touching(at(1, 100).rect, at(2, 100).rect, S)).toBe(true); // right on top of each other
    expect(touching(at(1, 100).rect, at(2, 300).rect, S)).toBe(false);
  });

  it('tags the sheep it touches, which becomes "it" after a head start for the old one', () => {
    const game: TagGame = { it: 1, waitUntil: 0, tags: 0 };
    const r = stepTag(game, [at(1, 100), at(2, 130), at(3, 500)], S, 5000);
    expect(r.tagged).toEqual({ from: 1, to: 2 });
    expect(r.game).toEqual({ it: 2, waitUntil: 5000 + TAG_WAIT_MS, tags: 1 });
  });

  it('cannot tag while it is still counting, then can', () => {
    const game: TagGame = { it: 1, waitUntil: 2000, tags: 0 };
    const sprites = [at(1, 100), at(2, 130)];
    expect(stepTag(game, sprites, S, 1999).tagged).toBeNull();
    expect(stepTag(game, sprites, S, 2000).tagged).toEqual({ from: 1, to: 2 });
  });

  it('tags the nearest of several touching sheep', () => {
    const game: TagGame = { it: 1, waitUntil: 0, tags: 3 };
    const r = stepTag(game, [at(1, 100), at(2, 70), at(3, 125)], S, 10);
    expect(r.tagged).toEqual({ from: 1, to: 3 });
    expect(r.game.tags).toBe(4);
  });

  it('does nothing when nobody is touching', () => {
    const game: TagGame = { it: 1, waitUntil: 0, tags: 0 };
    const r = stepTag(game, [at(1, 100), at(2, 400)], S, 10);
    expect(r).toEqual({ game, tagged: null });
  });

  it('hands "it" on if the sheep that was it goes away, and stops with fewer than two sheep', () => {
    const game: TagGame = { it: 9, waitUntil: 0, tags: 2 };
    const r = stepTag(game, [at(1, 100), at(2, 400)], S, 700);
    expect(r.game.it).toBe(1);
    expect(r.game.waitUntil).toBe(700 + TAG_WAIT_MS);
    expect(stepTag(game, [at(1, 100)], S, 700).game.it).toBeNull();
    expect(stepTag(game, [], S, 700).tagged).toBeNull();
  });

  describe('viewFor', () => {
    const game: TagGame = { it: 1, waitUntil: 5000, tags: 0 };

    it('"it" seeks the nearest reachable sheep, and waits while counting', () => {
      const sprites = [at(1, 100), at(2, 300), at(3, 200), at(4, 150, 200)];
      const v = viewFor(game, 1, sprites, S, 4000);
      expect(v).toMatchObject({ role: 'it', wait: true });
      expect(v?.target).toEqual(at(3, 200).rect); // nearest on its own level; #4 is up a level
      expect(viewFor(game, 1, sprites, S, 5000)?.wait).toBe(false);
    });

    it('"it" has no target when everyone is out of reach or too far', () => {
      expect(viewFor(game, 1, [at(1, 0), at(2, 100, 100)], S, 0)?.target).toBeNull();
      expect(viewFor(game, 1, [at(1, 0), at(2, S * SEEK_RANGE + 200)], S, 0)?.target).toBeNull();
    });

    it('a runner flees "it" only when it is near and on its level', () => {
      const near = [at(1, 100), at(2, 300)];
      expect(viewFor(game, 2, near, S, 0)).toEqual({
        role: 'runner',
        target: at(1, 100).rect,
        wait: false,
      });
      expect(
        viewFor(game, 2, [at(1, 100), at(2, 100 + S * FLEE_RANGE + 100)], S, 0)?.target,
      ).toBeNull();
      expect(viewFor(game, 2, [at(1, 100), at(2, 300, 100)], S, 0)?.target).toBeNull();
    });

    it('gives nothing to a sheep that is not playing, or when there is no game', () => {
      expect(viewFor(game, 99, [at(1, 0), at(2, 50)], S, 0)).toBeNull();
      expect(viewFor({ ...game, it: null }, 2, [at(1, 0), at(2, 50)], S, 0)).toBeNull();
      expect(viewFor(game, 1, [at(1, 0)], S, 0)).toBeNull();
    });
  });
});
