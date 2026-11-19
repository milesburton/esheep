// Original sheep art for the "woolly" classic pack: 40x40 tiles, facing LEFT, drawn procedurally.
// Every pose named in structure.json has a drawing here, so the pack plays every animation.
import { canvas } from './png.mjs';

export const TILE = 40;

const C = {
  wool: [250, 248, 240],
  edge: [178, 172, 168],
  dark: [62, 54, 60],
  white: [255, 255, 255],
  lid: [120, 120, 130],
  pink: [240, 140, 150],
  water: [120, 190, 240],
  waterDeep: [70, 140, 210],
  pee: [235, 215, 80],
  grass: [90, 170, 70],
  star: [255, 225, 90],
  tub: [210, 215, 225],
  tubEdge: [120, 130, 150],
  petal: [255, 255, 255],
  heart: [250, 200, 60],
  stem: [80, 160, 70],
  alert: [225, 60, 60],
};
const BLACK = { wool: [78, 78, 92], edge: [30, 30, 40], dark: [235, 200, 170] };

const fresh = () => canvas(TILE, TILE);

/** Rotate `src` by `deg` degrees clockwise about (cx, cy) (nearest neighbour), optionally mirrored. */
const turned = (src, deg, mirror = false, cx = 20, cy = 24) => {
  if (!deg && !mirror) return src;
  const out = fresh();
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= TILE || sy >= TILE) continue;
      const i = (sy * TILE + sx) * 4;
      if (!src.buf[i + 3]) continue;
      const ox = mirror ? TILE - 1 - x : x;
      out.buf.set(src.buf.subarray(i, i + 4), (y * TILE + ox) * 4);
    }
  return out;
};

const GLYPH = {
  Z: ['11111', '00010', '00100', '01000', '11111'],
};
const glyph = (c, ch, x0, y0, col) =>
  GLYPH[ch].forEach((row, y) =>
    [...row].forEach((v, x) => v === '1' && c.rect(x0 + x, y0 + y, 1, 1, col)),
  );

const legSet = (mode) =>
  ({
    stand: { off: [0, 0, 0, 0], len: 8 },
    A: { off: [-2, -2, 2, 2], len: 8 },
    B: { off: [2, 2, -2, -2], len: 8 },
    runA: { off: [-6, -4, 5, 7], len: 6 },
    runB: { off: [1, 2, -1, -2], len: 4 },
    tuck: { off: [0, 0, 0, 0], len: 3 },
    splay: { off: [-6, -4, 4, 6], len: 6 },
    dangle: { off: [-1, 0, 0, 1], len: 10 },
    peeL: { off: [0, 0, 0, 0], len: 8 },
  })[mode] ?? { off: [0, 0, 0, 0], len: 8 };

/** Side-on sheep facing left. */
const side = (o = {}) => {
  const { legs = 'stand', eye = 'open', dy = 0, sx = 1, sy = 1, headDy = 0, pal = C, bump = 0 } = o;
  const c = fresh();
  const bx = 22;
  const by = 21 + dy;
  const rx = 11 * sx;
  const ry = 9 * sy;
  const { off, len } = legSet(legs);
  const top = Math.round(by + ry - 2);
  [14, 18, 26, 30].forEach((x, i) => {
    if (legs === 'peeL' && i === 3) c.rect(x, top + 1, 7, 2, C.dark);
    else c.rect(Math.round(x + off[i] - (sx - 1) * 6), top, 2, len, C.dark);
  });
  c.ellipse(bx, by, rx + 1, ry + 1, pal.edge);
  c.ellipse(bx, by, rx, ry, pal.wool);
  for (const [x, y] of [
    [13, -6],
    [19, -8],
    [26, -7],
    [32, -3],
    [15, 5],
    [23, 8],
    [30, 5],
  ]) {
    c.ellipse(bx - 22 + x, by + y + 2 + bump, 3.4, 3.4 * sy, pal.edge);
    c.ellipse(bx - 22 + x, by + y + 2 + bump, 2.7, 2.7 * sy, pal.wool);
  }
  const hx = 7;
  const hy = Math.round(19 + dy + headDy);
  c.ellipse(hx + 1, hy, 5, 5, pal.dark === C.dark ? C.dark : pal.dark);
  c.ellipse(hx + 5, hy - 5, 2, 3, pal.dark === C.dark ? C.dark : pal.dark);
  const ink = pal === C ? C.dark : [30, 30, 40];
  if (eye === 'open') {
    c.rect(4, hy - 2, 2, 2, C.white);
    c.rect(4, hy - 1, 1, 1, ink);
  } else if (eye === 'wide') {
    c.ellipse(5, hy - 1, 2.2, 2.2, C.white);
    c.rect(4, hy - 1, 1, 1, ink);
  } else if (eye === 'x') {
    for (const [a, b] of [
      [3, -2],
      [5, -2],
      [4, -1],
      [3, 0],
      [5, 0],
    ])
      c.rect(a, hy + b, 1, 1, C.white);
  } else c.rect(3, hy - 1, 3, 1, C.lid);
  c.ellipse(34, by - 3, 2, 2, pal.edge);
  c.ellipse(34, by - 3, 1.4, 1.4, pal.wool);
  return c;
};

