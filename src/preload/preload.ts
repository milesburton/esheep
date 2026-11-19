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
