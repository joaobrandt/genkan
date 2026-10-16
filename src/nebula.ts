// The night sky's nebula textures — the Milky Way and small coloured clouds — generated from
// noise. Pure (no DOM), so they can be timed or tuned on their own.

/** Seeded PRNG (mulberry32), so one seed always gives the same sky. */
export function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fractal value noise: `fbm(x, y, octaves)` in 0..1. */
function fractalNoise(rand: () => number) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const at = (x: number, y: number) => vals[perm[perm[x & 255] + (y & 255)]];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi),
      b = at(xi + 1, yi),
      c = at(xi, yi + 1),
      d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number, octaves: number) => {
    let sum = 0,
      amp = 0.5,
      norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x, y);
      norm += amp;
      x *= 2.03;
      y *= 2.03;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/**
 * Fill `px` (RGBA, n×n) with a faint Milky Way band at angle `band` (radians), broken up by
 * dark dust lanes. Everywhere else is pure black, so the OLED pixels there stay off.
 */
export function milkyWay(px: Uint8ClampedArray, n: number, band: number, rand: () => number) {
  const fbm = fractalNoise(rand);
  const bx = Math.cos(band),
    by = Math.sin(band);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / n,
        v = j / n;
      // domain warp: bends the noise into wisps and filaments
      const wu = fbm(u * 3, v * 3, 3),
        wv = fbm(u * 3 + 5.2, v * 3 + 1.3, 3);
      const f = smooth(0.3, 0.75, fbm(u * 5 + wu * 2, v * 5 + wv * 2, 5));

      const across = (u - 0.5) * by - (v - 0.5) * bx; // distance from the band's centre line
      const lanes = 1 - 0.8 * smooth(0.48, 0.66, fbm(u * 11 + 3.1, v * 11 + 7.7, 4));
      const glow = Math.exp((-across * across) / 0.003) * (0.25 + 0.75 * f) * lanes * 0.3;

      // a small floor drops the faintest haze to true black instead of a grey veil
      const o = (j * n + i) * 4;
      px[o] = 150 * glow - 6;
      px[o + 1] = 155 * glow - 6;
      px[o + 2] = 185 * glow - 6;
      px[o + 3] = 255;
    }
  }
}

// muted violet, rose, blue and teal — close to each other, so no cloud shouts
const COLOURS = [
  [105, 90, 165],
  [150, 95, 135],
  [85, 115, 180],
  [75, 135, 150]
];

/**
 * Fill `px` (RGBA, n×n) with one faint nebula on transparency: wispy, with a ragged edge,
 * blending two colours, and fading out well inside the square.
 */
export function cloud(px: Uint8ClampedArray, n: number, rand: () => number) {
  const fbm = fractalNoise(rand);
  const a = COLOURS[Math.floor(rand() * COLOURS.length)];
  const b = COLOURS[Math.floor(rand() * COLOURS.length)];

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / n - 0.5,
        v = j / n - 0.5;
      const wu = fbm(u * 4 + 10, v * 4, 3),
        wv = fbm(u * 4, v * 4 + 10, 3);
      const f = smooth(0.35, 0.75, fbm(u * 6 + wu * 1.5, v * 6 + wv * 1.5, 5));
      const edge = 1 - smooth(0.25, 0.9, Math.hypot(u, v) * 2 + (wu - 0.5) * 0.6);
      const mix = smooth(0.3, 0.7, wv);

      const o = (j * n + i) * 4;
      px[o] = a[0] + (b[0] - a[0]) * mix;
      px[o + 1] = a[1] + (b[1] - a[1]) * mix;
      px[o + 2] = a[2] + (b[2] - a[2]) * mix;
      px[o + 3] = 90 * f * edge;
    }
  }
}
