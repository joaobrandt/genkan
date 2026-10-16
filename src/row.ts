import {TILES} from './tiles';
import {connectedInputs, launchApp} from './luna';

// PS4-style row: the selected tile stays put at the row's left edge, larger than the
// rest, and Left/Right slide the whole row under it. The tile before it peeks in,
// half off-screen. Tiles are absolutely positioned and moved with transforms only,
// so a step never triggers layout on the TV.
const SIZE = 260; // selected tile, px — others are drawn at SMALL of this
const SMALL = 200 / SIZE;
const GAP = 16;
const PITCH = SIZE * SMALL + GAP;
const GROW = SIZE - SIZE * SMALL; // how much further the tiles after the selected one sit
const LAST = 'genkan.last'; // localStorage: the ID of the tile opened last

const row = document.getElementById('row')!;
const title = document.getElementById('title')!;
const status = document.getElementById('status')!;

const tiles = TILES.map((t) => {
  const el = document.createElement('div');
  el.className = 'tile';
  const img = document.createElement('img');
  img.src = t.icon;
  img.alt = '';
  const dot = document.createElement('span'); // lit while a device is on at this input
  dot.className = 'dot';
  el.append(img, dot);
  row.append(el);
  return el;
});

// Start where you left off: on the tile opened last, even across reboots.
function remembered(): number {
  try {
    return Math.max(
      0,
      TILES.findIndex((t) => t.id === localStorage.getItem(LAST))
    );
  } catch {
    return 0;
  }
}

let selected = remembered();
let statusTimer = 0;

function render() {
  tiles.forEach((el, i) => {
    const x = (i - selected) * PITCH + (i > selected ? GROW : 0);
    el.style.transform = `translateX(${x}px) scale(${i === selected ? 1 : SMALL})`;
    el.classList.toggle('selected', i === selected);
    el.classList.toggle('previous', i === selected - 1);
    el.classList.toggle('passed', i < selected - 1);
  });
  title.textContent = TILES[selected].title;
}

function select(i: number) {
  const next = Math.max(0, Math.min(TILES.length - 1, i));
  if (next === selected) return;
  selected = next;
  status.textContent = '';
  render();
}

function launch() {
  const tile = TILES[selected];
  const el = tiles[selected];
  el.classList.remove('launching');
  void el.offsetWidth; // restart the press animation
  el.classList.add('launching');
  launchApp(tile.id).then(
    () => {
      try {
        localStorage.setItem(LAST, tile.id);
      } catch {
        /* then the row starts at the first tile */
      }
    },
    (err: Error) => {
      status.textContent = `Não foi possível abrir ${tile.title}: ${err.message}`;
      clearTimeout(statusTimer);
      statusTimer = window.setTimeout(() => {
        status.textContent = '';
      }, 4000);
    }
  );
}

// Light the dot on the inputs whose device is on: when genkan comes up and every few seconds
// while it's in view, so a console switched on shows up soon after.
async function refreshInputs() {
  const live = await connectedInputs();
  tiles.forEach((el, i) => el.classList.toggle('live', live.has(TILES[i].id)));
}

refreshInputs();
setInterval(() => {
  if (!document.hidden) refreshInputs();
}, 10_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshInputs();
});

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') select(selected + 1);
  else if (e.key === 'ArrowLeft') select(selected - 1);
  else if (e.key === 'Enter') {
    if (!e.repeat) launch();
  } else return;
  e.preventDefault();
});

render();
