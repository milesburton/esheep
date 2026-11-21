import { clampIntoAreas, onScreenLower } from '../core/geometry';

/**
 * Where a sheep's window may actually be put. The sheep's own logic keeps the sprite on a display, but
 * that is a decision made in another process from information that can be a moment stale (displays
 * changing, a window list that moves, a drag, a bug): the main process is the last line of defence and
 * never places a sheep with its lower body off every display. A window is `size` px square with the
 * sprite inset by `pad`; (x, y) is the window's top-left. Returns the position to use.
 */
export const clampWindow = (
  areas: readonly Rect[],
  x: number,
  y: number,
  size: number,
  pad: number,
): { x: number; y: number } => {
  if (areas.length === 0) return { x, y };
  const sprite = Math.max(1, size - 2 * pad);
  // A sprite standing on a window near the top may have its head above the display: that is fine.
  if (onScreenLower(areas, sprite, x + pad, y + pad)) return { x, y };
  const at = clampIntoAreas(areas, sprite, x + pad, y + pad);
  return { x: at.x - pad, y: at.y - pad };
};
