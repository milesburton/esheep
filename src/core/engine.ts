import { evalExpr } from './expr.js';
import { TOL, farthestValid, onScreen, onScreenLower, overlapsX } from './geometry.js';
import { stepBallistic } from './physics.js';
import { drawMany, nextRandom } from './rng.js';

/**
 * Classic-pack engine: a probability-weighted animation state machine (desktopPet / eSheep
 * `animations.xml`). Everything here is a pure function over immutable `SheepState`; the
 * only impurity in the whole app is the caller supplying time and the world.
 */

export interface Config {
  /** On-screen sprite size in px. */
  readonly size: number;
  /** On-screen px per source px (movement values in packs are source px). */
  readonly scale: number;
}

export interface CompiledPack {
  readonly pack: ClassicPack;
  readonly byId: ReadonlyMap<number, PackAnim>;
  readonly byName: ReadonlyMap<string, PackAnim>;
}

export const compilePack = (pack: ClassicPack): CompiledPack => ({
  pack,
  byId: new Map(pack.animations.map((a) => [a.id, a])),
  byName: new Map(pack.animations.map((a) => [a.name, a])),
});

interface Keyframe {
  readonly x: number;
  readonly y: number;
  readonly o: number;
  readonly a: number;
  readonly i: number;
}

export type Mode =
  | { readonly kind: 'walk' }
  | { readonly kind: 'held' }
  | {
      readonly kind: 'thrown';
      readonly vx: number;
      readonly vy: number;
      readonly ageMs: number;
      /** Hardest floor contact so far (px/s); picks the soft or hard landing animation. */
      readonly impact: number;
    };

export interface SheepState {
  readonly x: number;
  readonly y: number;
  readonly frame: number;
  /** The default art faces left; flipped faces right. */
  readonly flipped: boolean;
  readonly offsetY: number;
  readonly opacity: number;
  readonly animName: string;
  readonly mode: Mode;
  readonly rng: number;
  readonly entered: boolean;
  // current animation playback
  readonly anim: PackAnim;
  readonly frames: readonly number[];
  readonly repeatFrom: number;
  readonly total: number;
  readonly step: number;
  readonly acc: number;
  readonly p0: Keyframe;
  readonly p1: Keyframe;
}

export interface Update {
  readonly state: SheepState;
  /** Names of animations that began during this update (e.g. to trigger a sound). */
  readonly started: readonly string[];
}

interface Flags {
  readonly taskbar: boolean;
  readonly window: boolean;
  readonly vertical: boolean;
  readonly top: boolean;
  readonly windowSide: boolean;
}

const GRAVITY = 2600; // px / s² for thrown sheep
const RESTITUTION = 0.5;
const MIN_TOSS_SPEED = 250;
const HARD_LANDING = 1100;
const MAX_THROWN_MS = 10_000;
const MAX_STEPS_PER_UPDATE = 50;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const varsFor = (
  at: { x: number; y: number; rng: number },
  world: World,
  cfg: Config,
  forRepeat: boolean,
): { vars: Record<string, number>; rng: number } => {
  const [[random, randS], rng] = drawMany(at.rng, 2);
  const a = world.areas[0];
  // Step counts in packs were authored for unscaled sprites.
  const k = forRepeat ? cfg.scale : 1;
  return {
    rng,
    vars: {
      random: random * 100,
      randS: randS * 100,
      screenW: a.width / k,
      screenH: a.height / k,
      areaW: a.width,
      areaH: a.height,
      imageW: cfg.size,
      imageH: cfg.size,
      imageX: at.x,
      imageY: at.y,
    },
  };
};

const placeholder = (anim: PackAnim, x: number, y: number, rng: number): SheepState => ({
  x,
  y,
  frame: anim.frames[0] ?? 0,
  flipped: false,
  offsetY: 0,
  opacity: 1,
  animName: anim.name,
  mode: { kind: 'walk' },
  rng,
  entered: false,
  anim,
  frames: anim.frames,
  repeatFrom: 0,
  total: 1,
  step: 0,
  acc: 0,
  p0: { x: 0, y: 0, o: 0, a: 1, i: 200 },
  p1: { x: 0, y: 0, o: 0, a: 1, i: 200 },
});

