import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions as Item } from 'electron';
import { PACK_LABELS, buildTrayTemplate, flattenLabels, type TrayState } from './trayMenu.js';

const state = (over: Partial<TrayState> = {}): TrayState => ({
  version: '0.1.4',
  platform: 'win32',
  paused: false,
  sheepCount: 3,
  maxSheep: 12,
  pack: 'original',
  packs: ['builtin', 'original', 'woolly'],
  scale: 1,
  maxScale: 4,
  speed: 1,
  sound: false,
  autoLaunch: true,
  tagActive: false,
  soccerActive: false,
  kickAboutActive: false,
  fromSheep: false,
  ...over,
});
const actions = () => ({
  togglePause: vi.fn(),
  setSheepCount: vi.fn(),
  removeThisSheep: vi.fn(),
  setPack: vi.fn(),
  setScale: vi.fn(),
  setSpeed: vi.fn(),
  setSound: vi.fn(),
  setAutoLaunch: vi.fn(),
  toggleTag: vi.fn(),
  toggleSoccer: vi.fn(),
  toggleKickAbout: vi.fn(),
  openSettings: vi.fn(),
  openReleases: vi.fn(),
  quit: vi.fn(),
});
const find = (items: readonly Item[], label: string): Item => {
  for (const i of items) {
    if (i.label === label) return i;
    if (Array.isArray(i.submenu)) {
      const hit = i.submenu.find((c) => c.label === label);
      if (hit) return hit;
    }
  }
  throw new Error(`no menu item "${label}"`);
};
const sub = (items: readonly Item[], label: string): Item[] => {
  const s = find(items, label).submenu;
  if (!Array.isArray(s)) throw new Error(`"${label}" has no submenu`);
  return s as Item[];
};
const click = (i: Item): void => (i.click as unknown as () => void)();

