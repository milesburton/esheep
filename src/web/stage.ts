import {
  BASE_SPEED,
  bounceGrab,
  bounceMoveHeld,
  bounceRelease,
  bounceStart,
  bounceUpdate,
  type BounceState,
} from '../core/bounce.js';
import {
  compilePack,
  grab,
  moveHeld,
  play,
  release,
  sheepRect,
  spawn,
  update,
  type CompiledPack,
  type Config,
  type Kick,
  type SheepState,
} from '../core/engine.js';
import { WINDOW_PAD } from '../core/geometry.js';
import type { TagView } from '../core/tag.js';
import { moveDrag, releaseVelocity, startDrag, type Drag, type Point } from '../core/pointer.js';

/** Size of the transparent window / canvas the sheep is drawn into. */
/** The bounce sheep's window is a fixed square. */
export const WINDOW = 128;
/** Transparent margin around a classic sprite, so tossed pixels are never clipped at the edge. */
export const PAD = WINDOW_PAD;
/** Classic packs: on-screen px per source px. */
/** Default sprite size multiplier: native pixels (the classic art is 40 px). */
export const SCALE = 1;
export const MAX_SCALE = 4;

export interface StageOptions {
  readonly pack: Pack;
  /** Classic packs: the decoded sprite sheet. Bounce: the 8-frame strip. */
  readonly sheet: CanvasImageSource;
  readonly sheetSize: { readonly width: number; readonly height: number };
  readonly ctx: CanvasRenderingContext2D;
  readonly seed: number;
  readonly getWorld: () => World;
  readonly getPrefs: () => { speed: number; sound: boolean };
  /** Move the host window / element so the canvas origin is at (x, y) in screen px. */
  readonly place: (x: number, y: number) => void;
  readonly onSound?: () => void;
  /** Classic sprites are drawn this many times their native size (whole numbers look crispest). */
  readonly scale?: number;
  /** Device pixels per CSS pixel: the canvas is rendered at this resolution so it stays crisp. */
  readonly pixelRatio?: number;
  /** Tag, if it is being played: this sheep's role and who to chase or flee. */
  readonly getTag?: () => TagView | null;
  /** Soccer, if it is being played: the side this sheep attacks. */
  readonly getTeam?: () => { dir: 1 | -1 } | null;
  /** The kick-about ball's rectangle, if there is one: sheep chase it. */
  readonly getBall?: () => Rect | null;
  /** A sheep kicked the ball: the velocity it should take. */
  readonly onKick?: (kick: Kick) => void;
  /** Sprite rectangles of the other sheep, so this one can leap over them. */
  readonly getOthers?: () => readonly Rect[];
}

export interface Snapshot {
  readonly x: number;
  readonly y: number;
  readonly animation: string;
  readonly mode: 'walk' | 'held' | 'thrown';
  readonly frame: number;
}

export interface Stage {
  /** The display's device pixel ratio changed (e.g. the window moved to another monitor). */
  setPixelRatio(ratio: number): void;
  /** Side of the square window the sheep draws into (sprite plus a small margin). */
  windowSize(): number;
  /** The transparent margin around the sprite inside that window (0 for the bounce sheep). */
  padding(): number;
  /** Advance by `dtMs` of (unscaled) wall time, redraw and reposition. */
  tick(dtMs: number): void;
  /** True if the canvas pixel at (x, y) is part of the sheep (used for click-through). */
  hit(x: number, y: number): boolean;
  down(pointer: Point, t: number): void;
  move(pointer: Point, t: number): void;
  up(t: number): void;
  dragging(): boolean;
  setPaused(paused: boolean): void;
  snapshot(): Snapshot;
  /** Classic packs: switch straight to the named animation. Returns false if it is unknown. */
  play(name: string): boolean;
  /** The sprite's rectangle in screen px (classic packs), or null for the bounce sheep. */
  rect(): Rect | null;
  /** Names of the animations a classic pack can play (empty for the bounce sheep). */
  animations(): string[];
}

/** The two behaviours share this shape so pointer handling is written once. */
interface Brain {
  pos(): Point;
  step(
    dtMs: number,
    world: World,
    prefs: { speed: number; sound: boolean },
    onKick: (k: Kick) => void,
  ): boolean; // true => play sound
  grab(p: Point, world: World): void;
  moveHeld(p: Point): void;
  release(v: { vx: number; vy: number }, world: World): void;
  draw(ctx: CanvasRenderingContext2D): void;
  snapshot(): Snapshot;
  rect?(): Rect;
  play?(name: string, world: World): void;
  animations?(): string[];
  readonly pad: number;
  /** Side of the square window / canvas this sheep draws into. */
  readonly win: number;
}

