import { startTag, stepTag, viewFor, type Sprite, type TagGame, type TagView } from '../core/tag';

export interface TagPlayDeps {
  /** Every sheep that can play, with its sprite rectangle in screen px. */
  sprites: () => Sprite[];
  /** Sprite side in px (the sprite scale). */
  size: () => number;
  /** Milliseconds clock. */
  now: () => number;
}

export interface TagPlay {
  start(pick?: number): void;
  stop(): void;
  active(): boolean;
  /** Advance the game; returns the swap if "it" just tagged somebody. */
  tick(): { from: number; to: number } | null;
  /** What sheep `id` should do right now (null if no game, or it is not playing). */
  view(id: number): TagView | null;
  state(): { it: number | null; tags: number } | null;
}

export const createTagPlay = (deps: TagPlayDeps): TagPlay => {
  let game: TagGame | null = null;
  return {
    start: (pick = 0) => {
      if (!game) game = startTag(deps.sprites(), deps.now(), pick);
    },
    stop: () => {
      game = null;
    },
    active: () => game !== null,
    tick: () => {
      if (!game) return null;
      const r = stepTag(game, deps.sprites(), deps.size(), deps.now());
      game = r.game;
      return r.tagged;
    },
    view: (id) => (game ? viewFor(game, id, deps.sprites(), deps.size(), deps.now()) : null),
    state: () => (game ? { it: game.it, tags: game.tags } : null),
  };
};
