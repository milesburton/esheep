// Shared ambient types (main, preload and renderer all see these).

interface Prefs {
  speed: number; // multiplier, 0.5 - 2.0
  sound: boolean;
  pack: string; // 'builtin' or a folder name under assets/packs
  count: number; // how many sheep, 1 - 12
  scale: number; // sprite size multiplier, 1 - 4 (whole numbers are crispest)
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
  /** Resize this sheep's window to fit its sprite. */
  setWindowSize: (size: number) => void;
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
  /** This sheep's part in a game of tag (role and who to chase or flee), or null if none is on. */
  getTag: () => Promise<{ role: 'it' | 'runner'; target: Rect | null; wait: boolean } | null>;
  /** The shared kick-about ball (px, with velocity), or null when there is none. */
  getBall: () => Promise<{ x: number; y: number; size: number; vx: number; vy: number } | null>;
  /** A sheep kicked the ball: the velocity it should take. */
  kickBall: (kick: { vx: number; vy: number }) => void;
  /** The ball window's pointer events (pick up, carry to a screen position, throw). */
  ballGrab: () => void;
  ballMove: (x: number, y: number) => void;
  ballRelease: (vx: number, vy: number) => void;
  /** Window bounds of every other sheep window. */
  getOtherSheep: () => Promise<Rect[]>;
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
  /** Sprite rectangles of the other sheep, if there are any (they leap over each other). */
  others?: readonly Rect[];
  /** Tag, if it is being played: this sheep's role and who to run at (it) or away from (runner). */
  tag?: { role: 'it' | 'runner'; target: Rect | null; wait: boolean };
  /** The kick-about ball, if there is one (sheep chase and kick it). */
  ball?: Rect;
}
