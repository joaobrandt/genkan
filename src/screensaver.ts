import {fadeIn, fadeOut, stop} from './music';
import {blockScreenSaver, onScreenOn, setScreen} from './luna';
import {setSkyRunning} from './sky';
import {shift} from './shift';
import {isNight} from './night';
import {onPointerMove} from './pointer';

// After a while with no input genkan turns screensaver: the clock and the row drift off and
// fade, the music fades out, and only the sky keeps turning (styles under body.idle). Any
// input brings it all back. The key that wakes it does nothing else, so waking never moves
// the row or opens an app. After a long while asleep the panel itself goes dark, which is
// the best rest an OLED can get; the TV stays on and any key lights it again.
const IDLE_MS = 2 * 60_000;
const NIGHT_IDLE_MS = 45_000;
const DARK_MS = 30 * 60_000; // asleep this long, then the panel goes off
const FADE_MS = 3_000; // how long the UI takes to fade out (style.css)
const RETURN_MS = 1_000; // and to come back

let idle = false;
let dark = false;
let timer = 0;
let darkTimer = 0;
let shiftTimer = 0;
let wokeAt = -Infinity;

function sleep() {
  idle = true;
  document.body.classList.add('idle');
  fadeOut();
  darkTimer = window.setTimeout(darken, DARK_MS);
  shiftTimer = window.setTimeout(shift, FADE_MS); // once it's out of sight
}

function darken() {
  dark = true;
  setSkyRunning(false); // nothing to see, so don't draw it
  setScreen(false);
}

function wake() {
  idle = false;
  wokeAt = performance.now();
  clearTimeout(darkTimer);
  clearTimeout(shiftTimer);
  if (dark) {
    dark = false;
    setSkyRunning(true);
    setScreen(true); // in case the waking key reached genkan instead of lighting the panel
  }
  document.body.classList.remove('idle');
  fadeIn();
}

// Input of any kind: restart the countdown, and wake if asleep.
function activity() {
  clearTimeout(timer);
  timer = window.setTimeout(sleep, isNight() ? NIGHT_IDLE_MS : IDLE_MS);
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

// Picking up the Magic Remote moves its pointer. A click that wakes genkan does nothing else either,
// nor one while the row is still coming back.
onPointerMove(activity);
let wakingClick = false;
addEventListener(
  'pointerdown',
  () => {
    wakingClick = idle || performance.now() - wokeAt < RETURN_MS;
    activity();
  },
  true
);
addEventListener(
  'click',
  (e) => {
    if (!wakingClick) return;
    wakingClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  },
  true
);

// HOME while genkan is already up relaunches it rather than sending a key.
document.addEventListener('webOSRelaunch', activity);

// While dark, the key that lights the panel again is the TV's, and never reaches genkan.
onScreenOn(() => {
  if (dark) activity();
});

// Under another app: silent, and no countdown. Coming back counts as input.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(timer);
    clearTimeout(darkTimer);
    stop();
    shift();
  } else {
    activity();
    fadeIn(); // stop() paused it, whether or not genkan had gone idle first
  }
});

// genkan is the screensaver now, so keep the TV's own from covering it.
blockScreenSaver();
activity();
