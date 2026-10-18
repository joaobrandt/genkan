// Make genkan's night sky, at build time, from a fixed seed, into public/sky/; the app only reads
// it (src/sky.ts). Skipped when public/sky/ is newer than this script and its helpers.
// Usage: npm run sky (dev and build run it first)
//
//   haze.png      the Milky Way's glow and the faint nebulae, soft by nature, so a 1024px square
//                 stretched over the whole sky is all they need; RGB, added on black
//   galaxies.png  an atlas of the distant galaxies, one 256px square each; RGB, added on black
//   stars.bin     every star, as float32 ×10: x, y, size, kind (0 a dot, size its radius; 1 a
//                 glow, size its square's side), r, g, b, alpha, twinkle speed (rad/s), phase
//   sky.json      the size of it all, and where the galaxies and the moon go
//
// Positions are in layout px across the S×S square that turns behind the 1920×1080 screen.
import {mkdirSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {cloud, milkyWay, random} from './sky/nebula.mjs';
import {edgeOn, elliptical, spiral} from './sky/galaxies.mjs';
import {png} from './sky/png.mjs';

const SEED = 20261018; // the sky: change it for another one
const W = 1920,
  H = 1080;
const S = Math.ceil(Math.hypot(W, H)); // enough to cover the screen at every angle of the turn
const HAZE_PX = 1024;
const GALAXY_PX = 256;
const CLOUDS = 5; // faint nebulae, 300–600px across
const STAR_AREA = 400; // one faint star per this many px²
const BRIGHT_AREA = 11_000; // one twinkling star per this many px²
const TWINKLE_S = 600; // every twinkle repeats within this, so the app can wrap its clock
const TINTS = [
  [207, 220, 255],
  [255, 255, 255],
  [255, 244, 224],
  [255, 217, 176]
]; // blue-white … orange
const TAU = 2 * Math.PI;
const OUT = 'public/sky';

const newest = (dir) => Math.max(...readdirSync(dir).map((f) => statSync(`${dir}/${f}`).mtimeMs));
try {
  if (
    statSync(`${OUT}/sky.json`).mtimeMs >
    Math.max(newest('scripts/sky'), statSync('scripts/make-sky.mjs').mtimeMs)
  ) {
    console.log('sky: up to date');
    process.exit(0);
  }
} catch {
  /* not made yet */
}

const started = Date.now();
const rand = random(SEED);
const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.577;
const band = rand() * Math.PI;
const bx = Math.cos(band),
  by = Math.sin(band);
// anywhere the turn will bring on screen at some point: the circle around the centre
const spot = () => {
  const a = rand() * TAU,
    r = (Math.sqrt(rand()) * S) / 2;
  return [S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r];
};

// Haze: the Milky Way's glow, with the nebulae added onto it.
const haze = new Uint8ClampedArray(HAZE_PX * HAZE_PX * 4);
milkyWay(haze, HAZE_PX, band, rand);
const texel = HAZE_PX / S;
for (let i = 0; i < CLOUDS; i++) {
  const [x, y] = spot(),
    size = 300 + rand() * 300;
  const n = Math.round(size * texel);
  const c = new Uint8ClampedArray(n * n * 4);
  cloud(c, n, rand);
  const ox = Math.round(x * texel - n / 2),
    oy = Math.round(y * texel - n / 2);
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < n; k++) {
      const X = ox + k,
        Y = oy + j;
      if (X < 0 || Y < 0 || X >= HAZE_PX || Y >= HAZE_PX) continue;
      const s = (j * n + k) * 4,
        d = (Y * HAZE_PX + X) * 4,
        a = c[s + 3] / 255;
      haze[d] += c[s] * a;
      haze[d + 1] += c[s + 1] * a;
      haze[d + 2] += c[s + 2] * a;
    }
  }
}

// Galaxies: an atlas of four, and where each goes, [drawn by, smallest, largest px across].
const kinds = [
  [spiral, 60, 110],
  [spiral, 60, 110],
  [elliptical, 40, 80],
  [edgeOn, 80, 130]
];
const atlas = new Uint8ClampedArray(GALAXY_PX * kinds.length * GALAXY_PX * 3);
const galaxies = kinds.map(([draw, min, max], slot) => {
  const px = new Float32Array(GALAXY_PX * GALAXY_PX * 4);
  draw(px, GALAXY_PX, rand, gauss);
  for (let y = 0; y < GALAXY_PX; y++) {
    for (let x = 0; x < GALAXY_PX; x++) {
      const s = (y * GALAXY_PX + x) * 4,
        d = (y * GALAXY_PX * kinds.length + slot * GALAXY_PX + x) * 3;
      atlas[d] = px[s] * 255;
      atlas[d + 1] = px[s + 1] * 255;
      atlas[d + 2] = px[s + 2] * 255;
    }
  }
  const [x, y] = spot();
  return {x, y, size: min + rand() * (max - min), slot};
});

// Stars: faint dots everywhere, many more crowded along the Milky Way, and the twinkling ones.
const stars = [];
const tint = () => TINTS[Math.floor(rand() * TINTS.length)];
const dot = (x, y, dim) => {
  const m = rand() ** 3; // most stars are faint
  const [r, g, b] = tint();
  stars.push(x, y, 0.35 + 0.85 * m, 0, r / 255, g / 255, b / 255, (0.18 + 0.7 * m) * dim, 0, 0);
};
const count = (S * S) / STAR_AREA;
for (let i = 0; i < count; i++) dot(rand() * S, rand() * S, 1);
for (let i = 0; i < count; i++) {
  const along = (rand() - 0.5) * S * 1.5,
    across = gauss() * S * 0.035;
  dot(S / 2 + along * bx + across * by, S / 2 + along * by - across * bx, 0.6);
}
for (let i = 0, n = Math.round((S * S) / BRIGHT_AREA); i < n; i++) {
  const [r, g, b] = tint();
  // a twinkle every 2–8 s, made a whole number of times per TWINKLE_S
  const turns = Math.round(TWINKLE_S / (2 + rand() * 6));
  stars.push(
    rand() * S,
    rand() * S,
    3 + rand() ** 2 * 10,
    1,
    r / 255,
    g / 255,
    b / 255,
    0.45 + 0.55 * rand(),
    (turns * TAU) / TWINKLE_S,
    rand() * TAU
  );
}

// the moon circles the centre close enough to stay on screen all the way round
const ma = rand() * TAU,
  mr = H * (0.2 + rand() * 0.18);
const moon = [S / 2 + Math.cos(ma) * mr, S / 2 + Math.sin(ma) * mr];

const rgb = (rgba) => {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
};
mkdirSync(OUT, {recursive: true});
writeFileSync(`${OUT}/haze.png`, png(HAZE_PX, HAZE_PX, rgb(haze)));
writeFileSync(
  `${OUT}/galaxies.png`,
  png(GALAXY_PX * kinds.length, GALAXY_PX, new Uint8Array(atlas.buffer))
);
writeFileSync(`${OUT}/stars.bin`, new Float32Array(stars));
writeFileSync(
  `${OUT}/sky.json`,
  JSON.stringify({
    S,
    stars: stars.length / 10,
    twinkleSeconds: TWINKLE_S,
    galaxies,
    slots: kinds.length,
    moon
  })
);
console.log(
  `sky: ${stars.length / 10} stars, ${galaxies.length} galaxies, made in ${((Date.now() - started) / 1000).toFixed(1)}s`
);
