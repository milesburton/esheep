import { describe, expect, it } from 'vitest';
import { TEMPO, WALK_BOOST, tunePack } from './tune.js';
import { anim, next } from '../test/fixtures.js';

const point = (x: string, i: string): AnimPoint => ({
  x,
  y: '0',
  offsety: '0',
  opacity: '1',
  interval: i,
});

const base = (): ClassicPack => ({
  kind: 'classic',
  name: 't',
  tilesX: 1,
  tilesY: 1,
  transparency: 'None',
  png: 'data:,',
  animations: [
    anim({
      id: 1,
      name: 'walk',
      start: point('-2', '200'),
      end: point('-2', '200'),
      next: [next(11, 2, 'window'), next(35, 10, 'taskbar')],
      border: [next(2), next(37, 2, 'vertical')],
    }),
    anim({ id: 2, name: 'jump', start: point('-10', '100'), end: point('-10', '100') }),
    anim({ id: 3, name: 'expr', start: point('screenW/2', '30'), end: point('0', '100') }),
    anim({ id: 26, name: 'rotate1b', next: [next(26, 2, 'taskbar')] }),
  ],
  spawns: [
    { p: 20, x: '0', y: '0', next: 1 },
    { p: 80, x: '0', y: '0', next: 1 },
    { p: 3, x: '0', y: '0', next: 1 },
    { p: 3, x: '0', y: '0', next: 1 },
  ],
});

describe('tunePack', () => {
  it('shortens every interval by the tempo and lengthens only the walkers', () => {
    const t = tunePack(base());
    const [walk, jump] = t.animations;
    expect(walk.start.interval).toBe(String(200 / TEMPO));
    expect(walk.start.x).toBe(String(-2 * WALK_BOOST));
    expect(jump.start.x).toBe('-10'); // not a walker: stride unchanged
    expect(jump.start.interval).toBe(String(100 / TEMPO));
  });

  it('leaves expressions alone', () => {
    const expr = tunePack(base()).animations[2];
    expect(expr.start.x).toBe('screenW/2');
    expect(expr.start.interval).toBe(String(30 / TEMPO));
  });

  it('raises climbing and grazing weights and adds the missing transitions', () => {
    const t = tunePack(base());
    const walk = t.animations[0];
    expect(walk.border.find((n) => n.id === 37)?.p).toBe(30);
    expect(walk.next.find((n) => n.id === 11)?.p).toBe(10);
    expect(walk.next.find((n) => n.id === 35)?.p).toBe(25);
    expect(walk.next.map((n) => n.id)).toEqual(expect.arrayContaining([27, 8]));
    expect(t.animations[3].next[0].p).toBe(20);
  });

  it('boosts the bath and black-sheep spawns only', () => {
    expect(tunePack(base()).spawns.map((s) => s.p)).toEqual([20, 80, 8, 6]);
  });

  it('is pure, and does not duplicate transitions when applied to a pack that already has them', () => {
    const input = base();
    const before = JSON.stringify(input);
    const once = tunePack(input);
    expect(JSON.stringify(input)).toBe(before);
    const ids = (p: ClassicPack): number[] => p.animations[0].next.map((n) => n.id);
    expect(ids(tunePack({ ...once }))).toEqual(ids(once));
  });

  it('copes with packs that lack the classic animations', () => {
    const bare: ClassicPack = { ...base(), animations: [anim({ id: 9, name: 'x' })], spawns: [] };
    expect(() => tunePack(bare)).not.toThrow();
  });
});
