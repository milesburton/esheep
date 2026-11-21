import {
  REST_RESET_MS,
  ballRect,
  dropSpot,
  kickBall,
  restTime,
  stepBall,
  type Ball,
} from '../core/ball.js';
import { clampIntoAreas, obstaclesFrom } from '../core/geometry.js';
import {
  attackDir,
  formatScore,
  goalsFor,
  kickoffSpot,
  startMatch,
  stepMatch,
  teamOf,
  type Match,
} from '../core/soccer.js';
import { startTag, stepTag, viewFor, type Sprite, type TagGame } from '../core/tag.js';
import { moveDrag, releaseVelocity, startDrag, type Drag } from '../core/pointer.js';
import { beep } from '../web/sound.js';
import { loadClassicSheet, loadImage } from '../web/sprites.js';
import { createStage, type Snapshot, type Stage } from '../web/stage.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
/** `?manual=1` stops the animation loop so tests and screenshots can step time themselves. */
const manual = params.get('manual') === '1';
const seed = Number(params.get('seed') ?? Date.now()) >>> 0;
/** `?pack=woolly` picks the generated sheep; the original eSheep art is the default. */
const wantedPack = params.get('pack');

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
  readonly id: number;
  readonly stage: Stage;
  readonly canvas: HTMLCanvasElement;
}
const MAX_SHEEP = 12;
let nextSheepId = 1;
const flock: Sheep[] = [];
/** The sheep the status line and the Animation picker follow: the one last added or grabbed. */
let focus: Sheep | null = null;
let wanted = 1;
let paused = false;
const prefs = { speed: 1, sound: false };
let scale = Math.min(4, Math.max(1, Number(params.get('scale')) || 1));

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
// ---- the kick-about ball ----------------------------------------------------------------------
const BALL_BASE = 14;
let ball: Ball | null = null;
let ballEl: HTMLElement | null = null;
let ballDrag: Drag | null = null;
let kicks = 0;
let restMs = 0; // how long the ball has been lying still
let ballResets = 0;
const ballSize = (): number => Math.round(BALL_BASE * scale);
const currentBall = (): Rect | null => (ball ? ballRect(ball, ballSize()) : null);

const drawBall = (): void => {
  if (!ball || !ballEl) return;
  const size = ballSize();
  ballEl.style.width = `${size}px`;
  ballEl.style.height = `${size}px`;
  ballEl.style.transform = `translate(${ball.x}px, ${ball.y}px)`;
};

const startKickAbout = (): void => {
  if (ball) return;
  const w = world();
  const spot = dropSpot(w.areas, w.windows, ballSize());
  ball = { x: spot.x, y: spot.y, vx: 140, vy: 0 };
  restMs = 0;
  ballResets = 0;
  ballEl = document.createElement('div');
  ballEl.className = 'ball';
  ballEl.id = 'ball';
  ballEl.addEventListener('pointerdown', (e) => {
    if (!ball) return;
    ballEl?.setPointerCapture(e.pointerId);
    ballDrag = startDrag(ball, { x: e.clientX, y: e.clientY }, e.timeStamp);
  });
  const release = (e: PointerEvent): void => {
    if (!ballDrag || !ball) return;
    ball = { ...ball, ...releaseVelocity(ballDrag, e.timeStamp) };
    ballDrag = null;
  };
  ballEl.addEventListener('pointerup', release);
  ballEl.addEventListener('pointercancel', release);
  document.body.append(ballEl);
  drawBall();
  $('kickabout').textContent = 'Stop kick-about';
  $('kickabout').setAttribute('aria-pressed', 'true');
};

const stopKickAbout = (): void => {
  ball = null;
  ballDrag = null;
  ballEl?.remove();
  ballEl = null;
  $('kickabout').textContent = 'Kick-about';
  $('kickabout').setAttribute('aria-pressed', 'false');
};

