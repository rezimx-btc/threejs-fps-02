// Input: keyboard state, pointer-lock mouse look, firing, and aim-down-sights.
// Pointer lock is requested by the HUD's play button; losing it pauses the game
// (unless a shot capture is running, where input is scripted instead). Right
// mouse holds ADS; the Tab key opens the scoreboard while held.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let locked = false;
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let firingEdge = false;
  let aiming = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
    if (event.code === 'Tab') event.preventDefault();
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
    if (event.button === 2) aiming = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) firing = false;
    if (event.button === 2) aiming = false;
  }
  function onContextMenu(event) {
    event.preventDefault();
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) { firing = false; aiming = false; }
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLock);

  return {
    keys,
    get locked() { return locked; },
    get firing() { return firing; },
    get aiming() { return aiming; },
    get scoreboardOpen() { return keys.has('Tab'); },
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
      aiming = false;
    },
  };
}
