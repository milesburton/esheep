import { obstaclesFrom } from '../core/geometry.js';
import { beep } from '../web/sound.js';
import { loadClassicSheet, loadImage } from '../web/sprites.js';
import { createStage, type Snapshot, type Stage } from '../web/stage.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
/** `?manual=1` stops the animation loop so tests and screenshots can step time themselves. */
const manual = params.get('manual') === '1';
const seed = Number(params.get('seed') ?? Date.now()) >>> 0;

const canvas = $<HTMLCanvasElement>('sheep');
const desk = $('desk');

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

const buildMonitors = (dual: boolean): void => {
  desk.replaceChildren(
    ...Array.from({ length: dual ? 2 : 1 }, (_, i) => {
      const m = document.createElement('div');
      m.className = 'monitor';
      m.innerHTML = `<span class="tag">Display ${i + 1}</span>`;
      return m;
    }),
  );
};

const world = (): World => {
  const areas = Array.from(desk.children).map(rectOf);
  return {
    areas,
    windows: obstaclesFrom(
      Array.from(document.querySelectorAll('.win')).map((w, id) => ({
        id,
        title: 'w',
        bounds: rectOf(w),
      })),
      areas,
    ),
  };
};

/** One sheep: its own canvas and its own stage (state, drag, drawing). */
interface Sheep {
  readonly stage: Stage;
  readonly canvas: HTMLCanvasElement;
}
const MAX_SHEEP = 12;
const flock: Sheep[] = [];
/** The sheep the status line and the Animation picker follow: the one last added or grabbed. */
let focus: Sheep | null = null;
let wanted = 1;
let paused = false;
const prefs = { speed: 1, sound: false };

const loadPack = async (
  name: string,
): Promise<{ pack: Pack; sheet: CanvasImageSource; size: { width: number; height: number } }> => {
  if (name === 'bounce') {
    const img = await loadImage('assets/sheep.png');
    return {
      pack: { kind: 'bounce', name: 'bounce' },
      sheet: img,
      size: { width: img.width, height: img.height },
    };
  }
  const pack = (await (await fetch(`packs/${name}.json`)).json()) as ClassicPack;
  const sheet = await loadClassicSheet(pack);
  return { pack, sheet, size: { width: sheet.width, height: sheet.height } };
};

const LABELS: Record<string, string> = {
  rotate1a: 'turn round (A)',
  rotate1b: 'turn round (B)',
  pissa: 'wee (A)',
  pissb: 'wee (B)',
  sleep1a: 'fall asleep (1)',
  sleep1b: 'wake up (1)',
  sleep2a: 'lie down',
  sleep2b: 'get up',
  sleep3a: 'doze off',
  sleep3b: 'wake from doze',
  batha: 'bath: appears',
  bathb: 'bath: wash',
  vertical_walk_up: 'climb up',
  vertical_walk_down: 'climb down',
  top_walk: 'walk on the ceiling',
};
const label = (n: string): string => LABELS[n] ?? n.replace(/_/g, ' ');
const animSelect = $<HTMLSelectElement>('anim');
/** Lists the pack's animations so every one (turning, sleeping, bathing, ...) can be triggered. */
const fillAnimations = (names: readonly string[]): void => {
  animSelect.replaceChildren(new Option('Play…', ''), ...names.map((n) => new Option(label(n), n)));
  animSelect.disabled = names.length === 0;
};
animSelect.addEventListener('change', () => {
  if (animSelect.value) focus?.stage.play(animSelect.value);
  animSelect.value = '';
  refreshStatus();
});

interface Loaded {
  pack: Pack;
  sheet: CanvasImageSource;
  size: { width: number; height: number };
}
let loaded: Loaded | null = null;

const canvasFor = (index: number): HTMLCanvasElement => {
  if (index === 0) return canvas;
  const c = document.createElement('canvas');
  c.id = `sheep-${index + 1}`;
  c.className = 'sheep';
  c.width = 128;
  c.height = 128;
  document.body.append(c);
  return c;
};

const status = $('status');
const refreshStatus = (): void => {
  $('count').textContent = String(flock.length);
  const s: Snapshot | undefined = focus?.stage.snapshot();
  if (!s) return;
  status.textContent = `${s.animation} · ${s.mode}`;
  document.body.dataset.animation = s.animation;
  document.body.dataset.mode = s.mode;
};
const tickAll = (dt: number): void => {
  for (const s of flock) s.stage.tick(dt);
  refreshStatus();
};

const attachPointer = (sheep: Sheep): void => {
  sheep.canvas.addEventListener('pointerdown', (e) => {
    sheep.canvas.setPointerCapture(e.pointerId);
    focus = sheep;
    fillAnimations(sheep.stage.animations());
    sheep.stage.down({ x: e.clientX, y: e.clientY }, e.timeStamp);
    refreshStatus();
  });
  const end = (e: PointerEvent): void => {
    sheep.stage.up(e.timeStamp);
    refreshStatus();
  };
  sheep.canvas.addEventListener('pointerup', end);
  sheep.canvas.addEventListener('pointercancel', end);
};

