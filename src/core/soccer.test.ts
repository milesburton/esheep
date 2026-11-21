import { describe, expect, it } from 'vitest';
import {
  GOAL_DEPTH,
  GOAL_HEIGHT,
  KICKOFF_MS,
  WIN_SCORE,
  attackDir,
  formatScore,
  goalsFor,
  kickoffSpot,
  other,
  startMatch,
  stepMatch,
  teamOf,
  type Match,
} from './soccer';

const AREA: Rect = { x: 0, y: 0, width: 1000, height: 600 };
const SIZE = 14;
const goals = goalsFor([AREA], SIZE);
if (!goals) throw new Error('no goals');
const ballIn = (g: Rect): Rect => ({
  x: g.x + 2,
  y: g.y + g.height - SIZE,
  width: SIZE,
  height: SIZE,
});
const MID: Rect = { x: 500, y: 580, width: SIZE, height: SIZE };
const live = (m: Match): number => m.restartUntil + 1;

describe('teams', () => {
  it('alternate by id order, so the sides stay balanced', () => {
    const ids = [30, 10, 20, 40];
    expect(ids.map((i) => teamOf(i, ids))).toEqual(['red', 'red', 'blue', 'blue']);
    expect(teamOf(10, ids)).toBe('red');
    expect(teamOf(20, ids)).toBe('blue');
  });
  it('has no team for a sheep that is not playing', () => {
    expect(teamOf(99, [1, 2])).toBeNull();
  });
  it('red attacks right and blue attacks left', () => {
    expect(attackDir('red')).toBe(1);
    expect(attackDir('blue')).toBe(-1);
    expect(other('red')).toBe('blue');
  });
});

describe('goals', () => {
  it('sit on the floor at both ends of the display', () => {
    expect(goals.left).toEqual({
      x: 0,
      y: 600 - SIZE * GOAL_HEIGHT,
      width: SIZE * GOAL_DEPTH,
      height: SIZE * GOAL_HEIGHT,
    });
    expect(goals.right.x + goals.right.width).toBe(1000);
    expect(goals.right.y + goals.right.height).toBe(600);
  });
  it('span the far ends of several displays', () => {
    const g = goalsFor(
      [
        { x: 1000, y: 0, width: 800, height: 500 },
        { x: 0, y: 0, width: 1000, height: 600 },
      ],
      SIZE,
    );
    expect(g?.left.x).toBe(0);
    expect((g?.left.y ?? 0) + (g?.left.height ?? 0)).toBe(600);
    expect((g?.right.x ?? 0) + (g?.right.width ?? 0)).toBe(1800);
    expect((g?.right.y ?? 0) + (g?.right.height ?? 0)).toBe(500);
  });
  it('do not exist without a display', () => {
    expect(goalsFor([], SIZE)).toBeNull();
  });
  it('put the kick-off spot in the middle of the primary display', () => {
    expect(kickoffSpot([AREA], SIZE)).toEqual({ x: 493, y: 20 });
  });
});

describe('scoring', () => {
  it('starts nil-nil with a kick-off pause', () => {
    const m = startMatch(1000);
    expect(m.score).toEqual({ red: 0, blue: 0 });
    expect(m.restartUntil).toBe(1000 + KICKOFF_MS);
    expect(formatScore(m)).toBe('RED 0 – 0 BLUE');
  });
  it('ignores a ball in a goal during the kick-off pause', () => {
    const m = startMatch(0);
    const r = stepMatch(m, ballIn(goals.right), goals, KICKOFF_MS - 1);
    expect(r.scored).toBeNull();
    expect(r.match).toBe(m);
  });
  it('a ball in the right goal is a goal for red, and in the left goal for blue', () => {
    const m = startMatch(0);
    const red = stepMatch(m, ballIn(goals.right), goals, live(m));
    expect(red.scored).toBe('red');
    expect(red.match.score).toEqual({ red: 1, blue: 0 });
    const blue = stepMatch(m, ballIn(goals.left), goals, live(m));
    expect(blue.scored).toBe('blue');
    expect(blue.match.score).toEqual({ red: 0, blue: 1 });
    expect(blue.match.lastScorer).toBe('blue');
  });
  it('pauses for a new kick-off after a goal, so one shot scores once', () => {
    const m = startMatch(0);
    const t = live(m);
    const first = stepMatch(m, ballIn(goals.right), goals, t);
    const again = stepMatch(first.match, ballIn(goals.right), goals, t + 10);
    expect(again.scored).toBeNull();
    expect(again.match.score.red).toBe(1);
    expect(first.match.restartUntil).toBe(t + KICKOFF_MS);
  });
  it('does nothing for a ball in play, no ball, or no goals', () => {
    const m = startMatch(0);
    expect(stepMatch(m, MID, goals, live(m)).scored).toBeNull();
    expect(stepMatch(m, null, goals, live(m)).match).toBe(m);
    expect(stepMatch(m, ballIn(goals.left), null, live(m)).match).toBe(m);
  });
  it('a ball above the goal mouth is a miss', () => {
    const m = startMatch(0);
    const high: Rect = { x: 2, y: goals.left.y - SIZE * 2, width: SIZE, height: SIZE };
    expect(stepMatch(m, high, goals, live(m)).scored).toBeNull();
  });
  it('ends the match when a team reaches the winning score, and then stops scoring', () => {
    let m = startMatch(0);
    let now = live(m);
    for (let i = 0; i < WIN_SCORE; i++) {
      m = stepMatch(m, ballIn(goals.right), goals, now).match;
      now = live(m);
    }
    expect(m.winner).toBe('red');
    expect(m.score.red).toBe(WIN_SCORE);
    const after = stepMatch(m, ballIn(goals.left), goals, now + 10_000);
    expect(after.scored).toBeNull();
    expect(after.match.score.blue).toBe(0);
  });
});
