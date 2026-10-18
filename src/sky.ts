import {cloud, milkyWay, random} from './nebula';
import {moonPhase, moonSprite} from './moon';
import {loadSky, saveSky} from './skystore';

// Night sky behind the UI, drawn on one canvas. A Milky Way texture and a layer of stars, small
// nebulae and distant galaxies turn around the screen's centre; brighter stars twinkle on top,
// tonight's moon turns with them, and every few seconds a shooting star crosses. The turn also
// keeps any one pixel from staying lit for long, which the OLED panel likes.
//
// Generating the Milky Way and the star layer takes the TV a second or two, so it happens once
// per installation, and the result is kept as images (skystore.ts): every later launch decodes
// those, and only works out the cheap parts (the twinkling stars, the moon's place) again from
// the same seed. While genkan is out of sight the layers are let go, so the app in front has
// that memory rather than the TV swapping it out, and they're decoded again on the way back.

const W = 1920,
  H = 1080; // drawn at the layout's size, a pixel per CSS px: the 4K
// panel's double density would quadruple every layer
const S = Math.ceil(Math.hypot(W, H)); // the layers' size, enough to cover the screen at every angle of the turn
const SKY_KEY = 'sky-2'; // bump when the generated sky changes, so a new one is made
const TURN_MS = 9 * 60_000; // one full turn of the sky
const MILKY_WAY_PX = 384; // Milky Way texture size — it's soft, so it's upscaled
const CLOUD_PX = 192; // each nebula's texture size
const CLOUDS = 5; // faint nebulae, 300–600px across
const STAR_AREA = 400; // one faint star per this many px²
const BRIGHT_AREA = 11_000; // one twinkling star per this many px²
const METEOR_MS = [3_000, 9_000]; // time between shooting stars
const MOON_R = 20; // the moon's radius, px
const MOON_ALPHA = 0.85; // kept a little dim
const MOON_MS = 60 * 60_000; // redrawn this often, as its phase creeps on
const TINTS = [
  [207, 220, 255],
  [255, 255, 255],
  [255, 244, 224],
  [255, 217, 176]
]; // blue-white … orange
const TAU = 2 * Math.PI;

interface Star {
  x: number;
  y: number;
  size: number;
  sprite: HTMLCanvasElement;
  base: number;
  speed: number;
  phase: number;
}
interface Meteor {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  len: number;
  life: number;
  born: number;
}
interface Layers {
  milkyWay: HTMLCanvasElement | ImageBitmap;
  stars: HTMLCanvasElement | ImageBitmap;
}

const canvas = document.getElementById('sky') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', {alpha: false})!;

let sky: Layers | null = null;
let bright: Star[] = [];
let meteor: Meteor | null = null;
let nextMeteor = 0;
let moon: HTMLCanvasElement | null = null;
let moonX = 0,
  moonY = 0,
  moonAt = -Infinity;

function layer(w: number, h = w, opaque = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', {alpha: !opaque})!];
}

/** Soft round glow in one tint, drawn scaled for each twinkling star. */
function sprite([r, g, b]: number[]) {
  const [c, x] = layer(64);
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.1, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return c;
}

const sprites = TINTS.map(sprite);

/** A round glow of radius `r` at the origin, in the current transform: `stops` are
 *  [offset, rgba] from its centre out. */
function disc(x: CanvasRenderingContext2D, r: number, stops: [number, string][]) {
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [at, rgba] of stops) g.addColorStop(at, rgba);
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, r, 0, TAU);
  x.fill();
}

/** A small spiral galaxy, tilted towards us by a random amount: a warm core in a bluish halo,
 *  and two arms of faint dots with the odd pink star-forming knot. */