const addSheep = (): void => {
  if (!loaded || flock.length >= MAX_SHEEP) return;
  const index = flock.length;
  const c = canvasFor(index);
  const cx = c.getContext('2d', { willReadFrequently: true });
  if (!cx) throw new Error('2D canvas unavailable');
  cx.imageSmoothingEnabled = false;
  const stage = createStage({
    pack: loaded.pack,
    sheet: loaded.sheet,
    sheetSize: loaded.size,
    ctx: cx,
    seed: (seed + index * 7919) >>> 0,
    getWorld: world,
    getPrefs: () => prefs,
    place: (x, y) => {
      c.style.transform = `translate(${x}px, ${y}px)`;
    },
    onSound: () => beep(),
  });
  stage.setPaused(paused);
  const sheep: Sheep = { stage, canvas: c };
  attachPointer(sheep);
  flock.push(sheep);
  focus = sheep;
  fillAnimations(stage.animations());
  stage.tick(0);
};

const removeSheep = (): void => {
  if (flock.length <= 1) return;
  const gone = flock.pop();
  gone?.canvas.remove();
  if (focus === gone) focus = flock[flock.length - 1] ?? null;
  refreshStatus();
};

/** Bumped on every start so a slow earlier load can't overwrite a newer choice. */
let generation = 0;

/** (Re)build the whole flock from the chosen pack, keeping the current number of sheep. */
const start = async (name: string): Promise<void> => {
  const mine = ++generation;
  const next = await loadPack(name);
  if (mine !== generation) return;
  loaded = next;
  while (flock.length > 0) {
    const gone = flock.pop();
    if (gone && gone.canvas !== canvas) gone.canvas.remove();
  }
  for (let i = 0; i < wanted; i++) addSheep();
  focus = flock[0] ?? null;
  if (focus) fillAnimations(focus.stage.animations());
  refreshStatus();
};

// Pointer: each canvas only captures events over its own sheep's pixels.
document.addEventListener('pointermove', (e) => {
  const dragging = flock.find((s) => s.stage.dragging());
  if (dragging) {
    dragging.stage.move({ x: e.clientX, y: e.clientY }, e.timeStamp);
    refreshStatus();
    return;
  }
  for (const s of flock) {
    const r = s.canvas.getBoundingClientRect();
    s.canvas.style.pointerEvents = s.stage.hit(e.clientX - r.left, e.clientY - r.top)
      ? 'auto'
      : 'none';
  }
});

// Draggable fake windows.
const placeWindow = (el: HTMLElement, x: number, y: number): void => {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
};
const initial = new Map<HTMLElement, { x: number; y: number }>();
document.querySelectorAll<HTMLElement>('.win').forEach((w) => {
  initial.set(w, { x: parseFloat(w.style.left), y: parseFloat(w.style.top) });
  const bar = w.querySelector<HTMLElement>('.bar');
  bar?.addEventListener('pointerdown', (e) => {
    bar.setPointerCapture(e.pointerId);
    const dx = e.clientX - w.offsetLeft;
    const dy = e.clientY - w.offsetTop;
    const move = (m: PointerEvent): void => placeWindow(w, m.clientX - dx, m.clientY - dy);
    const up = (): void => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
});

// Controls.
$<HTMLSelectElement>('pack').addEventListener(
  'change',
  (e) => void start((e.target as HTMLSelectElement).value),
);
$<HTMLInputElement>('speed').addEventListener('input', (e) => {
  prefs.speed = Number((e.target as HTMLInputElement).value);
});
$<HTMLInputElement>('dual').addEventListener('change', (e) => {
  buildMonitors((e.target as HTMLInputElement).checked);
  void start($<HTMLSelectElement>('pack').value);
});
$('pause').addEventListener('click', (e) => {
  paused = !paused;
  for (const s of flock) s.stage.setPaused(paused);
  (e.target as HTMLElement).textContent = paused ? 'Resume' : 'Pause';
});
$('add').addEventListener('click', () => {
  if (flock.length >= MAX_SHEEP) return;
  wanted = flock.length + 1;
  addSheep();
  refreshStatus();
});
$('remove').addEventListener('click', () => {
  removeSheep();
  wanted = flock.length;
});
$('reset').addEventListener('click', () => initial.forEach((p, w) => placeWindow(w, p.x, p.y)));

buildMonitors(false);
void start('woolly').then(() => {
  if (manual) return;
  let last = performance.now();
  const frame = (now: number): void => {
    tickAll(Math.min(now - last, 100));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

/** Test seam (also handy in the console): deterministic stepping and state inspection. */
Object.assign(window, {
  __demo: {
    step: (ms: number, frameMs = 16): void => {
      for (let t = 0; t < ms; t += frameMs) tickAll(Math.min(frameMs, ms - t));
    },
    /** The first sheep (the only one unless more were added). */
    snapshot: (): Snapshot | undefined => flock[0]?.stage.snapshot(),
    snapshots: (): Snapshot[] => flock.map((s) => s.stage.snapshot()),
    add: (): void => {
      wanted = Math.min(MAX_SHEEP, flock.length + 1);
      addSheep();
    },
    count: (): number => flock.length,
    ready: (): boolean => flock.length > 0,
  },
});
