import {moonPhase, moonSprite} from './moon';

// Night sky behind the UI, drawn with WebGL from what scripts/make-sky.mjs made at build time
// (public/sky/): the Milky Way's glow and the nebulae as one soft texture, the distant galaxies as
// sprites, and every star as a point, drawn at the panel's own resolution so even the faintest is
// crisp at 4K. It turns around the screen's centre; the stars twinkle on the GPU, tonight's moon
// turns with them, and every few seconds a shooting star crosses. The turn also keeps any one
// pixel from staying lit for long, which the OLED panel likes.
//
// Out of sight, the canvas lets go of its pixels, which at 4K is most of what the sky holds, so the
// app in front has that memory; the shaders, textures and stars stay on the GPU (a few MB), so
// coming back is immediate.

const W = 1920,
  H = 1080; // the layout's size; the sky covers any window like object-fit: cover
const TURN_MS = 9 * 60_000; // one full turn of the sky
const METEOR_MS = [3_000, 9_000]; // time between shooting stars
const MOON_R = 20; // the moon's radius, layout px
const MOON_ALPHA = 0.85; // kept a little dim
const MOON_MS = 60 * 60_000; // redrawn this often, as its phase creeps on
const FLOATS = 10; // per star in stars.bin (see make-sky.mjs)
const TAU = 2 * Math.PI;

interface Meta {
  S: number; // the turning square's side, layout px
  stars: number;
  twinkleSeconds: number; // every twinkle repeats within this
  slots: number; // galaxies in the atlas
  galaxies: {x: number; y: number; size: number; slot: number}[];
  moon: [number, number];
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

const canvas = document.getElementById('sky') as HTMLCanvasElement;
const gl = canvas.getContext('webgl', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false
});

// Where a point of the sky (or of the screen) lands: turned around u_origin by the sky's angle,
// then scaled to device pixels around the screen's centre.
const PLACE = `
uniform vec2 u_origin;
uniform vec2 u_turn;
uniform float u_scale;
uniform vec2 u_viewport;
vec4 place (vec2 p) {
  vec2 q = p - u_origin;
  q = vec2(q.x * u_turn.x - q.y * u_turn.y, q.x * u_turn.y + q.y * u_turn.x) * u_scale / (u_viewport * 0.5);
  return vec4(q.x, -q.y, 0.0, 1.0);
}`;

// Stars: a dot is an antialiased disc (one smaller than a pixel drawn a pixel wide, as dim as the
// light it would give); a glow is the soft sprite the brighter stars always had, a white core
// fading out through its tint. Both are added to the sky.
const STARS_VS =
  PLACE +
  `
attribute vec2 a_pos;
attribute float a_size;
attribute float a_kind;
attribute vec4 a_color;
attribute vec2 a_twinkle;
uniform float u_time;
varying vec4 v_color;
varying float v_kind;
varying float v_radius;
varying float v_side;
void main () {
  gl_Position = place(a_pos);
  float a = a_color.a;
  if (a_twinkle.x > 0.0) a *= 0.6 + 0.4 * sin(u_time * a_twinkle.x + a_twinkle.y);
  v_color = vec4(a_color.rgb, a);
  v_kind = a_kind;
  float r = a_size * u_scale;
  if (a_kind < 0.5) {
    float re = max(r, 0.7);
    v_color.a *= r * r / (re * re);
    v_radius = re;
    v_side = ceil(re * 2.0 + 2.0);
  } else {
    v_radius = 0.0;
    v_side = r;
  }
  gl_PointSize = v_side;
}`;
const STARS_FS = `
precision mediump float;
varying vec4 v_color;
varying float v_kind;
varying float v_radius;
varying float v_side;
void main () {
  float d = length(gl_PointCoord - 0.5) * v_side;
  if (v_kind < 0.5) {
    gl_FragColor = vec4(v_color.rgb * v_color.a * clamp(v_radius + 0.5 - d, 0.0, 1.0), 0.0);
    return;
  }
  float r = d / (v_side * 0.5);
  vec3 c = v_color.rgb;
  float a;
  if (r < 0.1) { c = mix(vec3(1.0), c, r / 0.1); a = mix(1.0, 0.9, r / 0.1); }
  else if (r < 0.3) a = mix(0.9, 0.22, (r - 0.1) / 0.2);
  else a = mix(0.22, 0.0, clamp((r - 0.3) / 0.7, 0.0, 1.0));
  gl_FragColor = vec4(c * a * v_color.a, 0.0);
}`;

