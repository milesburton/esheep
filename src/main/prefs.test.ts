import { describe, expect, it } from 'vitest';
import { PREFS_VERSION, migratePrefs, type PrefsStore } from './prefs.js';

const fake = (initial: Record<string, unknown>): PrefsStore & { data: Record<string, unknown> } => {
  const data = { ...initial };
  return {
    data,
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = v;
    },
  };
};
const ALL = ['builtin', 'original', 'woolly'];

describe('migratePrefs', () => {
  it('moves an old install off the generated bouncing sheep onto the original art', () => {
    const s = fake({ pack: 'builtin', speed: 1 }); // no version: written by 0.1.0 / 0.1.1
    expect(migratePrefs(s, ALL)).toBe('original');
    expect(s.data).toMatchObject({ pack: 'original', version: PREFS_VERSION, speed: 1 });
  });

  it('falls back to Woolly if the original art is not there, and leaves builtin if neither is', () => {
    const a = fake({ pack: 'builtin' });
    expect(migratePrefs(a, ['builtin', 'woolly'])).toBe('woolly');
    expect(a.data.pack).toBe('woolly');
    const b = fake({ pack: 'builtin' });
    expect(migratePrefs(b, ['builtin'])).toBeNull();
    expect(b.data).toMatchObject({ pack: 'builtin', version: PREFS_VERSION });
  });

  it('keeps a pack the user chose, but still records the version', () => {
    const s = fake({ pack: 'woolly' });
    expect(migratePrefs(s, ALL)).toBeNull();
    expect(s.data).toMatchObject({ pack: 'woolly', version: PREFS_VERSION });
  });

  it('runs once: a user who picks the bouncing sheep afterwards keeps it', () => {
    const s = fake({ pack: 'builtin' });
    migratePrefs(s, ALL);
    s.set('pack', 'builtin'); // a deliberate choice in Settings
    expect(migratePrefs(s, ALL)).toBeNull();
    expect(s.data.pack).toBe('builtin');
  });

  it('treats a junk version as the old one, and does nothing for newer versions', () => {
    const junk = fake({ pack: 'builtin', version: 'x' });
    expect(migratePrefs(junk, ALL)).toBe('original');
    const newer = fake({ pack: 'builtin', version: 3 });
    expect(migratePrefs(newer, ALL)).toBeNull();
    expect(newer.data.pack).toBe('builtin');
  });
});
