import { contextBridge, ipcRenderer } from 'electron';

// Only a narrow, explicit API crosses the context bridge; no Node APIs leak.
const api: ElectronAPI = {
  getWindows: () => ipcRenderer.invoke('get-windows'),
  getWorkAreas: () => ipcRenderer.invoke('get-work-areas'),
  moveWindow: (x, y) => ipcRenderer.send('move-window', x, y),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  setClickThrough: (ignore) => ipcRenderer.send('set-click-through', ignore),
  savePrefs: (prefs) => ipcRenderer.send('save-prefs', prefs),
  loadPrefs: () => ipcRenderer.invoke('load-prefs'),
  loadPack: () => ipcRenderer.invoke('load-pack'),
  listPacks: () => ipcRenderer.invoke('list-packs'),
  isPaused: () => ipcRenderer.invoke('is-paused'),
  getOtherSheep: () => ipcRenderer.invoke('get-other-sheep'),
  showMenu: () => ipcRenderer.send('show-menu'),
  getTeam: () => ipcRenderer.invoke('get-team'),
  getMatch: () => ipcRenderer.invoke('get-match'),
  getBall: () => ipcRenderer.invoke('get-ball'),
  getTag: () => ipcRenderer.invoke('get-tag'),
  kickBall: (kick) => ipcRenderer.send('ball-kick', kick),
  ballGrab: () => ipcRenderer.send('ball-grab'),
  ballMove: (x, y) => ipcRenderer.send('ball-move', x, y),
  ballRelease: (vx, vy) => ipcRenderer.send('ball-release', vx, vy),
  onPause: (cb) => {
    ipcRenderer.on('pause', () => cb());
  },
  onResume: (cb) => {
    ipcRenderer.on('resume', () => cb());
  },
  onPrefsChanged: (cb) => {
    ipcRenderer.on('prefs-changed', (_e, prefs: Prefs) => cb(prefs));
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
