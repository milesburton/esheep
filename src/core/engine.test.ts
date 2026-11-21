import { describe, expect, it } from 'vitest';
import {
  compilePack,
  grab,
  isHeld,
  isThrown,
  moveHeld,
  release,
  play,
  sheepRect,
  spawn,
  update,
  type CompiledPack,
  type SheepState,
  type Update,
} from './engine.js';
import { CFG, anim, compiled, miniPack, next, world } from '../test/fixtures.js';

const FLOOR_Y = 600 - CFG.size;

/** Run `ms` of simulated time in 16ms frames, collecting every animation that started. */
const run = (
  cp: CompiledPack,
  s: SheepState,
  w: World,
  ms: number,
): { state: SheepState; started: string[] } => {
  let state = s;
  const started: string[] = [];
  for (let t = 0; t < ms; t += 16) {
    const u = update(cp, state, w, CFG, 16);
    state = u.state;
    started.push(...u.started);
  }
  return { state, started };
};

const spawned = (cp = compiled(), seed = 1): Update => spawn(cp, world(), CFG, seed);
const standing = (cp = compiled(), over: Partial<SheepState> = {}): SheepState => ({
  ...spawned(cp).state,
  entered: true,
  ...over,
});

describe('spawn', () => {
  it('places the sheep from the pack spawn expressions and starts its animation', () => {
    const u = spawned();
    expect(u.state).toMatchObject({ x: 100, y: FLOOR_Y, animName: 'walk', flipped: false });
    expect(u.started).toEqual(['walk']);
  });

  it('is deterministic for a seed', () => {
    expect(spawned(compiled(), 5).state).toEqual(spawned(compiled(), 5).state);
  });

  it('picks among weighted spawns, depending on the seed', () => {
    const cp = compiled({
      spawns: [
        { p: 50, x: '10', y: '0', next: 1 },
        { p: 50, x: '900', y: '0', next: 1 },
      ],
    });
    const xs = new Set(Array.from({ length: 30 }, (_, i) => spawn(cp, world(), CFG, i).state.x));
    expect(xs).toEqual(new Set([10, 900]));
  });

  it('falls back to the top-centre when a pack has no spawns', () => {
    const u = spawn(compiled({ spawns: [] }), world(), CFG, 1);
    expect(u.state.x).toBe(500);
    expect(u.state.y).toBe(0);
  });

  it('falls back to animation 1 when the spawn names an unknown animation', () => {
    const cp = compiled({ spawns: [{ p: 1, x: '0', y: '0', next: 999 }] });
    expect(spawn(cp, world(), CFG, 1).state.animName).toBe('walk');
  });

  it('survives an empty animation (no frames) and clamps repeatFrom', () => {
    const cp = compiled({
      animations: [anim({ id: 1, name: 'blank', frames: [], repeatFrom: '99', next: [next(1)] })],
    });
    const { state } = run(cp, spawned(cp).state, world(), 400);
    expect(state.frame).toBe(0);
  });
});

describe('walking', () => {
  it('walks left at the pack speed times the scale, cycling frames', () => {
    const cp = compiled();
    const s0 = standing(cp);
    const a = update(cp, s0, world(), CFG, 100).state;
    expect(a.x).toBe(s0.x - 10);
    expect(a.frame).toBe(0);
    const b = update(cp, a, world(), CFG, 100).state;
    expect(b.x).toBe(s0.x - 20);
    expect(b.frame).toBe(1);
  });

  it('does not move until a full interval has elapsed', () => {
    const cp = compiled();
    const s0 = standing(cp);
    expect(update(cp, s0, world(), CFG, 50).state.x).toBe(s0.x);
  });

  it('plays repeat loops, then chooses the next animation', () => {
    const cp = compiled(); // 2 frames + 2*(2 repeats) = 6 steps
    const { started } = run(cp, standing(cp), world(), 1000);
    expect(started.filter((n) => n === 'walk').length).toBeGreaterThanOrEqual(1);
  });

  it('survives a huge time step without hanging', () => {
    const cp = compiled();
    const u = update(cp, standing(cp), world(), CFG, 10_000_000);
    expect(Number.isFinite(u.state.x)).toBe(true);
  });
});

describe('borders, turning and contexts', () => {
  it('turns around at the screen edge: border → turn (flip) → walks the other way', () => {
    const cp = compiled();
    const wall = standing(cp, { x: 4 });
    const { state, started } = run(cp, wall, world(), 600);
    expect(started).toContain('turn');
    expect(state.flipped).toBe(true);
    expect(state.x).toBeGreaterThan(4);
  });

  it('never leaves the display once it has entered', () => {
    const cp = compiled();
    const states = Array.from({ length: 200 }).reduce<{
      s: SheepState;
      minX: number;
      maxX: number;
    }>(
      (acc) => {
        const s = update(cp, acc.s, world(), CFG, 100).state;
        return { s, minX: Math.min(acc.minX, s.x), maxX: Math.max(acc.maxX, s.x) };
      },
      { s: standing(cp), minX: Infinity, maxX: -Infinity },
    );
    expect(states.minX).toBeGreaterThanOrEqual(0);
    expect(states.maxX + CFG.size).toBeLessThanOrEqual(1001); // sub-pixel tolerance of onScreen
  });

  it('can walk in from off-screen before it has "entered"', () => {
    const cp = compiled({ spawns: [{ p: 1, x: 'screenW+10', y: 'areaH-imageH', next: 1 }] });
    const s0 = spawn(cp, world(), CFG, 1).state;
    expect(s0.entered).toBe(false);
    const { state } = run(cp, s0, world(), 3000);
    expect(state.entered).toBe(true);
    expect(state.x + CFG.size).toBeLessThanOrEqual(1000);
  });

  it('a sheep that spawns above the screen already walking is pulled down by gravity', () => {
    const cp = compiled({ spawns: [{ p: 1, x: '300', y: '-imageH-20', next: 1 }] });
    const { state, started } = run(cp, spawn(cp, world(), CFG, 1).state, world(), 6000);
    expect(started).toContain('fall');
    expect(state.entered).toBe(true);
    expect(state.y).toBe(FLOOR_Y);
  });

  const contextPack = (only: string, walkDy = '0'): CompiledPack =>
    compiled({
      animations: [
        anim({
          id: 1,
          name: 'walk',
          start: { x: '-5', y: walkDy, offsety: '0', opacity: '1', interval: '100' },
          end: { x: '-5', y: walkDy, offsety: '0', opacity: '1', interval: '100' },
          frames: [0],
          border: [next(7, 100, only)],
          next: [next(1)],
        }),
        anim({ id: 7, name: 'special', frames: [1], next: [next(1)] }),
      ],
    });

  it('picks a "vertical" transition when touching a side wall', () => {
    const cp = contextPack('vertical');
    const { started } = run(cp, standing(cp, { x: 2 }), world(), 200);
    expect(started).toContain('special');
  });

  it('treats vertical+ like vertical', () => {
    const cp = contextPack('vertical+');
    expect(run(cp, standing(cp, { x: 2 }), world(), 200).started).toContain('special');
  });

  it('picks a "horizontal+" transition when touching the top edge', () => {
    const cp = contextPack('horizontal+', '-5');
    const { started } = run(cp, standing(cp, { x: 400, y: 3 }), world(), 300);
    expect(started).toContain('special');
  });

  it('picks a "windowSide" transition when blocked by a window wall', () => {
    const cp = contextPack('windowSide');
    const w = world({ windows: [{ x: 200, y: 300, width: 300, height: 200 }] });
    const s = standing(cp, { x: 510, y: 372 });
    const { started, state } = run(cp, s, w, 300);
    expect(started).toContain('special');
    expect(state.x).toBeGreaterThanOrEqual(500);
  });

  it('never picks "petSide" (there are no other pets) and keeps going', () => {
    const cp = contextPack('petSide');
    const { started, state } = run(cp, standing(cp, { x: 2 }), world(), 400);
    expect(started).not.toContain('special');
    expect(state.x).toBeGreaterThanOrEqual(0);
  });

  it('only offers "taskbar" / "window" transitions in the matching context', () => {
    const mk = (only: string): CompiledPack =>
      compiled({
        animations: [
          anim({
            id: 1,
            name: 'walk',
            frames: [0],
            next: [next(7, 100, only), next(1, 1)],
          }),
          anim({ id: 7, name: 'special', frames: [1], next: [next(1)] }),
        ],
      });
    const onFloor = (cp: CompiledPack): string[] => run(cp, standing(cp), world(), 400).started;
    expect(onFloor(mk('taskbar'))).toContain('special');
    expect(onFloor(mk('window'))).not.toContain('special');

    const w = world({ windows: [{ x: 0, y: 300, width: 500, height: 100 }] });
    const cp = mk('window');
    const onWindow = standing(cp, { x: 100, y: 300 - CFG.size });
    expect(run(cp, onWindow, w, 400).started).toContain('special');
  });

  it('falls back to animation 1 when a sequence has no eligible next', () => {
    const cp = compiled({
      animations: [
        anim({ id: 1, name: 'walk', frames: [0], next: [next(7, 100, 'window')] }),
        anim({ id: 7, name: 'special' }),
      ],
    });
    const { started } = run(cp, standing(cp), world(), 400);
    expect(started.every((n) => n === 'walk')).toBe(true);
  });
});

