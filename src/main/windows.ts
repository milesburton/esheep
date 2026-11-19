// Window enumeration. All native access lives here, in the main process.

export interface NativeWindow {
  id: number;
  processId: number;
  getTitle: () => string;
  getBounds: () => Partial<Rect>;
  isVisible: () => boolean;
  /** Windows only: the window's monitor scale factor (node-window-manager divides bounds by it). */
  getScaleFactor?: () => number | undefined;
}

export interface WindowManagerLike {
  getWindows: () => NativeWindow[];
  /** macOS: asks for (and reports) the Accessibility permission needed to read window bounds. */
  requestAccessibility?: () => unknown;
}

/** Converts a rectangle in physical screen pixels to Electron's device-independent pixels. */
export type ToDip = (physical: Rect) => Rect;

const MIN_SIZE = 50;

const hasBounds = (b: Partial<Rect>): b is Rect =>
  b.x !== undefined && b.y !== undefined && (b.width ?? 0) > MIN_SIZE && (b.height ?? 0) > MIN_SIZE;

/**
 * node-window-manager divides Windows bounds by the window's own monitor scale factor. That is only
 * right on a single monitor: on mixed-DPI desktops each monitor sits at a different offset in the
 * physical coordinate space. Undo the division to get physical pixels back.
 */
export const physicalBounds = (b: Rect, scaleFactor: number | undefined): Rect => {
  const sf = scaleFactor !== undefined && scaleFactor > 0 ? scaleFactor : 1;
  return { x: b.x * sf, y: b.y * sf, width: b.width * sf, height: b.height * sf };
};

/**
 * Build a window lister. `load` is only called on Windows and macOS and may throw (the native
 * module is optional); in that case, and on other platforms, the sheep just uses the screen edges.
 *
 * - Windows: bounds are converted to DIPs with `toDip` (Electron's `screen.screenToDipRect`), so
 *   high-DPI and mixed-DPI desktops line up with `screen` work areas.
 * - macOS: needs the Accessibility permission (`requestAccessibility`); without it the sheep uses
 *   the screen edges. Window titles need Screen Recording permission, so untitled windows are kept.
 * - Linux: X11 could use EWMH; Wayland has no standard API. Not implemented.
 */
export const createWindowSource = (
  platform: NodeJS.Platform,
  ownPid: number,
  load: () => WindowManagerLike,
  toDip?: ToDip,
): (() => WindowInfo[]) => {
  const manager = ((): WindowManagerLike | null => {
    if (platform !== 'win32' && platform !== 'darwin') return null;
    try {
      const m = load();
      if (platform === 'darwin' && m.requestAccessibility && !m.requestAccessibility()) {
        console.warn('Accessibility permission not granted; window collisions disabled.');
        return null;
      }
      return m;
    } catch (err) {
      console.warn('node-window-manager unavailable; window collisions disabled:', err);
      return null;
    }
  })();

  const boundsOf = (w: NativeWindow): Partial<Rect> => {
    const b = w.getBounds();
    if (platform !== 'win32' || !toDip || !hasBounds(b)) return b;
    return toDip(physicalBounds(b, w.getScaleFactor?.()));
  };

  return () => {
    if (!manager) return [];
    try {
      return manager
        .getWindows()
        .filter((w) => w.processId !== ownPid && w.isVisible())
        .map((w) => ({ id: w.id, title: w.getTitle() ?? '', bounds: boundsOf(w) }))
        .filter(
          (w): w is WindowInfo =>
            (platform === 'darwin' || w.title.length > 0) && hasBounds(w.bounds),
        );
    } catch {
      return [];
    }
  };
};