/** Start animation `id` (falling back to #1, then the first) and reset playback. */
const begin = (cp: CompiledPack, s: SheepState, id: number, world: World, cfg: Config): Update => {
  const anim = cp.byId.get(id) ?? cp.byId.get(1) ?? cp.pack.animations[0];
  const first = varsFor(s, world, cfg, false);
  const second = varsFor({ ...s, rng: first.rng }, world, cfg, true);
  const ev = (src: string): number => evalExpr(src, first.vars);
  const frames = anim.frames.length > 0 ? anim.frames : [0];
  const repeatFrom = Math.min(Math.max(0, Math.floor(ev(anim.repeatFrom))), frames.length - 1);
  const repeat = Math.max(0, Math.round(evalExpr(anim.repeat, second.vars)));
  return {
    started: [anim.name],
    state: {
      ...s,
      anim,
      animName: anim.name,
      frames,
      repeatFrom,
      // Show the new animation's first frame straight away (e.g. the drag pose on grab).
      frame: frames[0],
      offsetY: ev(anim.start.offsety) * cfg.scale,
      opacity: ev(anim.start.opacity),
      total: frames.length + (frames.length - repeatFrom) * repeat,
      step: 0,
      acc: 0,
      rng: second.rng,
      p0: {
        x: ev(anim.start.x),
        y: ev(anim.start.y),
        o: ev(anim.start.offsety),
        a: ev(anim.start.opacity),
        i: ev(anim.start.interval),
      },
      p1: {
        x: ev(anim.end.x),
        y: ev(anim.end.y),
        o: ev(anim.end.offsety),
        a: ev(anim.end.opacity),
        i: ev(anim.end.interval),
      },
    },
  };
};

const frameAt = (s: SheepState, i: number): number => {
  const n = s.frames.length;
  return i < n ? s.frames[i] : s.frames[s.repeatFrom + ((i - n) % (n - s.repeatFrom))];
};

/** Create a sheep from a weighted pack spawn (or the top-centre of the primary display). */
export const spawn = (cp: CompiledPack, world: World, cfg: Config, seed: number): Update => {
  const area = world.areas[0];
  const [r, seed1] = nextRandom(seed);
  const spawns = cp.pack.spawns;
  const total = spawns.reduce((sum, sp) => sum + sp.p, 0);
  const pick =
    spawns.reduce<{ left: number; chosen?: PackSpawn }>(
      (acc, sp) =>
        acc.chosen || acc.left - sp.p >= 0
          ? { ...acc, left: acc.left - sp.p }
          : { left: acc.left, chosen: sp },
      { left: r * total },
    ).chosen ?? spawns[0];
  const blank = placeholder(cp.pack.animations[0], area.x, area.y, seed1);
  if (!pick) return begin(cp, { ...blank, x: area.x + area.width / 2 }, 1, world, cfg);
  const { vars, rng } = varsFor(blank, world, cfg, false);
  return begin(
    cp,
    { ...blank, x: area.x + evalExpr(pick.x, vars), y: area.y + evalExpr(pick.y, vars), rng },
    pick.next,
    world,
    cfg,
  );
};

const flagsOf = (s: SheepState, world: World, cfg: Config): Flags => {
  const feet = s.y + cfg.size;
  return {
    // Before it has entered, a sheep at floor height counts as standing on the floor even while
    // still beside the display (spawning in from the side), so gravity doesn't drop it.
    taskbar: world.areas.some(
      (a) =>
        Math.abs(feet - (a.y + a.height)) <= TOL && (!s.entered || overlapsX(cfg.size, s.x, a)),
    ),
    window: world.windows.some((w) => Math.abs(feet - w.y) <= TOL && overlapsX(cfg.size, s.x, w)),
    vertical:
      s.entered &&
      (!onScreenLower(world.areas, cfg.size, s.x - TOL, s.y) ||
        !onScreenLower(world.areas, cfg.size, s.x + TOL, s.y)),
    top: s.entered && !onScreen(world.areas, cfg.size, s.x, s.y - TOL),
    windowSide: world.windows.some(
      (w) =>
        feet > w.y + TOL * 2 &&
        s.y < w.y + w.height &&
        (Math.abs(s.x + cfg.size - w.x) <= TOL || Math.abs(s.x - (w.x + w.width)) <= TOL),
    ),
  };
};

const allowed = (only: string, f: Flags): boolean => {
  switch (only) {
    case 'none':
      return true;
    case 'taskbar':
      return f.taskbar;
    case 'window':
      return f.window;
    case 'vertical':
    case 'vertical+':
      return f.vertical;
    case 'horizontal+':
      return f.top;
    case 'windowSide':
      return f.windowSide;
    default:
      return false; // petSide etc.: there are no other pets
  }
};

