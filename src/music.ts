// Venus, looping under the sky. It fades rather than cuts: in when genkan starts or wakes,
// out when it turns screensaver (screensaver.ts).
const audio = document.getElementById('music') as HTMLAudioElement;
let ramp = 0;

// Glide the volume to `to` over `ms`, then call `done`. A new glide replaces one under way.
function glide(to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(ramp);
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
  glide(1, 2000);
}

export function fadeOut() {
  glide(0, 4000, () => audio.pause());
}

/** Silence at once — genkan went under another app. The next fadeIn starts from zero. */
export function stop() {
  cancelAnimationFrame(ramp);
  audio.pause();
  audio.volume = 0;
}

audio.volume = 0;
fadeIn();
