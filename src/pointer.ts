// Browsers also send pointermoves when things shift under a pointer that stands still, as the
// row does on a key press, so only a real move of the Magic Remote counts.
export function onPointerMove(fn: () => void) {
  let x = NaN,
    y = NaN;
  addEventListener('pointermove', (e) => {
    if (e.screenX === x && e.screenY === y) return;
    x = e.screenX;
    y = e.screenY;
    fn();
  });
}

// body.pointer while the pointer is in use, so a tile only glows under it then. webOS hides the
// pointer on a key press, or after a while still.
onPointerMove(() => document.body.classList.add('pointer'));
addEventListener('keydown', () => document.body.classList.remove('pointer'));
document.addEventListener('cursorStateChange', (e) => {
  if (!(e as CustomEvent<{visibility: boolean}>).detail?.visibility) {
    document.body.classList.remove('pointer');
  }
});
