import { describe, expect, it, vi } from 'vitest';
import { createWindowSource, type NativeWindow } from './windows.js';

const win = (
  o: Partial<{ id: number; pid: number; title: string; visible: boolean; b: Partial<Rect> }>,
): NativeWindow => ({
  id: o.id ?? 1,
  processId: o.pid ?? 100,
  getTitle: () => o.title ?? 'Editor',
  isVisible: () => o.visible ?? true,
  getBounds: () => o.b ?? { x: 0, y: 0, width: 300, height: 200 },
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

  it('returns nothing on macOS and Linux and never loads the native module', () => {
    const load = vi.fn();
    expect(createWindowSource('darwin', 1, load)()).toEqual([]);
    expect(createWindowSource('linux', 1, load)()).toEqual([]);
    expect(load).not.toHaveBeenCalled();
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
