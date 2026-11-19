import { describe, expect, it } from 'vitest';
import { evalExpr } from './expr.js';

describe('evalExpr', () => {
  it.each([
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    ['-4', -4],
    ['+4', 4],
    ['10/4', 2.5],
    ['2*-3', -6],
    ['.5+.25', 0.75],
    ['  7 ', 7],
    ['', 0],
  ])('evaluates %s = %d', (src, expected) => {
    expect(evalExpr(src, {})).toBe(expected);
  });

  it('substitutes variables and treats unknown ones as 0', () => {
    expect(evalExpr('screenW/2-imageW', { screenW: 1000, imageW: 80 })).toBe(420);
    expect(evalExpr('nope+1', {})).toBe(1);
  });

  it('collapses division by zero and non-finite results to 0', () => {
    expect(evalExpr('5/0', {})).toBe(0);
    expect(evalExpr('x', { x: Infinity })).toBe(0);
  });

  it('tolerates a missing closing parenthesis and stray tokens', () => {
    expect(evalExpr('(2+3', {})).toBe(5);
    expect(evalExpr('2 $ 3', {})).toBe(2); // trailing tokens are ignored
  });

  it('handles the expressions real packs use', () => {
    const vars = { random: 50, screenW: 1920, imageW: 80, areaH: 1040, imageH: 80, randS: 60 };
    expect(evalExpr('random*(screenW-imageW-50)/100+25', vars)).toBeCloseTo(920);
    expect(evalExpr('areaH/2-(randS*areaH/2)/120-imageH', vars)).toBeCloseTo(180);
    expect(evalExpr('(screenW/2)/30-6', vars)).toBe(26);
  });

  it('never executes code', () => {
    expect(evalExpr('process.exit()', {})).toBe(0);
  });
});