describe('standing on a window near the top of the display', () => {
  // The window top is only 100px below the screen top, so the 128px sprite sticks out above it.
  const w = world({ windows: [{ x: 100, y: 100, width: 500, height: 300 }] });

  it('still counts as on screen: stays on the window and turns at the display edge', () => {
    const cp = compiled();
    const s0: SheepState = { ...standing(cp, { x: 200, y: 100 - CFG.size }) };
    const { state } = run(cp, s0, w, 20_000);
    expect(state.entered).toBe(true);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.x + CFG.size).toBeLessThanOrEqual(1001);
  });

  it('counts as having entered once its lower body is on a display, not before', () => {
    const at = (y: string): SheepState =>
      spawn(compiled({ spawns: [{ p: 1, x: '100', y, next: 1 }] }), world(), CFG, 1).state;
    const cp = compiled();
    expect(update(cp, at('-60'), world(), CFG, 100).state.entered).toBe(true); // lower half on screen
    expect(update(cp, at('-120'), world(), CFG, 100).state.entered).toBe(false); // lower half still above
  });
});

describe('hopping onto a window', () => {
  // Window reaching the floor: its top is 200px up, within hopping range for a 128px sprite.
  const w = world({ windows: [{ x: 500, y: 300, width: 300, height: 300 }] });
  const withJump = (): CompiledPack => {
    const base = miniPack();
    return compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({ id: 7, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
      ],
    });
  };
  const atWall = (cp: CompiledPack, seed: number): SheepState => ({
    ...spawn(cp, w, CFG, seed).state,
    x: 500 - CFG.size,
    y: FLOOR_Y,
    flipped: true, // walking right, into the window
    entered: true,
  });

  it('meets a climbable window side, jumps and ends up standing on its top', () => {
    const cp = withJump();
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const hopped = seeds
      .map((seed) => run(cp, atWall(cp, seed), w, 3000))
      .filter((r) => r.started.includes('jump'));
    expect(hopped.length).toBeGreaterThan(3);
    for (const r of hopped) {
      expect(r.state.y).toBeCloseTo(300 - CFG.size, 0);
      expect(r.state.x).toBeGreaterThanOrEqual(500 - 1);
    }
  });

  it('spots a floating window ledge ahead while walking and hops up onto its top', () => {
    const cp = withJump();
    const ledge = world({ windows: [{ x: 500, y: 250, width: 300, height: 150 }] });
    const walkingRight = (seed: number): SheepState => ({
      ...atWall(cp, seed),
      x: 500 - CFG.size - 70,
      flipped: true,
    });
    const hopped = Array.from({ length: 30 }, (_, i) =>
      run(cp, walkingRight(i + 1), ledge, 1200),
    ).filter((r) => r.started.includes('jump'));
    expect(hopped.length).toBeGreaterThan(2);
    expect(hopped.some((r) => Math.abs(r.state.y - (250 - CFG.size)) < 1)).toBe(true);
  });

  it('does not hop when the window top is out of reach, or the pack has no jump', () => {
    const tall = world({ windows: [{ x: 500, y: 10, width: 300, height: 590 }] });
    const cp = withJump();
    const s = { ...atWall(cp, 1), y: FLOOR_Y };
    expect(run(cp, s, tall, 3000).started).not.toContain('jump');
    const plain = compiled();
    expect(run(plain, atWall(plain, 1), w, 3000).started).not.toContain('jump');
  });
});

