// Dependency-free PNG encoder and RGBA canvas used by the art generators.
import zlib from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export const encodePng = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** A w*h RGBA pixel buffer with a couple of drawing primitives. */
export const canvas = (w, h) => {
  const buf = Buffer.alloc(w * h * 4);
  const put = (x, y, [r, g, b]) => {
    if (x >= 0 && x < w && y >= 0 && y < h) buf.set([r, g, b, 255], (y * w + x) * 4);
  };
  const ellipse = (cx, cy, rx, ry, col) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, col);
  };
  const rect = (x0, y0, rw, rh, col) => {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) put(x, y, col);
  };
  return { w, h, buf, ellipse, rect };
};

/** Copy `src` into `dst` at (ox, oy), optionally mirrored or rotated about its centre. */
export const blit = (dst, src, ox, oy, transform = (x, y) => [x, y]) => {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const [sx, sy] = transform(x, y);
      const i = (sy * src.w + sx) * 4;
      if (src.buf[i + 3]) dst.buf.set(src.buf.subarray(i, i + 4), ((oy + y) * dst.w + ox + x) * 4);
    }
};
