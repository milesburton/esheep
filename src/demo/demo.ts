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
const ctx = canvas.getContext('2d', { willReadFrequently: true });
if (!ctx) throw new Error('2D canvas unavailable');
ctx.imageSmoothingEnabled = false;

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

let stage: Stage | null = null;
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
  if (animSelect.value) stage?.play(animSelect.value);
  animSelect.value = '';
  refreshStatus();
});

/** Bumped on every start so a slow earlier load can't overwrite a newer choice. */
let generation = 0;

const start = async (name: string): Promise<void> => {
  const mine = ++generation;
  const { pack, sheet, size } = await loadPack(name);
  if (mine !== generation) return;
  stage = createStage({
    pack,
    sheet,
    sheetSize: size,
    ctx,
    seed,
    getWorld: world,
    getPrefs: () => prefs,
    place: (x, y) => {
      canvas.style.transform = `translate(${x}px, ${y}px)`;
    },
    onSound: () => beep(),
  });
  stage.setPaused(paused);
  fillAnimations(stage.animations());
  tickOnce(0);
};

const status = $('status');
const refreshStatus = (): void => {
  const s: Snapshot | undefined = stage?.snapshot();
  if (!s) return;
  status.textContent = `${s.animation} · ${s.mode}`;
  document.body.dataset.animation = s.animation;
  document.body.dataset.mode = s.mode;
};
const tickOnce = (dt: number): void => {
  stage?.tick(dt);
  refreshStatus();
};

// Pointer: the canvas only captures events over the sheep's own pixels.
document.addEventListener('pointermove', (e) => {
  if (!stage) return;
  if (stage.dragging()) {
    stage.move({ x: e.clientX, y: e.clientY }, e.timeStamp);
    refreshStatus();
    return;
  }
  const r = canvas.getBoundingClientRect();
  canvas.style.pointerEvents = stage.hit(e.clientX - r.left, e.clientY - r.top) ? 'auto' : 'none';
});
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  stage?.down({ x: e.clientX, y: e.clientY }, e.timeStamp);
  refreshStatus();
});
const end = (e: PointerEvent): void => {
  stage?.up(e.timeStamp);
  refreshStatus();
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);

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
  stage?.setPaused(paused);
  (e.target as HTMLElement).textContent = paused ? 'Resume' : 'Pause';
});
$('reset').addEventListener('click', () => initial.forEach((p, w) => placeWindow(w, p.x, p.y)));

buildMonitors(false);
void start('woolly').then(() => {
  if (manual) return;
  let last = performance.now();
  const frame = (now: number): void => {
    tickOnce(Math.min(now - last, 100));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

/** Test seam (also handy in the console): deterministic stepping and state inspection. */
Object.assign(window, {
  __demo: {
    step: (ms: number, frameMs = 16): void => {
      for (let t = 0; t < ms; t += frameMs) tickOnce(Math.min(frameMs, ms - t));
    },
    snapshot: (): Snapshot | undefined => stage?.snapshot(),
    ready: (): boolean => stage !== null,
  },
});
