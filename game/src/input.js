// Input: keyboard state, pointer-lock mouse look, and firing. Pointer lock is
// requested by the HUD's play button; losing it pauses the game (unless a shot
// capture is running, where input is scripted instead).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let locked = false;
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let firingEdge = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (!locked) return;
    if (event.button === 0) { firing = true; firingEdge = true; }
  }
  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    keys,
    get locked() { return locked; },
    get firing() { return firing; },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takeFiringEdge() {
      const edge = firingEdge;
      firingEdge = false;
      return edge;
    },
    requestLock() {
      try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    clear() {
      keys.clear();
      firing = false;
    },
  };
}
