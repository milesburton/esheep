/**
 * Soccer: two teams, a goal at each end of the screen, a score, and a kick-off after every goal.
 * Pure and id-based (like tag), so the demo (one process) and the Electron main process (one window per
 * sheep) both run it. It owns no ball: callers pass the ball's rectangle in and move it themselves.
 */

export type Team = 'red' | 'blue';

export interface Match {
  readonly score: Readonly<Record<Team, number>>;
  /** Goals are ignored until this time (ms): the kick-off pause after the start or a goal. */
  readonly restartUntil: number;
  /** Who scored last (null before the first goal). */
  readonly lastScorer: Team | null;
  /** Set once a team reaches `WIN_SCORE`. */
  readonly winner: Team | null;
}

/** The two goal mouths (screen px): `left` is red's goal, `right` is blue's. */
export interface Goals {
  readonly left: Rect;
  readonly right: Rect;
}

/** First to this many goals wins. */
export const WIN_SCORE = 5;
/** Pause after the start and after each goal, in ms. */
export const KICKOFF_MS = 2500;
/** A goal is this many ball-widths deep and tall. */
export const GOAL_DEPTH = 2;
export const GOAL_HEIGHT = 9;

export const TEAMS: readonly Team[] = ['red', 'blue'];
export const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');

/** The side each team attacks: red kicks right, blue kicks left. */
export const attackDir = (t: Team): 1 | -1 => (t === 'red' ? 1 : -1);

/** Alternate sheep between the teams by id order, so the sides stay balanced as sheep come and go. */
export const teamOf = (id: number, ids: readonly number[]): Team | null => {
  const i = [...ids].sort((a, b) => a - b).indexOf(id);
  return i < 0 ? null : i % 2 === 0 ? 'red' : 'blue';
};

export const startMatch = (now: number): Match => ({
  score: { red: 0, blue: 0 },
  restartUntil: now + KICKOFF_MS,
  lastScorer: null,
  winner: null,
});

const bounds = (areas: readonly Rect[]): { left: Rect; right: Rect } | null => {
  if (areas.length === 0) return null;
  const left = areas.reduce((a, b) => (b.x < a.x ? b : a));
  const right = areas.reduce((a, b) => (b.x + b.width > a.x + a.width ? b : a));
  return { left, right };
};

/** Goal mouths on the floor at the far left and far right of the display area. `size` is the ball's side. */
export const goalsFor = (areas: readonly Rect[], size: number): Goals | null => {
  const ends = bounds(areas);
  if (!ends) return null;
  const width = size * GOAL_DEPTH;
  const height = size * GOAL_HEIGHT;
  const mouth = (a: Rect, x: number): Rect => ({
    x,
    y: a.y + a.height - height,
    width,
    height,
  });
  return {
    left: mouth(ends.left, ends.left.x),
    right: mouth(ends.right, ends.right.x + ends.right.width - width),
  };
};

/** Where the ball is put for a kick-off: the middle of the primary area, dropped from near the top. */
export const kickoffSpot = (areas: readonly Rect[], size: number): { x: number; y: number } => {
  const a = areas[0] ?? { x: 0, y: 0, width: 800, height: 600 };
  return { x: Math.round(a.x + a.width / 2 - size / 2), y: a.y + 20 };
};

const hit = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Advance the match: score if the ball is in a goal mouth (outside the kick-off pause). */
export const stepMatch = (
  m: Match,
  ball: Rect | null,
  goals: Goals | null,
  now: number,
): { match: Match; scored: Team | null } => {
  if (m.winner || !ball || !goals || now < m.restartUntil) return { match: m, scored: null };
  // The ball in the LEFT goal is a goal for blue (who attack left), and vice versa.
  const scored: Team | null = hit(ball, goals.left)
    ? 'blue'
    : hit(ball, goals.right)
      ? 'red'
      : null;
  if (!scored) return { match: m, scored: null };
  const score = { ...m.score, [scored]: m.score[scored] + 1 };
  return {
    match: {
      score,
      restartUntil: now + KICKOFF_MS,
      lastScorer: scored,
      winner: score[scored] >= WIN_SCORE ? scored : null,
    },
    scored,
  };
};

export const formatScore = (m: Match): string => `RED ${m.score.red} – ${m.score.blue} BLUE`;
