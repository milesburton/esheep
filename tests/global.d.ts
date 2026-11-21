/** The demo's test seam (see src/demo/demo.ts), shared by the e2e and screenshot specs. */
interface DemoSnap {
  x: number;
  y: number;
  animation: string;
  mode: 'walk' | 'held' | 'thrown';
  frame: number;
}

interface Window {
  __demo: {
    step(ms: number): void;
    snapshot(): DemoSnap;
    snapshots(): DemoSnap[];
    add(): void;
    count(): number;
    ball(): { x: number; y: number; vx: number; vy: number } | null;
    kickAbout(on: boolean): void;
    kicks(): number;
    ballResets(): number;
    placeBall(x: number, y: number): void;
    tag(): { it: number; tags: number } | null;
    tagPlay(on: boolean): void;
    match(): { red: number; blue: number; winner: string | null; teams: (string | null)[] } | null;
    matchPlay(on: boolean): void;
    ready(): boolean;
  };
}
