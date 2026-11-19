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
  spawn,
  update,
  type CompiledPack,
  type Config,
  type SheepState,
} from '../core/engine.js';
import { moveDrag, releaseVelocity, startDrag, type Drag, type Point } from '../core/pointer.js';

/** Size of the transparent window / canvas the sheep is drawn into. */
export const WINDOW = 128;
/** Classic packs: on-screen px per source px. */
export const SCALE = 1; // native pixels: the classic art is 40 px and looks wrong blown up

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
}

export interface Snapshot {
  readonly x: number;
  readonly y: number;
  readonly animation: string;
  readonly mode: 'walk' | 'held' | 'thrown';
  readonly frame: number;
}

export interface Stage {
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
  /** Names of the animations a classic pack can play (empty for the bounce sheep). */
  animations(): string[];
}

/** The two behaviours share this shape so pointer handling is written once. */
interface Brain {
  pos(): Point;
  step(dtMs: number, world: World, prefs: { speed: number; sound: boolean }): boolean; // true => play sound
  grab(p: Point, world: World): void;
  moveHeld(p: Point): void;
  release(v: { vx: number; vy: number }, world: World): void;
  draw(ctx: CanvasRenderingContext2D): void;
  snapshot(): Snapshot;
  play?(name: string, world: World): void;
  animations?(): string[];
  readonly pad: number;
}

const classicBrain = (o: StageOptions, pack: ClassicPack): Brain => {
  const cp: CompiledPack = compilePack(pack);
  const tw = o.sheetSize.width / pack.tilesX;
  const th = o.sheetSize.height / pack.tilesY;
  const cfg: Config = { size: Math.round(tw * SCALE), scale: SCALE };
  const pad = (WINDOW - cfg.size) / 2;
  const first = spawn(cp, o.getWorld(), cfg, o.seed);
  let s: SheepState = first.state;

  return {
    pad,
    pos: () => ({ x: s.x, y: s.y }),
    step: (dtMs, world, prefs) => {
      const u = update(cp, s, world, cfg, dtMs * prefs.speed);
      s = u.state;
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
      ctx.clearRect(0, 0, WINDOW, WINDOW);
      ctx.save();
      ctx.globalAlpha = s.opacity;
      if (s.flipped) {
        ctx.translate(WINDOW, 0);
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
  brain.draw(o.ctx);
  place();

  return {
    tick: (dtMs) => {
      if (paused) return;
      if (brain.step(dtMs, o.getWorld(), o.getPrefs())) o.onSound?.();
      brain.draw(o.ctx);
      place();
    },
    hit: (x, y) => o.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 16,
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
      brain.draw(o.ctx);
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
      brain.draw(o.ctx);
      place();
      return true;
    },
    animations: () => brain.animations?.() ?? [],
    snapshot: () => brain.snapshot(),
  };
};
