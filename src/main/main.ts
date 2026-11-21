import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import { WINDOW_PAD, obstaclesFrom } from '../core/geometry';
import { enableAutoLaunch } from './autolaunch';
import { createKickAbout } from './kickabout';
import { migratePrefs } from './prefs';
import { createSoccerPlay, MATCH_LIMIT_MS } from './soccerplay';
import { createTagPlay } from './tagplay';
import { BUILTIN, listPacks, loadPack } from './pack';
import { createWindowSource, type NativeWindow, type WindowManagerLike } from './windows';

// Windows start small (a classic sprite plus margin) and the renderer resizes them to fit.
const SIZE = 52;
// The native module is optional (Windows and macOS), so it is required lazily and may fail to load.
const loadNative = (): WindowManagerLike => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wm = require('node-window-manager').windowManager;
  return {
    requestAccessibility: () => wm.requestAccessibility?.(),
    getWindows: () =>
      wm
        .getWindows()
        .map((w: NativeWindow & { getMonitor: () => { getScaleFactor: () => number } }) => ({
          id: w.id,
          processId: w.processId,
          getTitle: () => w.getTitle(),
          getBounds: () => w.getBounds(),
          isVisible: () => w.isVisible(),
          getScaleFactor: () => w.getMonitor().getScaleFactor(),
        })),
  };
};
// Windows reports physical pixels; Electron lays out in DIPs (needed for high-DPI / mixed-DPI).
const getVisibleWindows = createWindowSource(process.platform, process.pid, loadNative, (r) =>
  screen.screenToDipRect(null, r),
);

const MAX_SHEEP = 12;
const MAX_SCALE = 4;
// The original eSheep art is the default sheep (the simple bouncing `builtin` one is opt-in).
const DEFAULT_PREFS: Prefs = { speed: 1, sound: false, pack: 'original', count: 1, scale: 1 };
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// NB `version` is deliberately not a default: electron-store would fill it in for an existing install
// and the migration would think it had already run.
const store = new Store<Prefs & { version?: number }>({ defaults: DEFAULT_PREFS });
const preload = path.join(__dirname, '..', 'preload', 'preload.js');
const page = (name: string): string => path.join(__dirname, '..', 'web', 'app', name);
const asset = (name: string): string => path.join(__dirname, '..', '..', 'assets', name);

// Existing installs were written with the old default (the bouncing sheep): move them once.
const migrated = migratePrefs(store, listPacks(asset('')));
if (migrated) console.log(`prefs: moved from the bouncing sheep to the "${migrated}" pack`);

const sheepWins: BrowserWindow[] = [];
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let paused = false;

const loadPrefs = (): Prefs => ({
  speed: store.get('speed'),
  sound: store.get('sound'),
  pack: store.get('pack'),
  count: store.get('count'),
  scale: store.get('scale'),
});