describe('leaping over other sheep', () => {
  const jumpPack = (): CompiledPack => {
    const base = miniPack();
    return compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({ id: 7, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
      ],
    });
  };
  const at = (x: number, y = FLOOR_Y): Rect => ({ x, y, width: CFG.size, height: CFG.size });
  // Facing right (the art faces left), so it walks right.
  const walker = (cp: CompiledPack, seed: number, x = 200): SheepState => ({
    ...spawn(cp, world(), CFG, seed).state,
    x,
    y: FLOOR_Y,
    flipped: true,
    entered: true,
  });
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);

  it('jumps over a sheep in its path and lands on the far side, on the same floor', () => {
    const cp = jumpPack();
    const blocker = at(200 + CFG.size + 10);
    const w = world({ others: [blocker] });
    const hopped = seeds
      .map((seed) => run(cp, walker(cp, seed), w, 1500))
      .filter((r) => r.started.includes('jump'));
    const leapt = hopped.filter((r) => r.state.y === FLOOR_Y); // the rest climbed onto its back
    expect(leapt.length).toBeGreaterThan(2);
    for (const r of leapt) expect(r.state.x).toBeGreaterThan(blocker.x + blocker.width - 1);
  });

  it('leaps leftwards too', () => {
    const cp = jumpPack();
    const blocker = at(600);
    const w = world({ others: [blocker] });
    const left = (seed: number): SheepState => ({
      ...walker(cp, seed, 600 + CFG.size + 10),
      flipped: false,
    });
    const hopped = seeds
      .map((seed) => run(cp, left(seed), w, 1500))
      .filter((r) => r.started.includes('jump') && r.state.y === FLOOR_Y);
    expect(hopped.length).toBeGreaterThan(2);
    for (const r of hopped) expect(r.state.x).toBeLessThan(blocker.x + 1);
  });

  it('does not leap over a sheep on a different level, behind it, or when the pack cannot jump', () => {
    const cp = jumpPack();
    const jumps = (w: World, c = cp, s = (n: number) => walker(c, n)): number =>
      seeds.filter((n) => run(c, s(n), w, 600).started.includes('jump')).length;
    expect(jumps(world({ others: [at(200 + CFG.size + 10, 100)] }))).toBe(0); // up in the air
    expect(jumps(world({ others: [at(10)] }))).toBe(0); // behind it
    const plain = compiled();
    expect(jumps(world({ others: [at(200 + CFG.size + 10)] }), plain)).toBe(0);
  });

  it('does not leap to a landing spot with no floor under it', () => {
    const cp = jumpPack();
    // Blocker right at the display edge: the far side is off-screen.
    const edge = at(1000 - CFG.size);
    const w = world({ others: [edge] });
    const s = (seed: number): SheepState => walker(cp, seed, 1000 - 2 * CFG.size - 5);
    // It may climb onto the blocker, but it never leaps over it into the void beyond the display.
    for (const n of seeds) {
      const r = run(cp, s(n), w, 600);
      expect(r.state.x).toBeLessThanOrEqual(edge.x + 1);
      expect(r.state.x + CFG.size).toBeLessThanOrEqual(1001);
    }
  });

  it('stops to greet a sheep it meets (the sync animation), then carries on', () => {
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({ id: 7, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
        anim({ id: 8, name: 'sync', frames: [12, 13], repeat: '3', next: [next(1)] }),
      ],
    });
    const blocker = at(200 + CFG.size + 10);
    const w = world({ others: [blocker] });
    const results = seeds.map((seed) => run(cp, walker(cp, seed), w, 3000));
    expect(results.filter((r) => r.started.includes('sync')).length).toBeGreaterThan(0);
    expect(results.filter((r) => r.started.includes('jump')).length).toBeGreaterThan(0);
    // Greeting never leaves it stuck: every run ends up beyond the other sheep or still walking.
    for (const r of results) expect(r.state.mode.kind).toBe('walk');
  });

  it("offers the pack's petSide transitions only while another sheep is right beside it", () => {
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: [
        ...base.animations.map((a) =>
          a.id === 1 ? { ...a, border: [next(7, 100, 'petSide')] } : a,
        ),
        anim({ id: 7, name: 'nap', frames: [8], next: [next(1)] }),
      ],
    });
    // Walking left into the screen edge with a sheep right beside it.
    const atEdge = (): SheepState => ({
      ...spawn(cp, world(), CFG, 1).state,
      x: 3,
      y: FLOOR_Y,
      flipped: false,
      entered: true,
    });
    const beside = world({ others: [at(CFG.size + 10)] });
    expect(run(cp, atEdge(), beside, 600).started).toContain('nap');
    expect(run(cp, atEdge(), world(), 600).started).not.toContain('nap');
    expect(run(cp, atEdge(), world({ others: [at(700)] }), 600).started).not.toContain('nap');
  });

  it('two sheep walking at each other get past one another', () => {
    const cp = jumpPack();
    let a = walker(cp, 1, 100);
    let b = { ...walker(cp, 2, 700), flipped: false };
    let jumps = 0;
    for (let t = 0; t < 12_000; t += 16) {
      const ua = update(cp, a, world({ others: [sheepRect(b, CFG)] }), CFG, 16);
      const ub = update(cp, b, world({ others: [sheepRect(a, CFG)] }), CFG, 16);
      a = ua.state;
      b = ub.state;
      jumps += [...ua.started, ...ub.started].filter((n) => n === 'jump').length;
      expect([a.x, a.y, b.x, b.y].every(Number.isFinite)).toBe(true);
      expect(a.y).toBeLessThanOrEqual(FLOOR_Y + 0.5);
    }
    expect(jumps).toBeGreaterThan(0);
  });
});

