import { describe, expect, it, vi } from 'vitest';
import { createWindowSource, physicalBounds, type NativeWindow } from './windows.js';

const win = (
  o: Partial<{
    id: number;
    pid: number;
    title: string;
    visible: boolean;
    b: Partial<Rect>;
    sf: number;
  }>,
): NativeWindow => ({
  id: o.id ?? 1,
  processId: o.pid ?? 100,
  getTitle: () => o.title ?? 'Editor',
  isVisible: () => o.visible ?? true,
  getBounds: () => o.b ?? { x: 0, y: 0, width: 300, height: 200 },
  getScaleFactor: () => o.sf,
});

const source = (windows: NativeWindow[], platform: NodeJS.Platform = 'win32') =>
  createWindowSource(platform, 999, () => ({ getWindows: () => windows }));

describe('createWindowSource', () => {
  it('lists visible, titled windows with their bounds', () => {
    expect(source([win({ id: 7, title: 'Terminal' })])()).toEqual([
      { id: 7, title: 'Terminal', bounds: { x: 0, y: 0, width: 300, height: 200 } },
    ]);
  });

  it.each([
    ['our own window', win({ pid: 999 })],
    ['hidden windows', win({ visible: false })],
    ['untitled windows', win({ title: '' })],
    ['tiny windows', win({ b: { x: 0, y: 0, width: 40, height: 300 } })],
    ['windows without a position', win({ b: { width: 300, height: 300 } })],
    ['windows without a size', win({ b: { x: 1, y: 1 } })],
  ])('skips %s', (_n, w) => {
    expect(source([w])()).toEqual([]);
  });

  it('returns nothing on Linux (no enumeration yet) and never loads the native module there', () => {
    const load = vi.fn();
    expect(createWindowSource('linux', 1, load)()).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  describe('macOS', () => {
    const mac = (windows: NativeWindow[], trusted: unknown = true) =>
      createWindowSource('darwin', 999, () => ({
        getWindows: () => windows,
        requestAccessibility: () => trusted,
      }));

    it('lists windows, keeping untitled ones (titles need Screen Recording permission)', () => {
      expect(mac([win({ id: 3, title: '' })])()).toEqual([
        { id: 3, title: '', bounds: { x: 0, y: 0, width: 300, height: 200 } },
      ]);
    });

    it('still skips our own, hidden and tiny windows', () => {
      expect(
        mac([
          win({ pid: 999 }),
          win({ visible: false }),
          win({ b: { x: 0, y: 0, width: 10, height: 10 } }),
        ])(),
      ).toEqual([]);
    });

    it('falls back to screen edges when Accessibility permission is refused', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(mac([win({})], false)()).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('works if the module has no permission API', () => {
      const list = createWindowSource('darwin', 1, () => ({ getWindows: () => [win({})] }));
      expect(list()).toHaveLength(1);
    });

    it('does not apply the Windows DPI conversion', () => {
      const toDip = vi.fn();
      const list = createWindowSource(
        'darwin',
        1,
        () => ({ getWindows: () => [win({ sf: 2 })] }),
        toDip,
      );
      expect(list()).toHaveLength(1);
      expect(toDip).not.toHaveBeenCalled();
    });
  });

  describe('DPI (Windows)', () => {
    const halve = (r: Rect): Rect => ({
      x: r.x / 2,
      y: r.y / 2,
      width: r.width / 2,
      height: r.height / 2,
    });

    it("undoes the library's per-monitor division, then converts physical pixels to DIPs", () => {
      // 200% monitor: the library reports 100,50,300,200; physical is 200,100,600,400; DIP is 100,50,300,200.
      const toDip = vi.fn(halve);
      const list = createWindowSource(
        'win32',
        1,
        () => ({
          getWindows: () => [win({ sf: 2, b: { x: 100, y: 50, width: 300, height: 200 } })],
        }),
        toDip,
      );
      expect(toDip).not.toHaveBeenCalled();
      expect(list()[0].bounds).toEqual({ x: 100, y: 50, width: 300, height: 200 });
      expect(toDip).toHaveBeenCalledWith({ x: 200, y: 100, width: 600, height: 400 });
    });

    it('treats a missing or nonsense scale factor as 1', () => {
      expect(physicalBounds({ x: 1, y: 2, width: 3, height: 4 }, undefined)).toEqual({
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      });
      expect(physicalBounds({ x: 1, y: 2, width: 3, height: 4 }, 0)).toEqual({
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      });
      expect(physicalBounds({ x: 10, y: 20, width: 30, height: 40 }, 1.5)).toEqual({
        x: 15,
        y: 30,
        width: 45,
        height: 60,
      });
    });

    it('leaves bounds alone when no converter is supplied', () => {
      expect(source([win({ sf: 2 })])()[0].bounds).toEqual({ x: 0, y: 0, width: 300, height: 200 });
    });
  });

  it('degrades gracefully when the optional native module fails to load', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const list = createWindowSource('win32', 1, () => {
      throw new Error('no native build');
    });
    expect(list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns nothing if enumeration itself throws', () => {
    const list = createWindowSource('win32', 1, () => ({
      getWindows: () => {
        throw new Error('boom');
      },
    }));
    expect(list()).toEqual([]);
  });
});