const createSheepWindow = (): void => {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    // Spread new windows out, so a flock does not start stacked in one spot before each renderer
    // places its own sheep.
    x: area.x + Math.round(area.width / 2) + ((sheepWins.length * 137) % 400) - 200,
    y: area.y + Math.round(area.height / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Click-through; the renderer turns it off while the pointer is over the sheep (grab / toss).
  win.setIgnoreMouseEvents(true, { forward: true });
  void win.loadFile(page('index.html'));
  win.on('closed', () => {
    const i = sheepWins.indexOf(win);
    if (i >= 0) sheepWins.splice(i, 1);
  });
  sheepWins.push(win);
};

/** Open or close sheep windows until there are `n` of them. */
const setSheepCount = (n: number): void => {
  const target = clamp(Math.round(n) || 1, 1, MAX_SHEEP);
  while (sheepWins.length < target) createSheepWindow();
  while (sheepWins.length > target) sheepWins.pop()?.destroy();
  if (store.get('count') !== target) store.set('count', target);
  tray?.setContextMenu(buildTrayMenu());
};

const broadcast = (channel: string, ...args: unknown[]): void => {
  for (const w of sheepWins) if (!w.isDestroyed()) w.webContents.send(channel, ...args);
};

const openSettings = (): void => {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 320,
    height: 260,
    title: 'eSheep settings',
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void settingsWin.loadFile(page('settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
};

const togglePause = (): void => {
  paused = !paused;
  broadcast(paused ? 'pause' : 'resume');
  tray?.setContextMenu(buildTrayMenu());
};

// Every sheep renderer polls these, and the ball loop needs them at 60 Hz, so they are memoised briefly.
const CACHE_MS = 150;
const memo = <T>(read: () => T): (() => T) => {
  let hit: { at: number; value: T } | null = null;
  return () => {
    const now = Date.now();
    if (!hit || now - hit.at > CACHE_MS) hit = { at: now, value: read() };
    return hit.value;
  };
};
const workAreas = memo((): Rect[] => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => Number(b.id === primaryId) - Number(a.id === primaryId))
    .map((d) => d.workArea);
});
const windowList = memo(() => getVisibleWindows());
// ---- kick-about: one shared ball, simulated here and shown in its own small window ------------------
const BALL_BASE = 14;
const BALL_STEP_MS = 16;
const ballSize = (): number => Math.round(BALL_BASE * store.get('scale'));
const kickAbout = createKickAbout({
  size: ballSize,
  world: () => ({ areas: workAreas(), windows: obstaclesFrom(windowList(), workAreas()) }),
  areas: workAreas,
  speed: () => store.get('speed'),
});
let ballWin: BrowserWindow | null = null;
let ballTimer: NodeJS.Timeout | null = null;

const stopKickAbout = (): void => {
  if (ballTimer) clearInterval(ballTimer);
  ballTimer = null;
  kickAbout.stop();
  const w = ballWin;
  ballWin = null;
  if (w && !w.isDestroyed()) w.destroy();
  if (soccer.active()) stopSoccer(); // a match is nothing without its ball
  tray?.setContextMenu(buildTrayMenu());
};

const createBallWindow = (): BrowserWindow => {
  const s = kickAbout.state();
  const size = ballSize();
  const win = new BrowserWindow({
    width: size,
    height: size,
    x: Math.round(s?.x ?? 0),
    y: Math.round(s?.y ?? 0),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  void win.loadFile(page('ball.html'));
  win.on('closed', () => {
    if (ballWin === win) stopKickAbout();
  });
  return win;
};

const startKickAbout = (limitMs?: number): void => {
  if (kickAbout.active()) return;
  kickAbout.start(limitMs);
  ballWin = createBallWindow();
  let last = Date.now();
  ballTimer = setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    if (paused) return;
    if (!kickAbout.tick(dt)) return stopKickAbout(); // time limit reached
    const b = kickAbout.state();
    if (b && ballWin && !ballWin.isDestroyed()) {
      ballWin.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: b.size, height: b.size });
    }
  }, BALL_STEP_MS);
  tray?.setContextMenu(buildTrayMenu());
};

// ---- tag: the game state lives here; each sheep window asks what it should do -----------------------
const TAG_STEP_MS = 50;
const tagSprites = (): { id: number; rect: Rect }[] =>
  sheepWins
    .filter((w) => !w.isDestroyed())
    .map((w) => {
      const b = w.getBounds();
      return {
        id: w.webContents.id,
        rect: {
          x: b.x + WINDOW_PAD,
          y: b.y + WINDOW_PAD,
          width: b.width - 2 * WINDOW_PAD,
          height: b.height - 2 * WINDOW_PAD,
        },
      };
    });
const tagPlay = createTagPlay({
  sprites: tagSprites,
  size: () => tagSprites()[0]?.rect.width ?? 40,
  now: () => Date.now(),
});
let tagTimer: NodeJS.Timeout | null = null;

const stopTag = (): void => {
  if (tagTimer) clearInterval(tagTimer);
  tagTimer = null;
  tagPlay.stop();
  tray?.setContextMenu(buildTrayMenu());
};

const startTag = (): void => {
  if (tagPlay.active() || store.get('pack') === BUILTIN) return; // the bounce sheep cannot play
  stopSoccer(); // one game at a time
  if (sheepWins.length < 2) setSheepCount(2); // it takes two to play
  tagPlay.start(Date.now());
  tagTimer = setInterval(() => {
    if (!paused) tagPlay.tick();
  }, TAG_STEP_MS);
  tray?.setContextMenu(buildTrayMenu());
};

const toggleTag = (): void => (tagPlay.active() ? stopTag() : startTag());

const toggleKickAbout = (): void => (kickAbout.active() ? stopKickAbout() : startKickAbout());

// ---- soccer: two teams, a goal at each end, a scoreboard; the match state lives here ---------------
const SOCCER_STEP_MS = 50;
const SCORE_W = 220;
const SCORE_H = 56;
const soccer = createSoccerPlay({
  sheepIds: () => tagSprites().map((s) => s.id),
  size: ballSize,
  areas: workAreas,
  now: () => Date.now(),
  ball: kickAbout,
});
let soccerTimer: NodeJS.Timeout | null = null;
let overlays: { goals: [BrowserWindow, BrowserWindow]; score: BrowserWindow } | null = null;

