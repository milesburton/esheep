import { moveDrag, releaseVelocity, startDrag, type Drag } from '../core/pointer.js';

// The ball window is the ball. Grabbing it hands control to the main process, which moves it with the
// pointer (screen coordinates), then throws it with the pointer's release velocity.
const api = window.electronAPI;
const el = document.getElementById('ball') as HTMLElement;
let drag: Drag | null = null;

el.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // only the primary button picks it up (a right-click must not freeze it)
  el.setPointerCapture(e.pointerId);
  drag = startDrag(
    { x: window.screenX, y: window.screenY },
    { x: e.screenX, y: e.screenY },
    e.timeStamp,
  );
  api.ballGrab();
});

el.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const m = moveDrag(drag, { x: e.screenX, y: e.screenY }, e.timeStamp);
  drag = m.drag;
  api.ballMove(m.sprite.x, m.sprite.y);
});

const end = (e: PointerEvent): void => {
  if (!drag) return;
  const v = releaseVelocity(drag, e.timeStamp);
  drag = null;
  api.ballRelease(v.vx, v.vy);
};
el.addEventListener('pointerup', end);
el.addEventListener('pointercancel', end);

// If the mouse-up never arrives (focus moved, the pointer capture was lost), let go rather than leave the
// ball frozen in the air for good. After a normal release `drag` is already null, so these do nothing.
const drop = (): void => {
  if (!drag) return;
  drag = null;
  api.ballRelease(0, 0);
};
el.addEventListener('lostpointercapture', drop);
window.addEventListener('blur', drop);
