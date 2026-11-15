// All textures are generated procedurally at boot — the game ships no image files.
import * as THREE from 'three';
import { rng } from './util.js';

function tileNoise(size, period, seed) {
  const r = rng(seed);
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size);
  const s = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, vy = ty * ty * (3 - 2 * ty);
    const ya = (y0 % period) * period, yb = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, vx = tx * tx * (3 - 2 * tx);
      const xa = x0 % period, xb = (x0 + 1) % period;
      const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
      out[y * size + x] = a + (b - a) * vx + (c - a) * vy + (a - b - c + d) * vx * vy;
    }
  }
  return out;
}
function fbmTile(size, period, oct, seed) {
  const out = new Float32Array(size * size);
  let amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    const n = tileNoise(size, Math.min(size, period << o), seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function worleyEdges(size, cells, seed) {
  const r = rng(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x / size) * cells, py = (y / size) * cells;
    const cx = Math.floor(px), cy = Math.floor(py);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const k = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells);
      const dx = gx + pts[k * 2] - px, dy = gy + pts[k * 2 + 1] - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    out[y * size + x] = 1 - Math.min(1, (f2 - f1) * 3.2);   // 1 on cell edges (cracks)
  }
  return out;
}

export function makeNoiseTexture() {
  const S = 256;
  const r = fbmTile(S, 4, 5, 11), g = fbmTile(S, 32, 3, 23), b = fbmTile(S, 12, 4, 37), a = worleyEdges(S, 9, 51);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.min(255, Math.max(0, (r[i] - 0.5) * 1.9 + 0.5) * 255);
    data[i * 4 + 1] = Math.min(255, Math.max(0, (g[i] - 0.5) * 2.2 + 0.5) * 255);
    data[i * 4 + 2] = Math.min(255, Math.max(0, (b[i] - 0.5) * 2.6 + 0.5) * 255);
    data[i * 4 + 3] = a[i] * 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 2x2 particle atlas: soft glow | smoke puff | hard chip | flame
export function makeParticleAtlas() {
  const c = canvas(256, 256), x = c.getContext('2d'), r = rng(5);
  let g = x.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 46; i++) {                       // smoke: clustered soft blobs
    const a = r() * 6.283, d = r() * 34, px = 192 + Math.cos(a) * d, py = 64 + Math.sin(a) * d, rad = 14 + r() * 22;
    g = x.createRadialGradient(px, py, 0, px, py, rad);
    const al = 0.1 + r() * 0.16;
    g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 6.3); x.fill();
  }
  x.save(); x.translate(64, 192); x.fillStyle = '#fff'; x.beginPath();   // chip: irregular polygon
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283, d = 26 + r() * 22; x.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  x.closePath(); x.fill(); x.restore();
  for (let i = 0; i < 30; i++) {                       // flame: bright core, ragged
    const a = r() * 6.283, d = r() * 26, px = 192 + Math.cos(a) * d, py = 192 + Math.sin(a) * d, rad = 10 + r() * 20;
    g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 6.3); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function makeLeafTexture(pine = false) {
  const c = canvas(256, 256), x = c.getContext('2d'), r = rng(pine ? 77 : 9);
  x.clearRect(0, 0, 256, 256);
  if (pine) {
    for (let i = 0; i < 520; i++) {
      const px = 128 + (r() - 0.5) * 230 * (0.3 + r() * 0.7), py = 20 + r() * 220;
      const l = 14 + r() * 22, a = Math.PI / 2 + (r() - 0.5) * 1.6;
      const gr = 60 + r() * 60;
      x.strokeStyle = `rgb(${20 + r() * 25},${gr},${28 + r() * 20})`; x.lineWidth = 1.6 + r() * 1.6;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  } else {
    for (let i = 0; i < 150; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 104;
      const px = 128 + Math.cos(a) * d, py = 128 + Math.sin(a) * d;
      const gr = 82 + r() * 84, rd = 34 + r() * 60;
      x.fillStyle = `rgb(${rd},${gr},${24 + r() * 30})`;
      x.save(); x.translate(px, py); x.rotate(r() * 6.283);
      x.beginPath(); x.ellipse(0, 0, 9 + r() * 9, 4 + r() * 4, 0, 0, 6.3); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-12, 0); x.lineTo(12, 0); x.stroke();
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeBarkTexture() {
  const c = canvas(128, 256), x = c.getContext('2d'), r = rng(3);
  x.fillStyle = '#4b3a2b'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 420; i++) {
    const px = r() * 128, py = r() * 256, l = 20 + r() * 60, v = 30 + r() * 60;
    x.strokeStyle = `rgba(${v + 20},${v},${v - 14},${0.25 + r() * 0.4})`; x.lineWidth = 1 + r() * 3;
    x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + (r() - 0.5) * 8, py + l * 0.3, px + (r() - 0.5) * 8, py + l * 0.6, px + (r() - 0.5) * 6, py + l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeFlashTexture() {
  const c = canvas(128, 128), x = c.getContext('2d'), r = rng(8);
  x.translate(64, 64);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.283 + r() * 0.5, l = 30 + r() * 32, w = 5 + r() * 9;
    const g = x.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = g; x.beginPath();
    x.moveTo(Math.cos(a + 1.57) * w, Math.sin(a + 1.57) * w); x.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    x.lineTo(Math.cos(a - 1.57) * w, Math.sin(a - 1.57) * w); x.closePath(); x.fill();
  }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,200,90,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, 6.3); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
