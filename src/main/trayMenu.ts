import type { MenuItemConstructorOptions } from 'electron';

/** Everything the tray / right-click menu needs to know to draw itself. */
export interface TrayState {
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly paused: boolean;
  readonly sheepCount: number;
  readonly maxSheep: number;
  readonly pack: string;
  readonly packs: readonly string[];
  readonly scale: number;
  readonly maxScale: number;
  readonly speed: number;
  readonly sound: boolean;
  /** Start at login: true / false, or null where it is not available (a development run). */
  readonly autoLaunch: boolean | null;
  readonly tagActive: boolean;
  readonly soccerActive: boolean;
  readonly kickAboutActive: boolean;
  /** The menu was opened by right-clicking a sheep (so it gets "Remove this sheep" on top). */
  readonly fromSheep: boolean;
}

export interface TrayActions {
  togglePause(): void;
  setSheepCount(n: number): void;
  removeThisSheep(): void;
  setPack(name: string): void;
  setScale(n: number): void;
  setSpeed(n: number): void;
  setSound(on: boolean): void;
  setAutoLaunch(on: boolean): void;
  toggleTag(): void;
  toggleSoccer(): void;
  toggleKickAbout(): void;
  openSettings(): void;
  openReleases(): void;
  quit(): void;
}

export const PACK_LABELS: Readonly<Record<string, string>> = {
  original: 'Original eSheep',
  woolly: 'Woolly (generated)',
  builtin: 'Bouncing sheep (simple)',
};
/** Quick choices for the number of sheep and the speed; the current value is always offered too. */
export const COUNT_CHOICES = [1, 2, 3, 4, 6, 8, 12] as const;
export const SPEED_CHOICES = [0.5, 0.75, 1, 1.5, 2] as const;

const withCurrent = (choices: readonly number[], current: number): number[] =>
  [...new Set([...choices, current])].sort((a, b) => a - b);

const header = (label: string): MenuItemConstructorOptions => ({ label, enabled: false });

const autoLaunchLabel = (platform: NodeJS.Platform): string =>
  platform === 'win32'
    ? 'Start with Windows'
    : platform === 'darwin'
      ? 'Open at login'
      : 'Start at login';

/**
 * The tray menu (and the menu you get by right-clicking a sheep) as a plain template. Pure: the state in,
 * the items out, with every click wired to an action, so it can be tested without Electron.
 */
export const buildTrayTemplate = (s: TrayState, a: TrayActions): MenuItemConstructorOptions[] => {
  const canPlay = s.pack !== 'builtin'; // the bouncing sheep cannot play games
  const radio = (
    label: string,
    checked: boolean,
    click: () => void,
  ): MenuItemConstructorOptions => ({ label, type: 'radio', checked, click });

  return [
    header(`eSheep ${s.version}`),
    { type: 'separator' },
    ...(s.fromSheep
      ? ([
          {
            label: 'Remove this sheep',
            enabled: s.sheepCount > 1,
            click: a.removeThisSheep,
          },
          { type: 'separator' },
        ] as MenuItemConstructorOptions[])
      : []),
    { label: s.paused ? 'Resume' : 'Pause', click: a.togglePause },
    { type: 'separator' },
    {
      label: 'Sheep',
      submenu: [
        {
          label: 'Add sheep',
          enabled: s.sheepCount < s.maxSheep,
          click: () => a.setSheepCount(s.sheepCount + 1),
        },
        {
          label: 'Remove sheep',
          enabled: s.sheepCount > 1,
          click: () => a.setSheepCount(s.sheepCount - 1),
        },
        { type: 'separator' },
        header('Number of sheep'),
        ...withCurrent(COUNT_CHOICES, s.sheepCount)
          .filter((n) => n <= s.maxSheep)
          .map((n) =>
            radio(n === 1 ? '1 sheep' : `${n} sheep`, n === s.sheepCount, () => a.setSheepCount(n)),
          ),
      ],
    },
    {
      label: 'Appearance',
      submenu: [
        header('Sprite pack'),
        ...s.packs.map((p) => radio(PACK_LABELS[p] ?? p, p === s.pack, () => a.setPack(p))),
        { type: 'separator' },
        header('Size'),
        ...Array.from({ length: s.maxScale }, (_, i) => i + 1).map((n) =>
          radio(n === 1 ? '×1 (native)' : `×${n}`, n === s.scale, () => a.setScale(n)),
        ),
        { type: 'separator' },
        header('Speed'),
        ...withCurrent(SPEED_CHOICES, s.speed).map((v) =>
          radio(`${v}×`, v === s.speed, () => a.setSpeed(v)),
        ),
      ],
    },
    {
      label: 'Games',
      submenu: [
        {
          label: s.tagActive ? 'Stop tag' : 'Play tag',
          enabled: s.tagActive || canPlay,
          click: a.toggleTag,
        },
        {
          label: s.soccerActive ? 'Stop soccer match' : 'Play soccer',
          enabled: s.soccerActive || canPlay,
          click: a.toggleSoccer,
        },
        {
          label: s.kickAboutActive ? 'Stop kick-about' : 'Start kick-about',
          click: a.toggleKickAbout,
        },
        ...(canPlay || s.tagActive || s.soccerActive
          ? []
          : ([
              { type: 'separator' },
              header('Tag and soccer need a classic sprite pack'),
            ] as MenuItemConstructorOptions[])),
      ],
    },
    { type: 'separator' },
    {
      label: 'Sound on bounce',
      type: 'checkbox',
      checked: s.sound,
      click: () => a.setSound(!s.sound),
    },
    ...(s.autoLaunch === null
      ? []
      : ([
          {
            label: autoLaunchLabel(s.platform),
            type: 'checkbox',
            checked: s.autoLaunch,
            click: () => a.setAutoLaunch(!s.autoLaunch),
          },
        ] as MenuItemConstructorOptions[])),
    { type: 'separator' },
    { label: 'Settings…', click: a.openSettings },
    { label: 'Downloads and updates', click: a.openReleases },
    { type: 'separator' },
    { label: 'Quit', click: a.quit },
  ];
};

/** Every label in the menu, submenus included, in order (handy for tests and tooltips). */
export const flattenLabels = (items: readonly MenuItemConstructorOptions[]): string[] =>
  items.flatMap((i) => [
    ...(i.label ? [i.label] : []),
    ...(Array.isArray(i.submenu) ? flattenLabels(i.submenu) : []),
  ]);
