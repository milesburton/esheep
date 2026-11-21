import { describe, expect, it } from 'vitest';
import { goalsFor, KICKOFF_MS, WIN_SCORE } from '../core/soccer';
import { createKickAbout } from './kickabout';
import { createSoccerPlay, FINISH_SHOW_MS, MATCH_LIMIT_MS } from './soccerplay';
import { world } from '../test/fixtures';

const SIZE = 14;
const setup = (ids: number[] = [1, 2, 3, 4]) => {
  const clock = { now: 0 };
  const ball = createKickAbout({
    size: () => SIZE,
    world: () => world(),
    areas: () => world().areas,
  });
  const play = createSoccerPlay({
    sheepIds: () => ids,
    size: () => SIZE,
    areas: () => world().areas,
    now: () => clock.now,
    ball,
  });
  const goals = goalsFor(world().areas, SIZE);
  if (!goals) throw new Error('no goals');
  /** Put the ball in a goal mouth and let the match see it. */
  const shoot = (g: Rect) => {
    ball.place(g.x + 2, g.y + g.height - SIZE);
    return play.tick();
  };
  const kickOff = () => {
    clock.now += KICKOFF_MS + 10;
  };
  return { clock, ball, play, goals, shoot, kickOff };
};

describe('soccer play controller', () => {
  it('has nothing until started, and a match brings its own ball', () => {
    const { play, ball } = setup();
    expect(play.active()).toBe(false);
    expect(play.state()).toBeNull();
    expect(play.view(1)).toBeNull();
    play.start();
    expect(play.active()).toBe(true);
    expect(ball.active()).toBe(true);
    expect(play.state()?.match.score).toEqual({ red: 0, blue: 0 });
  });

  it('tells each sheep its team and the way it attacks', () => {
    const { play } = setup([4, 2, 8, 6]);
    play.start();
    expect(play.view(2)).toEqual({ team: 'red', dir: 1 });
    expect(play.view(4)).toEqual({ team: 'blue', dir: -1 });
    expect(play.view(6)).toEqual({ team: 'red', dir: 1 });
    expect(play.view(99)).toBeNull();
  });

  it('scores when the ball goes in a goal, then puts the ball back in the middle', () => {
    const { play, ball, goals, shoot, kickOff } = setup();
    play.start();
    kickOff();
    expect(shoot(goals.right)).toBe('red');
    expect(play.state()?.match.score).toEqual({ red: 1, blue: 0 });
    expect(ball.state()).toMatchObject({ x: 493, y: 20, vx: 0, vy: 0 });
    kickOff();
    expect(shoot(goals.left)).toBe('blue');
    expect(play.state()?.match.score).toEqual({ red: 1, blue: 1 });
  });

  it('does not score during the kick-off pause', () => {
    const { play, goals, shoot } = setup();
    play.start();
    expect(shoot(goals.right)).toBeNull();
    expect(play.state()?.match.score.red).toBe(0);
  });

  it('shows the result after the winning goal, then ends itself and takes the ball away', () => {
    const { play, ball, goals, shoot, kickOff, clock } = setup();
    play.start();
    for (let i = 0; i < WIN_SCORE; i++) {
      kickOff();
      shoot(goals.right);
    }
    expect(play.state()).toMatchObject({ finished: true, match: { winner: 'red' } });
    expect(play.active()).toBe(true);
    clock.now += FINISH_SHOW_MS - 100;
    play.tick();
    expect(play.active()).toBe(true);
    clock.now += 200;
    play.tick();
    expect(play.active()).toBe(false);
    expect(ball.active()).toBe(false);
  });

  it('stops when the ball goes away (its time limit) and stop() clears everything', () => {
    const { play, ball } = setup();
    play.start();
    ball.stop();
    expect(play.tick()).toBeNull();
    expect(play.active()).toBe(false);
    play.start();
    play.stop();
    expect(play.active()).toBe(false);
    expect(ball.active()).toBe(false);
  });

  it('stopping when no match is on leaves a plain kick-about ball alone', () => {
    const { play, ball } = setup();
    ball.start();
    play.stop();
    expect(ball.active()).toBe(true);
  });

  it('a match outlasts a kick-about but not forever', () => {
    const { play, ball } = setup();
    play.start();
    for (let t = 0; t < MATCH_LIMIT_MS + 1000; t += 50) ball.tick(50);
    expect(ball.active()).toBe(false);
    expect(play.tick()).toBeNull();
    expect(play.active()).toBe(false);
  });
});
