// 2D navigation grid (0.5 m cells) derived from the brick world, with A* that can optionally path *through* walls
// at a cost — attackers use that to pick the weakest point to breach.
import { CELL, GX, GZ, HALF, G } from './util.js';

const N = 176, CS = 0.5, OFF = N * CS / 2;   // covers ±44 m
const cidx = (x, y, z) => x + GX * (z + GZ * y);

export class Nav {
  constructor() {
    this.blocked = new Uint8Array(N * N); this.g = new Float32Array(N * N); this.from = new Int32Array(N * N); this.state = new Uint8Array(N * N);
    this.heap = new Int32Array(N * N); this.hf = new Float32Array(N * N); this.budget = 0;
  }
  rebuild(world) {
    const occ = world.occ, b = this.blocked;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i + 0.5) * CS - OFF, wz = (j + 0.5) * CS - OFF;
      const gx = Math.floor((wx + HALF) / CELL) - 1, gz = Math.floor((wz + HALF) / CELL) - 1;
      let v = 0;
      if (gx >= 0 && gz >= 0 && gx < GX - 1 && gz < GZ - 1) {
        // find floor height (0 or a low slab) then require 1.5 m of clearance above a 0.5 m step
        for (let y = 2; y <= 7 && !v; y++) { const k = cidx(gx, y, gz); if (occ[k] || occ[k + 1] || occ[k + GX] || occ[k + GX + 1]) v = 1; }
      }
      b[j * N + i] = v;
    }
  }
  cell(x, z) { const i = Math.floor((x + OFF) / CS), j = Math.floor((z + OFF) / CS); return (i < 0 || j < 0 || i >= N || j >= N) ? -1 : j * N + i; }
  isBlocked(x, z) { const c = this.cell(x, z); return c >= 0 && this.blocked[c] === 1; }

  // returns array of {x,z} waypoints or null. breach>0 lets the path cross blocked cells at that extra cost
  path(sx, sz, tx, tz, breach = 0, maxNodes = 5000) {
    let s = this.cell(sx, sz), t = this.cell(tx, tz);
    if (s < 0 || t < 0) return [{ x: tx, z: tz }];
    if (s === t) return [{ x: tx, z: tz }];
    const { g, from, state, heap, hf, blocked } = this;
    state.fill(0);
    let hn = 0;
    const tix = t % N, tiz = (t / N) | 0;
    const push = (c, f) => { let i = hn++; heap[i] = c; hf[c] = f; while (i > 0) { const p = (i - 1) >> 1; if (hf[heap[p]] <= f) break; heap[i] = heap[p]; i = p; } heap[i] = c; };
    const pop = () => { const top = heap[0], last = heap[--hn]; let i = 0; const f = hf[last]; for (;;) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && hf[heap[c + 1]] < hf[heap[c]]) c++; if (hf[heap[c]] >= f) break; heap[i] = heap[c]; i = c; } heap[i] = last; return top; };
    g[s] = 0; from[s] = -1; state[s] = 1; push(s, 0);
    let found = -1, nodes = 0, best = s, bestH = 1e9;
    while (hn > 0 && nodes++ < maxNodes) {
      const c = pop(); if (state[c] === 2) continue; state[c] = 2;
      if (c === t) { found = c; break; }
      const ci = c % N, cj = (c / N) | 0;
      const h0 = Math.hypot(ci - tix, cj - tiz); if (h0 < bestH) { bestH = h0; best = c; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni; if (state[n] === 2) continue;
        let cost = (di && dj) ? 1.414 : 1;
        if (blocked[n]) { if (!breach && n !== t) continue; cost += breach; }
        else if (di && dj && (blocked[cj * N + ni] || blocked[nj * N + ci])) { if (!breach) continue; cost += breach * 0.5; }
        const ng = g[c] + cost;
        if (state[n] === 1 && ng >= g[n]) continue;
        g[n] = ng; from[n] = c; state[n] = 1; push(n, ng + Math.hypot(ni - tix, nj - tiz) * 1.05);
      }
    }
    let end = found >= 0 ? found : best;
    if (end === s) return null;
    const out = [];
    for (let c = end; c !== -1 && c !== s; c = from[c]) out.push({ x: (c % N + 0.5) * CS - OFF, z: (((c / N) | 0) + 0.5) * CS - OFF, b: blocked[c] });
    out.reverse();
    if (found >= 0) { out[out.length - 1].x = tx; out[out.length - 1].z = tz; }
    return out;
  }
}
