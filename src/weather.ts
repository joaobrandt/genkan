// One line under the clock, "22° · Cloudy" (in the TV's language), from Open-Meteo (free, no account or key). The
// place is VITE_LAT / VITE_LON in .env, read at build time; without them the line stays empty.
import {T} from './i18n';

const LAT = import.meta.env.VITE_LAT;
const LON = import.meta.env.VITE_LON;
const REFRESH_MS = 15 * 60_000;
const STALE_MS = 60 * 60_000; // an older reading is dropped rather than shown as current

// Open-Meteo reports the sky as a WMO weather code.
function describe(code: number): string {
  const w = T.weather;
  if (code === 0) return w.clear;
  if (code === 1) return w.mainlyClear;
  if (code === 2) return w.partlyCloudy;
  if (code === 3) return w.overcast;
  if (code <= 48) return w.fog;
  if (code <= 57) return w.drizzle;
  if (code <= 67) return code === 65 || code === 67 ? w.heavyRain : w.rain;
  if (code <= 77) return w.snow;
  if (code <= 82) return w.rainShowers;
  if (code <= 86) return w.snowShowers;
  return w.thunderstorm;
}

const line = document.getElementById('weather')!;
let last = 0; // when the shown reading was fetched

async function refresh() {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code`
    );
    const {current} = (await res.json()) as {
      current: {temperature_2m: number; weather_code: number};
    };
    line.textContent = `${Math.round(current.temperature_2m)}° · ${describe(current.weather_code)}`;
    last = Date.now();
  } catch {
    // offline or refused: keep the reading for now, and try again next minute
  }
}

// Every minute in view: fetch when the reading is due, and drop it once it's too old to trust.
function check() {
  if (document.hidden) return;
  if (Date.now() - last > STALE_MS) line.textContent = '';
  if (Date.now() - last > REFRESH_MS) refresh();
}

if (LAT && LON) {
  check();
  setInterval(check, 60_000);
  document.addEventListener('visibilitychange', check);
}