// Textured squares: the haze, the galaxies and the moon.
const QUADS_VS =
  PLACE +
  `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main () { gl_Position = place(a_pos); v_uv = a_uv; }`;
const QUADS_FS = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_alpha;
varying vec2 v_uv;
void main () { gl_FragColor = texture2D(u_tex, v_uv) * u_alpha; }`;

// A shooting star's tail: white, fading towards its end.
const TAIL_VS =
  PLACE +
  `
attribute vec2 a_pos;
attribute float a_alpha;
varying float v_alpha;
void main () { gl_Position = place(a_pos); v_alpha = a_alpha; }`;
const TAIL_FS = `
precision mediump float;
varying float v_alpha;
void main () { gl_FragColor = vec4(v_alpha); }`;

interface Program {
  p: WebGLProgram;
  a: Record<string, number>;
  u: Record<string, WebGLUniformLocation | null>;
}
interface Gpu {
  stars: Program;
  quads: Program;
  tail: Program;
  starBuf: WebGLBuffer;
  hazeBuf: WebGLBuffer;
  galaxyBuf: WebGLBuffer;
  moonBuf: WebGLBuffer;
  tailBuf: WebGLBuffer;
  headBuf: WebGLBuffer;
  haze: WebGLTexture;
  galaxies: WebGLTexture;
  moon: WebGLTexture;
}

let data: {
  meta: Meta;
  stars: Float32Array;
  haze: HTMLImageElement;
  galaxies: HTMLImageElement;
} | null = null;
let gpu: Gpu | null = null;
let moonAt = -Infinity,
  moonScale = 0,
  moonShown = false;
let meteor: Meteor | null = null;
let nextMeteor = 0;

function program(vs: string, fs: string, attributes: string[], uniforms: string[]): Program {
  const g = gl!;
  const p = g.createProgram()!;
  for (const [type, src] of [
    [g.VERTEX_SHADER, vs],
    [g.FRAGMENT_SHADER, fs]
  ] as const) {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS))
      throw new Error(g.getShaderInfoLog(s) ?? 'shader');
    g.attachShader(p, s);
  }
  g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS))
    throw new Error(g.getProgramInfoLog(p) ?? 'program');
  return {
    p,
    a: Object.fromEntries(attributes.map((n) => [n, g.getAttribLocation(p, n)])),
    u: Object.fromEntries(
      ['u_origin', 'u_turn', 'u_scale', 'u_viewport', ...uniforms].map((n) => [
        n,
        g.getUniformLocation(p, n)
      ])
    )
  };
}

function buffer(values: Float32Array | number[], usage: GLenum = gl!.STATIC_DRAW) {
  const b = gl!.createBuffer()!;
  gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
  gl!.bufferData(
    gl!.ARRAY_BUFFER,
    values instanceof Float32Array ? values : new Float32Array(values),
    usage
  );
  return b;
}

function texture(source: TexImageSource | null, mipmaps = false) {
  const g = gl!;
  const t = g.createTexture()!;
  g.bindTexture(g.TEXTURE_2D, t);
  g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  if (source) g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  if (mipmaps) g.generateMipmap(g.TEXTURE_2D);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, mipmaps ? g.LINEAR_MIPMAP_LINEAR : g.LINEAR);
  return t;
}

/** A square of side `size` around (x, y), as two triangles of [x, y, u, v], taking the `u0`–`u1`
 *  stretch of its texture. */
function square(x: number, y: number, size: number, u0 = 0, u1 = 1) {
  const x0 = x - size / 2,
    x1 = x + size / 2,
    y0 = y - size / 2,
    y1 = y + size / 2;
  return [x0, y0, u0, 0, x1, y0, u1, 0, x0, y1, u0, 1, x0, y1, u0, 1, x1, y0, u1, 0, x1, y1, u1, 1];
}

/** Put the sky on the GPU: programs, the stars, the haze, the galaxies and a place for the moon. */
function setup() {
  if (!gl || !data) return;
  const {meta} = data,
    S = meta.S;
  gpu = {
    stars: program(
      STARS_VS,
      STARS_FS,
      ['a_pos', 'a_size', 'a_kind', 'a_color', 'a_twinkle'],
      ['u_time']
    ),
    quads: program(QUADS_VS, QUADS_FS, ['a_pos', 'a_uv'], ['u_tex', 'u_alpha']),
    tail: program(TAIL_VS, TAIL_FS, ['a_pos', 'a_alpha'], []),
    starBuf: buffer(data.stars),
    hazeBuf: buffer(square(S / 2, S / 2, S)),
    galaxyBuf: buffer(
      meta.galaxies.flatMap((g) =>
        square(g.x, g.y, g.size, g.slot / meta.slots, (g.slot + 1) / meta.slots)
      )
    ),
    moonBuf: buffer(square(meta.moon[0], meta.moon[1], 4 * MOON_R)),
    tailBuf: buffer([], gl.DYNAMIC_DRAW),
    headBuf: buffer([], gl.DYNAMIC_DRAW),
    haze: texture(data.haze),
    galaxies: texture(data.galaxies, true),
    moon: texture(null)
  };
  moonAt = -Infinity; // draw the moon again, onto its new texture
}

/** Bind `prog` and its place() uniforms: turning around (ox, oy) by `angle`. */
function use(prog: Program, ox: number, oy: number, angle: number, scale: number) {
  const g = gl!;
  g.useProgram(prog.p);
  g.uniform2f(prog.u.u_origin, ox, oy);
  g.uniform2f(prog.u.u_turn, Math.cos(angle), Math.sin(angle));
  g.uniform1f(prog.u.u_scale, scale);
  g.uniform2f(prog.u.u_viewport, canvas.width, canvas.height);
}

/** Point `prog`'s attributes [name, floats] into `buf`, interleaved, and return a function that
 *  lets them go again. */
function attributes(prog: Program, buf: WebGLBuffer, layout: [string, number][]) {
  const g = gl!;
  const stride = layout.reduce((n, [, size]) => n + size, 0) * 4;
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  let offset = 0;
  for (const [name, size] of layout) {
    g.enableVertexAttribArray(prog.a[name]);
    g.vertexAttribPointer(prog.a[name], size, g.FLOAT, false, stride, offset);
    offset += size * 4;
  }
  return () => {
    for (const [name] of layout) g.disableVertexAttribArray(prog.a[name]);
  };
}

const STAR_LAYOUT: [string, number][] = [
  ['a_pos', 2],
  ['a_size', 1],
  ['a_kind', 1],
  ['a_color', 4],
  ['a_twinkle', 2]
];
const QUAD_LAYOUT: [string, number][] = [
  ['a_pos', 2],
  ['a_uv', 2]
];

function drawQuads(buf: WebGLBuffer, tex: WebGLTexture, vertices: number, alpha: number) {
  const g = gl!,
    prog = gpu!.quads;
  g.activeTexture(g.TEXTURE0);
  g.bindTexture(g.TEXTURE_2D, tex);
  g.uniform1i(prog.u.u_tex, 0);
  g.uniform1f(prog.u.u_alpha, alpha);
  const done = attributes(prog, buf, QUAD_LAYOUT);
  g.drawArrays(g.TRIANGLES, 0, vertices);
  done();
}

function shootingStar(t: number, scale: number) {
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
  const g = gl!,
    fade = Math.sin((Math.PI * age) / m.life); // in and out
  const hx = m.x + m.dx * m.speed * age,
    hy = m.y + m.dy * m.speed * age;
  const tail = m.len * Math.min(1, age / 150);
  const tx = hx - m.dx * tail,
    ty = hy - m.dy * tail;
  const nx = -m.dy * 0.8,
    ny = m.dx * 0.8; // half its 1.6px width, across it

  use(gpu!.tail, W / 2, H / 2, 0, scale);
  g.bindBuffer(g.ARRAY_BUFFER, gpu!.tailBuf);
  g.bufferData(
    g.ARRAY_BUFFER,
    new Float32Array([
      tx - nx,
      ty - ny,
      0,
      tx + nx,
      ty + ny,
      0,
      hx - nx,
      hy - ny,
      0.9 * fade,
      hx + nx,
      hy + ny,
      0.9 * fade
    ]),
    g.DYNAMIC_DRAW
  );
  let done = attributes(gpu!.tail, gpu!.tailBuf, [
    ['a_pos', 2],
    ['a_alpha', 1]
  ]);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  done();

  // its head: a white glow, like a bright star's
  use(gpu!.stars, W / 2, H / 2, 0, scale);
  g.bindBuffer(g.ARRAY_BUFFER, gpu!.headBuf);
  g.bufferData(
    g.ARRAY_BUFFER,
    new Float32Array([hx, hy, 10, 1, 1, 1, 1, fade, 0, 0]),
    g.DYNAMIC_DRAW
  );
  done = attributes(gpu!.stars, gpu!.headBuf, STAR_LAYOUT);
  g.drawArrays(g.POINTS, 0, 1);
  done();
}

let raf = 0;
let wanted = true; // false while the panel is off: nothing to see, so nothing drawn

function run() {
  cancelAnimationFrame(raf);
  if (wanted && gpu && !document.hidden) raf = requestAnimationFrame(frame);
}

/** Stop drawing while the panel is off, and start again when it's back. */
export function setSkyRunning(on: boolean) {
  wanted = on;
  run();
}

function frame(t: number) {
  raf = requestAnimationFrame(frame);
  if (!gl || !gpu || !data) return;
  const {meta} = data,
    S = meta.S;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(innerWidth * dpr),
    ch = Math.round(innerHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  gl.viewport(0, 0, cw, ch);
  const scale = dpr * Math.max(innerWidth / W, innerHeight / H); // device px per layout px
  const angle = (t / TURN_MS) * TAU;

  // the haze, opaque, covering the screen at any angle
  gl.disable(gl.BLEND);
  use(gpu.quads, S / 2, S / 2, angle, scale);
  drawQuads(gpu.hazeBuf, gpu.haze, 6, 1);

  // the stars and the galaxies, added to it
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  use(gpu.stars, S / 2, S / 2, angle, scale);
  gl.uniform1f(gpu.stars.u.u_time, (t / 1000) % meta.twinkleSeconds);
  const done = attributes(gpu.stars, gpu.starBuf, STAR_LAYOUT);
  gl.drawArrays(gl.POINTS, 0, meta.stars);
  done();
  use(gpu.quads, S / 2, S / 2, angle, scale);
  drawQuads(gpu.galaxyBuf, gpu.galaxies, meta.galaxies.length * 6, 1);

  // the moon over them, hiding the stars behind it, redrawn as its phase creeps on
  if (Date.now() - moonAt > MOON_MS || moonScale !== scale) {
    const sprite = moonSprite(MOON_R * scale, moonPhase(new Date()));
    moonShown = !!sprite;
    if (sprite) {
      gl.bindTexture(gl.TEXTURE_2D, gpu.moon);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite);
    }
    moonAt = Date.now();
    moonScale = scale;
  }
  if (moonShown) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuads(gpu.moonBuf, gpu.moon, 6, MOON_ALPHA);
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  shootingStar(t, scale);
}

let loading: Promise<void> | null = null;

async function load() {
  const image = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };
  const [meta, stars, haze, galaxies] = await Promise.all([
    fetch('sky/sky.json').then((r) => r.json() as Promise<Meta>),
    fetch('sky/stars.bin')
      .then((r) => r.arrayBuffer())
      .then((b) => new Float32Array(b)),
    image('sky/haze.png'),
    image('sky/galaxies.png')
  ]);
  if (stars.length !== meta.stars * FLOATS) throw new Error('sky: stars.bin and sky.json disagree');
  data = {meta, stars, haze, galaxies};
}

async function show() {
  if (!gl) return;
  if (!data) {
    loading ??= load().finally(() => {
      loading = null;
    });
    await loading;
  }
  if (document.hidden || gl.isContextLost()) return;
  if (!gpu) setup();
  canvas.classList.add('ready');
  run();
}

function hide() {
  cancelAnimationFrame(raf);
  canvas.classList.remove('ready');
  canvas.width = canvas.height = 1; // its pixels; the next frame sizes it again
}

// Out of sight, let the canvas's pixels go; back in sight, draw again. A lost context (the GPU
// reset) takes everything with it, so it's all put back once it's restored.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
  else show();
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  cancelAnimationFrame(raf);
  gpu = null;
});
canvas.addEventListener('webglcontextrestored', () => {
  show();
});

// Let the clock and the row paint first, then fade the sky in.
nextMeteor = performance.now() + 3000;
requestAnimationFrame(() => setTimeout(show, 0));