const classicBrain = (o: StageOptions, pack: ClassicPack): Brain => {
  const cp: CompiledPack = compilePack(pack);
  const tw = o.sheetSize.width / pack.tilesX;
  const th = o.sheetSize.height / pack.tilesY;
  const scale = Math.min(MAX_SCALE, Math.max(1, o.scale ?? SCALE));
  const cfg: Config = { size: Math.round(tw * scale), scale };
  const pad = PAD;
  const win = cfg.size + 2 * PAD;
  const first = spawn(cp, o.getWorld(), cfg, o.seed);
  let s: SheepState = first.state;

  return {
    pad,
    win,
    pos: () => ({ x: s.x, y: s.y }),
    step: (dtMs, world, prefs, onKick) => {
      const others = o.getOthers?.() ?? [];
      const ball = o.getBall?.() ?? undefined;
      const tag = o.getTag?.() ?? undefined;
      const team = o.getTeam?.() ?? undefined;
      const u = update(cp, s, { ...world, others, ball, tag, team }, cfg, dtMs * prefs.speed);
      s = u.state;
      u.kicks?.forEach(onKick);
      return prefs.sound && u.started.some((n) => n.startsWith('boing'));
    },
    grab: (p, world) => {
      s = grab(cp, s, world, cfg, p.x, p.y).state;
    },
    moveHeld: (p) => {
      s = moveHeld(s, p.x, p.y);
    },
    release: (v, world) => {
      s = release(cp, s, world, cfg, v.vx, v.vy).state;
    },
    draw: (ctx) => {
      ctx.clearRect(0, 0, win, win);
      ctx.save();
      ctx.globalAlpha = s.opacity;
      if (s.flipped) {
        ctx.translate(win, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        o.sheet,
        (s.frame % pack.tilesX) * tw,
        Math.floor(s.frame / pack.tilesX) * th,
        tw,
        th,
        pad,
        pad + s.offsetY,
        cfg.size,
        cfg.size,
      );
      ctx.restore();
    },
    rect: () => sheepRect(s, cfg),
    play: (name, world) => {
      s = play(cp, s, name, world, cfg).state;
    },
    animations: () => cp.pack.animations.map((a) => a.name),
    snapshot: () => ({ x: s.x, y: s.y, animation: s.animName, mode: s.mode.kind, frame: s.frame }),
  };
};

const bounceBrain = (o: StageOptions): Brain => {
  const home = o.getWorld().areas[0];
  let s: BounceState = bounceStart(home.x + home.width / 2, home.y + home.height / 2);
  const mode = (): Snapshot['mode'] =>
    s.held ? 'held' : s.speed > BASE_SPEED * 1.5 ? 'thrown' : 'walk';

  return {
    pad: 0,
    win: WINDOW,
    pos: () => ({ x: s.x, y: s.y }),
    step: (dtMs, world, prefs) => {
      const r = bounceUpdate(s, world, WINDOW, prefs.speed, Math.min(dtMs, 50) / 1000);
      s = r.state;
      return prefs.sound && r.bounced;
    },
    grab: (p) => {
      s = bounceGrab(s, p.x, p.y);
    },
    moveHeld: (p) => {
      s = bounceMoveHeld(s, p.x, p.y);
    },
    release: (v) => {
      s = bounceRelease(s, v.vx, v.vy);
    },
    draw: (ctx) => {
      ctx.clearRect(0, 0, WINDOW, WINDOW);
      ctx.save();
      if (s.dx < 0) {
        ctx.translate(WINDOW, 0);
        ctx.scale(-1, 1);
      } // sprite faces right
      ctx.drawImage(o.sheet, s.frame * 64, 0, 64, 64, 0, 0, WINDOW, WINDOW);
      ctx.restore();
    },
    snapshot: () => ({ x: s.x, y: s.y, animation: 'bounce', mode: mode(), frame: s.frame }),
  };
};

/**
 * Imperative shell around the pure core: owns the current state, converts pointer events into
 * grab / drag / throw, and draws. Shared by the Electron app and the GitHub Pages demo.
 */
export const createStage = (o: StageOptions): Stage => {
  const brain = o.pack.kind === 'classic' ? classicBrain(o, o.pack) : bounceBrain(o);
  let paused = false;
  let drag: Drag | null = null;

  const place = (): void => {
    const p = brain.pos();
    o.place(Math.round(p.x - brain.pad), Math.round(p.y - brain.pad));
  };
  // The canvas is rendered at device resolution (CSS size stays the window size) so pixel art is
  // crisp on high-DPI displays; everything is drawn in CSS px under a scale transform.
  const canvas = o.ctx.canvas as HTMLCanvasElement | undefined;
  let ratio = Math.max(1, o.pixelRatio ?? 1);
  const sizeCanvas = (): void => {
    if (!canvas) return;
    canvas.width = Math.round(brain.win * ratio); // resizing resets the context, hence the redraw
    canvas.height = Math.round(brain.win * ratio);
    o.ctx.imageSmoothingEnabled = false;
  };
  const paint = (): void => {
    o.ctx.setTransform?.(ratio, 0, 0, ratio, 0, 0);
    brain.draw(o.ctx);
  };
  sizeCanvas();
  paint();
  place();

  return {
    windowSize: () => brain.win,
    padding: () => brain.pad,
    tick: (dtMs) => {
      if (paused) return;
      if (brain.step(dtMs, o.getWorld(), o.getPrefs(), (k) => o.onKick?.(k))) o.onSound?.();
      paint();
      place();
    },
    hit: (x, y) =>
      o.ctx.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data[3] > 16,
    setPixelRatio: (r) => {
      const next = Math.max(1, r);
      if (next === ratio) return;
      ratio = next;
      sizeCanvas();
      paint();
    },
    down: (pointer, t) => {
      if (paused) return;
      drag = startDrag(brain.pos(), pointer, t);
      brain.grab(brain.pos(), o.getWorld());
    },
    move: (pointer, t) => {
      if (!drag) return;
      const m = moveDrag(drag, pointer, t);
      drag = m.drag;
      brain.moveHeld(m.sprite);
      paint();
      place();
    },
    up: (t) => {
      if (!drag) return;
      const v = releaseVelocity(drag, t);
      drag = null;
      brain.release(v, o.getWorld());
    },
    dragging: () => drag !== null,
    setPaused: (p) => {
      paused = p;
    },
    play: (name) => {
      if (!brain.play || !brain.animations?.().includes(name)) return false;
      brain.play(name, o.getWorld());
      paint();
      place();
      return true;
    },
    rect: () => brain.rect?.() ?? null,
    animations: () => brain.animations?.() ?? [],
    snapshot: () => brain.snapshot(),
  };
};
