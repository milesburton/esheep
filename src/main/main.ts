import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { enableAutoLaunch } from './autolaunch';
import { BUILTIN, listPacks, loadPack } from './pack';
import { createWindowSource, type WindowManagerLike } from './windows';

const SIZE = 128;
// The native module is optional (Windows only), so it is required lazily and may fail to load.
const loadNative = (): WindowManagerLike =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-window-manager').windowManager;
const getVisibleWindows = createWindowSource(process.platform, process.pid, loadNative);

const DEFAULT_PREFS: Prefs = { speed: 1, sound: false, pack: BUILTIN };
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const store = new Store<Prefs>({ defaults: DEFAULT_PREFS });
const preload = path.join(__dirname, '..', 'preload', 'preload.js');
const page = (name: string): string => path.join(__dirname, '..', 'web', 'app', name);
const asset = (name: string): string => path.join(__dirname, '..', '..', 'assets', name);

let sheepWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let paused = false;

const loadPrefs = (): Prefs => ({
  speed: store.get('speed'),
  sound: store.get('sound'),
  pack: store.get('pack'),
});

const createSheepWindow = (): void => {
  const area = screen.getPrimaryDisplay().workArea;
  sheepWin = new BrowserWindow({
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
  sheepWin.setAlwaysOnTop(true, 'screen-saver');
  // Click-through; the renderer turns it off while the pointer is over the sheep (grab / toss).
  sheepWin.setIgnoreMouseEvents(true, { forward: true });
  void sheepWin.loadFile(page('index.html'));
  sheepWin.on('closed', () => {
    sheepWin = null;
  });
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
  sheepWin?.webContents.send(paused ? 'pause' : 'resume');
  tray?.setContextMenu(buildTrayMenu());
};

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: paused ? 'Resume' : 'Pause', click: togglePause },
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
ipcMain.handle('list-packs', () => listPacks(asset('')));
ipcMain.handle('load-pack', () => loadPack(asset(''), store.get('pack')));
ipcMain.on('set-click-through', (_e, ignore: boolean) => {
  sheepWin?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});
ipcMain.on('move-window', (_e, x: number, y: number) => {
  if (Number.isFinite(x) && Number.isFinite(y)) sheepWin?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('save-prefs', (_e, prefs: Prefs) => {
  const packs = listPacks(asset(''));
  const clean: Prefs = {
    speed: clamp(Number(prefs.speed) || 1, 0.5, 2),
    sound: Boolean(prefs.sound),
    pack: packs.includes(prefs.pack) ? prefs.pack : BUILTIN,
  };
  const packChanged = clean.pack !== store.get('pack');
  store.set(clean);
  if (packChanged)
    sheepWin?.webContents.reload(); // renderer reloads the new pack on start
  else sheepWin?.webContents.send('prefs-changed', clean);
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
    },
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Transparent windows on Linux need this and fail without a compositor.
  if (process.platform === 'linux') app.disableHardwareAcceleration();
  void app.whenReady().then(() => {
    createSheepWindow();
    createTray();
    enableAutoLaunch();
  });
  // Tray app: don't quit when the settings window closes.
  app.on('window-all-closed', () => {
    /* keep running */
  });
}
