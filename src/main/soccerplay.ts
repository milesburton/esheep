import { ballRect } from '../core/ball';
import {
  attackDir,
  goalsFor,
  kickoffSpot,
  startMatch,
  stepMatch,
  teamOf,
  type Goals,
  type Match,
  type Team,
} from '../core/soccer';
import type { BallState } from './kickabout';

/** A match is cut off after this long, so it can never run forever (it is opt-in). */
export const MATCH_LIMIT_MS = 300_000;
/** The final score stays up this long after the winning goal. */
export const FINISH_SHOW_MS = 8000;

export interface SoccerPlayDeps {
  /** The ids of the sheep that can play. */
  sheepIds: () => number[];
  /** The ball's side in px (depends on the sprite scale). */
  size: () => number;
  /** Display work areas, primary first. */
  areas: () => readonly Rect[];
  now: () => number;
  /** The shared ball (the same one kick-about uses). */
  ball: {
    start(limitMs?: number): void;
    stop(): void;
    active(): boolean;
    state(): BallState | null;
    place(x: number, y: number): void;
  };
}

/** What one sheep is told: its team and the way it attacks. */
export interface TeamView {
  readonly team: Team;
  readonly dir: 1 | -1;
}

export interface SoccerState {
  readonly match: Match;
  readonly goals: Goals | null;
  /** True once the match is over and the result is being shown. */
  readonly finished: boolean;
}

export interface SoccerPlay {
  start(): void;
  stop(): void;
  active(): boolean;
  /** Advance the match; returns the team that just scored, if any. A finished match stops itself. */
  tick(): Team | null;
  view(id: number): TeamView | null;
  state(): SoccerState | null;
}

export const createSoccerPlay = (deps: SoccerPlayDeps): SoccerPlay => {
  let match: Match | null = null;
  let endAt: number | null = null;

  const kickoff = (): void => {
    const spot = kickoffSpot(deps.areas(), deps.size());
    deps.ball.place(spot.x, spot.y);
  };

  const stop = (): void => {
    const was = match !== null;
    match = null;
    endAt = null;
    if (was) deps.ball.stop(); // never take away a kick-about ball that is not ours
  };

  return {
    start: () => {
      if (match) return;
      if (!deps.ball.active()) deps.ball.start(MATCH_LIMIT_MS);
      match = startMatch(deps.now());
      endAt = null;
      kickoff();
    },
    stop,
    active: () => match !== null,
    tick: () => {
      if (!match) return null;
      const now = deps.now();
      if (endAt !== null) {
        if (now >= endAt) stop();
        return null;
      }
      const b = deps.ball.state();
      if (!b) {
        stop(); // the ball's own time limit ran out
        return null;
      }
      const r = stepMatch(match, ballRect(b, b.size), goalsFor(deps.areas(), b.size), now);
      match = r.match;
      if (r.scored) {
        if (match.winner) endAt = now + FINISH_SHOW_MS;
        else kickoff();
      }
      return r.scored;
    },
    view: (id) => {
      if (!match) return null;
      const team = teamOf(id, deps.sheepIds());
      return team ? { team, dir: attackDir(team) } : null;
    },
    state: () =>
      match
        ? { match, goals: goalsFor(deps.areas(), deps.size()), finished: endAt !== null }
        : null,
  };
};