const stepBallFrame = (dt: number): void => {
  if (!ball || paused || ballDrag) return;
  const w = world();
  ball = stepBall(ball, w, ballSize(), (Math.min(dt, 50) * prefs.speed) / 1000);
  restMs = restTime(restMs, ball, dt);
  if (restMs >= REST_RESET_MS) {
    // Lying still this long means nobody can get at it (on a window top, say): drop it in again over
    // open floor.
    const spot = dropSpot(w.areas, w.windows, ballSize());
    ball = { x: spot.x, y: spot.y, vx: 0, vy: 0 };
    restMs = 0;
    ballResets += 1;
  }
};

// ---- soccer: two teams, a goal at each end, first to WIN_SCORE -------------------------------------
let match: Match | null = null;
let matchOwnsBall = false;
let matchEndAt: number | null = null;
let goalEls: { left: HTMLElement; right: HTMLElement } | null = null;
let scoreEl: HTMLElement | null = null;
/** The final score stays up this long (simulated ms) after the winning goal. */
const FINISH_SHOW_MS = 8000;

const teamViewFor = (stage: Stage): { dir: 1 | -1 } | null => {
  const sheep = flock.find((s) => s.stage === stage);
  const team =
    match && sheep
      ? teamOf(
          sheep.id,
          flock.map((s) => s.id),
        )
      : null;
  return team ? { dir: attackDir(team) } : null;
};

const drawMatch = (): void => {
  const ids = flock.map((s) => s.id);
  for (const s of flock) {
    const team = match ? teamOf(s.id, ids) : null;
    s.canvas.classList.toggle('team-red', team === 'red');
    s.canvas.classList.toggle('team-blue', team === 'blue');
  }
  if (!match || !goalEls || !scoreEl) return;
  const areas = world().areas;
  scoreEl.style.top = `${(areas[0]?.y ?? 0) + 8}px`; // inside the first display, clear of the toolbar
  const goals = goalsFor(areas, ballSize());
  if (goals) {
    for (const [el, g] of [
      [goalEls.left, goals.left],
      [goalEls.right, goals.right],
    ] as const) {
      el.style.width = `${g.width}px`;
      el.style.height = `${g.height}px`;
      el.style.transform = `translate(${g.x}px, ${g.y}px)`;
    }
  }
  const note = match.winner
    ? `${match.winner.toUpperCase()} WINS`
    : clock < match.restartUntil
      ? 'Kick-off…'
      : '';
  scoreEl.innerHTML = `${formatScore(match)}${note ? `<small>${note}</small>` : ''}`;
};

const kickoff = (): void => {
  const w = world();
  const spot = kickoffSpot(w.areas, ballSize(), w.windows);
  if (ball) ball = { x: spot.x, y: spot.y, vx: 0, vy: 0 };
  restMs = 0;
};

const stepMatchFrame = (): void => {
  if (!match || paused) return;
  if (matchEndAt !== null) {
    if (clock >= matchEndAt) stopMatch();
    return;
  }
  const r = stepMatch(match, currentBall(), goalsFor(world().areas, ballSize()), clock);
  match = r.match;
  if (r.scored) {
    if (match.winner) matchEndAt = clock + FINISH_SHOW_MS;
    else kickoff();
  }
  drawMatch();
};

const startMatchGame = (): void => {
  if (match || loaded?.pack.kind === 'bounce') return; // the bounce sheep cannot play
  stopTagGame();
  while (flock.length < 4 && flock.length < MAX_SHEEP) addSheep(); // two a side
  wanted = flock.length;
  matchOwnsBall = ball === null; // a ball you already had out stays yours when the match ends
  startKickAbout();
  match = startMatch(clock);
  matchEndAt = null;
  kickoff();
  const mk = (side: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = `goal ${side}`;
    document.body.append(el);
    return el;
  };
  goalEls = { left: mk('red'), right: mk('blue') };
  scoreEl = document.createElement('div');
  scoreEl.id = 'scoreboard';
  scoreEl.setAttribute('aria-live', 'polite');
  document.body.append(scoreEl);
  $('match').textContent = 'Stop soccer';
  $('match').setAttribute('aria-pressed', 'true');
  drawMatch();
};

