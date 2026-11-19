import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { enableAutoLaunch } from './autolaunch';
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
const DEFAULT_PREFS: Prefs = { speed: 1, sound: false, pack: BUILTIN, count: 1, scale: 1 };
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const store = new Store<Prefs>({ defaults: DEFAULT_PREFS });
const preload = path.join(__dirname, '..', 'preload', 'preload.js');
const page = (name: string): string => path.join(__dirname, '..', 'web', 'app', name);
const asset = (name: string): string => path.join(__dirname, '..', '..', 'assets', name);

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
    x: area.x + Math.round(area.width / 2),
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

ipcMain.handle('get-windows', () => getVisibleWindows());
ipcMain.handle('get-work-areas', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => Number(b.id === primaryId) - Number(a.id === primaryId))
    .map((d) => d.workArea);
});
ipcMain.handle('load-prefs', () => loadPrefs());
ipcMain.handle('is-paused', () => paused);
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
  if (packChanged)
    for (const w of sheepWins) w.webContents.reload(); // renderers reload the new pack on start
  else broadcast('prefs-changed', clean);
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
    },
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Transparent windows on Linux need this and fail without a compositor.
  if (process.platform === 'linux') app.disableHardwareAcceleration();
  void app.whenReady().then(() => {
    createTray();
    setSheepCount(store.get('count'));
    enableAutoLaunch();
  });
  // Tray app: don't quit when the settings window closes.
  app.on('window-all-closed', () => {
    /* keep running */
  });
}