/** Front-on sheep. */
const front = (o = {}) => {
  const { legs = 'stand', eye = 'open', dy = 0, headDy = 0, mouth = false, sx = 1, sy = 1 } = o;
  const c = fresh();
  const by = 24 + dy;
  const len = legs === 'tuck' ? 3 : 6;
  c.rect(14, by + 8, 3, len, C.dark);
  c.rect(23, by + 8, 3, len, C.dark);
  c.ellipse(20, by, 11 * sx + 1, 10 * sy + 1, C.edge);
  c.ellipse(20, by, 11 * sx, 10 * sy, C.wool);
  for (const [x, y] of [
    [11, -4],
    [29, -4],
    [13, 6],
    [27, 6],
    [20, 8],
  ]) {
    c.ellipse(x, by + y, 3.5, 3.5, C.edge);
    c.ellipse(x, by + y, 2.8, 2.8, C.wool);
  }
  const hy = 13 + dy + headDy;
  c.ellipse(13, hy - 2, 3, 2, C.dark);
  c.ellipse(27, hy - 2, 3, 2, C.dark);
  c.ellipse(20, hy, 7, 7, C.dark);
  const eyes = (x) => {
    if (eye === 'open') {
      c.rect(x, hy - 2, 2, 3, C.white);
      c.rect(x, hy - 1, 1, 1, C.dark);
    } else if (eye === 'wide') {
      c.ellipse(x + 1, hy - 1, 2, 2.4, C.white);
      c.rect(x + 1, hy - 1, 1, 1, C.dark);
    } else c.rect(x - 1, hy - 1, 3, 1, C.lid);
  };
  eyes(16);
  eyes(22);
  if (mouth) c.ellipse(20, hy + 4, 2, 2.5, C.pink);
  else c.rect(19, hy + 3, 2, 1, C.pink);
  return c;
};

/** Three-quarter view mid-turn: body still left-facing, head swung to the viewer. */
const threeQ = () => {
  const c = side({ headDy: -1 });
  c.ellipse(11, 20, 7, 7, C.edge);
  c.ellipse(11, 20, 6, 6, C.dark);
  c.ellipse(7, 15, 2, 3, C.dark);
  c.ellipse(15, 15, 2, 3, C.dark);
  c.rect(8, 18, 2, 3, C.white);
  c.rect(8, 19, 1, 1, C.dark);
  c.rect(13, 18, 2, 3, C.white);
  c.rect(13, 19, 1, 1, C.dark);
  c.rect(10, 24, 2, 1, C.pink);
  return c;
};

// ---- extras ----------------------------------------------------------------------------------
const zs = (c, n) => {
  glyph(c, 'Z', 2, 4, C.water);
  if (n > 1) glyph(c, 'Z', 9, 0, C.waterDeep);
};
const drops = (c, n, y0 = 30) => {
  for (let i = 0; i < n; i++) c.rect(8 + i * 6, y0 + ((i * 3) % 6), 1, 2, C.water);
};
const stars = (c, n) => {
  [
    [6, 4],
    [30, 6],
    [18, 2],
    [34, 16],
  ]
    .slice(0, n)
    .forEach(([x, y]) => {
      c.rect(x, y - 1, 1, 3, C.star);
      c.rect(x - 1, y, 3, 1, C.star);
    });
};
const exclaim = (c, size) => {
  const h = 4 + size * 2;
  c.rect(2, 2, 2, h, C.alert);
  c.rect(2, 2 + h + 1, 2, 2, C.alert);
};
const grass = (c, n) => {
  for (let i = 0; i < n; i++) c.rect(1 + i * 2, 30 - (i % 2) * 2, 1, 6 + (i % 2) * 2, C.grass);
};

