/** Transparent margin (px) around a classic sprite inside its window. */
export const WINDOW_PAD = 6;

/** Tolerance (px) for "standing on" / "touching" tests. */
export const TOL = 3;

export const insideAny = (areas: readonly Rect[], px: number, py: number): boolean =>
  areas.some((a) => px >= a.x && px < a.x + a.width && py >= a.y && py < a.y + a.height);

/** True if the sprite's corners and edge midpoints all lie on some display. */
export const onScreen = (areas: readonly Rect[], size: number, x: number, y: number): boolean => {
  const e = size - 1;
  const m = size / 2;
  return [
    [0, 0],
    [e, 0],
    [0, e],
    [e, e],
    [m, 0],
    [m, e],
    [0, m],
    [e, m],
  ].every(([dx, dy]) => insideAny(areas, x + dx, y + dy));
};

/**
 * Like `onScreen` but ignoring the top row of the sprite: a sheep standing on a window near the
 * top of the display legitimately has its head above the screen, which must not block walking.
 */
export const onScreenLower = (
  areas: readonly Rect[],
  size: number,
  x: number,
  y: number,
): boolean => {
  const e = size - 1;
  const m = size / 2;
  return [
    [0, m],
    [e, m],
    [0, e],
    [e, e],
    [m, e],
  ].every(([dx, dy]) => insideAny(areas, x + dx, y + dy));
};

/** Horizontal overlap of the sprite's middle half with `r` (so a toe over an edge is not "on" it). */
export const overlapsX = (size: number, x: number, r: Rect): boolean =>
  x + size * 0.75 > r.x && x + size * 0.25 < r.x + r.width;

export const intersects = (x: number, y: number, size: number, r: Rect): boolean =>
  x < r.x + r.width && x + size > r.x && y < r.y + r.height && y + size > r.y;

/** Near-maximised windows would trap or pin the sheep, so they are not treated as obstacles. */
export const isMaximised = (b: Rect, areas: readonly Rect[]): boolean =>
  areas.some((a) => b.width * b.height >= a.width * a.height * 0.85);

export const obstaclesFrom = (windows: readonly WindowInfo[], areas: readonly Rect[]): Rect[] =>
  windows.map((w) => w.bounds).filter((b) => !isMaximised(b, areas));

/** Move a `size` square so it lies inside the nearest display (a no-op if it already does). */
export const clampIntoAreas = (
  areas: readonly Rect[],
  size: number,
  x: number,
  y: number,
): { x: number; y: number } => {
  if (areas.length === 0 || onScreen(areas, size, x, y)) return { x, y };
  const nearest = areas.reduce((best, a) => {
    const d = (r: Rect): number =>
      Math.hypot(x + size / 2 - (r.x + r.width / 2), y + size / 2 - (r.y + r.height / 2));
    return d(a) < d(best) ? a : best;
  });
  return {
    x: clamp(x, nearest.x, Math.max(nearest.x, nearest.x + nearest.width - size)),
    y: clamp(y, nearest.y, Math.max(nearest.y, nearest.y + nearest.height - size)),
  };
};

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Largest point along `from → to` for which `valid` still holds (binary search, assuming `from`
 * is valid). Lets a blocked sprite slide right up to an edge instead of stopping a step short.
 */
export const farthestValid = (
  from: number,
  to: number,
  valid: (v: number) => boolean,
  iterations = 12,
): number => {
  const { lo } = Array.from({ length: iterations }).reduce<{ lo: number; hi: number }>(
    ({ lo, hi }) => {
      const mid = (lo + hi) / 2;
      return valid(from + (to - from) * mid) ? { lo: mid, hi } : { lo, hi: mid };
    },
    { lo: 0, hi: 1 },
  );
  return from + (to - from) * lo;
};
