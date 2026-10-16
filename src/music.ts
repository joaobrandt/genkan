import {isNight} from './night';

// Venus, looping under the sky. It fades rather than cuts: in when genkan starts or wakes,
// out when it turns screensaver (screensaver.ts). At night it plays softer.
const NIGHT_VOLUME = 0.3;

const audio = document.getElementById('music') as HTMLAudioElement;
let ramp = 0;
let target = 0; // the volume it's at or gliding to

const level = () => (isNight() ? NIGHT_VOLUME : 1);

// Glide the volume to `to` over `ms`, then call `done`. A new glide replaces one under way.
function glide(to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(ramp);
  target = to;
  const from = audio.volume,
    start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / ms);
    audio.volume = from + (to - from) * k;
    if (k < 1) ramp = requestAnimationFrame(step);
    else done?.();
  };
  ramp = requestAnimationFrame(step);
}

export function fadeIn() {
  // If autoplay with sound is refused, the first remote key press starts it.
  audio.play().catch(() => {
    addEventListener('keydown', fadeIn, {once: true});
  });
  glide(level(), 2000);
}

export function fadeOut() {
  glide(0, 4000, () => audio.pause());
}

/** Silence at once — genkan went under another app. The next fadeIn starts from zero. */
export function stop() {
  cancelAnimationFrame(ramp);
  audio.pause();
  audio.volume = target = 0;
}

/** Night began or ended: glide gently to the new level, if the music is up. */
export function retune() {
  if (target > 0 && target !== level()) glide(level(), 5000);
}

audio.volume = 0;
fadeIn();