const tub = (c, level, o = {}) => {
  c.ellipse(20, 33, 17, 5, C.tubEdge);
  c.rect(4, 26, 32, 9, C.tub);
  c.rect(4, 26, 32, 1, C.tubEdge);
  c.rect(4, 34, 32, 1, C.tubEdge);
  c.rect(3, 26, 1, 9, C.tubEdge);
  c.rect(36, 26, 1, 9, C.tubEdge);
  c.rect(8, 36, 3, 2, C.tubEdge);
  c.rect(29, 36, 3, 2, C.tubEdge);
  if (level > 0) c.rect(5, 34 - level, 30, level, C.water);
  if (o.bubbles)
    for (let i = 0; i < o.bubbles; i++) c.ellipse(10 + i * 6, 24 - (i % 2) * 3, 2, 2, C.white);
};
const peekSheep = (c, up) => {
  // Head and a wool tuft peeking above the tub rim; `up` = rows visible above the rim.
  const y = 26 - up;
  c.ellipse(20, y - 4, 9, 8, C.edge);
  c.ellipse(20, y - 4, 8, 7, C.wool);
  c.ellipse(20, y, 5, 5, C.dark);
  c.rect(17, y - 2, 2, 2, C.white);
  c.rect(22, y - 2, 2, 2, C.white);
};
const flower = (c, stage) => {
  const h = [4, 8, 12, 16, 20][stage];
  c.rect(19, 38 - h, 2, h, C.stem);
  c.rect(15, 33, 4, 1, C.stem);
  if (stage >= 1) c.rect(21, 30, 4, 1, C.stem);
  if (stage >= 3) {
    const y = 38 - h;
    for (const [dx, dy] of [
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4],
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ])
      c.ellipse(20 + dx, y + dy, 2.4, 2.4, C.petal);
    c.ellipse(20, y, 2.6, 2.6, C.heart);
  }
};

// ---- pose table ------------------------------------------------------------------------------
const lieDown = { legs: 'tuck', dy: 10, sy: 0.8, headDy: 5 };
const spin = (i) => turned(side({ legs: 'tuck', eye: 'wide' }), i * 50);
const boing = (i) => turned(side({ legs: 'tuck', eye: 'wide' }), i * 60, i > 3);