function stopMatch(): void {
  if (matchOwnsBall) stopKickAbout(); // the ball the match brought in goes with it
  matchOwnsBall = false;
  match = null;
  matchEndAt = null;
  goalEls?.left.remove();
  goalEls?.right.remove();
  goalEls = null;
  scoreEl?.remove();
  scoreEl = null;
  for (const s of flock) s.canvas.classList.remove('team-red', 'team-blue');
  $('match').textContent = 'Soccer';
  $('match').setAttribute('aria-pressed', 'false');
}

// ---- tag --------------------------------------------------------------------------------------
let tagGame: TagGame | null = null;
let tagSprites: Sprite[] = [];
let clock = 0; // simulated ms, so tests can step time
let tagCount = 0;

/** Sprite rectangles of the sheep that can play (classic sheep only). */
const spritesNow = (): Sprite[] =>
  flock.flatMap((s) => {
    const rect = s.stage.rect();
    return rect ? [{ id: s.id, rect }] : [];
  });

const tagViewFor = (stage: Stage): ReturnType<typeof viewFor> => {
  const sheep = flock.find((s) => s.stage === stage);
  const size = tagSprites[0]?.rect.width ?? 40;
  return tagGame && sheep ? viewFor(tagGame, sheep.id, tagSprites, size, clock) : null;
};

const markIt = (): void => {
  for (const s of flock) s.canvas.classList.toggle('it', tagGame?.it === s.id);
};

const stepTagFrame = (): void => {
  if (!tagGame || paused) return;
  tagSprites = spritesNow();
  const size = tagSprites[0]?.rect.width ?? 40;
  const r = stepTag(tagGame, tagSprites, size, clock);
  tagGame = r.game;
  if (r.tagged) tagCount += 1;
  markIt();
};

const startTagGame = (): void => {
  while (flock.length < 2 && flock.length < MAX_SHEEP) addSheep(); // it takes two to play
  wanted = flock.length;
  tagSprites = spritesNow();
  tagCount = 0;
  tagGame = startTag(tagSprites, clock, Math.floor(clock) + flock.length);
  $('tag').textContent = 'Stop tag';
  $('tag').setAttribute('aria-pressed', 'true');
  markIt();
};

const stopTagGame = (): void => {
  tagGame = null;
  for (const s of flock) s.canvas.classList.remove('it');
  $('tag').textContent = 'Play tag';
  $('tag').setAttribute('aria-pressed', 'false');
};

const tickAll = (dt: number): void => {
  if (!paused) clock += dt;
  stepTagFrame();
  stepMatchFrame();
  stepBallFrame(dt);
  drawBall();
  for (const s of flock) {
    s.stage.setPixelRatio(window.devicePixelRatio);
    s.stage.tick(dt);
  }
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
  let me: Stage | null = null;
  const stage = createStage({
    pack: loaded.pack,
    sheet: loaded.sheet,
    sheetSize: loaded.size,
    ctx: cx,
    seed: (seed + index * 7919) >>> 0,
    scale,
    pixelRatio: window.devicePixelRatio,
    getWorld: world,
    getPrefs: () => prefs,
    getTag: () => (me ? tagViewFor(me) : null),
    getTeam: () => (me ? teamViewFor(me) : null),
    getBall: currentBall,
    onKick: (k) => {
      if (!ball || ballDrag) return;
      ball = kickBall(ball, k);
      kicks += 1;
    },
    getOthers: () =>
      flock
        .filter((o) => o.stage !== me)
        .map((o) => o.stage.rect())
        .filter((r): r is Rect => r !== null),
    place: (x, y) => {
      c.style.transform = `translate(${x}px, ${y}px)`;
    },
    onSound: () => beep(),
  });
  me = stage;
  c.style.width = `${stage.windowSize()}px`;
  c.style.height = `${stage.windowSize()}px`;
  stage.setPaused(paused);
  const sheep: Sheep = { id: nextSheepId++, stage, canvas: c };
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
  if (tagGame) startTagGame(); // the sheep were rebuilt, so deal a new game
  if (match) drawMatch();
  focus = flock[0] ?? null;
  if (focus) fillAnimations(focus.stage.animations());
  refreshStatus();
};

