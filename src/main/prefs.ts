import { BUILTIN } from './pack';

/**
 * Preferences schema version. v1 (releases up to 0.1.1) defaulted to the generated bouncing sheep
 * (`builtin`, a 128px window), which is not the intended art. electron-store *persists* its defaults
 * on first run, so changing the default alone would leave every existing install on the wrong sheep.
 */
export const PREFS_VERSION = 2;

/** The part of electron-store the migration needs (so it can be tested without Electron). */
export interface PrefsStore {
  get(key: 'pack' | 'version'): unknown;
  set(key: 'pack' | 'version', value: string | number): void;
}

/** What a stored `builtin` pack is replaced with: the original art if it is bundled, else Woolly. */
const preferred = (packs: readonly string[]): string | null =>
  packs.includes('original') ? 'original' : packs.includes('woolly') ? 'woolly' : null;

/**
 * One-time upgrade of stored preferences. Returns the pack it switched to, or null if nothing changed.
 * A user who picks the bouncing sheep *after* this has run (version already 2) keeps it.
 */
export const migratePrefs = (store: PrefsStore, packs: readonly string[]): string | null => {
  const version = Number(store.get('version')) || 1;
  if (version >= PREFS_VERSION) return null;
  const next = store.get('pack') === BUILTIN ? preferred(packs) : null;
  if (next) store.set('pack', next);
  store.set('version', PREFS_VERSION);
  return next;
};
