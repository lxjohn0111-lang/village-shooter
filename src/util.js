// Shared constants, math helpers and the global game context.
export const CELL = 0.25;          // metres per voxel cell
export const GX = 256, GY = 64, GZ = 256;
export const HALF = 32;            // plot half extent in metres (GX*CELL/2)
export const G = {};               // global game context, filled by main.js

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- value noise -----------------------------------------------------------
const PERM = new Uint8Array(512);
{
  const r = rng(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const X = xi & 255, Y = yi & 255;
  const a = PERM[PERM[X] + Y], b = PERM[PERM[X + 1] + Y];
  const c = PERM[PERM[X] + Y + 1], d = PERM[PERM[X + 1] + Y + 1];
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
}
export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// ---- terrain height (flat village plot, hills beyond) ------------------------
export function terrainH(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d < 37) return 0;
  const s = smooth(37, 130, d);
  let h = (fbm2(x * 0.011 + 31.7, z * 0.011 + 11.3, 4) - 0.45) * 26 * s;
  h += (fbm2(x * 0.05, z * 0.05, 3) - 0.5) * 2.2 * smooth(37, 60, d);
  const far = smooth(230, 620, Math.hypot(x, z));
  h += far * far * (18 + fbm2(x * 0.004 + 5, z * 0.004 + 9, 4) * 120);
  // lake basin to the west
  const lx = x + 105, lz = z - 62;
  const ld = Math.hypot(lx, lz);
  if (ld < 60) h = lerp(h, -3.2, smooth(60, 22, ld));
  return h;
}

export function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
  return String(n);
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
