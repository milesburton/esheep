// Shared ambient types (main, preload and renderer all see these).

interface Prefs {
  speed: number; // multiplier, 0.5 - 2.0
  sound: boolean;
  pack: string; // 'builtin' or a folder name under assets/packs
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowInfo {
  id: number;
  title: string;
  bounds: Rect;
}

/** Reference to the next animation, chosen by weighted probability when its `only` context holds. */
interface NextRef {
  p: number;
  only: string;
  id: number;
}

/** Start/end keyframe of an animation. Values are arithmetic expressions kept as strings. */
interface AnimPoint {
  x: string;
  y: string;
  offsety: string;
  opacity: string;
  interval: string;
}

interface PackAnim {
  id: number;
  name: string;
  start: AnimPoint;
  end: AnimPoint;
  repeat: string;
  repeatFrom: string;
  frames: number[];
  action: string;
  next: NextRef[];
  border: NextRef[];
  gravity: NextRef[];
}

interface PackSpawn {
  p: number;
  x: string;
  y: string;
  next: number;
}

/** A desktopPet/eSheep-style pack (animations.xml) converted to JSON by the main process. */
interface ClassicPack {
  kind: 'classic';
  name: string;
  tilesX: number;
  tilesY: number;
  transparency: string;
  png: string; // data: URL
  animations: PackAnim[];
  spawns: PackSpawn[];
}

/** The built-in generated sheep: 8-frame strip, simple bouncing. */
interface BouncePack {
  kind: 'bounce';
  name: string;
}

type Pack = ClassicPack | BouncePack;

interface ElectronAPI {
  getWindows: () => Promise<WindowInfo[]>;
  /** Work areas of all displays, primary first. */
  getWorkAreas: () => Promise<Rect[]>;
  moveWindow: (x: number, y: number) => void;
  /** Ignore mouse events (click-through) except while the pointer is over the sheep. */
  setClickThrough: (ignore: boolean) => void;
  savePrefs: (prefs: Prefs) => void;
  loadPrefs: () => Promise<Prefs>;
  loadPack: () => Promise<Pack>;
  listPacks: () => Promise<string[]>;
  /** Current tray pause state (a Pause sent before the page loaded would otherwise be lost). */
  isPaused: () => Promise<boolean>;
  onPause: (cb: () => void) => void;
  onResume: (cb: () => void) => void;
  onPrefsChanged: (cb: (prefs: Prefs) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}

/** What the sheep can walk on and bump into. */
interface World {
  /** Display work areas, primary first. */
  areas: readonly Rect[];
  /** Other application windows (floors / walls). */
  windows: readonly Rect[];
}