const POSES = {
  stand: () => side(),
  walkA: () => side({ legs: 'A' }),
  walkB: () => side({ legs: 'B' }),
  runA: () => side({ legs: 'runA', headDy: -1 }),
  runB: () => side({ legs: 'runB', dy: -2, headDy: -1 }),
  front: () => front(),
  frontBlink: () => front({ eye: 'closed' }),
  frontYawn: () => front({ mouth: true, eye: 'closed' }),
  turn3q: threeQ,
  crouch: () => side({ legs: 'tuck', dy: 5, sy: 0.9 }),
  lie: () => side({ ...lieDown, eye: 'closed' }),
  lieSettle: () => side({ ...lieDown, eye: 'open', dy: 9 }),
  lieZ1: () => {
    const c = side({ ...lieDown, eye: 'closed' });
    zs(c, 1);
    return c;
  },
  lieZ2: () => {
    const c = side({ ...lieDown, eye: 'closed', bump: 1 });
    zs(c, 2);
    return c;
  },
  sitA: () => front({ dy: 4, legs: 'tuck' }),
  sitB: () => front({ dy: 4, legs: 'tuck', eye: 'closed' }),
  nodA: () => front({ dy: 4, legs: 'tuck', eye: 'closed' }),
  nodB: () => front({ dy: 4, legs: 'tuck', eye: 'closed', headDy: 2 }),
  nodC: () => front({ dy: 4, legs: 'tuck', eye: 'closed', headDy: 4 }),
  riseA: () => front({ dy: 2, eye: 'closed' }),
  riseB: () => front({ dy: 1 }),
  peeStart: () => side({ eye: 'open' }),
  peeLift: () => side({ legs: 'peeL' }),
  peeEnd: () => side({ eye: 'closed' }),
  peeA: () => {
    const c = side({ legs: 'peeL' });
    c.rect(38, 28, 1, 1, C.pee);
    return c;
  },
  peeB: () => {
    const c = side({ legs: 'peeL' });
    c.rect(37, 29, 2, 1, C.pee);
    c.rect(38, 30, 1, 6, C.pee);
    return c;
  },
  peeC: () => {
    const c = side({ legs: 'peeL' });
    c.rect(37, 29, 2, 1, C.pee);
    c.rect(38, 30, 1, 6, C.pee);
    c.ellipse(36, 38, 3, 1.4, C.pee);
    return c;
  },
  peeD: () => {
    const c = side({ legs: 'peeL', eye: 'closed' });
    c.ellipse(36, 38, 4, 1.6, C.pee);
    return c;
  },
  climbA: () => turned(side({ legs: 'A' }), 90),
  climbB: () => turned(side({ legs: 'B' }), 90),
  climbTop: () => turned(side({ legs: 'A' }), 130),
  ceilingTurn: () => turned(side({ legs: 'stand' }), 180, true),
  ceilingA: () => turned(side({ legs: 'A' }), 180, true),
  ceilingB: () => turned(side({ legs: 'B' }), 180, true),
  downA: () => turned(side({ legs: 'A' }), -90),
  downB: () => turned(side({ legs: 'B' }), -90),
  leanA: () => turned(side({ legs: 'A' }), 40),
  leanB: () => turned(side({ legs: 'B' }), 65),
  crouchJump: () => side({ legs: 'tuck', dy: 6, sy: 0.85, eye: 'wide' }),
  landJump: () => side({ sx: 1.12, sy: 0.85, legs: 'stand', dy: 2 }),
  leap1: () => turned(side({ legs: 'splay', eye: 'wide', dy: -3 }), 22),
  leap2: () => turned(side({ legs: 'tuck', eye: 'wide', dy: -3 }), -14),
  airSplay: () => side({ legs: 'splay', eye: 'wide', dy: -3 }),
  dropCrouch: () => side({ legs: 'tuck', dy: 4, headDy: 3 }),
  fallSplay: () => side({ legs: 'splay', eye: 'wide', dy: -3, headDy: -2 }),
  fallFast: () => side({ legs: 'splay', eye: 'wide', sx: 0.9, sy: 1.15, dy: -2 }),
  fallA: () => turned(side({ legs: 'splay', eye: 'wide', dy: -3 }), -12),
  tumbleA: () => turned(side({ legs: 'splay', eye: 'wide' }), 120),
  tumbleB: () => turned(side({ legs: 'splay', eye: 'wide' }), 200),
  tumbleLand: () => turned(side({ legs: 'tuck', eye: 'x' }), 85),
  dangleA: () => side({ legs: 'dangle', eye: 'wide', dy: -5 }),
  dangleB: () => turned(side({ legs: 'dangle', eye: 'wide', dy: -5 }), -7),
  dangleC: () => turned(side({ legs: 'dangle', eye: 'wide', dy: -5 }), 7),
  squashLand: () => side({ sx: 1.2, sy: 0.75, legs: 'tuck', dy: 5 }),
  squashHard: () => {
    const c = side({ sx: 1.3, sy: 0.65, legs: 'tuck', dy: 8, eye: 'x' });
    stars(c, 3);
    return c;
  },
  hitHard: () => {
    const c = turned(side({ legs: 'splay', eye: 'x' }), 10);
    stars(c, 2);
    return c;
  },
  recover: () => {
    const c = side({ sy: 0.92, legs: 'stand', eye: 'closed', dy: 1 });
    stars(c, 1);
    return c;
  },
  syncA: () => front({ mouth: true }),
  syncB: () => front({ eye: 'closed' }),
  eatDown: () => {
    const c = side({ headDy: 5, legs: 'stand' });
    grass(c, 3);
    return c;
  },
  chewA: () => {
    const c = side({ headDy: 5 });
    grass(c, 2);
    return c;
  },
  chewB: () => {
    const c = side({ headDy: 6, eye: 'closed' });
    grass(c, 1);
    return c;
  },
  chewC: () => side({ headDy: 5, eye: 'closed' }),
  boingSquash: () => side({ sx: 1.2, sy: 0.75, legs: 'tuck', dy: 5 }),
  boingStretch: () => side({ sx: 0.85, sy: 1.2, legs: 'splay', eye: 'wide', dy: -3 }),
  boingSpin1: () => boing(1),
  boingSpin2: () => boing(2),
  boingSpin3: () => boing(3),
  boingSpin4: () => boing(4),
  boingSpin5: () => boing(5),
  boingSpin6: () => boing(6),
  boingLand: () => side({ sx: 1.15, sy: 0.82, legs: 'tuck', dy: 4 }),
  lookDown1: () => turned(side({ headDy: 2 }), 10),
  lookDown2: () => turned(side({ headDy: 4 }), 22),
  lookDown3: () => turned(side({ headDy: 3, eye: 'closed' }), 22),
  shakeA: () => {
    const c = turned(side(), -8);
    drops(c, 3, 8);
    return c;
  },
  shakeB: () => {
    const c = turned(side(), 8);
    drops(c, 3, 12);
    return c;
  },
  zapped: () => {
    const c = side({ legs: 'splay', eye: 'x' });
    stars(c, 4);
    return c;
  },
  wetStand: () => {
    const c = side({ eye: 'closed' });
    drops(c, 2);
    return c;
  },
  dripA: () => {
    const c = side();
    drops(c, 1, 30);
    return c;
  },
  dripB: () => {
    const c = side({ eye: 'closed' });
    drops(c, 2, 32);
    return c;
  },
  dripC: () => {
    const c = side();
    drops(c, 3, 33);
    return c;
  },
  surprise1: () => {
    const c = side({ eye: 'wide' });
    exclaim(c, 0);
    return c;
  },
  surprise2: () => {
    const c = side({ eye: 'wide', dy: -1 });
    exclaim(c, 1);
    return c;
  },
  surprise3: () => {
    const c = side({ eye: 'wide', dy: -2 });
    exclaim(c, 2);
    return c;
  },
  surprise4: () => {
    const c = side({ eye: 'wide' });
    exclaim(c, 1);
    return c;
  },
  spin0: () => spin(0),
  spin1: () => spin(1),
  spin2: () => spin(2),
  spin3: () => spin(3),
  spin4: () => spin(4),
  spin5: () => spin(5),
  spin6: () => spin(6),
  blackStand: () => side({ pal: BLACK }),
  blackStandB: () => side({ pal: BLACK, headDy: -2, eye: 'wide' }),
  blackWalkA: () => side({ pal: BLACK, legs: 'A' }),
  blackWalkB: () => side({ pal: BLACK, legs: 'B' }),
  tubEmpty: () => {
    const c = fresh();
    tub(c, 0);
    return c;
  },
  tubBubbles0: () => {
    const c = fresh();
    tub(c, 6, { bubbles: 3 });
    peekSheep(c, 6);
    return c;
  },
  tubBubbles1: () => {
    const c = fresh();
    tub(c, 6, { bubbles: 5 });
    peekSheep(c, 8);
    return c;
  },
  tubDrain0: () => {
    const c = fresh();
    tub(c, 4);
    peekSheep(c, 9);
    return c;
  },
  tubDrain1: () => {
    const c = fresh();
    tub(c, 2);
    peekSheep(c, 10);
    return c;
  },
  tubDrain2: () => {
    const c = fresh();
    tub(c, 1);
    peekSheep(c, 10);
    drops(c, 2, 4);
    return c;
  },
  blank: fresh,
};
for (let i = 0; i < 9; i++)
  POSES[`tubSink${i}`] = () => {
    const c = fresh();
    tub(c, Math.min(7, 1 + i), { bubbles: i > 4 ? i - 4 : 0 });
    if (i < 8) peekSheep(c, Math.max(2, 10 - i));
    return c;
  };
for (let i = 0; i < 5; i++)
  POSES[`flower${i}`] = () => {
    const c = fresh();
    flower(c, i);
    return c;
  };

export const poseNames = Object.keys(POSES);
export const drawPose = (name) => {
  const make = POSES[name];
  if (!make) throw new Error(`no art for pose "${name}"`);
  return make();
};
