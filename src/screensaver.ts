import {fadeIn, fadeOut, stop} from './music';
import {blockScreenSaver} from './luna';

// After a while with no input genkan turns screensaver: the clock and the row drift off and
// fade, the music fades out, and only the sky keeps turning (styles under body.idle). Any
// input brings it all back. The key that wakes it does nothing else, so waking never moves
// the row or opens an app.
const IDLE_MS = 2 * 60_000;

let idle = false;
let timer = 0;

function sleep() {
  idle = true;
  document.body.classList.add('idle');
  fadeOut();
}

function wake() {
  idle = false;
  document.body.classList.remove('idle');
  fadeIn();
}

// Input of any kind: restart the countdown, and wake if asleep.
function activity() {
  clearTimeout(timer);
  timer = window.setTimeout(sleep, IDLE_MS);
  if (idle) wake();
}

// Capture, so this runs before the row's own key handler and can keep the waking key from it.
addEventListener(
  'keydown',
  (e) => {
    const wasIdle = idle;
    activity();
    if (wasIdle) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true
);

// Picking up the Magic Remote moves its pointer. Only real moves count: browsers also send
// mousemoves when things shift under a pointer that stands still, as the UI does going idle.
let px = NaN,
  py = NaN;
addEventListener('pointermove', (e) => {
  if (e.screenX === px && e.screenY === py) return;
  px = e.screenX;
  py = e.screenY;
  activity();
});
addEventListener('pointerdown', activity);

// HOME while genkan is already up relaunches it rather than sending a key.
document.addEventListener('webOSRelaunch', activity);

// Under another app: silent, and no countdown. Coming back counts as input.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(timer);
    stop();
  } else {
    activity();
    fadeIn(); // stop() paused it, whether or not genkan had gone idle first
  }
});

// genkan is the screensaver now, so keep the TV's own from covering it.
blockScreenSaver();
activity();
