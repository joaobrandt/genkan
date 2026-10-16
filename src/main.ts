import './style.css';
import './sky';
import './row';

function greetingFor(h: number): string {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

const greeting = document.getElementById('greeting')!;
const render = () => {
  greeting.textContent = greetingFor(new Date().getHours());
};

render();
setInterval(render, 60_000);

// The layout is drawn for the TV's 1920×1080; scale it to fit any other window.
const stage = document.getElementById('stage')!;
const fit = () => {
  stage.style.setProperty('--fit', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
};

fit();
addEventListener('resize', fit);

// Music. If autoplay with sound is refused, the first remote key press starts it.
const music = document.getElementById('music') as HTMLAudioElement;
const play = () => {
  music.play().catch(() => {
    /* blocked until a key press */
  });
};

play();
addEventListener('keydown', play);
// Don't play under other apps — pause when genkan goes to the background.
document.addEventListener('visibilitychange', () => {
  document.hidden ? music.pause() : play();
});