describe('chasing and kicking the ball', () => {
  const base = miniPack();
  const withRun = (): CompiledPack =>
    compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({
          id: 7,
          name: 'run',
          start: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          end: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          frames: [0, 1],
          repeat: '4',
          next: [next(1)],
        }),
        anim({ id: 8, name: 'kick', frames: [2, 3], next: [next(1)] }),
      ],
    });
  const ballAt = (x: number, y = FLOOR_Y + CFG.size - 14): Rect => ({
    x,
    y,
    width: 14,
    height: 14,
  });
  const walker = (cp: CompiledPack, x: number, flipped = false): SheepState => ({
    ...spawn(cp, world(), CFG, 3).state,
    x,
    y: FLOOR_Y,
    flipped,
    entered: true,
  });
  const runAll = (cp: CompiledPack, s0: SheepState, w: World, ms: number) => {
    let state = s0;
    const started: string[] = [];
    const kicks: { vx: number; vy: number }[] = [];
    for (let t = 0; t < ms; t += 16) {
      const u = update(cp, state, w, CFG, 16);
      state = u.state;
      started.push(...u.started);
      kicks.push(...(u.kicks ?? []));
    }
    return { state, started, kicks };
  };

  it('turns towards a ball it notices and breaks into a run', () => {
    const cp = withRun();
    const w = world({ ball: ballAt(800) });
    const r = runAll(cp, walker(cp, 100, false), w, 600); // facing left, ball is to the right
    expect(r.started).toContain('run');
    expect(r.state.flipped).toBe(true);
    expect(r.state.x).toBeGreaterThan(100);
  });

  it('kicks the ball away from itself once it reaches it, then waits out the cooldown', () => {
    const cp = withRun();
    const s = walker(cp, 400, true); // facing right
    const w = world({ ball: ballAt(400 + CFG.size + 5) });
    const r = runAll(cp, s, w, 300);
    expect(r.kicks.length).toBe(1);
    expect(r.kicks[0].vx).toBeGreaterThan(350); // away to the right
    expect(r.kicks[0].vy).toBeLessThan(0); // and up
    expect(r.started).toContain('kick');
    // Still there 300ms later: the cooldown stops a second kick straight away.
    expect(runAll(cp, r.state, w, 300).kicks.length).toBe(0);
  });

  it('kicks to the left when the ball is on its left', () => {
    const cp = withRun();
    const w = world({ ball: ballAt(400 - 14 - 5) });
    const r = runAll(cp, walker(cp, 400, false), w, 300);
    expect(r.kicks[0].vx).toBeLessThan(-350);
  });

  it('in a match, kicks only towards the goal it attacks', () => {
    const cp = withRun();
    const attackRight = world({ ball: ballAt(400 + CFG.size + 5), team: { dir: 1 } });
    const r = runAll(cp, walker(cp, 400, true), attackRight, 300);
    expect(r.kicks.length).toBe(1);
    expect(r.kicks[0].vx).toBeGreaterThan(350);
    const attackLeft = world({ ball: ballAt(400 + CFG.size + 5), team: { dir: -1 } });
    expect(runAll(cp, walker(cp, 400, true), attackLeft, 300).kicks.length).toBe(0);
  });

  it('in a match, a sheep on the wrong side runs past the ball and then kicks it the right way', () => {
    const cp = withRun();
    // Blue (attacks left) stands left of the ball, so it must get round to the ball's right first.
    const w = world({ ball: ballAt(500), team: { dir: -1 } });
    const r = runAll(cp, walker(cp, 420, true), w, 6000);
    expect(r.kicks.length).toBeGreaterThan(0);
    expect(r.kicks[0].vx).toBeLessThan(-350);
  });

  it('scales the kick with the sprite scale', () => {
    const cp = withRun();
    const w = world({ ball: ballAt(400 + CFG.size + 5) });
    const big = (() => {
      let state = walker(cp, 400, true);
      const kicks: { vx: number }[] = [];
      for (let t = 0; t < 300; t += 16) {
        const u = update(cp, state, w, { ...CFG, scale: 4 }, 16);
        state = u.state;
        kicks.push(...(u.kicks ?? []));
      }
      return kicks;
    })();
    expect(big[0].vx).toBeGreaterThan(4 * 350);
  });

  it('ignores a ball on another level, and a sheep that is asleep', () => {
    const cp = withRun();
    expect(
      runAll(cp, walker(cp, 400, true), world({ ball: ballAt(800, 100) }), 600).started,
    ).not.toContain('run');
    const asleep = compilePack({
      ...base,
      animations: [
        ...base.animations.map((a) => (a.id === 1 ? { ...a, name: 'sleep', repeat: '100' } : a)),
        anim({ id: 7, name: 'run', frames: [0] }),
      ],
    });
    const r = runAll(asleep, walker(asleep, 100), world({ ball: ballAt(800) }), 600);
    expect(r.started).not.toContain('run');
  });

  it('runs the whole way: a sheep chasing a ball on the far side eventually kicks it', () => {
    const cp = withRun();
    const r = runAll(cp, walker(cp, 50, false), world({ ball: ballAt(700) }), 8000);
    expect(r.kicks.length).toBeGreaterThan(0);
  });

  it('does nothing when there is no ball', () => {
    const cp = withRun();
    const r = runAll(cp, walker(cp, 400), world(), 2000);
    expect(r.kicks).toEqual([]);
    expect(r.started).not.toContain('kick');
  });

  it('still kicks if the pack has no kick animation (it just keeps running)', () => {
    const cp = compilePack({
      ...base,
      animations: [...base.animations, anim({ id: 7, name: 'run', frames: [0], next: [next(1)] })],
    });
    const r = runAll(cp, walker(cp, 400, true), world({ ball: ballAt(400 + CFG.size + 5) }), 300);
    expect(r.kicks.length).toBe(1);
  });
});

describe('standing on other sheep', () => {
  const jumpPack = (): CompiledPack => {
    const base = miniPack();
    return compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({ id: 7, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
      ],
    });
  };
  const at = (x: number, y = FLOOR_Y): Rect => ({ x, y, width: CFG.size, height: CFG.size });
  const backY = (o: Rect): number => o.y + CFG.size * 0.2 - CFG.size; // where a passenger's top ends up
  const walker = (cp: CompiledPack, seed: number, x: number): SheepState => ({
    ...spawn(cp, world(), CFG, seed).state,
    x,
    y: FLOOR_Y,
    flipped: true,
    entered: true,
  });
  const seeds = Array.from({ length: 16 }, (_, i) => i + 1);

  it('a sheep walking into another sometimes climbs onto its back and stands there', () => {
    const cp = jumpPack();
    const carrier = at(200 + CFG.size + 10);
    const w = world({ others: [carrier] });
    const climbed = seeds
      .map((seed) => run(cp, walker(cp, seed, 200), w, 1200))
      .filter((r) => Math.abs(r.state.y - backY(carrier)) < 1);
    expect(climbed.length).toBeGreaterThan(0);
    for (const r of climbed) {
      expect(r.state.x).toBeGreaterThan(carrier.x - CFG.size / 2);
      expect(r.state.x).toBeLessThan(carrier.x + CFG.size);
    }
  });

  it('does not climb onto a sheep that already has a passenger', () => {
    const cp = jumpPack();
    const carrier = at(400);
    const passenger = at(400, carrier.y - CFG.size * 0.8); // standing on its back
    const w = world({ others: [carrier, passenger] });
    const onTop = seeds
      .map((seed) => run(cp, walker(cp, seed, 400 - CFG.size - 10), w, 1200))
      .filter((r) => r.state.y < FLOOR_Y - CFG.size / 2);
    expect(onTop).toHaveLength(0);
  });

  it('a falling sheep lands on the back of a sheep below it', () => {
    const cp = compiled();
    const carrier = at(400);
    const w = world({ others: [carrier] });
    const falling: SheepState = {
      ...spawn(cp, w, CFG, 1).state,
      x: 400,
      y: 100,
      entered: true,
    };
    // Mini pack: walk's gravity hook starts the fall; it should come to rest on the carrier's back.
    const r = run(cp, falling, w, 4000);
    expect(r.started).toContain('fall');
    expect(r.state.y).toBeCloseTo(backY(carrier), 0);
  });

  it('a passenger falls to the floor when the carrier walks away', () => {
    const cp = compiled();
    const carrier = at(400);
    const w1 = world({ others: [carrier] });
    const onBack: SheepState = { ...walker(cp, 1, 400), y: backY(carrier) };
    const settled = run(cp, { ...onBack, flipped: false }, w1, 100);
    expect(settled.state.y).toBeCloseTo(backY(carrier), 0);
    // Carrier moves 300px away: nothing under the passenger any more.
    const w2 = world({ others: [at(800)] });
    const fell = run(cp, settled.state, w2, 4000);
    expect(fell.started).toContain('fall');
    expect(fell.state.y).toBeCloseTo(FLOOR_Y, 0);
  });

  it('a pile of sheep is a stack: standing on a back counts as standing on a window', () => {
    // The mini pack's walk has a window-only transition to "sleep"-like animation 'turn'.
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: base.animations.map((a) =>
        a.id === 1 ? { ...a, next: [next(2, 100, 'window')], repeat: '0' } : a,
      ),
    });
    const carrier = at(400);
    const w = world({ others: [carrier] });
    const onBack: SheepState = { ...walker(cp, 1, 400), y: backY(carrier), flipped: false };
    expect(run(cp, onBack, w, 600).started).toContain('turn');
    // ...whereas on the plain floor, the window-only transition is never offered.
    expect(run(cp, walker(cp, 1, 100), world(), 600).started).not.toContain('turn');
  });
});

