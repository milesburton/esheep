/** DOM helpers for loading and drawing sprite sheets. Thin shell: logic lives in core/. */

/** Load a classic pack's sheet, colour-keying magenta to transparent if the pack asks for it. */
export const loadClassicSheet = async (pack: ClassicPack): Promise<HTMLCanvasElement> => {
  const img = new Image();
  img.src = pack.png;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  g.drawImage(img, 0, 0);
  if (pack.transparency.toLowerCase() === 'magenta') {
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i] === 255 && data.data[i + 1] === 0 && data.data[i + 2] === 255)
        data.data[i + 3] = 0;
    }
    g.putImageData(data, 0, 0);
  }
  return canvas;
};

export const loadImage = async (src: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};