function spiral(rand: () => number, gauss: () => number) {
  const n = 192,
    R = n * 0.42;
  const [c, x] = layer(n);
  x.translate(n / 2, n / 2);
  x.rotate(rand() * TAU);
  x.scale(1, 0.3 + rand() * 0.6);
  x.globalCompositeOperation = 'lighter';

  disc(x, R, [
    [0, 'rgba(255,236,200,0.95)'],
    [0.07, 'rgba(255,220,180,0.5)'],
    [0.3, 'rgba(170,180,255,0.12)'],
    [1, 'rgba(140,160,255,0)']
  ]);

  const turns = 0.8 + rand() * 0.7,
    dir = rand() < 0.5 ? 1 : -1;
  for (let i = 0; i < 1500; i++) {
    const t = Math.sqrt(rand()); // more dots further out, where the arms are longer
    const theta = dir * (t * turns * TAU + (i % 2) * Math.PI) + gauss() * 0.25;
    const r = R * (0.08 + 0.92 * t) + gauss() * R * 0.04;
    x.globalAlpha = 0.25 * (1.1 - t);
    x.fillStyle = rand() < 0.08 ? '#ffb4c8' : '#c8d4ff';
    x.fillRect(Math.cos(theta) * r, Math.sin(theta) * r, 1.4, 1.4);
  }
  return c;
}

/** An elliptical galaxy: a smooth, featureless oval of old, yellowish stars, brightest at its
 *  core. */
function elliptical(rand: () => number) {
  const n = 128;
  const [c, x] = layer(n);
  x.translate(n / 2, n / 2);
  x.rotate(rand() * TAU);
  x.scale(1, 0.5 + rand() * 0.4);
  disc(x, n * 0.48, [
    [0, 'rgba(255,240,215,0.95)'],
    [0.06, 'rgba(255,225,190,0.6)'],
    [0.25, 'rgba(240,205,170,0.18)'],
    [0.6, 'rgba(220,190,160,0.05)'],
    [1, 'rgba(220,190,160,0)']
  ]);
  return c;
}

/** A spiral seen edge-on: a thin, bright disk with a bulge at its middle, split along its
 *  length by a dark dust lane. */
function edgeOn(rand: () => number) {
  const n = 192;
  const [c, x] = layer(n);
  x.translate(n / 2, n / 2);
  x.rotate(rand() * TAU);

  x.save();
  x.scale(1, 0.09);
  disc(x, n * 0.46, [
    [0, 'rgba(240,235,255,0.75)'],
    [0.5, 'rgba(190,200,255,0.25)'],
    [1, 'rgba(170,185,255,0)']
  ]);
  x.restore();
  x.save();
  x.scale(1, 0.6);
  disc(x, n * 0.12, [
    [0, 'rgba(255,235,205,0.85)'],
    [1, 'rgba(255,225,190,0)']
  ]);
  x.restore();

  // the dust lane takes light away, just off the disk's middle
  x.globalCompositeOperation = 'destination-out';
  x.translate(0, n * 0.006);
  x.scale(1, 0.018);
  disc(x, n * 0.4, [
    [0, 'rgba(0,0,0,0.85)'],
    [0.7, 'rgba(0,0,0,0.6)'],
    [1, 'rgba(0,0,0,0)']
  ]);
  return c;
}

/** The expensive part of a sky, from `seed`: the Milky Way texture, and the layer of stars,
 *  faint nebulae and distant galaxies. */
