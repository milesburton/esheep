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
    ready(): boolean;
  };
}
