/**
 * Tag: one sheep is "it" and chases the others; touching one makes that sheep "it" (after a short
 * head start for the old one). Pure and id-based, so the demo (one process) and the Electron main
 * process (one window per sheep) can both run it.
 */

export interface Sprite {
  readonly id: number;
  /** The sprite's rectangle in screen px. */
  readonly rect: Rect;
}

export interface TagGame {
  /** The sheep that is "it" (null until there are at least two sheep). */
  readonly it: number | null;
  /** The new "it" stands still counting until this time (ms), so the old one can run. */
  readonly waitUntil: number;
  /** How many tags have happened. */
  readonly tags: number;
}

/** What one sheep is told: its role and who to run at or away from. */
export interface TagView {
  readonly role: 'it' | 'runner';
  readonly target: Rect | null;
  /** True while a new "it" is still counting (it should not chase yet). */
  readonly wait: boolean;
}

/** A new "it" counts to this before chasing. */
export const TAG_WAIT_MS = 1500;
/** A runner starts running when "it" is within this many sprite widths. */
export const FLEE_RANGE = 10;
/** "It" notices a sheep within this many sprite widths. */
export const SEEK_RANGE = 14;
/** Rectangles on levels whose feet differ by more than this (sprite heights) are out of reach. */
const REACH = 1.2;

const feet = (r: Rect): number => r.y + r.height;
const centre = (r: Rect): number => r.x + r.width / 2;
const reachable = (a: Rect, b: Rect, size: number): boolean =>
  Math.abs(feet(a) - feet(b)) <= size * REACH;

export const startTag = (sprites: readonly Sprite[], now: number, pick = 0): TagGame => ({
  it: sprites.length >= 2 ? sprites[Math.abs(pick) % sprites.length].id : null,
  waitUntil: now + TAG_WAIT_MS,
  tags: 0,
});

/** Do `a` and `b` touch: on the same level, with no real gap between them? */
export const touching = (a: Rect, b: Rect, size: number): boolean => {
  const gap = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  return Math.abs(feet(a) - feet(b)) <= size * 0.6 && gap <= size * 0.1 && gap >= -size;
};

/** Advance the game: pick an "it" if needed, and swap it if "it" touches another sheep. */
export const stepTag = (
  game: TagGame,
  sprites: readonly Sprite[],
  size: number,
  now: number,
): { game: TagGame; tagged: { from: number; to: number } | null } => {
  if (sprites.length < 2) return { game: { ...game, it: null }, tagged: null };
  const itSprite = sprites.find((s) => s.id === game.it);
  if (!itSprite) {
    // "It" left (a sheep was removed): the first remaining sheep takes over.
    return {
      game: { ...game, it: sprites[0].id, waitUntil: now + TAG_WAIT_MS },
      tagged: null,
    };
  }
  if (now < game.waitUntil) return { game, tagged: null };
  const hit = sprites
    .filter((o) => o.id !== itSprite.id && touching(itSprite.rect, o.rect, size))
    .sort(
      (a, b) =>
        Math.abs(centre(a.rect) - centre(itSprite.rect)) -
        Math.abs(centre(b.rect) - centre(itSprite.rect)),
    )[0];
  if (!hit) return { game, tagged: null };
  return {
    game: { it: hit.id, waitUntil: now + TAG_WAIT_MS, tags: game.tags + 1 },
    tagged: { from: itSprite.id, to: hit.id },
  };
};

/** What sheep `id` should do this tick, or null if it is not playing. */
export const viewFor = (
  game: TagGame,
  id: number,
  sprites: readonly Sprite[],
  size: number,
  now: number,
): TagView | null => {
  const me = sprites.find((s) => s.id === id);
  const it = sprites.find((s) => s.id === game.it);
  if (!me || !it || sprites.length < 2) return null;
  if (id === game.it) {
    const target = sprites
      .filter((o) => o.id !== id && reachable(me.rect, o.rect, size))
      .filter((o) => Math.abs(centre(o.rect) - centre(me.rect)) <= size * SEEK_RANGE)
      .sort(
        (a, b) =>
          Math.abs(centre(a.rect) - centre(me.rect)) - Math.abs(centre(b.rect) - centre(me.rect)),
      )[0];
    return { role: 'it', target: target?.rect ?? null, wait: now < game.waitUntil };
  }
  const near =
    reachable(me.rect, it.rect, size) &&
    Math.abs(centre(it.rect) - centre(me.rect)) <= size * FLEE_RANGE;
  return { role: 'runner', target: near ? it.rect : null, wait: false };
};
