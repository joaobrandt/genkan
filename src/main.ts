import './style.css';
import './sky';
import './row';
import './screensaver';
import {isNight} from './night';
import {retune} from './music';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

// "Sexta-feira, 16 de Outubro de 2026". Spelled out by hand rather than with Intl, so it
// doesn't depend on the TV's browser carrying pt-BR locale data.
function dateLine(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

// "10:42"
function timeLine(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const date = document.getElementById('date')!;
const time = document.getElementById('time')!;
const render = () => {
  const now = new Date();
  date.textContent = dateLine(now);
  time.textContent = timeLine(now);
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