function generate(seed: number): {milkyWay: HTMLCanvasElement; stars: HTMLCanvasElement} {
  const rand = random(seed);
  const band = rand() * Math.PI;
  const bx = Math.cos(band),
    by = Math.sin(band);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.577;
  const tint = () => TINTS[Math.floor(rand() * TINTS.length)];

  const [mw, mctx] = layer(MILKY_WAY_PX);
  const img = mctx.createImageData(MILKY_WAY_PX, MILKY_WAY_PX);
  milkyWay(img.data, MILKY_WAY_PX, band, rand);
  mctx.putImageData(img, 0, 0);

  // opaque black rather than transparent: it's only ever added to the sky ('lighter'), where
  // black adds nothing, and an opaque image keeps exactly through PNG, where the faint, nearly
  // transparent edges of the nebulae would be posterized
  const [stars, sctx] = layer(S, S, true);
  sctx.globalCompositeOperation = 'lighter';

  // anywhere the turn will bring on screen at some point: the circle around the centre
  const spot = () => {
    const a = rand() * TAU,
      r = (Math.sqrt(rand()) * S) / 2;
    return [S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r];
  };
  const [cl, cctx] = layer(CLOUD_PX);
  const cimg = cctx.createImageData(CLOUD_PX, CLOUD_PX);
  for (let i = 0; i < CLOUDS; i++) {
    cloud(cimg.data, CLOUD_PX, rand);
    cctx.putImageData(cimg, 0, 0);
    const [x, y] = spot(),
      size = 300 + rand() * 300;
    sctx.drawImage(cl, x - size / 2, y - size / 2, size, size);
  }
  // distant galaxies of a few kinds: [drawn by, smallest, largest px across]
  const galaxies: [
    (rand: () => number, gauss: () => number) => HTMLCanvasElement,
    number,
    number
  ][] = [
    [spiral, 60, 110],
    [spiral, 60, 110],
    [elliptical, 40, 80],
    [edgeOn, 80, 130]
  ];
  for (const [draw, min, max] of galaxies) {
    const [x, y] = spot(),
      size = min + rand() * (max - min);
    sctx.drawImage(draw(rand, gauss), x - size / 2, y - size / 2, size, size);
  }

  const dot = (x: number, y: number, dim: number) => {
    const m = rand() ** 3; // most stars are faint
    const [r, g, b] = tint();
    sctx.globalAlpha = (0.18 + 0.7 * m) * dim;
    sctx.fillStyle = `rgb(${r},${g},${b})`;
    sctx.beginPath();
    sctx.arc(x, y, 0.35 + 0.85 * m, 0, TAU);
    sctx.fill();
  };
  const count = (S * S) / STAR_AREA;
  for (let i = 0; i < count; i++) dot(rand() * S, rand() * S, 1);
  // the Milky Way: many more faint stars crowded along its glowing band
  for (let i = 0; i < count; i++) {
    const along = (rand() - 0.5) * S * 1.5,
      across = gauss() * S * 0.035;
    dot(S / 2 + along * bx + across * by, S / 2 + along * by - across * bx, 0.6);
  }
  return {milkyWay: mw, stars};
}

/** The cheap part, worked out again at every launch from the same seed (its own stream of it,
 *  so it doesn't depend on how much `generate` drew): where the moon circles, and which stars
 *  twinkle. */
function arrange(seed: number) {
  const rand = random(seed ^ 0x5bd1e995);
  // the moon circles the centre close enough to stay on screen all the way round
  const ma = rand() * TAU,
    mr = H * (0.2 + rand() * 0.18);
  moonX = S / 2 + Math.cos(ma) * mr;
  moonY = S / 2 + Math.sin(ma) * mr;

  bright = Array.from({length: Math.round((S * S) / BRIGHT_AREA)}, () => ({
    x: rand() * S,
    y: rand() * S,
    size: 3 + rand() ** 2 * 10,
    sprite: sprites[Math.floor(rand() * sprites.length)],
    base: 0.45 + 0.55 * rand(),
    speed: TAU / (2000 + rand() * 6000), // a twinkle every 2–8 s
    phase: rand() * TAU
  }));
}

const png = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
  });

/** Get the sky's layers: the kept ones if there are, otherwise make them now and keep them. */
async function load() {
  const kept = await loadSky(SKY_KEY);
  if (kept) {
    const [mw, stars] = await Promise.all([
      createImageBitmap(kept.milkyWay),
      createImageBitmap(kept.stars)
    ]);
    sky = {milkyWay: mw, stars};
    arrange(kept.seed);
    return;
  }
  const seed = Math.floor(Math.random() * 2 ** 31);
  const made = generate(seed);
  sky = made;
  arrange(seed);
  Promise.all([png(made.milkyWay), png(made.stars)])
    .then(([mw, stars]) => saveSky(SKY_KEY, {seed, milkyWay: mw, stars}))
    .catch(() => {
      /* not kept: the next launch makes a new one */
    });
}

