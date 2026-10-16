// The moon as it is tonight, for sky.ts: the phase comes from the date (the mean synodic month
// counted from a known new moon, good to within a day) and is drawn small and dim, with a
// faint glow and the darker seas roughly where they are on the real face.
const SYNODIC_DAYS = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
const TAU = 2 * Math.PI;

// The seas (maria) as [x, y, radius], in moon radii from its centre.
const MARIA = [
  [-0.35, -0.35, 0.28],
  [0.12, -0.3, 0.16],
  [0.25, -0.05, 0.2],
  [-0.55, 0, 0.33],
  [0.6, -0.2, 0.1],
  [-0.15, 0.4, 0.18],
  [0.5, 0.15, 0.12]
];

/** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(d: Date): number {
  const days = (d.getTime() - NEW_MOON) / 86_400_000;
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}

/** The moon in `phase`, of radius r px, at the centre of a 4r canvas with its glow around it.
 *  null near new moon, when there's nothing to see. */
export function moonSprite(r: number, phase: number): HTMLCanvasElement | null {
  const lit = (1 - Math.cos(phase * TAU)) / 2; // fraction of the face in sunlight
  if (lit < 0.03) return null;

  const n = Math.ceil(r * 4);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  x.translate(n / 2, n / 2);

  // glow, stronger the fuller it is
  const glow = x.createRadialGradient(0, 0, r, 0, 0, n / 2);
  glow.addColorStop(0, `rgba(220,225,235,${0.14 * lit})`);
  glow.addColorStop(1, 'rgba(220,225,235,0)');
  x.fillStyle = glow;
  x.fillRect(-n / 2, -n / 2, n, n);

  // the whole disc, barely lit by earthshine, and opaque so the stars behind it don't show
  x.fillStyle = 'rgb(16,18,24)';
  x.beginPath();
  x.arc(0, 0, r, 0, TAU);
  x.fill();

  // the sunlit part: the right half disc (left when waning), closed by the terminator, an
  // ellipse bulging into it for a crescent and out of it for a gibbous moon
  const rx = r * Math.abs(Math.cos(phase * TAU));
  x.save();
  if (phase > 0.5) x.scale(-1, 1);
  x.beginPath();
  x.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  if (lit < 0.5) x.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
  else x.ellipse(0, 0, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2);
  x.restore();

  const face = x.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
  face.addColorStop(0, 'rgb(238,234,222)');
  face.addColorStop(1, 'rgb(196,192,182)');
  x.fillStyle = face;
  x.fill();

  x.save();
  x.clip(); // seas on the sunlit part only
  for (const [mx, my, mr] of MARIA) {
    const sea = x.createRadialGradient(mx * r, my * r, 0, mx * r, my * r, mr * r);
    sea.addColorStop(0, 'rgba(70,72,82,0.3)');
    sea.addColorStop(1, 'rgba(70,72,82,0)');
    x.fillStyle = sea;
    x.fillRect(-r, -r, 2 * r, 2 * r);
  }
  x.restore();
  return c;
}
