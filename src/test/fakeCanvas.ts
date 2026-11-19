import { vi } from 'vitest';

/** A recording stand-in for CanvasRenderingContext2D; `alpha` is what getImageData reports. */
export const fakeCtx = (alpha = 255) => {
  const ctx = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: [0, 0, 0, alpha] })),
  };
  return ctx as typeof ctx & CanvasRenderingContext2D;
};
