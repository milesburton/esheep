// Window enumeration. All native access lives here, in the main process.

export interface NativeWindow {
  id: number;
  processId: number;
  getTitle: () => string;
  getBounds: () => Partial<Rect>;
  isVisible: () => boolean;
}

export interface WindowManagerLike {
  getWindows: () => NativeWindow[];
}

const MIN_SIZE = 50;

const hasBounds = (b: Partial<Rect>): b is Rect =>
  b.x !== undefined && b.y !== undefined && (b.width ?? 0) > MIN_SIZE && (b.height ?? 0) > MIN_SIZE;

/**
 * Build a window lister. `load` is only called on Windows and may throw (the native module is
 * optional); in that case, and on other platforms, the sheep just uses the screen edges.
 *
 * macOS: TODO - needs a native addon (CGWindowListCopyWindowInfo) plus Screen Recording /
 *        Accessibility permission. Linux: X11 could use EWMH; Wayland has no standard API.
 */
export const createWindowSource = (
  platform: NodeJS.Platform,
  ownPid: number,
  load: () => WindowManagerLike,
): (() => WindowInfo[]) => {
  const manager = ((): WindowManagerLike | null => {
    if (platform !== 'win32') return null;
    try {
      return load();
    } catch (err) {
      console.warn('node-window-manager unavailable; window collisions disabled:', err);
      return null;
    }
  })();

  return () => {
    if (!manager) return [];
    try {
      return manager
        .getWindows()
        .filter((w) => w.processId !== ownPid && w.isVisible())
        .map((w) => ({ id: w.id, title: w.getTitle(), bounds: w.getBounds() }))
        .filter((w): w is WindowInfo => w.title.length > 0 && hasBounds(w.bounds));
    } catch {
      return [];
    }
  };
};