/** Weighted random pick among transitions whose `only` context currently holds. */
const choose = (
  list: readonly NextRef[],
  f: Flags,
  rng: number,
): { id: number | null; rng: number } => {
  const eligible = list.filter((n) => n.p > 0 && allowed(n.only, f));
  const total = eligible.reduce((sum, n) => sum + n.p, 0);
  if (total === 0) return { id: null, rng };
  const [r, next] = nextRandom(rng);
  const hit = eligible.reduce<{ left: number; id?: number }>(
    (acc, n) =>
      acc.id !== undefined || acc.left - n.p >= 0
        ? { ...acc, left: acc.left - n.p }
        : { left: acc.left, id: n.id },
    { left: r * total },
  );
  return { id: hit.id ?? eligible[0].id, rng: next };
};

/** Move by (dx, dy); stop at screen edges / window walls, land on floors. `hit` reports contact. */
const move = (
  s: SheepState,
  dx: number,
  dy: number,
  world: World,
  cfg: Config,
): { state: SheepState; hit: boolean } => {
  const S = cfg.size;
  const afterX = ((): { x: number; hit: boolean } => {
    if (!dx) return { x: s.x, hit: false };
    const nx = s.x + dx;
    const wall = world.windows.find(
      (w) => nx + S > w.x && nx < w.x + w.width && s.y + S > w.y + TOL * 2 && s.y < w.y + w.height,
    );
    if (wall) return { x: dx > 0 ? wall.x - S : wall.x + wall.width, hit: true };
    if (s.entered && !onScreenLower(world.areas, S, nx, s.y)) {
      return { x: farthestValid(s.x, nx, (v) => onScreenLower(world.areas, S, v, s.y)), hit: true };
    }
    return { x: nx, hit: false };
  })();

  const afterY = ((): { y: number; hit: boolean } => {
    if (!dy) return { y: s.y, hit: false };
    const ny = s.y + dy;
    if (dy > 0) {
      const feet = s.y + S;
      const floors = [
        ...world.windows.filter((w) => overlapsX(S, afterX.x, w)).map((w) => w.y),
        ...world.areas.filter((a) => overlapsX(S, afterX.x, a)).map((a) => a.y + a.height),
      ].filter((fy) => feet <= fy + TOL && ny + S >= fy);
      return floors.length > 0 ? { y: Math.min(...floors) - S, hit: true } : { y: ny, hit: false };
    }
    if (s.entered && !onScreen(world.areas, S, afterX.x, ny)) {
      return { y: farthestValid(s.y, ny, (v) => onScreen(world.areas, S, afterX.x, v)), hit: true };
    }
    return { y: ny, hit: false };
  })();

  // "Entered" = lower body fully on a display (a spawn may start off to the side or above).
  const entered = s.entered || onScreenLower(world.areas, S, afterX.x, afterY.y);
  return { state: { ...s, x: afterX.x, y: afterY.y, entered }, hit: afterX.hit || afterY.hit };
};

/** Cycle the current animation's frames in place (used while held or thrown). */
const loopFrames = (s: SheepState, cfg: Config, dtMs: number): SheepState => {
  const interval = Math.max(15, s.p0.i);
  const acc = s.acc + dtMs;
  const steps = Math.floor(acc / interval);
  const step = s.step + steps;
  return {
    ...s,
    acc: acc - steps * interval,
    step,
    frame: s.frames[step % s.frames.length],
    offsetY: s.p0.o * cfg.scale,
    opacity: s.p0.a,
  };
};

const findId = (cp: CompiledPack, names: readonly string[], fallback: number): number =>
  names.map((n) => cp.byName.get(n)).find((a) => a !== undefined)?.id ?? fallback;

const landingId = (cp: CompiledPack, impact: number): number =>
  impact > HARD_LANDING
    ? findId(cp, ['fall hard', 'land', 'fall soft'], 1)
    : findId(cp, ['fall soft', 'land', 'fall hard'], 1);

const updateThrown = (
  cp: CompiledPack,
  s: SheepState,
  mode: Extract<Mode, { kind: 'thrown' }>,
  world: World,
  cfg: Config,
  dtMs: number,
): Update => {
  const r = stepBallistic(
    { x: s.x, y: s.y, vx: mode.vx, vy: mode.vy },
    world,
    { size: cfg.size, gravity: GRAVITY, restitution: RESTITUTION },
    dtMs / 1000,
  );
  const ageMs = mode.ageMs + dtMs;
  const moved: SheepState = {
    ...s,
    x: r.body.x,
    y: r.body.y,
    flipped: Math.abs(r.body.vx) > 50 ? r.body.vx > 0 : s.flipped,
    mode: {
      kind: 'thrown',
      vx: r.body.vx,
      vy: r.body.vy,
      ageMs,
      impact: Math.max(mode.impact, r.impact),
    },
  };
  if (r.landed || ageMs > MAX_THROWN_MS) {
    return begin(
      cp,
      { ...moved, mode: { kind: 'walk' } },
      landingId(cp, Math.max(mode.impact, r.impact)),
      world,
      cfg,
    );
  }
  return { state: loopFrames(moved, cfg, dtMs), started: [] };
};