const createOverlay = (b: Rect, query: Record<string, string>): BrowserWindow => {
  const win = new BrowserWindow({
    ...b,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true); // the pitch is only for looking at; clicks go to what is underneath
  void win.loadFile(page('overlay.html'), { query });
  return win;
};

const placeOverlays = (): void => {
  const g = soccer.state()?.goals;
  if (!g || !overlays) return;
  const r = (b: Rect) => ({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  });
  overlays.goals[0].setBounds(r(g.left));
  overlays.goals[1].setBounds(r(g.right));
  const a = workAreas()[0];
  overlays.score.setBounds({
    x: Math.round(a.x + (a.width - SCORE_W) / 2),
    y: a.y + 8,
    width: SCORE_W,
    height: SCORE_H,
  });
};

function stopSoccer(): void {
  if (soccerTimer) clearInterval(soccerTimer);
  soccerTimer = null;
  const o = overlays;
  overlays = null;
  for (const w of o ? [...o.goals, o.score] : []) if (!w.isDestroyed()) w.destroy();
  const was = soccer.active();
  soccer.stop();
  if (was) stopKickAbout(); // takes the ball (and its window) away
  tray?.setContextMenu(buildTrayMenu());
}

const startSoccer = (): void => {
  if (soccer.active() || store.get('pack') === BUILTIN) return; // the bounce sheep cannot play
  stopTag(); // one game at a time
  if (sheepWins.length < 4) setSheepCount(4); // two a side
  startKickAbout(MATCH_LIMIT_MS);
  soccer.start();
  const zero = { x: 0, y: 0, width: 10, height: 10 };
  overlays = {
    goals: [
      createOverlay(zero, { kind: 'goal', team: 'red' }),
      createOverlay(zero, { kind: 'goal', team: 'blue' }),
    ],
    score: createOverlay(zero, { kind: 'score' }),
  };
  placeOverlays();
  soccerTimer = setInterval(() => {
    if (paused) return;
    soccer.tick();
    if (!soccer.active()) return stopSoccer(); // the final score has been shown, or the ball ran out
    placeOverlays();
  }, SOCCER_STEP_MS);
  tray?.setContextMenu(buildTrayMenu());
};

const toggleSoccer = (): void => (soccer.active() ? stopSoccer() : startSoccer());

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: paused ? 'Resume' : 'Pause', click: togglePause },
    {
      label: 'Add sheep',
      enabled: sheepWins.length < MAX_SHEEP,
      click: () => setSheepCount(sheepWins.length + 1),
    },
    {
      label: 'Remove sheep',
      enabled: sheepWins.length > 1,
      click: () => setSheepCount(sheepWins.length - 1),
    },
    {
      label: tagPlay.active() ? 'Stop tag' : 'Play tag',
      enabled: tagPlay.active() || store.get('pack') !== BUILTIN,
      click: toggleTag,
    },
    {
      label: soccer.active() ? 'Stop soccer match' : 'Play soccer',
      enabled: soccer.active() || store.get('pack') !== BUILTIN,
      click: toggleSoccer,
    },
    {
      label: kickAbout.active() ? 'Stop kick-about' : 'Start kick-about',
      click: toggleKickAbout,
    },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

const createTray = (): void => {
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('eSheep');
  tray.setContextMenu(buildTrayMenu());
};

ipcMain.handle('get-windows', () => windowList());
ipcMain.handle('get-work-areas', () => workAreas());
ipcMain.handle('load-prefs', () => loadPrefs());
ipcMain.handle('is-paused', () => paused);
ipcMain.handle('get-ball', () => kickAbout.state());
ipcMain.handle('get-tag', (e) => tagPlay.view(e.sender.id));
ipcMain.handle('get-team', (e) => soccer.view(e.sender.id));
ipcMain.handle('get-match', () => {
  const s = soccer.state();
  return s
    ? {
        ...s.match.score,
        winner: s.match.winner,
        kickoff: Date.now() < s.match.restartUntil,
      }
    : null;
});
const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
ipcMain.on('ball-kick', (_e, k: { vx: number; vy: number }) =>
  kickAbout.kick({ vx: num(k?.vx), vy: num(k?.vy) }),
);
ipcMain.on('ball-grab', () => kickAbout.grab());
ipcMain.on('ball-move', (_e, x: number, y: number) => kickAbout.move(num(x), num(y)));
ipcMain.on('ball-release', (_e, vx: number, vy: number) => kickAbout.release(num(vx), num(vy)));
ipcMain.handle('get-other-sheep', (e) =>
  sheepWins.filter((w) => !w.isDestroyed() && w.webContents !== e.sender).map((w) => w.getBounds()),
);
ipcMain.handle('list-packs', () => listPacks(asset('')));
ipcMain.handle('load-pack', () => loadPack(asset(''), store.get('pack')));
ipcMain.on('set-click-through', (e, ignore: boolean) => {
  BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});