describe('playing tag', () => {
  const base = miniPack();
  const cp = compilePack({
    ...base,
    animations: [
      ...base.animations,
      anim({
        id: 7,
        name: 'run',
        start: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
        end: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
        frames: [0, 1],
        repeat: '4',
        next: [next(1)],
      }),
      anim({ id: 8, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
    ],
  });
  const rect = (x: number): Rect => ({ x, y: FLOOR_Y, width: CFG.size, height: CFG.size });
  const sheepAt = (x: number, flipped = false): SheepState => ({
    ...spawn(cp, world(), CFG, 2).state,
    x,
    y: FLOOR_Y,
    flipped,
    entered: true,
  });
  const play = (s0: SheepState, w: World, ms: number) => {
    let state = s0;
    const started: string[] = [];
    for (let t = 0; t < ms; t += 16) {
      const u = update(cp, state, w, CFG, 16);
      state = u.state;
      started.push(...u.started);
    }
    return { state, started };
  };

  it('"it" turns to face its target and runs at it', () => {
    const w = world({ tag: { role: 'it', target: rect(700), wait: false } });
    const r = play(sheepAt(100, false), w, 700); // facing left, target is to the right
    expect(r.started).toContain('run');
    expect(r.state.flipped).toBe(true);
    expect(r.state.x).toBeGreaterThan(100);
  });

  it('"it" stands its ground while still counting (wait)', () => {
    const w = world({ tag: { role: 'it', target: rect(700), wait: true } });
    expect(play(sheepAt(100, false), w, 700).started).not.toContain('run');
  });

  it('a runner turns away from "it" and runs', () => {
    const w = world({ tag: { role: 'runner', target: rect(300), wait: false } });
    const r = play(sheepAt(500, false), w, 700); // "it" is on its left, so it runs right
    expect(r.started).toContain('run');
    expect(r.state.flipped).toBe(true);
    expect(r.state.x).toBeGreaterThan(500);
    // "It" on its right: it runs left instead (not cornered, so it does not leap).
    const left = play(
      sheepAt(400, true),
      world({ tag: { role: 'runner', target: rect(700), wait: false } }),
      700,
    );
    expect(left.state.flipped).toBe(false);
    expect(left.state.x).toBeLessThan(400);
  });

  it('a runner cornered against the screen edge hops over "it" to escape', () => {
    const it = rect(3 + CFG.size + 4); // right beside it, runner pinned to the left edge
    const w = world({ tag: { role: 'runner', target: it, wait: false } });
    const r = play(sheepAt(3, false), w, 900);
    expect(r.started).toContain('jump');
    expect(r.state.x).toBeGreaterThan(it.x); // landed on the far side
    expect(r.state.y).toBe(FLOOR_Y);
  });

  it('does not greet or leap over the sheep it is chasing (it must tag it, not jump it)', () => {
    const blocker = rect(100 + CFG.size + 10);
    const w = world({ others: [blocker], tag: { role: 'it', target: blocker, wait: false } });
    const jumps = Array.from({ length: 12 }, (_, i) => i + 1).filter((seed) => {
      const s = { ...sheepAt(100, true), rng: seed * 7919 };
      return play(s, w, 800).started.includes('jump');
    });
    expect(jumps).toHaveLength(0);
  });

  it('plays as normal with no target to chase or flee', () => {
    const w = world({ tag: { role: 'it', target: null, wait: false } });
    expect(play(sheepAt(300, true), w, 500).started).not.toContain('run');
  });
});

describe('displays changing under a sheep (a window resized, a monitor unplugged)', () => {
  const small = (w: number, h: number): World => ({
    areas: [{ x: 0, y: 0, width: w, height: h }],
    windows: [],
  });
  const settle = (cp: CompiledPack, s0: SheepState, w: World, ms: number): SheepState => {
    let s = s0;
    for (let t = 0; t < ms; t += 16) s = update(cp, s, w, CFG, 16).state;
    return s;
  };

  it('brings a sheep stranded past the new right edge back onto the display', () => {
    const cp = compiled();
    const stranded: SheepState = { ...standing(cp, { x: 900, y: FLOOR_Y }) };
    const after = update(cp, stranded, small(500, 600), CFG, 16).state;
    expect(after.x + CFG.size).toBeLessThanOrEqual(500);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.y).toBe(FLOOR_Y);
  });

  it('does not let a sheep fall forever when the floor moved up past it', () => {
    const cp = compiled();
    const below: SheepState = { ...standing(cp, { x: 100, y: FLOOR_Y }) }; // floor was at y=600
    const s = settle(cp, below, small(1000, 300), 5000);
    expect(s.y).toBeLessThanOrEqual(300 - CFG.size);
    expect(s.y).toBeGreaterThanOrEqual(0);
  });

  it('moves a sheep that was on an unplugged monitor onto the one that is left', () => {
    const cp = compiled();
    const w: World = {
      areas: [{ x: 0, y: 0, width: 1000, height: 600 }],
      windows: [],
    };
    const onSecond: SheepState = { ...standing(cp, { x: 1400, y: FLOOR_Y }) };
    const s = settle(cp, onSecond, w, 500);
    expect(s.x + CFG.size).toBeLessThanOrEqual(1000);
    expect(s.y).toBeCloseTo(FLOOR_Y, 0);
  });

  it('leaves sheep that are fine, and sheep that have not yet walked in, alone', () => {
    const cp = compiled();
    const fine = standing(cp, { x: 300, y: FLOOR_Y });
    const after = update(cp, fine, world(), CFG, 16).state;
    expect(after.y).toBe(FLOOR_Y);
    const arriving = spawn(cp, world(), CFG, 1).state; // starts above the screen, not yet "entered"
    expect(arriving.entered).toBe(false);
    expect(update(cp, arriving, world(), CFG, 16).state.y).toBeLessThanOrEqual(arriving.y + 20);
  });

  it('copes with there being no display at all (nothing to rescue onto)', () => {
    const cp = compiled();
    const s = standing(cp, { x: 100, y: 100 });
    expect(() => update(cp, s, { areas: [], windows: [] }, CFG, 16)).not.toThrow();
  });
});

describe('sheep are solid to each other (no overlapping)', () => {
  const base = miniPack();
  const withJump = (): CompiledPack =>
    compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({ id: 7, name: 'jump', frames: [8, 9, 10, 11], next: [next(1)] }),
      ],
    });
  const S = CFG.size;
  const box = (x: number, y = FLOOR_Y): Rect => ({ x, y, width: S, height: S });
  /** The same measure the engine uses: interpenetrating on one level by more than the tolerance. */
  const overlap = (a: { x: number; y: number }, o: Rect): boolean =>
    Math.min(a.x + S, o.x + o.width) - Math.max(a.x, o.x) > 3 &&
    Math.min(a.y + S, o.y + o.height) - Math.max(a.y, o.y) > S * 0.3;
  const walker = (cp: CompiledPack, seed: number, x: number, flipped: boolean): SheepState => ({
    ...spawn(cp, world(), CFG, seed).state,
    x,
    y: FLOOR_Y,
    flipped,
    entered: true,
  });
  const seeds = Array.from({ length: 24 }, (_, i) => i + 1);

  it('a sheep that cannot jump is stopped by one in its way, and turns round', () => {
    const cp = compiled(); // no jump animation: the hard block has to do all the work
    const blocker = box(400);
    const w = world({ others: [blocker] });
    for (const seed of seeds.slice(0, 6)) {
      let s = walker(cp, seed, 400 - S - 60, true); // facing right, walking at it
      let turned = false;
      for (let t = 0; t < 4000; t += 16) {
        const u = update(cp, s, w, CFG, 16);
        s = u.state;
        if (u.started.includes('turn')) turned = true;
        expect(overlap(s, blocker)).toBe(false);
      }
      expect(turned).toBe(true);
    }
  });

  it('with every option open it hops, climbs, greets or turns, but never overlaps', () => {
    const cp = withJump();
    const blocker = box(400);
    const w = world({ others: [blocker] });
    let hops = 0;
    for (const seed of seeds) {
      for (const flipped of [true, false]) {
        let s = walker(cp, seed, flipped ? 400 - S - 80 : 400 + S + 80, flipped);
        for (let t = 0; t < 3000; t += 16) {
          const u = update(cp, s, w, CFG, 16);
          s = u.state;
          if (u.started.includes('jump')) hops += 1;
          expect(overlap(s, blocker), `seed ${seed} flipped ${flipped} t ${t}`).toBe(false);
        }
      }
    }
    expect(hops).toBeGreaterThan(0);
  });

  const rectOf = (s: SheepState): Rect => ({ x: s.x, y: s.y, width: S, height: S });
  /** How far two sprites interpenetrate on one level (0 if they do not). */
  const depth = (a: SheepState, b: SheepState): number =>
    Math.min(a.y + S, b.y + S) - Math.max(a.y, b.y) > S * 0.3
      ? Math.max(0, Math.min(a.x + S, b.x + S) - Math.max(a.x, b.x))
      : 0;

  it('two sheep walking at each other never overlap, however long they play (updated in turn, as the demo does)', () => {
    const cp = withJump();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let a = walker(cp, seed, 100, true);
      let b = walker(cp, seed + 100, 700, false);
      for (let t = 0; t < 40_000; t += 16) {
        a = update(cp, a, world({ others: [rectOf(b)] }), CFG, 16).state;
        b = update(cp, b, world({ others: [rectOf(a)] }), CFG, 16).state; // sees `a` as already moved
        expect(depth(a, b), `seed ${seed} t ${t}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('with stale positions (each sheep sees the other as it was a moment ago, as the app does) overlaps stay shallow and clear at once', () => {
    const cp = withJump();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let a = walker(cp, seed, 100, true);
      let b = walker(cp, seed + 100, 700, false);
      let deepFrames = 0;
      let worst = 0;
      for (let t = 0; t < 40_000; t += 16) {
        const [oa, ob] = [rectOf(a), rectOf(b)];
        a = update(cp, a, world({ others: [ob] }), CFG, 16).state;
        b = update(cp, b, world({ others: [oa] }), CFG, 16).state;
        const d = depth(a, b);
        worst = Math.max(worst, d);
        if (d > S * 0.25) deepFrames += 1;
      }
      expect(worst, `seed ${seed}`).toBeLessThan(S * 0.6);
      expect(deepFrames, `seed ${seed}`).toBeLessThan(15);
    }
  });

  it('a sheep that finds itself overlapping another (landed on it, spawned on it) slides clear', () => {
    const cp = compiled();
    const other = box(400);
    const w = world({ others: [other] });
    for (const x of [380, 400, 420]) {
      let s = walker(cp, 3, x, false);
      s = { ...s, anim: { ...s.anim, border: [] } };
      for (let t = 0; t < 1500; t += 16) s = update(cp, s, w, CFG, 16).state;
      expect(overlap(s, other), `start x ${x}`).toBe(false);
    }
  });

  it('exactly on top of each other, the pair separates instead of moving as one', () => {
    const cp = compiled();
    let a = { ...walker(cp, 1, 400, false), rng: 2 }; // even rng -> pushed right
    let b = { ...walker(cp, 2, 400, false), rng: 3 }; // odd rng -> pushed left
    for (let t = 0; t < 1500; t += 16) {
      const ua = update(
        cp,
        a,
        world({ others: [{ x: b.x, y: b.y, width: S, height: S }] }),
        CFG,
        16,
      );
      const ub = update(
        cp,
        b,
        world({ others: [{ x: a.x, y: a.y, width: S, height: S }] }),
        CFG,
        16,
      );
      a = ua.state;
      b = ub.state;
    }
    expect(overlap(a, { x: b.x, y: b.y, width: S, height: S })).toBe(false);
  });

  it('is not pushed while standing on a back, or while still falling', () => {
    const cp = compiled();
    const carrier = box(400);
    const onBack: SheepState = { ...walker(cp, 1, 400, false), y: carrier.y + S * 0.2 - S };
    const w = world({ others: [carrier] });
    const after = update(cp, onBack, w, CFG, 16).state;
    expect(after.y).toBeCloseTo(onBack.y, 0);
    expect(Math.abs(after.x - onBack.x)).toBeLessThan(6); // walking, not shoved aside
  });

  it('a leap never lands on top of a third sheep', () => {
    const cp = withJump();
    const blocker = box(300);
    const third = box(300 + S + 4 + 6); // right where a leap over `blocker` would land
    const w = world({ others: [blocker, third] });
    for (const seed of seeds) {
      let s = walker(cp, seed, 300 - S - 30, true);
      for (let t = 0; t < 2500; t += 16) {
        s = update(cp, s, w, CFG, 16).state;
        expect(overlap(s, blocker) || overlap(s, third), `seed ${seed} t ${t}`).toBe(false);
      }
    }
  });
});

describe('the stuck watchdog (a sheep that walks but gets nowhere)', () => {
  const S = CFG.size;
  const noTurn = (): CompiledPack => {
    // The classic `run` has no turn-round border, so a sheep pressed against something stays "running".
    const base = miniPack();
    return compilePack({
      ...base,
      animations: [
        ...base.animations.map((a) => (a.id === 1 ? { ...a, border: [] } : a)),
        anim({
          id: 7,
          name: 'run',
          start: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          end: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          frames: [0, 1],
          repeat: '40',
          next: [next(1)],
        }),
      ],
    });
  };
  const box = (x: number): Rect => ({ x, y: FLOOR_Y, width: S, height: S });
  const at = (cp: CompiledPack, x: number, flipped: boolean): SheepState => ({
    ...spawn(cp, world(), CFG, 3).state,
    x,
    y: FLOOR_Y,
    flipped,
    entered: true,
  });
  const go = (cp: CompiledPack, s0: SheepState, w: World, ms: number, rect?: () => Rect[]) => {
    let s = s0;
    const started: string[] = [];
    for (let t = 0; t < ms; t += 16) {
      const u = update(cp, rect ? { ...s } : s, rect ? { ...w, others: rect() } : w, CFG, 16);
      s = u.state;
      started.push(...u.started);
    }
    return { s, started };
  };

  it('turns a sheep that is pinned against another round, instead of walking on the spot for ever', () => {
    const cp = noTurn();
    const blocker = box(400);
    const w = world({ others: [blocker] });
    // Walking right into a stationary sheep, with no border response to turn it.
    const start = at(cp, 400 - S - 2, true);
    const pinned = go(cp, start, w, 1000); // after 1s it is still pinned
    expect(Math.abs(pinned.s.x - start.x)).toBeLessThan(3);
    const later = go(cp, start, w, 4000);
    expect(later.s.x).toBeLessThan(start.x - 20); // it turned and walked away
    expect(later.s.stuckMs).toBeLessThan(1500);
  });

  it('a tag runner pinned in its flee direction gives up fleeing into the obstacle and walks away', () => {
    const cp = noTurn();
    const blocker = box(700);
    const w = world({
      others: [blocker],
      tag: { role: 'runner', target: box(100), wait: false }, // "it" is far behind, to the left
    });
    const start = at(cp, 700 - S - 2, true); // running right, into the blocker
    const r = go(cp, start, w, 5000);
    expect(r.s.x).toBeLessThan(start.x - 30);
    expect(r.s.x + S).toBeLessThanOrEqual(blocker.x + 1); // and never overlapped it
  });

  it('a sheep wedged between two others is slid to a free spot, not left stuck', () => {
    const cp = noTurn();
    const left = box(300 - S - 1);
    const right = box(300 + S + 1);
    const w = world({ others: [left, right] });
    const start = at(cp, 300, false);
    const r = go(cp, start, w, 9000);
    const overlaps = [left, right].some(
      (o) => Math.min(r.s.x + S, o.x + S) - Math.max(r.s.x, o.x) > 3,
    );
    expect(overlaps).toBe(false);
    expect(Math.abs(r.s.x - start.x)).toBeGreaterThan(S / 2); // it really did move
  });

  it('leaves a sheep that is walking freely completely alone', () => {
    const cp = noTurn();
    let s = at(cp, 900, false); // walking left across an empty floor
    let turns = 0;
    for (let t = 0; t < 4000; t += 16) {
      const u = update(cp, s, world(), CFG, 16);
      s = u.state;
      expect(s.stuckMs).toBeLessThan(1500);
      turns += u.started.filter((n) => n === 'turn').length;
    }
    expect(s.x).toBeLessThan(900 - 100);
    expect(turns).toBe(0);
  });

  it('does not count sleeping or standing animations as stuck', () => {
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: base.animations.map((a) =>
        a.id === 1 ? { ...a, name: 'sleep', repeat: '1000' } : a,
      ),
    });
    const s = go(cp, at(cp, 300, false), world(), 6000).s;
    expect(s.stuckMs).toBe(0);
  });

  it('in a match a sheep knows where the ball is however far away; outside one it does not notice', () => {
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: [
        ...base.animations,
        anim({
          id: 7,
          name: 'run',
          start: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          end: { x: '-10', y: '0', offsety: '0', opacity: '1', interval: '100' },
          frames: [0, 1],
          repeat: '4',
          next: [next(1)],
        }),
      ],
    });
    const far: Rect = { x: 100 + S * 30, y: FLOOR_Y + S - 14, width: 14, height: 14 };
    const wide = { areas: [{ x: 0, y: 0, width: 4000, height: 600 }], windows: [] };
    const sheep = at(cp, 100, false);
    const noMatch = go(cp, sheep, { ...wide, ball: far }, 800).started;
    const inMatch = go(
      cp,
      sheep,
      { ...wide, ball: far, team: { team: 'red', dir: 1 } } as World,
      800,
    ).started;
    expect(noMatch).not.toContain('run'); // 30 sprites away is beyond its notice
    expect(inMatch).toContain('run');
  });
});

describe('gravity and landing', () => {
  it('falls when there is no floor, then lands on the display bottom and resumes walking', () => {
    const cp = compiled();
    const { state, started } = run(cp, standing(cp, { y: 100 }), world(), 4000);
    expect(started.slice(0, 3)).toEqual(['fall', 'land', 'walk']);
    expect(state.y).toBe(FLOOR_Y);
  });

  it('lands on top of a window', () => {
    const cp = compiled();
    const w = world({ windows: [{ x: 0, y: 300, width: 600, height: 200 }] });
    const { state } = run(cp, standing(cp, { x: 100, y: 0 }), w, 1500);
    expect(state.y).toBe(300 - CFG.size);
  });

  it('drops to the next floor if it walks off the end of a window and the pack has no edge response', () => {
    const base = miniPack();
    const cp = compilePack({
      ...base,
      animations: base.animations.map((a) => (a.id === 1 ? { ...a, border: [] } : a)),
    });
    const w = world({ windows: [{ x: 300, y: 300, width: 200, height: 200 }] });
    const onTop = standing(cp, { x: 400, y: 300 - CFG.size });
    const { state, started } = run(cp, onTop, w, 6000);
    expect(started).toContain('fall');
    expect(state.y).toBe(FLOOR_Y);
  });

  it('treats the end of a window as an edge: it turns round and stays on top', () => {
    const cp = compiled();
    const w = world({ windows: [{ x: 300, y: 300, width: 200, height: 200 }] });
    const onTop = standing(cp, { x: 400, y: 300 - CFG.size });
    const { state, started } = run(cp, onTop, w, 6000);
    expect(started).toContain('turn');
    expect(started).not.toContain('fall');
    expect(state.y).toBe(300 - CFG.size);
  });
});

describe('grab, drop and toss', () => {
  it('grab pins the sheep to the pointer and plays the drag animation', () => {
    const cp = compiled();
    const u = grab(cp, standing(cp), world(), CFG, 300, 200);
    expect(u.started).toEqual(['drag']);
    expect(u.state).toMatchObject({ x: 300, y: 200, animName: 'drag' });
    expect(isHeld(u.state)).toBe(true);
    expect(isThrown(u.state)).toBe(false);
  });

  it('shows the drag pose immediately, before any time has passed', () => {
    const cp = compiled();
    const u = grab(cp, standing(cp), world(), CFG, 300, 200);
    expect(u.state.frame).toBe(5); // first frame of `drag`, not the leftover walking frame
  });

  it('held sheep stays put (no gravity, no walking) but keeps animating', () => {
    const cp = compiled();
    const held = grab(cp, standing(cp), world(), CFG, 300, 200).state;
    const later = update(cp, held, world(), CFG, 250);
    expect(later.state.x).toBe(300);
    expect(later.state.y).toBe(200);
    expect([5, 6]).toContain(later.state.frame);
    expect(later.started).toEqual([]);
    expect(moveHeld(later.state, 10, 20)).toMatchObject({ x: 10, y: 20 });
  });

  it('a gentle release just drops the sheep: it falls, lands and walks on', () => {
    const cp = compiled();
    const held = grab(cp, standing(cp), world(), CFG, 300, 100).state;
    const dropped = release(cp, held, world(), CFG, 20, 10);
    expect(dropped.state.mode.kind).toBe('walk');
    expect(dropped.started).toEqual(['fall']);
    const { state, started } = run(cp, dropped.state, world(), 3000);
    expect(started).toContain('land');
    expect(state.y).toBe(FLOOR_Y);
  });

  it('a flick throws the sheep: toss animation, ballistic flight, bounce, then land and walk', () => {
    const cp = compiled();
    const held = grab(cp, standing(cp), world(), CFG, 300, 300).state;
    const thrown = release(cp, held, world(), CFG, 900, -1200);
    expect(thrown.started).toEqual(['toss']);
    expect(isThrown(thrown.state)).toBe(true);

    const first = update(cp, thrown.state, world(), CFG, 100).state;
    expect(first.x).toBeGreaterThan(300);
    expect(first.y).toBeLessThan(300);
    expect(first.flipped).toBe(true); // travelling right
    expect([7, 6]).toContain(first.frame);

    const { state, started } = run(cp, thrown.state, world(), 8000);
    expect(started).toContain('land');
    expect(state.mode.kind).toBe('walk');
    expect(state.y).toBe(FLOOR_Y);
  });

  it('a throw to the left faces left', () => {
    const cp = compiled();
    const held = grab(cp, standing(cp), world(), CFG, 600, 300).state;
    const thrown = release(cp, held, world(), CFG, -900, -100).state;
    expect(update(cp, thrown, world(), CFG, 100).state.flipped).toBe(false);
  });

  it('bounces off screen edges and window walls while flying', () => {
    const cp = compiled();
    const w = world({ windows: [{ x: 600, y: 100, width: 100, height: 400 }] });
    const held = grab(cp, standing(cp), w, CFG, 300, 300).state;
    const thrown = release(cp, held, w, CFG, 1500, 0).state;
    const { state } = run(cp, thrown, w, 300);
    expect(state.x + CFG.size).toBeLessThanOrEqual(600 + 1);
  });

  it('picks "fall hard" for a heavy impact and "fall soft" for a light one when the pack has both', () => {
    const cp = compiled({
      animations: [
        ...miniPack().animations,
        anim({ id: 8, name: 'fall hard', frames: [4], next: [next(1)] }),
        anim({ id: 9, name: 'fall soft', frames: [4], next: [next(1)] }),
      ],
    });
    const hard = run(
      cp,
      release(cp, grab(cp, standing(cp), world(), CFG, 400, 0).state, world(), CFG, 300, 0).state,
      world(),
      5000,
    );
    expect(hard.started).toContain('fall hard');

    const soft = run(
      cp,
      release(
        cp,
        grab(cp, standing(cp), world(), CFG, 400, FLOOR_Y - 20).state,
        world(),
        CFG,
        300,
        0,
      ).state,
      world(),
      5000,
    );
    expect(soft.started).toContain('fall soft');
  });

  it('forces a landing if a throw somehow lasts too long', () => {
    const cp = compiled();
    const thrown: SheepState = {
      ...standing(cp, { y: 50 }),
      mode: { kind: 'thrown', vx: 0, vy: 0, ageMs: 9_990, impact: 0 },
    };
    const u = update(cp, thrown, world(), CFG, 40);
    expect(u.state.mode.kind).toBe('walk');
    expect(u.started).toEqual(['land']);
  });

  it('copes with packs that lack drag / toss / fall animations', () => {
    const cp = compiled({
      animations: [anim({ id: 1, name: 'walk', frames: [0], next: [next(1)] })],
    });
    const held = grab(cp, standing(cp), world(), CFG, 300, 200);
    expect(held.state.animName).toBe('walk');
    const thrown = release(cp, held.state, world(), CFG, 800, -800);
    expect(thrown.state.mode.kind).toBe('thrown');
    const { state } = run(cp, thrown.state, world(), 6000);
    expect(state.mode.kind).toBe('walk');
  });
});

describe('play', () => {
  it('switches straight to a named animation, cancelling a throw or hop', () => {
    const cp = compiled();
    const s = spawn(cp, world(), CFG, 1).state;
    const u = play(cp, { ...s, mode: { kind: 'held' } }, 'turn', world(), CFG);
    expect(u.started).toEqual(['turn']);
    expect(u.state.animName).toBe('turn');
    expect(u.state.mode.kind).toBe('walk');
    expect(u.state.frame).toBe(2);
  });

  it('ignores unknown names', () => {
    const cp = compiled();
    const s = spawn(cp, world(), CFG, 1).state;
    expect(play(cp, s, 'nope', world(), CFG)).toEqual({ state: s, started: [] });
  });
});

describe('helpers', () => {
  it('compilePack indexes by id and name', () => {
    const cp = compilePack(miniPack());
    expect(cp.byId.get(3)?.name).toBe('fall');
    expect(cp.byName.get('toss')?.id).toBe(6);
  });

  it('sheepRect reports the sprite bounds', () => {
    expect(sheepRect(standing(), CFG)).toEqual({ x: 100, y: FLOOR_Y, width: 128, height: 128 });
  });
});
