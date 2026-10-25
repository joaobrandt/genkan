import './style.css';
import './sky';
import './row';
import './screensaver';
import './weather';
import {isNight} from './night';
import {retune} from './music';
import {T} from './i18n';

const date = document.getElementById('date')!;
const time = document.getElementById('time')!;
const render = () => {
  const now = new Date();
  date.textContent = T.formatDate(now);
  time.textContent = T.formatTime(now);
  document.body.classList.toggle('night', isNight(now));
  retune();
};
// on every minute boundary, so the clock turns over on time
const tick = () => {
  render();
  setTimeout(tick, 60_000 - (Date.now() % 60_000));
};

tick();

// The layout is drawn for the TV's 1920×1080; scale it to fit any other window.
const stage = document.getElementById('stage')!;
const fit = () => {
  stage.style.setProperty('--fit', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
};

fit();
addEventListener('resize', fit);