ipcMain.on('move-window', (e, x: number, y: number) => {
  if (Number.isFinite(x) && Number.isFinite(y))
    BrowserWindow.fromWebContents(e.sender)?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('set-window-size', (e, size: number) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const n = Math.round(clamp(Number(size) || SIZE, 16, 512));
  if (!win || win.getBounds().width === n) return;
  // Linux ignores setSize on non-resizable windows, so lift the restriction around the call.
  win.setResizable(true);
  win.setSize(n, n);
  win.setResizable(false);
});
ipcMain.on('save-prefs', (_e, prefs: Prefs) => {
  const packs = listPacks(asset(''));
  const clean: Prefs = {
    speed: clamp(Number(prefs.speed) || 1, 0.5, 2),
    sound: Boolean(prefs.sound),
    pack: packs.includes(prefs.pack) ? prefs.pack : BUILTIN,
    count: clamp(Math.round(Number(prefs.count)) || 1, 1, MAX_SHEEP),
    scale: clamp(Math.round(Number(prefs.scale)) || 1, 1, MAX_SCALE),
  };
  // A new pack or size needs the sheep rebuilt, which a renderer reload does.
  const packChanged = clean.pack !== store.get('pack') || clean.scale !== store.get('scale');
  store.set(clean);
  if (packChanged) {
    stopKickAbout(); // the ball is sized to the sprite
    stopTag(); // the sheep are rebuilt, so the game is over
    for (const w of sheepWins) w.webContents.reload(); // renderers reload the new pack on start
  } else broadcast('prefs-changed', clean);
  setSheepCount(clean.count);
});

// Test seam: lets Playwright drive the tray menu without a real tray. Off in production.
if (process.env.ESHEEP_TEST === '1') {
  Object.assign(globalThis, {
    __esheep: {
      togglePause,
      openSettings,
      trayLabels: () =>
        buildTrayMenu()
          .items.map((i) => i.label)
          .filter(Boolean),
      isPaused: () => paused,
      sheepCount: () => sheepWins.length,
      addSheep: () => setSheepCount(sheepWins.length + 1),
      removeSheep: () => setSheepCount(sheepWins.length - 1),
      startKickAbout,
      stopKickAbout,
      kickAbout: () => ({
        active: kickAbout.active(),
        held: kickAbout.held(),
        kicks: kickAbout.kicks(),
        ball: kickAbout.state(),
        windows: BrowserWindow.getAllWindows().filter((w) =>
          w.webContents.getURL().endsWith('/app/ball.html'),
        ).length,
      }),
      placeBall: (x: number, y: number) => kickAbout.place(x, y),
      startSoccer,
      stopSoccer,
      soccerState: () => {
        const s = soccer.state();
        return {
          active: soccer.active(),
          score: s?.match.score ?? null,
          winner: s?.match.winner ?? null,
          teams: tagSprites().map((t) => soccer.view(t.id)?.team ?? null),
          overlays: BrowserWindow.getAllWindows().filter((w) =>
            w.webContents.getURL().includes('/app/overlay.html'),
          ).length,
        };
      },
      startTag,
      stopTag,
      tagState: () => tagPlay.state(),
    },
  });
}

/**
 * `ESHEEP_SELFTEST=<file>`: start normally, wait for the first sheep to render, write a JSON report
 * (did the page load, is the native window module available, ...) to <file>, then quit. Lets CI prove
 * a packaged build, including the native module, really launches on its own OS.
 */
const runSelfTest = (out: string): void => {
  const report = async (): Promise<void> => {
    const first = sheepWins[0];
    const result: Record<string, unknown> = {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electron: process.versions.electron,
      nativeWindows: getVisibleWindows.available,
      visibleWindows: getVisibleWindows().length,
      sheepWindows: sheepWins.length,
      packs: listPacks(asset('')),
    };
    try {
      result.rendered = Boolean(
        await first?.webContents.executeJavaScript(
          "typeof window.electronAPI === 'object' && !!document.querySelector('canvas')",
        ),
      );
    } catch (err) {
      result.rendered = false;
      result.error = String(err);
    }
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    app.exit(0);
  };
  setTimeout(() => void report(), 6000);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Transparent windows on Linux need this and fail without a compositor.
  if (process.platform === 'linux') app.disableHardwareAcceleration();
  void app.whenReady().then(() => {
    createTray();
    setSheepCount(store.get('count'));
    // A self-test run (CI proving a packaged build starts) must not touch login items.
    if (process.env.ESHEEP_SELFTEST) runSelfTest(process.env.ESHEEP_SELFTEST);
    else enableAutoLaunch();
  });
  // Tray app: don't quit when the settings window closes.
  app.on('window-all-closed', () => {
    /* keep running */
  });
}