describe('tray menu', () => {
  it('is comprehensive: every control a user needs is reachable', () => {
    const labels = flattenLabels(buildTrayTemplate(state(), actions()));
    expect(labels).toEqual(
      expect.arrayContaining([
        'eSheep 0.1.4',
        'Pause',
        'Add sheep',
        'Remove sheep',
        'Original eSheep',
        'Woolly (generated)',
        'Bouncing sheep (simple)',
        '×1 (native)',
        '×4',
        '0.5×',
        '2×',
        'Play tag',
        'Play soccer',
        'Start kick-about',
        'Sound on bounce',
        'Start with Windows',
        'Settings…',
        'Downloads and updates',
        'Quit',
      ]),
    );
  });

  it('keeps the top level short, with the detail in submenus', () => {
    const top = buildTrayTemplate(state(), actions()).filter((i) => i.type !== 'separator');
    expect(top.map((i) => i.label)).toEqual([
      'eSheep 0.1.4',
      'Pause',
      'Sheep',
      'Appearance',
      'Games',
      'Sound on bounce',
      'Start with Windows',
      'Settings…',
      'Downloads and updates',
      'Quit',
    ]);
  });

  it('the header is a disabled version label', () => {
    expect(buildTrayTemplate(state(), actions())[0]).toMatchObject({
      label: 'eSheep 0.1.4',
      enabled: false,
    });
  });

  it('wires Pause / Resume, Settings, Downloads and Quit to their actions', () => {
    const a = actions();
    const t = buildTrayTemplate(state(), a);
    click(find(t, 'Pause'));
    click(find(t, 'Settings…'));
    click(find(t, 'Downloads and updates'));
    click(find(t, 'Quit'));
    expect(a.togglePause).toHaveBeenCalledOnce();
    expect(a.openSettings).toHaveBeenCalledOnce();
    expect(a.openReleases).toHaveBeenCalledOnce();
    expect(a.quit).toHaveBeenCalledOnce();
    expect(find(buildTrayTemplate(state({ paused: true }), a), 'Resume')).toBeTruthy();
  });

  describe('Sheep', () => {
    it('adds and removes one at a time, within limits', () => {
      const a = actions();
      const t = buildTrayTemplate(state({ sheepCount: 3 }), a);
      click(find(t, 'Add sheep'));
      click(find(t, 'Remove sheep'));
      expect(a.setSheepCount).toHaveBeenNthCalledWith(1, 4);
      expect(a.setSheepCount).toHaveBeenNthCalledWith(2, 2);
      expect(find(buildTrayTemplate(state({ sheepCount: 12 }), a), 'Add sheep').enabled).toBe(
        false,
      );
      expect(find(buildTrayTemplate(state({ sheepCount: 1 }), a), 'Remove sheep').enabled).toBe(
        false,
      );
    });

    it('offers quick counts as radios with the current one ticked, including an unusual current count', () => {
      const radios = (n: number) =>
        sub(buildTrayTemplate(state({ sheepCount: n }), actions()), 'Sheep').filter(
          (i) => i.type === 'radio',
        );
      expect(radios(3).map((i) => i.label)).toEqual([
        '1 sheep',
        '2 sheep',
        '3 sheep',
        '4 sheep',
        '6 sheep',
        '8 sheep',
        '12 sheep',
      ]);
      expect(
        radios(3)
          .filter((i) => i.checked)
          .map((i) => i.label),
      ).toEqual(['3 sheep']);
      expect(radios(5).map((i) => i.label)).toContain('5 sheep'); // not a quick choice, but it is the current one
      expect(
        radios(5)
          .filter((i) => i.checked)
          .map((i) => i.label),
      ).toEqual(['5 sheep']);
    });

    it('picking a count sets exactly that many', () => {
      const a = actions();
      const t = buildTrayTemplate(state(), a);
      click(sub(t, 'Sheep').find((i) => i.label === '8 sheep') as Item);
      expect(a.setSheepCount).toHaveBeenCalledWith(8);
    });

    it('never offers more sheep than the maximum', () => {
      const t = buildTrayTemplate(state({ maxSheep: 4 }), actions());
      expect(sub(t, 'Sheep').map((i) => i.label)).not.toContain('6 sheep');
    });
  });

  describe('Appearance', () => {
    it('lists the packs with friendly names and ticks the current one', () => {
      const t = buildTrayTemplate(state({ pack: 'woolly' }), actions());
      const packs = sub(t, 'Appearance').filter(
        (i) => i.type === 'radio' && Object.values(PACK_LABELS).includes(i.label ?? ''),
      );
      expect(packs.map((i) => i.label)).toEqual([
        'Bouncing sheep (simple)',
        'Original eSheep',
        'Woolly (generated)',
      ]);
      expect(packs.filter((i) => i.checked).map((i) => i.label)).toEqual(['Woolly (generated)']);
    });

    it('shows an unknown pack by its folder name', () => {
      const t = buildTrayTemplate(
        state({ packs: ['builtin', 'my-pack'], pack: 'my-pack' }),
        actions(),
      );
      expect(find(t, 'my-pack')).toMatchObject({ type: 'radio', checked: true });
    });

    it('choosing a pack, a size or a speed calls the matching action', () => {
      const a = actions();
      const t = buildTrayTemplate(state(), a);
      click(find(t, 'Woolly (generated)'));
      click(find(t, '×3'));
      click(find(t, '1.5×'));
      expect(a.setPack).toHaveBeenCalledWith('woolly');
      expect(a.setScale).toHaveBeenCalledWith(3);
      expect(a.setSpeed).toHaveBeenCalledWith(1.5);
    });

    it('ticks the current size and speed, and offers an odd current speed too', () => {
      const t = buildTrayTemplate(state({ scale: 2, speed: 1.3 }), actions());
      const checked = sub(t, 'Appearance')
        .filter((i) => i.checked)
        .map((i) => i.label);
      expect(checked).toContain('×2');
      expect(checked).toContain('1.3×');
      expect(checked).not.toContain('×1 (native)');
    });
  });

  describe('Games', () => {
    it('are available with a classic pack, and toggle their labels while running', () => {
      const t = buildTrayTemplate(state(), actions());
      expect(find(t, 'Play tag').enabled).toBe(true);
      expect(find(t, 'Play soccer').enabled).toBe(true);
      const on = buildTrayTemplate(
        state({ tagActive: true, soccerActive: true, kickAboutActive: true }),
        actions(),
      );
      expect(flattenLabels(on)).toEqual(
        expect.arrayContaining(['Stop tag', 'Stop soccer match', 'Stop kick-about']),
      );
    });

    it('tag and soccer are greyed out for the bouncing sheep, with an explanation, but kick-about is not', () => {
      const t = buildTrayTemplate(state({ pack: 'builtin' }), actions());
      expect(find(t, 'Play tag').enabled).toBe(false);
      expect(find(t, 'Play soccer').enabled).toBe(false);
      expect(find(t, 'Start kick-about').enabled).not.toBe(false);
      expect(flattenLabels(t)).toContain('Tag and soccer need a classic sprite pack');
    });

    it('a game already running can always be stopped, even if the pack was switched', () => {
      const t = buildTrayTemplate(state({ pack: 'builtin', tagActive: true }), actions());
      expect(find(t, 'Stop tag').enabled).toBe(true);
    });

    it('clicks reach the right action', () => {
      const a = actions();
      const t = buildTrayTemplate(state(), a);
      click(find(t, 'Play tag'));
      click(find(t, 'Play soccer'));
      click(find(t, 'Start kick-about'));
      expect(
        [a.toggleTag, a.toggleSoccer, a.toggleKickAbout].map((f) => f.mock.calls.length),
      ).toEqual([1, 1, 1]);
    });
  });

  describe('options', () => {
    it('sound is a checkbox that flips', () => {
      const a = actions();
      click(find(buildTrayTemplate(state({ sound: false }), a), 'Sound on bounce'));
      click(find(buildTrayTemplate(state({ sound: true }), a), 'Sound on bounce'));
      expect(find(buildTrayTemplate(state({ sound: true }), a), 'Sound on bounce')).toMatchObject({
        type: 'checkbox',
        checked: true,
      });
      expect(a.setSound).toHaveBeenNthCalledWith(1, true);
      expect(a.setSound).toHaveBeenNthCalledWith(2, false);
    });

    it('start-at-login is a checkbox, worded for the platform, and absent where unavailable', () => {
      const a = actions();
      expect(
        find(buildTrayTemplate(state({ platform: 'darwin' }), a), 'Open at login'),
      ).toBeTruthy();
      expect(
        find(buildTrayTemplate(state({ platform: 'linux' }), a), 'Start at login'),
      ).toBeTruthy();
      const win = buildTrayTemplate(state({ autoLaunch: true }), a);
      click(find(win, 'Start with Windows'));
      expect(a.setAutoLaunch).toHaveBeenCalledWith(false);
      expect(
        flattenLabels(buildTrayTemplate(state({ autoLaunch: null }), a)).some((l) =>
          /login|Windows/.test(l),
        ),
      ).toBe(false);
    });
  });

  describe('opened from a sheep (right-click)', () => {
    it('adds "Remove this sheep" on top, which is disabled for the last sheep', () => {
      const a = actions();
      const t = buildTrayTemplate(state({ fromSheep: true }), a);
      const item = find(t, 'Remove this sheep');
      expect(item.enabled).toBe(true);
      click(item);
      expect(a.removeThisSheep).toHaveBeenCalledOnce();
      expect(
        find(buildTrayTemplate(state({ fromSheep: true, sheepCount: 1 }), a), 'Remove this sheep')
          .enabled,
      ).toBe(false);
    });

    it('is otherwise the same menu, and the tray version has no such item', () => {
      expect(flattenLabels(buildTrayTemplate(state(), actions()))).not.toContain(
        'Remove this sheep',
      );
      const withSheep = flattenLabels(buildTrayTemplate(state({ fromSheep: true }), actions()));
      expect(withSheep.filter((l) => l !== 'Remove this sheep')).toEqual(
        flattenLabels(buildTrayTemplate(state(), actions())),
      );
    });
  });
});
