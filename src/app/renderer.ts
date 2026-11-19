import { obstaclesFrom } from '../core/geometry.js';
import { beep } from '../web/sound.js';
import { loadClassicSheet, loadImage } from '../web/sprites.js';
import { createStage, type Stage } from '../web/stage.js';

const POLL_MS = 250;

const run = async (): Promise<void> => {
  const api = window.electronAPI;
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;

  // Subscribe before any await: a Pause from the tray can arrive while we are still loading.
  const live: { paused: boolean; stage: Stage | null } = { paused: false, stage: null };
  const setPaused = (p: boolean): void => {
    live.paused = p;
    live.stage?.setPaused(p);
  };
  api.onPause(() => setPaused(true));
  api.onResume(() => setPaused(false));
  // A Pause sent before this page finished loading would have been dropped, so ask for the state.
  live.paused = await api.isPaused();
  let prefs = await api.loadPrefs();
  const pack = await api.loadPack();
  let areas = await api.getWorkAreas();
  let windows: Rect[] = [];
  /** Other sheep windows (their sprites sit centred in them), refreshed often so leaps look right. */
  let others: Rect[] = [];

  const sheet =
    pack.kind === 'classic'
      ? await loadClassicSheet(pack)
      : await loadImage('../../../assets/sheep.png');
  const sheetSize = {
    width: 'width' in sheet ? sheet.width : 0,
    height: 'height' in sheet ? sheet.height : 0,
  };

  const created = createStage({
    pack,
    sheet,
    sheetSize,
    ctx,
    // Several sheep start in the same millisecond, so mix in real randomness.
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    getWorld: () => ({ areas, windows }),
    scale: prefs.scale,
    pixelRatio: window.devicePixelRatio,
    getPrefs: () => prefs,
    getOthers: () => others,
    place: (x, y) => api.moveWindow(x, y),
    onSound: beep,
  });

  api.onPrefsChanged((p) => {
    prefs = p;
  });
  api.setWindowSize(created.windowSize());
  created.setPaused(live.paused);
  live.stage = created;

  setInterval(async () => {
    areas = await api.getWorkAreas();
    windows = obstaclesFrom(await api.getWindows(), areas);
  }, POLL_MS);

  const OTHERS_MS = 50;
  setInterval(async () => {
    const mine = live.stage?.rect();
    if (!mine) return;
    others = (await api.getOtherSheep()).map((b) => ({
      x: b.x + (b.width - mine.width) / 2,
      y: b.y + (b.height - mine.height) / 2,
      width: mine.width,
      height: mine.height,
    }));
  }, OTHERS_MS);

  // Click-through everywhere except on the sheep's own pixels (mouse moves are forwarded to us).
  let clickThrough = true;
  const setClickThrough = (v: boolean): void => {
    if (v !== clickThrough) {
      clickThrough = v;
      api.setClickThrough(v);
    }
  };
  window.addEventListener('pointermove', (e) => {
    if (created.dragging()) {
      created.move({ x: e.screenX, y: e.screenY }, e.timeStamp);
    } else {
      setClickThrough(!created.hit(e.clientX, e.clientY));
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (clickThrough || !created.hit(e.clientX, e.clientY)) return;
    canvas.setPointerCapture(e.pointerId);
    created.down({ x: e.screenX, y: e.screenY }, e.timeStamp);
  });
  const end = (e: PointerEvent): void => {
    if (!created.dragging()) return;
    created.up(e.timeStamp);
    setClickThrough(!created.hit(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  let last = performance.now();
  const frame = (now: number): void => {
    created.setPixelRatio(window.devicePixelRatio); // follows the window between mixed-DPI displays
    created.tick(Math.min(now - last, 100));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

void run();
