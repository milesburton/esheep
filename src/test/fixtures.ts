import type { CompiledPack } from '../core/engine.js';
import { compilePack } from '../core/engine.js';

export const SIZE = 128;
export const CFG = { size: SIZE, scale: 2 } as const;

/** Display work area 1000x600 at the origin, no windows. */
export const world = (extra: Partial<World> = {}): World => ({
  areas: [{ x: 0, y: 0, width: 1000, height: 600 }],
  windows: [],
  ...extra,
});

export const next = (id: number, p = 100, only = 'none'): NextRef => ({ p, only, id });

const point = (x = '0', y = '0', i = '100'): AnimPoint => ({
  x,
  y,
  offsety: '0',
  opacity: '1',
  interval: i,
});

export const anim = (o: Partial<PackAnim> & Pick<PackAnim, 'id' | 'name'>): PackAnim => ({
  start: point(),
  end: point(),
  repeat: '0',
  repeatFrom: '0',
  frames: [0],
  action: 'none',
  next: [],
  border: [],
  gravity: [],
  ...o,
});

/** A minimal pack: walk (left), turn, fall, land, drag, toss. Mirrors the shape of `woolly`. */
export const miniPack = (over: Partial<ClassicPack> = {}): ClassicPack => ({
  kind: 'classic',
  name: 'mini',
  tilesX: 4,
  tilesY: 2,
  transparency: 'None',
  png: 'data:,',
  animations: [
    anim({
      id: 1,
      name: 'walk',
      start: point('-5'),
      end: point('-5'),
      frames: [0, 1],
      repeat: '2',
      next: [next(1)],
      border: [next(2)],
      gravity: [next(3)],
    }),
    anim({ id: 2, name: 'turn', frames: [2], action: 'flip', next: [next(1)] }),
    anim({
      id: 3,
      name: 'fall',
      start: point('0', '10', '50'),
      end: point('0', '10', '50'),
      frames: [3],
      repeat: '100',
      border: [next(4)],
    }),
    anim({ id: 4, name: 'land', frames: [4], next: [next(1)] }),
    anim({ id: 5, name: 'drag', frames: [5, 6] }),
    anim({ id: 6, name: 'toss', frames: [7, 6] }),
  ],
  spawns: [{ p: 100, x: '100', y: 'areaH-imageH', next: 1 }],
  ...over,
});

export const compiled = (over: Partial<ClassicPack> = {}): CompiledPack =>
  compilePack(miniPack(over));
