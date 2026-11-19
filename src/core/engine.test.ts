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
    expect(hopped.length).toBeGreaterThan(3);
    for (const r of hopped) {
      expect(r.state.x).toBeGreaterThan(blocker.x + blocker.width - 1);
      expect(r.state.y).toBe(FLOOR_Y);
    }
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
      .filter((r) => r.started.includes('jump'));
    expect(hopped.length).toBeGreaterThan(3);
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
    expect(seeds.filter((n) => run(cp, s(n), w, 400).started.includes('jump')).length).toBe(0);
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
