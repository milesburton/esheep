/**
 * Pace and variety for classic packs.
 *
 * The classic eSheep data is slow (the walk is ~10 px/s) and rarely reaches most of its
 * animations. `tunePack` is applied to every classic pack when it is loaded, so the same sheep
 * feel livelier whichever art is used. It is pure: it returns a new pack.
 */

/** Every keyframe interval is divided by this, so the whole sheep moves and animates faster. */
export const TEMPO = 2;
/** Extra stride for the slow walking animations. */
export const WALK_BOOST = 3;

const WALKERS = new Set([
  'walk',
  'walk_win2',
  'walk_task2',
  'vertical_walk_up',
  'vertical_walk_down',
  'top_walk2',
]);

type ListName = 'next' | 'border' | 'gravity';

/** [animation, list, target id, only, new probability] */
const WEIGHTS: ReadonlyArray<readonly [string, ListName, number, string, number]> = [
  // Climb the screen edges and walk the ceiling far more often than the classic 2%.
  ['walk', 'border', 37, 'vertical', 30],
  ['walk_win2', 'border', 37, 'vertical', 30],
  ['walk_task2', 'border', 37, 'vertical', 30],
  // Graze, wee, doze and sprint more often.
  ['rotate1b', 'next', 26, 'taskbar', 20],
  ['walk', 'next', 11, 'window', 10],
  ['walk', 'next', 15, 'none', 10],
  ['walk_win2', 'next', 17, 'none', 10],
  ['walk_win2', 'next', 19, 'none', 10],
  ['walk_task2', 'next', 17, 'none', 10],
  ['walk_task2', 'next', 19, 'none', 10],
  ['walk', 'next', 35, 'taskbar', 25],
  ['look_down', 'next', 44, 'none', 70],
];

/** Transitions the classic pack lacks entirely, so the rest of the sheet gets used. */
const EXTRA: ReadonlyArray<readonly [string, ListName, NextRef]> = [
  ['walk_task2', 'next', { p: 8, only: 'taskbar', id: 27 }], // grow a flower
  ['walk_task2', 'next', { p: 6, only: 'taskbar', id: 8 }], // boing
  ['walk', 'next', { p: 8, only: 'taskbar', id: 27 }],
  ['walk', 'next', { p: 6, only: 'taskbar', id: 8 }],
];

/** Spawn index -> weight: the bath and the black sheep walk-on turn up more often. */
const SPAWN_WEIGHTS: Readonly<Record<number, number>> = { 2: 8, 3: 6 };

/**
 * The classic pack starts some sheep beyond the right edge (`screenW+10`, `screenW`) and walks them in.
 * A sheep that starts off every display looks like one that has walked off the screen, so they start just
 * inside it instead.
 */
const onScreen = (x: string): string =>
  /^screenW(\s*\+\s*\d+)?$/.test(x.trim()) ? 'screenW-imageW-10' : x;

const numeric = /^-?\d+(\.\d+)?$/;
const scaled = (v: string, k: number): string => (numeric.test(v) ? String(Number(v) * k) : v);

export const tunePack = (pack: ClassicPack): ClassicPack => {
  const animations: PackAnim[] = pack.animations.map((a) => {
    const speed = (pt: AnimPoint): AnimPoint => ({
      ...pt,
      x: WALKERS.has(a.name) ? scaled(pt.x, WALK_BOOST) : pt.x,
      y: WALKERS.has(a.name) ? scaled(pt.y, WALK_BOOST) : pt.y,
      interval: scaled(pt.interval, 1 / TEMPO),
    });
    return {
      ...a,
      start: speed(a.start),
      end: speed(a.end),
      next: a.next.map((n) => ({ ...n })),
      border: a.border.map((n) => ({ ...n })),
      gravity: a.gravity.map((n) => ({ ...n })),
    };
  });
  for (const [name, list, id, only, p] of WEIGHTS) {
    const a = animations.find((x) => x.name === name);
    for (const n of a?.[list] ?? []) if (n.id === id && n.only === only) n.p = p;
  }
  for (const [name, list, ref] of EXTRA) {
    const a = animations.find((x) => x.name === name);
    if (a && !a[list].some((n) => n.id === ref.id && n.only === ref.only)) a[list].push({ ...ref });
  }
  // The classic sheets have no kick. Reuse the skid from `run_end` (a few run poses) as one, so the
  // sheep visibly lunges at the ball; a pack with its own `kick` animation keeps it.
  const skid = animations.find((a) => a.name === 'run_end');
  if (skid && !animations.some((a) => a.name === 'kick')) {
    animations.push({
      ...skid,
      id: Math.max(...animations.map((a) => a.id)) + 1,
      name: 'kick',
      frames: skid.frames.slice(0, 4),
      repeat: '0',
      repeatFrom: '0',
      next: [{ p: 100, only: 'none', id: 1 }],
      border: [],
      gravity: [],
    });
  }
  return {
    ...pack,
    animations,
    spawns: pack.spawns.map((s, i) => ({
      ...s,
      p: SPAWN_WEIGHTS[i] ?? s.p,
      x: onScreen(s.x),
    })),
  };
};
