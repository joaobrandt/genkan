// The night sky's distant galaxies, for make-sky.mjs: drawn into an n×n buffer of premultiplied
// RGBA (0..1) with the same shapes the canvas used to draw them, so the result can go on black and
// be added to the sky. Discs are radial gradients under a rotation and a stretch, composited like
// canvas 2D's source-over, lighter and destination-out, and supersampled so thin ones stay smooth.

const TAU = 2 * Math.PI;
const SS = 4; // supersampling: SS×SS samples a pixel

/** Colour at `t` (0..1) along gradient stops [[offset, [r, g, b, a]]], channels 0..255 and alpha
 *  0..1, interpolated unpremultiplied as Chrome's canvas does. */
function stopsAt(stops, t) {
  let i = 1;
  while (i < stops.length - 1 && stops[i][0] < t) i++;
  const [o0, c0] = stops[i - 1],
    [o1, c1] = stops[i];
  const k = Math.min(1, Math.max(0, (t - o0) / (o1 - o0 || 1)));
  return c0.map((v, j) => v + (c1[j] - v) * k);
}

/** A radial-gradient disc of `radius` in its own frame, centred at (cx, cy), turned by `angle` and
 *  stretched by (sx, sy), composited onto `px` with `mode`. */
function disc(px, n, {cx, cy, angle, sx = 1, sy = 1, radius, stops, mode = 'over'}) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const reach = radius * Math.max(sx, sy);
  const x0 = Math.max(0, Math.floor(cx - reach)),
    x1 = Math.min(n - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach)),
    y1 = Math.min(n - 1, Math.ceil(cy + reach));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const dx = x + (i + 0.5) / SS - cx,
            dy = y + (j + 0.5) / SS - cy;
          const lx = (dx * cos + dy * sin) / sx,
            ly = (-dx * sin + dy * cos) / sy;
          const t = Math.hypot(lx, ly) / radius;
          if (t > 1) continue;
          const [cr, cg, cb, ca] = stopsAt(stops, t);
          r += (cr / 255) * ca;
          g += (cg / 255) * ca;
          b += (cb / 255) * ca;
          a += ca;
        }
      }
      if (a === 0) continue;
      const w = 1 / (SS * SS);
      r *= w;
      g *= w;
      b *= w;
      a *= w;
      const o = (y * n + x) * 4;
      if (mode === 'lighter') {
        px[o] += r;
        px[o + 1] += g;
        px[o + 2] += b;
        px[o + 3] += a;
      } else if (mode === 'over') {
        const k = 1 - a;
        px[o] = r + px[o] * k;
        px[o + 1] = g + px[o + 1] * k;
        px[o + 2] = b + px[o + 2] * k;
        px[o + 3] = a + px[o + 3] * k;
      } else {
        // destination-out: takes light away where it's drawn
        const k = 1 - a;
        px[o] *= k;
        px[o + 1] *= k;
        px[o + 2] *= k;
        px[o + 3] *= k;
      }
    }
  }
}

/** Add a small dot of `area` px² at (x, y), spread over the 2×2 pixels around it. */
function dot(px, n, x, y, area, [r, g, b], alpha) {
  const fx = x - 0.5,
    fy = y - 0.5;
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    u = fx - ix,
    v = fy - iy;
  const k = (area * alpha) / 255;
  for (const [ox, oy, w] of [
    [0, 0, (1 - u) * (1 - v)],
    [1, 0, u * (1 - v)],
    [0, 1, (1 - u) * v],
    [1, 1, u * v]
  ]) {
    const X = ix + ox,
      Y = iy + oy;
    if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
    const o = (Y * n + X) * 4;
    px[o] += r * k * w;
    px[o + 1] += g * k * w;
    px[o + 2] += b * k * w;
    px[o + 3] += alpha * area * w;
  }
}

/** A small spiral galaxy, tilted towards us by a random amount: a warm core in a bluish halo,
 *  and two arms of faint dots with the odd pink star-forming knot. */
export function spiral(px, n, rand, gauss) {
  const R = n * 0.42,
    c = n / 2;
  const angle = rand() * TAU,
    sy = 0.3 + rand() * 0.6;
  disc(px, n, {
    cx: c,
    cy: c,
    angle,
    sy,
    radius: R,
    mode: 'lighter',
    stops: [
      [0, [255, 236, 200, 0.95]],
      [0.07, [255, 220, 180, 0.5]],
      [0.3, [170, 180, 255, 0.12]],
      [1, [140, 160, 255, 0]]
    ]
  });

  const turns = 0.8 + rand() * 0.7,
    dir = rand() < 0.5 ? 1 : -1;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const side = (1.4 * n) / 192; // the dots' size the canvas drew them at, scaled to this n
  for (let i = 0; i < 1500; i++) {
    const t = Math.sqrt(rand()); // more dots further out, where the arms are longer
    const theta = dir * (t * turns * TAU + (i % 2) * Math.PI) + gauss() * 0.25;
    const r = R * (0.08 + 0.92 * t) + gauss() * R * 0.04;
    const alpha = 0.25 * (1.1 - t);
    const colour = rand() < 0.08 ? [255, 180, 200] : [200, 212, 255];
    const lx = Math.cos(theta) * r,
      ly = Math.sin(theta) * r * sy;
    dot(px, n, c + lx * cos - ly * sin, c + lx * sin + ly * cos, side * side * sy, colour, alpha);
  }
}

/** An elliptical galaxy: a smooth, featureless oval of old, yellowish stars, brightest at its
 *  core. */
export function elliptical(px, n, rand) {
  const c = n / 2;
  disc(px, n, {
    cx: c,
    cy: c,
    angle: rand() * TAU,
    sy: 0.5 + rand() * 0.4,
    radius: n * 0.48,
    stops: [
      [0, [255, 240, 215, 0.95]],
      [0.06, [255, 225, 190, 0.6]],
      [0.25, [240, 205, 170, 0.18]],
      [0.6, [220, 190, 160, 0.05]],
      [1, [220, 190, 160, 0]]
    ]
  });
}

/** A spiral seen edge-on: a thin, bright disk with a bulge at its middle, split along its
 *  length by a dark dust lane. */
export function edgeOn(px, n, rand) {
  const c = n / 2,
    angle = rand() * TAU;
  disc(px, n, {
    cx: c,
    cy: c,
    angle,
    sy: 0.09,
    radius: n * 0.46,
    stops: [
      [0, [240, 235, 255, 0.75]],
      [0.5, [190, 200, 255, 0.25]],
      [1, [170, 185, 255, 0]]
    ]
  });
  disc(px, n, {
    cx: c,
    cy: c,
    angle,
    sy: 0.6,
    radius: n * 0.12,
    stops: [
      [0, [255, 235, 205, 0.85]],
      [1, [255, 225, 190, 0]]
    ]
  });
  // the dust lane takes light away, just off the disk's middle
  const off = n * 0.006;
  disc(px, n, {
    cx: c - Math.sin(angle) * off,
    cy: c + Math.cos(angle) * off,
    angle,
    sy: 0.018,
    radius: n * 0.4,
    mode: 'out',
    stops: [
      [0, [0, 0, 0, 0.85]],
      [0.7, [0, 0, 0, 0.6]],
      [1, [0, 0, 0, 0]]
    ]
  });
}