// Pointer: each canvas only captures events over its own sheep's pixels.
document.addEventListener('pointermove', (e) => {
  if (ballDrag && ball) {
    const m = moveDrag(ballDrag, { x: e.clientX, y: e.clientY }, e.timeStamp);
    ballDrag = m.drag;
    // The held ball can't be dragged out of the playfield (it would have nowhere to land).
    const at = clampIntoAreas(world().areas, ballSize(), m.sprite.x, m.sprite.y);
    ball = { ...ball, ...at, vx: 0, vy: 0 };
    drawBall();
    return;
  }
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
const scaleSelect = $<HTMLSelectElement>('scale');
scaleSelect.value = String(scale);
scaleSelect.addEventListener('change', () => {
  scale = Number(scaleSelect.value);
  void start($<HTMLSelectElement>('pack').value);
});
$('tag').addEventListener('click', () => (tagGame ? stopTagGame() : startTagGame()));
$('match').addEventListener('click', () => (match ? stopMatch() : startMatchGame()));
$('kickabout').addEventListener('click', () => (ball ? stopKickAbout() : startKickAbout()));
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

const PACK_LABELS: Record<string, string> = {
  woolly: 'Woolly (generated, MIT)',
  original: 'Original eSheep (all 56 animations)',
};
/** The build lists which classic packs it shipped; the bounce sheep is always available. */
const fillPacks = async (): Promise<string> => {
  const names = await fetch('packs/index.json')
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : ['woolly']))
    .catch(() => ['woolly']);
  const select = $<HTMLSelectElement>('pack');
  select.replaceChildren(
    ...names.map((n) => new Option(PACK_LABELS[n] ?? n, n)),
    new Option('Bounce (screensaver)', 'bounce'),
  );
  const chosen = wantedPack && [...names, 'bounce'].includes(wantedPack) ? wantedPack : names[0];
  select.value = chosen;
  return chosen;
};

buildMonitors(false);
void fillPacks()
  .then((name) => start(name))
  .then(() => {
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
    /** The kick-about ball (a copy), or null. */
    ball: (): Ball | null => (ball ? { ...ball } : null),
    kickAbout: (on: boolean): void => (on ? startKickAbout() : stopKickAbout()),
    kicks: (): number => kicks,
    /** How many times a ball that had lain still too long was dropped in again. */
    ballResets: (): number => ballResets,
    /** Tag state: which sheep (0-based flock index) is it, and how many tags so far. */
    tag: (): { it: number; tags: number } | null =>
      tagGame ? { it: flock.findIndex((s) => s.id === tagGame?.it), tags: tagCount } : null,
    tagPlay: (on: boolean): void => (on ? startTagGame() : stopTagGame()),
    /** Soccer state: the score, who has won, and each sheep's team. */
    match: (): {
      red: number;
      blue: number;
      winner: string | null;
      teams: (string | null)[];
    } | null =>
      match
        ? {
            ...match.score,
            winner: match.winner,
            teams: flock.map((s) =>
              teamOf(
                s.id,
                flock.map((o) => o.id),
              ),
            ),
          }
        : null,
    matchPlay: (on: boolean): void => (on ? startMatchGame() : stopMatch()),
    /** Put the ball somewhere and leave it there (to stage a goal, or a stuck ball, in a test). */
    placeBall: (x: number, y: number): void => {
      if (ball) ball = { x, y, vx: 0, vy: 0 };
      restMs = 0;
    },
    ready: (): boolean => flock.length > 0,
  },
});