/** Pick the sheep up: plays the pack's `drag` animation and pins it to the pointer. */
export const grab = (
  cp: CompiledPack,
  s: SheepState,
  world: World,
  cfg: Config,
  x: number,
  y: number,
): Update => {
  const id = findId(cp, ['drag'], s.anim.id);
  const began = begin(cp, { ...s, x, y, entered: true }, id, world, cfg);
  return { ...began, state: { ...began.state, mode: { kind: 'held' } } };
};

/** Follow the pointer while held. */
export const moveHeld = (s: SheepState, x: number, y: number): SheepState => ({ ...s, x, y });

/** Let go: a flick throws the sheep, a gentle release just drops it. */
export const release = (
  cp: CompiledPack,
  s: SheepState,
  world: World,
  cfg: Config,
  vx: number,
  vy: number,
): Update => {
  const thrown = Math.hypot(vx, vy) >= MIN_TOSS_SPEED;
  const id = thrown ? findId(cp, ['toss', 'fall'], 1) : findId(cp, ['fall'], 1);
  const began = begin(cp, s, id, world, cfg);
  return {
    ...began,
    state: {
      ...began.state,
      mode: thrown ? { kind: 'thrown', vx, vy, ageMs: 0, impact: 0 } : { kind: 'walk' },
    },
  };
};

/** Advance simulated time by `dtMs`. */
export const update = (
  cp: CompiledPack,
  state: SheepState,
  world: World,
  cfg: Config,
  dtMs: number,
): Update => {
  if (state.mode.kind === 'held') return { state: loopFrames(state, cfg, dtMs), started: [] };
  if (state.mode.kind === 'thrown') return updateThrown(cp, state, state.mode, world, cfg, dtMs);

  let s: SheepState = { ...state, acc: state.acc + dtMs };
  let started: readonly string[] = [];
  const restart = (id: number | null, fallback: number): void => {
    const u = begin(cp, s, id ?? fallback, world, cfg);
    s = u.state;
    started = [...started, ...u.started];
  };

  for (let guard = 0; guard < MAX_STEPS_PER_UPDATE; guard++) {
    const t = s.total > 1 ? s.step / (s.total - 1) : 0;
    const interval = Math.max(15, lerp(s.p0.i, s.p1.i, t));
    if (s.acc < interval) break;

    const dir = s.flipped ? -1 : 1;
    const moved = move(
      {
        ...s,
        acc: s.acc - interval,
        frame: frameAt(s, s.step),
        offsetY: lerp(s.p0.o, s.p1.o, t) * cfg.scale,
        opacity: lerp(s.p0.a, s.p1.a, t),
      },
      lerp(s.p0.x, s.p1.x, t) * cfg.scale * dir,
      lerp(s.p0.y, s.p1.y, t) * cfg.scale,
      world,
      cfg,
    );
    s = moved.state;

    const flags = flagsOf(s, world, cfg);
    if (moved.hit) {
      const c = choose(s.anim.border, flags, s.rng);
      s = { ...s, rng: c.rng };
      if (c.id !== null) {
        restart(c.id, 1);
        continue;
      }
    }
    if (s.anim.gravity.length > 0 && !flags.taskbar && !flags.window) {
      const c = choose(s.anim.gravity, flags, s.rng);
      s = { ...s, rng: c.rng };
      if (c.id !== null) {
        restart(c.id, 1);
        continue;
      }
    }
    s = { ...s, step: s.step + 1 };
    if (s.step >= s.total) {
      const c = choose(s.anim.next, flags, s.rng);
      s = { ...s, flipped: s.anim.action === 'flip' ? !s.flipped : s.flipped, rng: c.rng };
      restart(c.id, 1);
    }
  }
  return { state: s, started };
};

export const isHeld = (s: SheepState): boolean => s.mode.kind === 'held';
export const isThrown = (s: SheepState): boolean => s.mode.kind === 'thrown';
export const sheepRect = (s: SheepState, cfg: Config): Rect => ({
  x: s.x,
  y: s.y,
  width: cfg.size,
  height: cfg.size,
});