/** Let the layers go, and the canvas's own pixels with them. Decoded images are closed at once;
 *  freshly generated canvases are only dropped, as their PNG may still be being written from
 *  them (that takes the TV a few seconds), and freeing them under it garbles the kept sky. */
function release() {
  cancelAnimationFrame(raf);
  if (sky) {
    for (const l of [sky.milkyWay, sky.stars]) if (l instanceof ImageBitmap) l.close();
    sky = null;
  }
  canvas.classList.remove('ready');
  canvas.width = canvas.height = 0;
}

let loading: Promise<void> | null = null;

async function show() {
  if (!sky) {
    loading ??= load().finally(() => {
      loading = null;
    });
    await loading;
    if (document.hidden) {
      release();
      return; // gone again meanwhile
    }
  }
  if (canvas.width !== W) {
    canvas.width = W;
    canvas.height = H;
  }
  canvas.classList.add('ready');
  run();
}

function shootingStar(t: number) {
  if (!meteor) {
    if (t < nextMeteor) return;
    const angle = 0.25 + Math.random() * 0.35; // 15–35° below the horizon
    meteor = {
      x: W * (0.15 + Math.random() * 0.7),
      y: H * (0.05 + Math.random() * 0.4),
      dx: Math.cos(angle) * (Math.random() < 0.5 ? 1 : -1),
      dy: Math.sin(angle),
      speed: (W * (0.6 + Math.random() * 0.5)) / 1000,
      len: W * (0.06 + Math.random() * 0.08),
      life: 500 + Math.random() * 600,
      born: t
    };
  }
  const m = meteor,
    age = t - m.born;
  if (age > m.life) {
    meteor = null;
    nextMeteor = t + METEOR_MS[0] + Math.random() * (METEOR_MS[1] - METEOR_MS[0]);
    return;
  }
  const fade = Math.sin((Math.PI * age) / m.life); // in and out
  const hx = m.x + m.dx * m.speed * age,
    hy = m.y + m.dy * m.speed * age;
  const tail = m.len * Math.min(1, age / 150);
  const tx = hx - m.dx * tail,
    ty = hy - m.dy * tail;
  const grad = ctx.createLinearGradient(tx, ty, hx, hy);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, `rgba(255,255,255,${0.9 * fade})`);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.drawImage(sprites[1], hx - 5, hy - 5, 10, 10);
}

let raf = 0;
let wanted = true; // false while the panel is off: nothing to see, so nothing drawn

function run() {
  cancelAnimationFrame(raf);
  if (wanted && sky && !document.hidden) raf = requestAnimationFrame(frame);
}

/** Stop drawing while the panel is off, and start again when it's back. */
export function setSkyRunning(on: boolean) {
  wanted = on;
  run();
}

function frame(t: number) {
  raf = requestAnimationFrame(frame);
  if (!sky) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.translate(W / 2, H / 2);
  ctx.rotate((t / TURN_MS) * TAU);
  ctx.translate(-S / 2, -S / 2);
  ctx.drawImage(sky.milkyWay, 0, 0, S, S);

  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sky.stars, 0, 0, S, S);
  for (const s of bright) {
    ctx.globalAlpha = s.base * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
    ctx.drawImage(s.sprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }

  if (Date.now() - moonAt > MOON_MS) {
    moon = moonSprite(MOON_R, moonPhase(new Date()));
    moonAt = Date.now();
  }
  if (moon) {
    ctx.globalCompositeOperation = 'source-over'; // over the stars, hiding those behind it
    ctx.globalAlpha = MOON_ALPHA;
    ctx.drawImage(moon, moonX - 2 * MOON_R, moonY - 2 * MOON_R, 4 * MOON_R, 4 * MOON_R);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  shootingStar(t);
}

// Out of sight, let the sky go; back in sight, load it again (decoding the kept images).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
  else show();
});

// Let the clock and the row paint first, then fade the sky in.
nextMeteor = performance.now() + 3000;
requestAnimationFrame(() => setTimeout(show, 0));
