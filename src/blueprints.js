// Brick-by-brick building generators + procedural village layouts.
// Every generator emits individual pieces (bricks, beams, tiles, planks) so everything can be shot apart.
import { CELL, GX, GZ, HALF, rng, clamp, hashStr } from './util.js';
import { M, MATS, F_LOOT, F_EXPLOSIVE, F_CORE, F_FREE } from './materials.js';

class Bld {
  constructor(w, d, r, lvl, ctx) { this.w = w; this.d = d; this.r = r; this.lvl = lvl; this.ctx = ctx || {}; this.p = []; this.meta = { spawns: [], lamps: [], door: [w / 2, d + 2] }; }
  box(mat, x, y, z, sx, sy, sz, flags = 0, tint = -1) { if (sx > 0 && sy > 0 && sz > 0) this.p.push([mat, x, y, z, sx, sy, sz, flags, tint]); }
  fill(mat, x, y, z, sx, sy, sz, ux, uy, uz, flags = 0, tint = -1) {
    for (let j = 0; j < sy; j += uy) for (let k = 0; k < sz; k += uz) {
      const off = ((j / uy + k / uz) % 2) ? ux >> 1 : 0;
      let i = 0;
      while (i < sx) { let e = i + ux - ((i + off) % ux); if (e > sx) e = sx; this.box(mat, x + i, y + j, z + k, e - i, Math.min(uy, sy - j), Math.min(uz, sz - k), flags, tint); i = e; }
    }
  }
  // running-bond wall. open = [[a0,a1,y0,y1]] in along-axis / absolute-y cells
  wall(mat, x, y, z, len, h, axis, o = {}) {
    const L = o.L || 2, H = o.H || 1, T = o.T || 1, open = o.open || [], ph = o.phase || 0;
    for (let r = 0; r * H < h; r++) {
      const yy = y + r * H, hh = Math.min(H, h - r * H), off = ((r + ph) % 2) ? L >> 1 : 0;
      let a = 0;
      while (a < len) {
        const op = open.find((q) => a >= q[0] && a < q[1] && yy + hh > q[2] && yy < q[3]);
        if (op) { a = op[1]; continue; }
        let end = a + L - ((a + off) % L); if (end > len) end = len;
        for (const q of open) if (q[0] > a && q[0] < end && yy + hh > q[2] && yy < q[3]) end = q[0];
        if (axis === 'x') this.box(mat, x + a, yy, z, end - a, hh, T); else this.box(mat, x, yy, z + a, T, hh, end - a);
        a = end;
      }
    }
  }
  // gable roof; axis = ridge direction, W = span across (even), len along ridge
  roof(mat, x0, y0, z0, W, len, axis, gmat = -1, g0 = -1, g1 = -1) {
    const rows = (W >> 1) - 1, U = 4;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? 2 : 0; let a = 0;
      while (a < len) {
        let e = a + U - ((a + off) % U); if (e > len) e = len;
        if (axis === 'z') { this.box(mat, x0 + r, y0 + r, z0 + a, 2, 1, e - a, 1); this.box(mat, x0 + W - 2 - r, y0 + r, z0 + a, 2, 1, e - a, 3); }
        else { this.box(mat, x0 + a, y0 + r, z0 + r, e - a, 1, 2, 2); this.box(mat, x0 + a, y0 + r, z0 + W - 2 - r, e - a, 1, 2, 4); }
        a = e;
      }
      if (gmat >= 0) {
        const gl = W - 4 - 2 * r;
        if (gl > 0) for (const g of [g0, g1]) { if (g < 0) continue; if (axis === 'z') this.wall(gmat, x0 + r + 2, y0 + r, g, gl, 1, 'x', { phase: r }); else this.wall(gmat, g, y0 + r, z0 + r + 2, gl, 1, 'z', { phase: r }); }
      }
    }
    if (axis === 'z') this.fill(mat, x0 + (W >> 1) - 1, y0 + rows, z0, 2, 1, len, 2, 1, 4); else this.fillZ(mat, x0, y0 + rows, z0 + (W >> 1) - 1, len, 1, 2);
  }
  fillZ(mat, x, y, z, sx, sy, sz) { for (let i = 0; i < sx; i += 4) this.box(mat, x + i, y, z, Math.min(4, sx - i), sy, sz); }
  post(mat, x, y, z, h, t = 1) { for (let j = 0; j < h; j += 4) this.box(mat, x, y + j, z, t, Math.min(4, h - j), t); }
  beamX(mat, x, y, z, len, t = 1) { for (let i = 0; i < len; i += 6) this.box(mat, x + i, y, z, Math.min(6, len - i), t, t); }
  beamZ(mat, x, y, z, len, t = 1) { for (let i = 0; i < len; i += 6) this.box(mat, x, y, z + i, t, t, Math.min(6, len - i)); }
  spawn(kind, x, y, z, extra) { this.meta.spawns.push(Object.assign({ kind, x, y, z }, extra || {})); }
  lamp(x, y, z, intensity = 34, color = 0xff9a4a) { this.meta.lamps.push({ x, y, z, intensity, color }); }
  // rectangular spiral ramp of treads hugging the inside of a shaft
  spiral(mat, ix0, iz0, ix1, iz1, y0, y1, tw) {
    const path = [];
    for (let x = ix0; x < ix1; x++) path.push([x, iz0]);
    for (let z = iz0; z < iz1; z++) path.push([ix1, z]);
    for (let x = ix1; x > ix0; x--) path.push([x, iz1]);
    for (let z = iz1; z > iz0; z--) path.push([ix0, z]);
    const used = [];
    for (let i = 0; y0 + i < y1; i++) { const c = path[i % path.length]; this.box(mat, c[0], y0 + i, c[1], tw, 1, tw); if (y1 - (y0 + i) < 12) used.push(c); }
    return used;
  }
}

// --------------------------------------------------------------- houses
function furnish(b, x0, z0, w, d, y) {
  const r = b.r;
  if (r() < 0.9) { const tx = x0 + 1 + r.int(0, Math.max(0, w - 7)), tz = z0 + 1; b.box(M.WOOD, tx, y + 2, tz, 5, 1, 3); b.box(M.TIMBER, tx, y, tz, 1, 2, 1); b.box(M.TIMBER, tx + 4, y, tz, 1, 2, 1); b.box(M.TIMBER, tx, y, tz + 2, 1, 2, 1); b.box(M.TIMBER, tx + 4, y, tz + 2, 1, 2, 1); b.box(M.WOOD, tx + 1, y, tz + 3, 2, 2, 2); }
  if (r() < 0.85) { const bx = x0 + w - 4, bz = z0 + 1; b.box(M.TIMBER, bx, y, bz, 3, 1, 8); b.box(M.CLOTH, bx, y + 1, bz + 2, 3, 1, 6, 0, r.pick([0x7a2f2f, 0x2f4a7a, 0x4a6b3a, 0x8a7a55])); b.box(M.HAY, bx, y + 1, bz, 3, 1, 2); b.box(M.TIMBER, bx, y + 1, bz - 1 < z0 ? bz : bz, 0, 0, 0); }
  if (r() < 0.7) { const cx = x0 + r.int(0, 2), cz = z0 + d - 3; b.box(M.CRATE, cx, y, cz, 3, 3, 3); if (r() < 0.5) b.box(M.CRATE, cx + 3, y, cz + 1, 2, 2, 2); }
  if (r() < 0.6) { const sx = x0 + w - 2, sz = z0 + d - 7; b.box(M.WOOD, sx, y + 3, sz, 2, 1, 6); b.box(M.WOOD, sx, y + 6, sz, 2, 1, 6); b.box(M.TIMBER, sx, y, sz, 2, 3, 1); b.box(M.TIMBER, sx, y, sz + 5, 2, 3, 1); b.box(M.TIMBER, sx, y + 4, sz, 2, 2, 1); b.box(M.TIMBER, sx, y + 4, sz + 5, 2, 2, 1); }
}

function houseGen(style) {
  return (b) => {
    const r = b.r, w = b.w, d = b.d, two = style === 'tudor';
    const wh = two ? 20 : 11;
    const wm = { brick: M.BRICK, stone: M.COBBLE, wood: M.WOOD, tudor: M.PLASTER, ashen: M.DARKBRICK }[style];
    const o = style === 'wood' ? { L: 4 } : {};
    const x0 = 1, z0 = 1, x1 = w - 2, z1 = d - 2, iw = w - 2, id = d - 2;
    const doorA = Math.floor(iw / 2) - 2 + r.int(-2, 2);
    const wins = (len, floors, skip) => { const out = []; const n = Math.max(1, Math.floor((len - 4) / 9)); for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) { const a = Math.floor((len / (n + 1)) * (i + 1)) - 2; if (skip && f === 0 && Math.abs(a - skip) < 6) continue; out.push([a, a + 4, 4 + f * 10, 8 + f * 10]); } return out; };
    const fo = [[doorA, doorA + 4, 1, 10], ...wins(iw, two ? 2 : 1, doorA)], bo = wins(iw, two ? 2 : 1), so = wins(id, two ? 2 : 1);
    // foundation course + walls
    const base = style === 'wood' ? M.COBBLE : style === 'tudor' ? M.COBBLE : wm;
    const hb = style === 'tudor' ? 3 : 1;
    b.wall(base, x0, 0, z1, iw, hb, 'x', { open: fo }); b.wall(base, x0, 0, z0, iw, hb, 'x'); b.wall(base, x0, 0, z0 + 1, id - 2, hb, 'z'); b.wall(base, x1, 0, z0 + 1, id - 2, hb, 'z');
    if (style === 'tudor') {
      const frame = (ax, x, z, len, open) => {
        for (let a = 0; a < len; a++) {
          const isPost = a === 0 || a === len - 1 || a % 6 === 0;
          if (!isPost) continue;
          if (open.some((q) => a >= q[0] && a < q[1])) continue;
          if (ax === 'x') b.post(M.TIMBER, x + a, hb, z, wh - hb); else b.post(M.TIMBER, x, hb, z + a, wh - hb);
        }
        const posts = []; for (let a = 0; a < len; a++) if (a === 0 || a === len - 1 || a % 6 === 0) if (!open.some((q) => a >= q[0] && a < q[1])) posts.push([a, a + 1, 0, 99]);
        const beams = [[0, len, 10, 11]];
        const all = open.concat(posts);
        for (const yb of [10, wh - 1]) for (let a = 0; a < len;) { if (posts.some((q) => a >= q[0] && a < q[1])) { a++; continue; } let e = a; while (e < len && e - a < 6 && !posts.some((q) => e >= q[0] && e < q[1])) e++; if (ax === 'x') b.box(M.TIMBER, x + a, yb, z, e - a, 1, 1); else b.box(M.TIMBER, x, yb, z + a, 1, 1, e - a); a = e; }
        const op2 = all.concat([[0, len, 10, 11], [0, len, wh - 1, wh]]);
        if (ax === 'x') b.wall(M.PLASTER, x, hb, z, len, wh - hb, 'x', { L: 4, H: 1, open: op2 }); else b.wall(M.PLASTER, x, hb, z, len, wh - hb, 'z', { L: 4, H: 1, open: op2 });
        void beams;
      };
      frame('x', x0, z1, iw, fo); frame('x', x0, z0, iw, bo); frame('z', x0, z0 + 1, id - 2, so.map((q) => [q[0] - 1, q[1] - 1, q[2], q[3]])); frame('z', x1, z0 + 1, id - 2, so.map((q) => [q[0] - 1, q[1] - 1, q[2], q[3]]));
    } else {
      b.wall(wm, x0, hb, z1, iw, wh - hb, 'x', Object.assign({ open: fo.concat([[doorA - 1, doorA + 5, 10, 11]]), phase: 1 }, o)); b.wall(wm, x0, hb, z0, iw, wh - hb, 'x', Object.assign({ open: bo, phase: 1 }, o));
      const sz = so.map((q) => [q[0] - 1, q[1] - 1, q[2], q[3]]);
      b.wall(wm, x0, hb, z0 + 1, id - 2, wh - hb, 'z', Object.assign({ open: sz }, o)); b.wall(wm, x1, hb, z0 + 1, id - 2, wh - hb, 'z', Object.assign({ open: sz }, o));
    }
    // lintels + glass
    b.box(M.TIMBER, x0 + doorA - 1, 10, z1, 6, 1, 1);
    for (const q of fo.slice(1)) { b.box(M.GLASS, x0 + q[0], q[2], z1, 4, 4, 1); }
    for (const q of bo) b.box(M.GLASS, x0 + q[0], q[2], z0, 4, 4, 1);
    for (const q of so) { b.box(M.GLASS, x0, q[2], z0 + q[0], 1, 4, 4); b.box(M.GLASS, x1, q[2], z0 + q[0], 1, 4, 4); }
    // floor
    b.fill(M.WOOD, x0 + 1, 0, z0 + 1, iw - 2, 1, id - 2, 4, 1, 2);
    furnish(b, x0 + 1, z0 + 1, iw - 2, id - 2, 1);
    if (two) {
      const sx = x0 + 1, szz = z0 + 1;      // staircase along back wall
      for (let i = 0; i < 10; i++) b.box(M.WOOD, sx + i, 1 + i, szz, 2, 1, 3);
      for (let k = 0; k < id - 2; k += 2) for (let i = 0; i < iw - 2;) {
        const e = Math.min(iw - 2, i + 4);
        if (k < 4 && i < 13) { i = 13; continue; }
        b.box(M.WOOD, x0 + 1 + i, 10, z0 + 1 + k, e - i, 1, Math.min(2, id - 2 - k)); i = e;
      }
      b.box(M.WOOD, x0 + 11, 10, szz, 2, 1, 3);
      furnish(b, x0 + 1, z0 + 5, iw - 2, id - 6, 11);
    }
    // chimney + hearth (built before the roof so the tiles leave a gap around it)
    const cx = x0 + 1, cz = z0 + Math.floor(id / 2) - 1, ctop = wh + (d >> 1) + 2;
    for (let y = 1; y < ctop; y++) { if (y < 4) { b.box(M.BRICK, cx, y, cz, 1, 1, 2); if (y === 3) b.box(M.BRICK, cx + 1, y, cz, 1, 1, 2); } else if (y % 2) { b.box(M.BRICK, cx, y, cz, 2, 1, 1); b.box(M.BRICK, cx, y, cz + 1, 2, 1, 1); } else { b.box(M.BRICK, cx, y, cz, 1, 1, 2); b.box(M.BRICK, cx + 1, y, cz, 1, 1, 2); } }
    b.box(M.EMBER, cx + 1, 1, cz, 1, 1, 2);
    b.lamp(cx + 2.5, 3, cz + 1, 16);
    const rm = style === 'wood' ? M.THATCH : style === 'stone' ? M.SLATE : style === 'ashen' ? M.SLATE : style === 'tudor' ? M.TILE : (r() < 0.6 ? M.TILE : M.SLATE);
    b.roof(rm, 0, wh, 0, d, w, 'x', style === 'tudor' ? M.PLASTER : wm, x0, x1);
    b.meta.door = [x0 + doorA + 2, d + 3];
    if (b.ctx.militia) b.spawn('guard', x0 + doorA + 2, 0, d + 4);
  };
}

// --------------------------------------------------------------- hall (holds the Ember Heart)
function hallGen(b) {
  const L = b.lvl, r = b.r, W = b.w;
  const s = [28, 30, 32, 34, 36][L - 1], wh = [12, 14, 20, 22, 24][L - 1];
  const wm = [M.WOOD, M.COBBLE, M.STONE, M.STONE, M.STONE][L - 1], rm = [M.THATCH, M.TILE, M.SLATE, M.SLATE, M.SLATE][L - 1];
  const o0 = (W - s) >> 1, x0 = o0, z0 = o0, x1 = o0 + s - 2, z1 = o0 + s - 2, T = 2, il = s - 4;
  const U = L >= 3 ? { L: 4, H: 2, T: 2 } : { L: wm === M.WOOD ? 4 : 2, H: 1, T: 2 };
  const dA = (s >> 1) - 3;
  const win = (len, f) => { const out = []; for (let a = 5; a + 4 < len - 3; a += 8) for (let k = 0; k < f; k++) out.push([a, a + 3, 4 + k * 10, 9 + k * 10 - (U.H === 2 ? 1 : 0)]); return out; };
  const floors = L >= 3 ? 2 : 1;
  const fo = [[dA, dA + 6, 0, 10], ...win(s, floors).filter((q) => q[1] < dA - 1 || q[0] > dA + 7)];
  b.wall(wm, x0, 0, z1, s, wh, 'x', Object.assign({ open: fo }, U)); b.wall(wm, x0, 0, z0, s, wh, 'x', Object.assign({ open: win(s, floors) }, U));
  const sw = win(il, floors);
  b.wall(wm, x0, 0, z0 + T, il, wh, 'z', Object.assign({ open: sw }, U)); b.wall(wm, x1, 0, z0 + T, il, wh, 'z', Object.assign({ open: sw }, U));
  b.beamX(M.TIMBER, x0 + dA - 1, 10, z1, 8, 1); b.beamX(M.TIMBER, x0 + dA - 1, 10, z1 + 1, 8, 1);
  b.fill(L >= 3 ? M.STONE : M.WOOD, x0 + T, 0, z0 + T, il, 1, il, 4, 1, 4);
  // the Ember Heart: glowing monolith on a plinth
  const c = W >> 1, ch = 5 + L;
  b.fill(M.STONE, c - 3, 1, c - 3, 6, 1, 6, 2, 1, 2); b.fill(M.STONE, c - 2, 2, c - 2, 4, 1, 4, 2, 1, 2);
  for (let i = 0; i < ch; i++) b.box(M.EMBER, c - 1, 3 + i * 2, c - 1, 2, 2, 2, F_CORE);
  b.box(M.EMBER, c - 3, 2, c - 3, 1, 2, 1, F_CORE); b.box(M.EMBER, c + 2, 2, c + 2, 1, 3, 1, F_CORE); b.box(M.EMBER, c + 2, 2, c - 3, 1, 1, 1, F_CORE); b.box(M.EMBER, c - 3, 2, c + 2, 1, 2, 1, F_CORE);
  b.meta.core = [c, 3 + ch, c]; b.lamp(c, 6, c + 2.5, 60, 0xff7a22);
  // gallery floor with an opening above the heart
  if (floors === 2) {
    for (let k = 0; k < il; k += 4) for (let i = 0; i < il; i += 4) {
      const gx = x0 + T + i, gz = z0 + T + k;
      if (Math.abs(gx + 2 - c) < 7 && Math.abs(gz + 2 - c) < 7) continue;
      if (i < 14 && k < 4) continue;
      b.box(M.WOOD, gx, 10, gz, Math.min(4, il - i), 1, Math.min(4, il - k));
    }
    for (let i = 0; i < 10; i++) b.box(M.WOOD, x0 + T + i, 1 + i, z0 + T, 2, 1, 4);
    b.box(M.WOOD, x0 + T + 10, 10, z0 + T, 4, 1, 4);
    for (const [px, pz] of [[c - 8, c - 8], [c + 7, c - 8], [c - 8, c + 7], [c + 7, c + 7]]) b.post(M.TIMBER, px, 1, pz, 9);
    b.spawn('elite', x0 + T + 18, 11, z0 + T + 3); b.spawn('guard', x1 - 4, 11, z1 - 4);
  }
  // interior dressing
  b.box(M.CRATE, x0 + T + 1, 1, z1 - 4, 3, 3, 3); b.box(M.CRATE, x0 + T + 4, 1, z1 - 3, 2, 2, 2);
  b.box(M.WOOD, x1 - 5, 3, z0 + T + 2, 4, 1, 8); b.post(M.TIMBER, x1 - 5, 1, z0 + T + 2, 2); b.post(M.TIMBER, x1 - 2, 1, z0 + T + 9, 2); b.post(M.TIMBER, x1 - 5, 1, z0 + T + 9, 2); b.post(M.TIMBER, x1 - 2, 1, z0 + T + 2, 2);
  // corner turrets for high levels
  if (L >= 4) for (const [tx, tz] of [[x0 - 3, z0 - 3], [x1 - 1, z0 - 3], [x0 - 3, z1 - 1], [x1 - 1, z1 - 1]]) {
    b.wall(M.STONE, tx, 0, tz, 6, wh + 8, 'x', { L: 4, H: 2, T: 1 }); b.wall(M.STONE, tx, 0, tz + 5, 6, wh + 8, 'x', { L: 4, H: 2, T: 1, phase: 1 });
    b.wall(M.STONE, tx, 0, tz + 1, 4, wh + 8, 'z', { L: 4, H: 2, T: 1, phase: 1 }); b.wall(M.STONE, tx + 5, 0, tz + 1, 4, wh + 8, 'z', { L: 4, H: 2, T: 1 });
    b.fill(M.SLATE, tx, wh + 8, tz, 6, 1, 6, 2, 1, 2); b.fill(M.SLATE, tx + 1, wh + 9, tz + 1, 4, 1, 4, 2, 1, 2); b.box(M.SLATE, tx + 2, wh + 10, tz + 2, 2, 2, 2);
  }
  b.roof(rm, x0 - 1, wh, z0 - 1, s + 2, s + 2, 'x', wm, x0, x1 + 1);
  // banners either side of the door
  const tint = b.ctx.tint !== undefined ? b.ctx.tint : 0xb02a2a;
  if (L >= 2) for (const bx of [x0 + dA - 4, x0 + dA + 8]) { b.box(M.TIMBER, bx, 12, z1 + 2, 3, 1, 1); b.box(M.CLOTH, bx, 5, z1 + 2, 3, 7, 1, 0, tint); }
  b.lamp(c, 5, z1 + 5, 30);
  b.meta.door = [x0 + dA + 3, W + 2];
  b.spawn('elite', c + 5, 1, c + 6); if (L >= 2) b.spawn('guard', c - 6, 1, c + 6); if (L >= 4) b.spawn('heavy', c, 1, z1 - 5);
  b.spawn('guard', x0 + dA - 2, 0, W - 1); if (L >= 3) b.spawn('guard', x0 + dA + 8, 0, W - 1);
}

// --------------------------------------------------------------- economy buildings
function millGen(b) {
  const w = b.w, d = b.d;
  for (const [x, z] of [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2], [w >> 1, 1], [w >> 1, d - 2]]) b.post(M.TIMBER, x, 0, z, 11);
  b.beamX(M.TIMBER, 1, 11, 1, w - 2); b.beamX(M.TIMBER, 1, 11, d - 2, w - 2); b.beamZ(M.TIMBER, 1, 11, 2, d - 4); b.beamZ(M.TIMBER, w - 2, 11, 2, d - 4);
  b.wall(M.WOOD, 2, 0, 1, (w >> 1) - 2, 9, 'x', { L: 4 });
  b.roof(M.WOOD, 0, 12, 0, d, w, 'x');
  for (let i = 0; i < 3; i++) { b.box(M.TIMBER, 3, i * 2, d - 6 - (i % 2), 8, 2, 2); if (i < 2) b.box(M.TIMBER, 3, i * 2, d - 9 + (i % 2), 8, 2, 2); }
  b.box(M.WOOD, w - 12, 3, 5, 8, 1, 4); b.post(M.TIMBER, w - 12, 0, 5, 3); b.post(M.TIMBER, w - 5, 0, 5, 3); b.post(M.TIMBER, w - 12, 0, 8, 3); b.post(M.TIMBER, w - 5, 0, 8, 3);
  b.box(M.METAL, w - 9, 4, 6, 1, 3, 1); b.box(M.METAL, w - 10, 6, 6, 3, 1, 1);
  b.fill(M.WOOD, w - 9, 0, d - 7, 6, 3, 4, 6, 1, 1);
  b.lamp(w >> 1, 8, d >> 1, 22); b.meta.door = [w >> 1, d + 2];
}
function quarryGen(b) {
  const r = b.r, w = b.w, d = b.d;
  for (let i = 0; i < 16; i++) { const x = r.int(1, w - 7), z = r.int(1, d - 7), h = r.int(1, 3); for (let j = 0; j < h; j++) b.box(r() < 0.5 ? M.STONE : M.COBBLE, x + (j % 2), j * 2, z + (j % 2), 4, 2, r() < 0.5 ? 2 : 4); }
  const cx = w - 6, cz = 3;
  b.post(M.TIMBER, cx, 0, cz, 14); b.post(M.TIMBER, cx + 3, 0, cz, 8); b.post(M.TIMBER, cx, 0, cz + 3, 8);
  b.beamZ(M.TIMBER, cx, 14, cz, 10); b.box(M.METAL, cx, 9, cz + 9, 1, 5, 1); b.box(M.STONE, cx - 1, 6, cz + 8, 3, 3, 3);
  b.box(M.CRATE, 2, 0, d - 4, 3, 3, 3);
  b.meta.door = [w >> 1, d + 2];
}
function forgeGen(b) {
  const w = b.w, d = b.d, wh = 11;
  const fo = [[(w >> 1) - 3, (w >> 1) + 3, 0, 10]];
  b.wall(M.COBBLE, 1, 0, d - 2, w - 2, wh, 'x', { open: fo }); b.wall(M.COBBLE, 1, 0, 1, w - 2, wh, 'x');
  b.wall(M.COBBLE, 1, 0, 2, d - 4, wh, 'z', { open: [[4, 8, 4, 8]] }); b.wall(M.COBBLE, w - 2, 0, 2, d - 4, wh, 'z');
  b.beamX(M.TIMBER, (w >> 1) - 4, 10, d - 2, 8);
  b.fill(M.STONE, 2, 0, 2, w - 4, 1, d - 4, 4, 1, 4);
  // furnace + tall chimney
  const fx = w - 9, fz = 2;
  b.fill(M.BRICK, fx, 1, fz, 6, 4, 4, 2, 1, 1); b.box(M.EMBER, fx + 2, 2, fz + 4, 2, 2, 1);
  for (let y = 5; y < wh + 14; y++) { if (y % 2) { b.box(M.BRICK, fx + 1, y, fz, 2, 1, 1); b.box(M.BRICK, fx + 3, y, fz, 2, 1, 1); b.box(M.BRICK, fx + 1, y, fz + 3, 2, 1, 1); b.box(M.BRICK, fx + 3, y, fz + 3, 2, 1, 1); b.box(M.BRICK, fx + 1, y, fz + 1, 1, 1, 2); b.box(M.BRICK, fx + 4, y, fz + 1, 1, 1, 2); } else { b.box(M.BRICK, fx + 1, y, fz, 1, 1, 2); b.box(M.BRICK, fx + 1, y, fz + 2, 1, 1, 2); b.box(M.BRICK, fx + 4, y, fz, 1, 1, 2); b.box(M.BRICK, fx + 4, y, fz + 2, 1, 1, 2); b.box(M.BRICK, fx + 2, y, fz, 2, 1, 1); b.box(M.BRICK, fx + 2, y, fz + 3, 2, 1, 1); } }
  b.box(M.METAL, 5, 1, d - 8, 2, 2, 3); b.box(M.METAL, 4, 3, d - 8, 4, 1, 3);
  b.box(M.WOOD, 3, 1, 4, 3, 3, 3); b.box(M.METAL, 3, 4, 4, 1, 1, 3); b.box(M.RUST, 7, 1, 3, 2, 1, 2);
  b.lamp(fx + 3, 4, fz + 6, 46, 0xff6a1a);
  b.roof(M.SLATE, 0, wh, 0, d, w, 'x', M.COBBLE, 1, w - 2);
  b.meta.door = [w >> 1, d + 2];
}
function vaultGen(b) {
  const w = b.w, d = b.d, wh = 10, L = b.lvl;
  const fo = [[(w >> 1) - 2, (w >> 1) + 2, 0, 8]];
  b.wall(M.STONE, 1, 0, d - 3, w - 2, wh, 'x', { L: 4, H: 2, T: 2, open: fo }); b.wall(M.STONE, 1, 0, 1, w - 2, wh, 'x', { L: 4, H: 2, T: 2 });
  b.wall(M.STONE, 1, 0, 3, d - 6, wh, 'z', { L: 4, H: 2, T: 2 }); b.wall(M.STONE, w - 3, 0, 3, d - 6, wh, 'z', { L: 4, H: 2, T: 2 });
  for (let i = 0; i < 4; i++) b.box(M.METAL, (w >> 1) - 2 + i, 0, d - 3, 1, 8, 1);       // iron-barred door
  b.fill(M.STONE, 1, wh, 1, w - 2, 1, d - 2, 4, 1, 4); b.fill(M.METAL, 2, wh + 1, 2, w - 4, 1, d - 4, 4, 1, 4);
  b.fill(M.STONE, 3, 0, 3, w - 6, 1, d - 6, 4, 1, 4);
  const n = 10 + L * 5; let k = 0;
  for (let y = 1; y < 6 && k < n; y++) for (let z = 4; z < d - 6 && k < n; z += 2) for (let x = 4; x < w - 5 && k < n; x += 3) { if (((x + z + y) % 5) === 0) continue; b.box(M.GOLD, x, y, z, 2, 1, 1, F_LOOT); k++; }
  b.meta.door = [w >> 1, d + 2]; b.meta.loot = k;
  b.spawn('guard', (w >> 1) + 3, 0, d + 1);
}
function marketGen(b) {
  const w = b.w, d = b.d, tint = b.r.pick([0xb03a2a, 0x2a5fa8, 0xc9a23a, 0x3a8a4a]);
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) b.post(M.TIMBER, x, 0, z, 9);
  for (let i = 0; i < w; i += 2) b.box(M.CLOTH, i, 9, 0, 2, 1, d, 0, (i / 2) % 2 ? tint : 0xe8e0cc);
  b.box(M.WOOD, 1, 3, 1, w - 2, 1, 3); b.box(M.WOOD, 1, 0, 1, 1, 3, 3); b.box(M.WOOD, w - 2, 0, 1, 1, 3, 3);
  b.box(M.CRATE, 2, 4, 1, 2, 2, 2); b.box(M.HAY, 5, 4, 1, 3, 1, 2); b.box(M.CRATE, w - 5, 4, 2, 2, 1, 2); b.box(M.CRATE, 2, 0, d - 4, 3, 3, 3);
  b.meta.door = [w >> 1, d + 2];
}
function barracksGen(b) {
  const w = b.w, d = b.d, wh = 12, r = b.r;
  const dA = (w >> 1) - 3, fo = [[dA, dA + 5, 0, 10], [5, 9, 4, 8], [w - 11, w - 7, 4, 8]];
  b.wall(M.COBBLE, 1, 0, d - 2, w - 2, 4, 'x', { open: fo }); b.wall(M.COBBLE, 1, 0, 1, w - 2, 4, 'x'); b.wall(M.COBBLE, 1, 0, 2, d - 4, 4, 'z'); b.wall(M.COBBLE, w - 2, 0, 2, d - 4, 4, 'z');
  b.wall(M.WOOD, 1, 4, d - 2, w - 2, wh - 4, 'x', { L: 4, open: fo }); b.wall(M.WOOD, 1, 4, 1, w - 2, wh - 4, 'x', { L: 4, open: [[8, 12, 5, 8], [w - 14, w - 10, 5, 8]] });
  b.wall(M.WOOD, 1, 4, 2, d - 4, wh - 4, 'z', { L: 4 }); b.wall(M.WOOD, w - 2, 4, 2, d - 4, wh - 4, 'z', { L: 4 });
  b.beamX(M.TIMBER, dA, 10, d - 2, 5);
  b.fill(M.WOOD, 2, 0, 2, w - 4, 1, d - 4, 4, 1, 2);
  for (let i = 0; i < 4; i++) { const bx = 3 + i * 7; if (bx + 3 > w - 3) break; b.box(M.TIMBER, bx, 1, 3, 3, 1, 7); b.box(M.CLOTH, bx, 2, 4, 3, 1, 6, 0, 0x5a5a48); b.box(M.TIMBER, bx, 5, 3, 3, 1, 7); b.post(M.TIMBER, bx, 2, 3, 3); b.post(M.TIMBER, bx + 2, 2, 9, 3); b.box(M.CLOTH, bx, 6, 4, 3, 1, 6, 0, 0x5a5a48); }
  b.box(M.WOOD, w - 6, 1, d - 8, 3, 4, 1); b.box(M.METAL, w - 6, 5, d - 8, 1, 3, 1); b.box(M.METAL, w - 4, 5, d - 8, 1, 3, 1);
  b.box(M.CRATE, 3, 1, d - 6, 3, 3, 3); b.box(M.POWDER, 7, 1, d - 5, 2, 3, 2, F_EXPLOSIVE);
  b.roof(M.TILE, 0, wh, 0, d, w, 'x', M.WOOD, 1, w - 2);
  const tint = b.ctx.tint !== undefined ? b.ctx.tint : 0xb02a2a;
  b.box(M.TIMBER, dA - 3, 11, d - 1, 2, 1, 1); b.box(M.CLOTH, dA - 3, 6, d - 1, 2, 5, 1, 0, tint);
  b.meta.door = [dA + 2, d + 2];
  b.spawn('guard', dA - 3, 0, d + 3); b.spawn('guard', dA + 7, 0, d + 3); b.spawn(r() < 0.4 ? 'heavy' : 'guard', dA + 2, 0, d + 6);
  if (b.lvl > 1) b.spawn('scout', dA + 12, 0, d + 2);
}

// --------------------------------------------------------------- defences
function towerGen(b) {
  const w = b.w, H = 20;
  for (const [x, z] of [[1, 1], [w - 2, 1], [1, w - 2], [w - 2, w - 2]]) b.post(M.TIMBER, x, 0, z, H + 8);
  for (const y of [6, 13]) { b.beamX(M.TIMBER, 2, y, 1, w - 4); b.beamX(M.TIMBER, 2, y, w - 2, w - 4); b.beamZ(M.TIMBER, 1, y, 2, w - 4); b.beamZ(M.TIMBER, w - 2, y, 2, w - 4); }
  b.fill(M.WOOD, 0, H, 0, w, 1, w, 4, 1, 2);
  for (const z of [0, w - 1]) { b.beamX(M.WOOD, 0, H + 1, z, w); b.beamX(M.WOOD, 0, H + 3, z, w); }
  for (const x of [0, w - 1]) { b.beamZ(M.WOOD, x, H + 1, 1, w - 2); b.beamZ(M.WOOD, x, H + 3, 1, w - 2); }
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, w - 1], [w - 1, w - 1]]) b.box(M.WOOD, x, H + 2, z, 1, 1, 1);
  b.roof(M.THATCH, 0, H + 8, 0, w, w, 'x');
  for (let y = 0; y < H; y += 2) b.box(M.WOOD, w - 2, y + 1, (w >> 1) - 1, 1, 1, 3);
  b.spawn('sentry', w / 2, H + 1, w / 2); b.lamp(w / 2, H + 5, w / 2, 20);
}
function bastionGen(b) {
  const w = b.w, H = 24, U = { L: 4, H: 2, T: 2 };
  const dA = (w >> 1) - 2;
  b.wall(M.STONE, 0, 0, w - 2, w, H, 'x', Object.assign({ open: [[dA, dA + 4, 0, 10]] }, U)); b.wall(M.STONE, 0, 0, 0, w, H, 'x', Object.assign({ open: [[dA, dA + 2, 14, 18]] }, U));
  b.wall(M.STONE, 0, 0, 2, w - 4, H, 'z', Object.assign({ open: [[dA - 2, dA, 14, 18]] }, U)); b.wall(M.STONE, w - 2, 0, 2, w - 4, H, 'z', Object.assign({ open: [[dA - 2, dA, 14, 18]] }, U));
  const used = b.spiral(M.WOOD, 2, 2, w - 6, w - 6, 0, H, 4);
  for (let k = 2; k < w - 2; k += 4) for (let i = 2; i < w - 2; i += 4) { if (used.some((c) => c[0] < i + 4 && c[0] + 4 > i && c[1] < k + 4 && c[1] + 4 > k)) continue; b.box(M.WOOD, i, H, k, 4, 1, 4); }
  for (let a = 0; a < w; a += 4) { b.box(M.STONE, a, H, 0, 2, 3, 2); b.box(M.STONE, a, H, w - 2, 2, 3, 2); if (a > 0 && a < w - 2) { b.box(M.STONE, 0, H, a, 2, 3, 2); b.box(M.STONE, w - 2, H, a, 2, 3, 2); } }
  for (let a = 2; a < w - 2; a += 4) { b.box(M.STONE, a, H, 0, 2, 1, 2); b.box(M.STONE, a, H, w - 2, 2, 1, 2); b.box(M.STONE, 0, H, a, 2, 1, 2); b.box(M.STONE, w - 2, H, a, 2, 1, 2); }
  b.spawn('sentry', w / 2 + 2, H + 1, w / 2 + 2); if (b.lvl > 1) b.spawn('guard', w / 2 - 3, H + 1, w / 2 + 3, { hold: true });
  b.lamp(w / 2, H + 4, w / 2, 24); b.meta.door = [w >> 1, w + 2];
}
function wallGen(b) { const w = b.w; b.wall(M.STONE, 0, 0, 0, w, 12, 'x', { L: 4, H: 2, T: 2 }); for (let a = 0; a < w; a += 4) b.box(M.STONE, a, 12, 0, 2, 2, 2); }
function palisadeGen(b) { const r = b.r; for (let a = 0; a < b.w; a += 2) { const h = r.int(10, 13); b.box(M.TIMBER, a, 0, 0, 2, 4, 2); b.box(M.TIMBER, a, 4, 0, 2, 4, 2); b.box(M.TIMBER, a, 8, 0, 2, h - 8, 2); } b.beamX(M.WOOD, 0, 6, 2, b.w); }
function gateGen(b) {
  const w = b.w;
  for (const x of [0, w - 4]) { b.wall(M.STONE, x, 0, 0, 4, 18, 'x', { L: 4, H: 2, T: 2 }); b.wall(M.STONE, x, 0, 2, 4, 18, 'x', { L: 4, H: 2, T: 2, phase: 1 }); b.box(M.STONE, x, 18, 0, 2, 2, 2); b.box(M.STONE, x + 2, 18, 2, 2, 2, 2); }
  b.wall(M.STONE, 4, 12, 0, w - 8, 4, 'x', { L: 4, H: 2, T: 2 }); b.wall(M.STONE, 4, 12, 2, w - 8, 4, 'x', { L: 4, H: 2, T: 2, phase: 1 });
  for (let a = 4; a < w - 4; a += 4) b.box(M.STONE, a, 16, 0, 2, 2, 2);
  for (let a = 4; a < w - 4; a += 2) for (let y = 0; y < 12; y += 4) { if (y === 4) { b.box(M.WOOD, a, 4, 1, 2, 1, 1); b.box(M.WOOD, a, 6, 1, 2, 2, 1); } else b.box(M.WOOD, a, y, 1, 2, 4, 1); }
  b.box(M.METAL, 4, 5, 1, 4, 1, 1); b.box(M.METAL, 8, 5, 1, 4, 1, 1);
  const tint = b.ctx.tint !== undefined ? b.ctx.tint : 0xb02a2a;
  b.box(M.CLOTH, 1, 9, 4, 2, 6, 1, 0, tint); b.box(M.CLOTH, w - 3, 9, 4, 2, 6, 1, 0, tint); b.box(M.TIMBER, 1, 15, 4, 2, 1, 1); b.box(M.TIMBER, w - 3, 15, 4, 2, 1, 1);
  b.lamp(w / 2, 9, 6, 30); b.meta.door = [w >> 1, 8]; b.meta.gate = true;
}
function turretGen(b) { b.fill(M.STONE, 0, 0, 0, 6, 2, 6, 2, 2, 2); b.fill(M.STONE, 1, 2, 1, 4, 2, 4, 2, 2, 2); b.box(M.METAL, 2, 4, 2, 2, 1, 2); b.spawn('turret', 3, 5, 3); }
function mineGen(b) { b.spawn('mine', 1, 0, 1); }
function spikesGen(b) { for (let i = 0; i < b.w; i += 4) { b.box(M.TIMBER, i, 0, 1, 1, 4, 1); b.box(M.TIMBER, i + 2, 0, 2, 1, 4, 1); b.box(M.TIMBER, i + 1, 2, 0, 1, 1, 4); b.box(M.TIMBER, i, 3, 1, 4, 1, 1); b.box(M.METAL, i + 3, 4, 1, 1, 1, 1); } }
function sandbagGen(b) { for (let y = 0; y < 4; y++) { const off = y % 2; for (let a = -off; a < b.w; a += 3) { const s = Math.max(0, a), e = Math.min(b.w, a + 3); b.box(M.SANDBAG, s, y, 0, e - s, 1, 2); } } }
function bunkerGen(b) {
  const w = b.w, d = b.d, U = { L: 4, H: 2, T: 2 };
  b.wall(M.CONCRETE, 0, 0, d - 2, w, 10, 'x', Object.assign({ open: [[3, w - 3, 6, 8]] }, U)); b.wall(M.CONCRETE, 0, 0, 0, w, 10, 'x', Object.assign({ open: [[(w >> 1) - 2, (w >> 1) + 2, 0, 8]] }, U));
  b.wall(M.CONCRETE, 0, 0, 2, d - 4, 10, 'z', Object.assign({ open: [[2, d - 6, 6, 8]] }, U)); b.wall(M.CONCRETE, w - 2, 0, 2, d - 4, 10, 'z', Object.assign({ open: [[2, d - 6, 6, 8]] }, U));
  b.fill(M.CONCRETE, 0, 10, 0, w, 2, d, 4, 2, 4); b.fill(M.SANDBAG, 2, 12, 2, w - 4, 1, 2, 3, 1, 2);
  b.fill(M.CONCRETE, 2, 0, 2, w - 4, 1, d - 4, 4, 1, 4);
  b.box(M.CRATE, 3, 1, 3, 3, 3, 3); b.box(M.POWDER, w - 5, 1, 3, 2, 3, 2, F_EXPLOSIVE);
  b.spawn('heavy', w / 2, 1, d / 2 + 1, { hold: true }); b.spawn('guard', w / 2 - 3, 1, d / 2 - 1, { hold: true });
  b.meta.door = [w >> 1, -3];
}

// --------------------------------------------------------------- props
function lampGen(b) { b.post(M.TIMBER, 0, 0, 0, 11); b.box(M.TIMBER, 0, 11, 0, 2, 1, 1); b.box(M.METAL, 1, 9, 0, 1, 1, 1); b.box(M.EMBER, 1, 8, 0, 1, 1, 1); b.lamp(1.5, 8, 0.5, 44); }
function wellGen(b) {
  const w = b.w;
  for (let y = 0; y < 3; y++) { b.wall(M.COBBLE, 2, y, 2, 6, 1, 'x', { phase: y }); b.wall(M.COBBLE, 2, y, 7, 6, 1, 'x', { phase: y }); b.wall(M.COBBLE, 2, y, 3, 4, 1, 'z', { phase: y + 1 }); b.wall(M.COBBLE, 7, y, 3, 4, 1, 'z', { phase: y + 1 }); }
  b.post(M.TIMBER, 2, 3, 4, 7); b.post(M.TIMBER, 7, 3, 4, 7); b.box(M.TIMBER, 2, 10, 4, 6, 1, 1); b.box(M.METAL, 4, 7, 4, 1, 3, 1); b.box(M.WOOD, 4, 5, 4, 2, 2, 2);
  b.roof(M.TILE, 1, 11, 1, 8, 8, 'x'); void w;
}
function hayGen(b) { const r = b.r; b.box(M.HAY, 0, 0, 0, 4, 3, 3); b.box(M.HAY, 4, 0, 0, 4, 3, 3); b.box(M.HAY, 2, 3, 0, 4, 3, 3); if (r() < 0.7) b.box(M.HAY, 1, 0, 3, 4, 3, 3); b.box(M.WOOD, 6, 0, 4, 2, 1, 2); }
function bannerGen(b) { const tint = b.ctx.tint !== undefined ? b.ctx.tint : 0xb02a2a; b.post(M.TIMBER, 0, 0, 0, 18); b.box(M.TIMBER, 0, 18, 0, 4, 1, 1); b.box(M.CLOTH, 1, 9, 0, 3, 9, 1, 0, tint); b.box(M.GOLD, 0, 19, 0, 1, 1, 1); }
function cratesGen(b) { const r = b.r; b.box(M.CRATE, 0, 0, 0, 3, 3, 3); b.box(M.CRATE, 3, 0, 0, 3, 3, 3); b.box(M.CRATE, 0, 0, 3, 3, 3, 3); b.box(M.CRATE, 1, 3, 0, 3, 3, 3); if (r() < 0.6) b.box(M.CRATE, 3, 0, 3, 2, 2, 2); if (r() < 0.4) b.box(M.METAL, 4, 3, 1, 2, 1, 2); b.meta.ammo = [3, 0, 7]; }
function powderGen(b) { b.box(M.POWDER, 0, 0, 0, 2, 3, 2, F_EXPLOSIVE); b.box(M.POWDER, 2, 0, 0, 2, 3, 2, F_EXPLOSIVE); b.box(M.POWDER, 0, 0, 2, 2, 3, 2, F_EXPLOSIVE); if (b.r() < 0.6) b.box(M.POWDER, 1, 3, 1, 2, 3, 2, F_EXPLOSIVE); }
function gardenGen(b) { const w = b.w, d = b.d; for (let a = 0; a < w; a += 4) { b.box(M.WOOD, a, 0, 0, Math.min(4, w - a), 2, 1); b.box(M.WOOD, a, 0, d - 1, Math.min(4, w - a), 2, 1); } for (let a = 1; a < d - 1; a += 4) { b.box(M.WOOD, 0, 0, a, 1, 2, Math.min(4, d - 1 - a)); b.box(M.WOOD, w - 1, 0, a, 1, 2, Math.min(4, d - 1 - a)); } for (let z = 2; z < d - 2; z += 2) for (let x = 2; x < w - 2; x += 2) if (b.r() < 0.8) b.box(M.MOSS, x, 0, z, 1, 1 + (b.r() < 0.3 ? 1 : 0), 1, 0, b.r.pick([0x4f7a2a, 0x6a8a2f, 0x3f6a2a, 0x8a8a2a])); }
function cageGen(b) {
  const w = b.w;
  for (let a = 0; a < w; a += 2) { b.post(M.METAL, a, 0, 0, 8); b.post(M.METAL, a, 0, w - 1, 8); if (a > 0 && a < w - 1) { b.post(M.METAL, 0, 0, a, 8); b.post(M.METAL, w - 1, 0, a, 8); } }
  b.post(M.METAL, w - 1, 0, 0, 8); b.post(M.METAL, w - 1, 0, w - 1, 8);
  b.fill(M.RUST, 0, 8, 0, w, 1, w, 4, 1, 4);
  b.spawn('hostage', w / 2, 0, w / 2); b.meta.cage = true;
}
function depotGen(b) {
  const w = b.w, d = b.d, r = b.r;
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1], [w >> 1, 0], [w >> 1, d - 1]]) b.post(M.TIMBER, x, 0, z, 10);
  b.fill(M.CLOTH, 0, 10, 0, w, 1, d, 4, 1, 4, 0, 0x3d4034);
  for (let i = 0; i < 6; i++) { const x = r.int(1, w - 5), z = r.int(1, d - 5); b.box(M.CRATE, x, 0, z, 3, 3, 3); if (r() < 0.5) b.box(M.CRATE, x, 3, z, 3, 3, 3); }
  b.box(M.POWDER, w - 4, 0, d - 4, 2, 3, 2, F_EXPLOSIVE); b.box(M.POWDER, 2, 0, 2, 2, 3, 2, F_EXPLOSIVE); b.box(M.RUST, (w >> 1) - 2, 0, (d >> 1), 4, 2, 2);
  b.spawn('guard', w / 2, 0, d + 3); b.meta.depot = true; b.meta.ammo = [w / 2, 0, d + 1];
}
function tentGen(b) {
  const w = b.w, d = b.d;
  b.post(M.TIMBER, w >> 1, 0, 1, 9); b.post(M.TIMBER, w >> 1, 0, d - 2, 9); b.beamZ(M.TIMBER, w >> 1, 9, 1, d - 2);
  for (let r = 0; r < 5; r++) for (let z = 1; z < d - 1; z += 4) { b.box(M.CLOTH, r, r * 2, z, 2, 2, Math.min(4, d - 1 - z), 0, 0x4a4d3c); b.box(M.CLOTH, w - 2 - r, r * 2, z, 2, 2, Math.min(4, d - 1 - z), 0, 0x4a4d3c); }
  b.box(M.CLOTH, 5, 0, 3, 3, 1, 6, 0, 0x6a5a3a); b.box(M.CRATE, w - 7, 0, 3, 2, 2, 2);
  b.spawn('guard', w / 2, 0, d + 2); b.lamp(w / 2, 4, d + 1, 18);
}

// --------------------------------------------------------------- catalogue
// max = allowed count per Ember Hall level (1..5); prod = resource per hour
export const BP = {
  hall: { name: 'Ember Hall', cat: 'core', w: 40, d: 40, gen: hallGen, max: [1, 1, 1, 1, 1], desc: 'Houses your Ember Heart. If it shatters, the village falls. Upgrade it to unlock more of everything.', levels: 5 },
  house: { name: 'Brick Cottage', cat: 'homes', w: 26, d: 22, gen: houseGen('brick'), max: [3, 5, 7, 9, 12], desc: 'Fired-clay cottage. Each home taxes 40 gold per hour.', prod: { gold: 40 } },
  cabin: { name: 'Woodcutter Cabin', cat: 'homes', w: 22, d: 18, gen: houseGen('wood'), max: [3, 4, 6, 8, 10], desc: 'Cheap plank cabin with a thatched roof. 25 gold per hour.', prod: { gold: 25 } },
  stonehouse: { name: 'Stone House', cat: 'homes', w: 26, d: 22, gen: houseGen('stone'), max: [0, 2, 4, 6, 8], desc: 'Field-stone walls shrug off rifle fire. 50 gold per hour.', prod: { gold: 50 } },
  tudor: { name: 'Timber Manor', cat: 'homes', w: 30, d: 24, gen: houseGen('tudor'), max: [0, 1, 2, 4, 6], desc: 'Two-storey timber frame manor. 90 gold per hour.', prod: { gold: 90 } },
  mill: { name: 'Lumber Mill', cat: 'economy', w: 28, d: 22, gen: millGen, max: [1, 2, 3, 4, 5], desc: 'Produces 260 wood per hour.', prod: { wood: 260 } },
  quarry: { name: 'Quarry Yard', cat: 'economy', w: 24, d: 24, gen: quarryGen, max: [1, 2, 3, 4, 5], desc: 'Produces 220 stone per hour.', prod: { stone: 220 } },
  forge: { name: 'Forge', cat: 'economy', w: 26, d: 22, gen: forgeGen, max: [0, 1, 2, 3, 4], desc: 'Smelts 90 iron per hour.', prod: { iron: 90 } },
  market: { name: 'Market Stall', cat: 'economy', w: 14, d: 10, gen: marketGen, max: [1, 2, 3, 4, 6], desc: 'Trade brings 60 gold per hour.', prod: { gold: 60 } },
  vault: { name: 'Gold Vault', cat: 'economy', w: 18, d: 18, gen: vaultGen, max: [1, 1, 2, 3, 4], desc: 'Raises your storage cap. Raiders will come for the bars inside.', cap: 4000 },
  barracks: { name: 'Barracks', cat: 'defence', w: 36, d: 22, gen: barracksGen, max: [0, 1, 2, 3, 4], desc: 'Garrisons three guards who defend the village.' },
  tower: { name: 'Watchtower', cat: 'defence', w: 12, d: 12, gen: towerGen, max: [1, 2, 4, 6, 8], desc: 'Timber tower with a marksman on top.' },
  bastion: { name: 'Stone Bastion', cat: 'defence', w: 20, d: 20, gen: bastionGen, max: [0, 0, 2, 4, 6], desc: 'Massive stone tower with a spiral stair and a sharpshooter.' },
  turret: { name: 'Sentry Turret', cat: 'defence', w: 6, d: 6, gen: turretGen, max: [0, 1, 2, 4, 6], desc: 'Clockwork repeater that tracks and shreds intruders.' },
  wall: { name: 'Stone Wall', cat: 'defence', w: 16, d: 2, gen: wallGen, max: [0, 16, 30, 46, 64], desc: 'Four metres of crenellated ashlar. Stops bullets, not rockets.' },
  palisade: { name: 'Palisade', cat: 'defence', w: 16, d: 3, gen: palisadeGen, max: [14, 22, 30, 40, 50], desc: 'Sharpened log wall. Cheap and quick.' },
  gate: { name: 'Gatehouse', cat: 'defence', w: 16, d: 5, gen: gateGen, max: [0, 1, 2, 3, 4], desc: 'Stone piers with an iron-banded oak gate.' },
  sandbags: { name: 'Sandbag Line', cat: 'defence', w: 12, d: 2, gen: sandbagGen, max: [4, 6, 10, 14, 20], desc: 'Waist-high cover for your guards.' },
  spikes: { name: 'Barricade', cat: 'defence', w: 8, d: 4, gen: spikesGen, max: [4, 6, 10, 14, 20], desc: 'Timber hedgehog that blocks a path.' },
  mine: { name: 'Powder Mine', cat: 'defence', w: 2, d: 2, gen: mineGen, max: [0, 2, 4, 7, 10], desc: 'Buried blackpowder charge. Hidden from raiders.', fixed: { iron: 40, gold: 60 } },
  powder: { name: 'Powder Kegs', cat: 'defence', w: 4, d: 4, gen: powderGen, max: [1, 2, 4, 6, 8], desc: 'Volatile. A trap for raiders — or a liability.' },
  bunker: { name: 'Bunker', cat: 'defence', w: 20, d: 16, gen: bunkerGen, max: [0, 0, 0, 1, 2], desc: 'Poured concrete strongpoint with firing slits and a heavy gunner.' },
  lamp: { name: 'Lamp Post', cat: 'decor', w: 2, d: 1, gen: lampGen, max: [4, 6, 9, 12, 16], desc: 'Ember lantern. Lights the night.' },
  well: { name: 'Well', cat: 'decor', w: 10, d: 10, gen: wellGen, max: [1, 1, 2, 2, 3], desc: 'A village needs water.' },
  hay: { name: 'Hay Bales', cat: 'decor', w: 8, d: 6, gen: hayGen, max: [3, 4, 6, 8, 10], desc: 'Soft cover.' },
  banner: { name: 'Clan Banner', cat: 'decor', w: 4, d: 1, gen: bannerGen, max: [2, 4, 6, 8, 12], desc: 'Fly your colours.' },
  crates: { name: 'Supply Stack', cat: 'decor', w: 6, d: 6, gen: cratesGen, max: [2, 3, 5, 7, 9], desc: 'Crates of provisions.' },
  garden: { name: 'Garden Plot', cat: 'decor', w: 12, d: 8, gen: gardenGen, max: [2, 3, 4, 6, 8], desc: 'Fenced vegetable beds.' },
  // story / enemy-only
  ashen: { name: 'Legion Blockhouse', cat: 'story', w: 26, d: 22, gen: houseGen('ashen'), max: [0, 0, 0, 0, 0] },
  cage: { name: 'Prison Cage', cat: 'story', w: 10, d: 10, gen: cageGen, max: [0, 0, 0, 0, 0] },
  depot: { name: 'Supply Depot', cat: 'story', w: 20, d: 16, gen: depotGen, max: [0, 0, 0, 0, 0] },
  tent: { name: 'Legion Tent', cat: 'story', w: 14, d: 12, gen: tentGen, max: [0, 0, 0, 0, 0] },
};
for (const k in BP) BP[k].key = k;

const genCache = new Map();
export function generate(type, lvl, seed, ctx) {
  const bp = BP[type];
  const b = new Bld(bp.w, bp.d, rng(seed), lvl || 1, ctx);
  bp.gen(b);
  return b;
}
export function bpCost(type, lvl = 1) {
  const key = type + ':' + lvl;
  if (genCache.has(key)) return genCache.get(key);
  const bp = BP[type]; let cost = { wood: 0, stone: 0, iron: 0, gold: 0 };
  if (bp.fixed) cost = Object.assign(cost, bp.fixed);
  else {
    const b = generate(type, lvl, 7, {});
    for (const p of b.p) { const m = MATS[p[0]]; if (p[0] === M.EMBER || p[0] === M.GOLD) continue; cost[m.res] += p[4] * p[5] * p[6] * m.cpc * 0.22; }
    if (type === 'hall') { const k = [0, 3, 6, 10, 15][lvl - 1]; cost.wood = cost.wood * k; cost.stone = cost.stone * k; cost.gold += [0, 1500, 6000, 18000, 45000][lvl - 1]; cost.iron += [0, 200, 900, 2500, 6000][lvl - 1]; }
    if (b.meta.spawns.length) cost.gold += b.meta.spawns.length * 120;
    if (type === 'vault') cost.gold += 300;
    if (type === 'turret') { cost.iron += 180; cost.gold += 250; }
    for (const k in cost) cost[k] = Math.ceil(cost[k] / 5) * 5;
  }
  genCache.set(key, cost);
  return cost;
}
export function footprint(type, rot) { const bp = BP[type]; return (rot & 1) ? [bp.d, bp.w] : [bp.w, bp.d]; }

// rotate a local point inside footprint (w,d); size (sx,sz) optional
function rotP(x, z, sx, sz, w, d, r) {
  if (r === 0) return [x, z, sx, sz];
  if (r === 1) return [d - z - sz, x, sz, sx];
  if (r === 2) return [w - x - sx, d - z - sz, sx, sz];
  return [z, w - x - sx, sz, sx];
}

// stamp one building record into the world. returns runtime info with world-space metadata
export function stamp(world, rec, bid, ctx) {
  const bp = BP[rec.t]; if (!bp) return null;
  const seed = hashStr(rec.t) ^ (rec.x * 7919 + rec.z * 104729 + (rec.l || 1) * 31);
  const b = generate(rec.t, rec.l || 1, seed, ctx);
  const r = rec.r | 0, w = bp.w, d = bp.d;
  let core = 0;
  for (const p of b.p) {
    const [x, z, sx, sz] = rotP(p[1], p[3], p[4], p[6], w, d, r);
    let fl = p[7];
    if (fl & 7) fl = (fl & ~7) | ((((fl & 7) - 1 + r) % 4) + 1);
    const id = world.addPiece(p[0], rec.x + x, p[2], rec.z + z, sx, p[5], sz, bid, fl, p[8]);
    if (id >= 0 && (fl & F_CORE)) core++;
  }
  const tw = (cx, cy, cz) => { const [x, z] = rotP(cx, cz, 0, 0, w, d, r); return { x: (rec.x + x) * CELL - HALF, y: cy * CELL, z: (rec.z + z) * CELL - HALF }; };
  const m = b.meta, fp = footprint(rec.t, r);
  const out = {
    rec, bid, type: rec.t, bp, core,
    cx: (rec.x + fp[0] / 2) * CELL - HALF, cz: (rec.z + fp[1] / 2) * CELL - HALF, radius: Math.max(fp[0], fp[1]) * CELL * 0.5,
    spawns: m.spawns.map((s) => Object.assign({}, s, tw(s.x, s.y, s.z), { rot: r })),
    lamps: m.lamps.map((l) => Object.assign({}, l, tw(l.x, l.y, l.z))),
    door: tw(m.door[0], 0, m.door[1]), corePos: m.core ? tw(m.core[0], m.core[1], m.core[2]) : null,
    ammo: m.ammo ? tw(m.ammo[0], m.ammo[1], m.ammo[2]) : null, loot: m.loot || 0, flags: m,
  };
  return out;
}

// build an entire village; returns runtime description
export function buildVillage(world, village, ctx = {}) {
  const rt = { buildings: [], lamps: [], spawns: [], paths: [], core: null, coreTotal: 0, lootTotal: 0, village };
  let bid = 2;
  for (const rec of village.b) {
    const info = stamp(world, rec, bid++, ctx);
    if (!info) continue;
    rt.buildings.push(info);
    for (const l of info.lamps) rt.lamps.push(l);
    for (const s of info.spawns) { s.bid = info.bid; rt.spawns.push(s); }
    if (info.corePos) { rt.core = info.corePos; rt.coreTotal += info.core; rt.coreBid = info.bid; }
    rt.lootTotal += info.loot;
  }
  if (village.f) for (const p of village.f) { world.addPiece(p[0], p[1], p[2], p[3], p[4], p[5], p[6], 1, F_FREE | (p[7] || 0)); if (p[0] === M.EMBER) rt.lamps.push({ x: (p[1] + 0.5) * CELL - HALF, y: (p[2] + 0.5) * CELL, z: (p[3] + 0.5) * CELL - HALF, intensity: 40, color: 0xff9a4a }); }
  rt.paths = villagePaths(rt.buildings);
  return rt;
}
// dirt paths: gates -> hall, hall -> doors
export function villagePaths(buildings) {
  const paths = [], hall = buildings.find((b) => b.type === 'hall');
  const hx = hall ? hall.door.x : 0, hz = hall ? hall.door.z : 0;
  for (const i of buildings) {
    if (i === hall) continue;
    const big = ['house', 'cabin', 'stonehouse', 'tudor', 'mill', 'quarry', 'forge', 'vault', 'barracks', 'market', 'ashen', 'depot'].includes(i.type);
    if (i.flags.gate) { const dx = hx - i.cx, dz = hz - i.cz, l = Math.hypot(dx, dz) || 1; paths.push([i.cx - dx / l * 16, i.cz - dz / l * 16, hx, hz, 3.4]); }
    else if (big) paths.push([i.door.x, i.door.z, hx, hz, 1.9]);
  }
  if (hall) paths.push([hx, hz, hx, hz + 30, 3]);
  return paths;
}

// --------------------------------------------------------------- procedural rival villages
const CLAN_A = ['Iron', 'Raven', 'Stone', 'Ash', 'Wolf', 'Thorn', 'Grim', 'Frost', 'Ember', 'Black', 'Red', 'Storm', 'Hollow', 'Bitter', 'Oak', 'Silver', 'Crow', 'Dusk', 'Bramble', 'Salt'];
const CLAN_B = ['hold', 'mere', 'wick', 'ford', 'reach', 'haven', 'gate', 'fall', 'crest', 'moor', 'stead', 'watch', 'barrow', 'combe', 'garth', 'dale'];
const CHIEF_A = ['xX', '', '', '', 'Sir', 'Lord', '', 'The', '', ''];
const CHIEF_B = ['Brickbreaker', 'NightOwl', 'Mason', 'Kestrel', 'Vandal', 'Rook', 'Longshot', 'Hammer', 'Cinder', 'Wolfe', 'Badger', 'Slate', 'Marrow', 'Quill', 'Tinder', 'Gravel', 'Hex', 'Juniper', 'Flint', 'Mortar', 'Bishop', 'Pike'];
export const CLAN_COLORS = [0xb02a2a, 0x2a5fa8, 0x3a8a4a, 0xc9a23a, 0x7a3aa8, 0xc96a2a, 0x2a9a9a, 0x8a8a8a, 0xd04a8a, 0x1f1f1f];

export function rivalIdentity(seed) {
  const r = rng(seed);
  const name = r.pick(CLAN_A) + r.pick(CLAN_B);
  const pre = r.pick(CHIEF_A), core = r.pick(CHIEF_B), num = r() < 0.5 ? String(r.int(1, 99)) : '';
  const chief = (pre ? pre + (pre === 'xX' ? '' : ' ') : '') + core + num + (pre === 'xX' ? 'Xx' : '');
  return { name, chief, color: r.pick(CLAN_COLORS) };
}

export function genVillage(seed, level, opts = {}) {
  const r = rng(seed), b = [], rects = [], fr = [];
  const C = GX >> 1;
  const free = (x, z, w, d, m = 2) => { if (x < 10 || z < 10 || x + w > GX - 10 || z + d > GZ - 10) return false; for (const q of rects) if (x < q[0] + q[2] + m && x + w + m > q[0] && z < q[1] + q[3] + m && z + d + m > q[1]) return false; return true; };
  const put = (t, x, z, rot, l = 1, m = 2) => { x = Math.round(x / 2) * 2; z = Math.round(z / 2) * 2; const fp = footprint(t, rot); if (!free(x, z, fp[0], fp[1], m)) return false; b.push({ t, x, z, r: rot, l }); rects.push([x, z, fp[0], fp[1]]); return true; };
  const face = (x, z) => { const dx = x - C, dz = z - C; return Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 3 : 1) : (dz < 0 ? 0 : 2); };
  const hallL = opts.hall || clamp(1 + Math.floor(level / 4), 1, 5);
  put('hall', C - 20, C - 20, 0, hallL, 0);
  let nseg = clamp(5 + Math.floor(level * 0.55), 5, 13); if (nseg % 2 === 0) nseg++;
  const R = 8 * nseg;     // half size of the walled compound in cells
  // perimeter
  if (level >= 2 && !opts.open) {
    const wt = level >= 5 ? 'wall' : 'palisade';
    const segs = (R * 2) / 16;
    for (let s = 0; s < segs; s++) {
      const a = C - R + s * 16, mid = s === Math.floor(segs / 2);
      // south (front, +z) with gate
      if (mid) { if (level >= 4) put('gate', a, C + R - 1, 0, 1, 0); /* else leave an opening */ } else put(wt, a, C + R, 0, 1, 0);
      if (mid && level >= 9) put('gate', a, C - R - 3, 2, 1, 0); else put(wt, a, C - R - (wt === 'wall' ? 2 : 3), 2, 1, 0);
      put(wt, C - R - (wt === 'wall' ? 2 : 3), a, 1, 1, 0); put(wt, C + R, a, 3, 1, 0);
    }
    const cm = wt === 'wall' ? M.STONE : M.TIMBER;
    for (const [qx, qz] of [[C - R - 2, C - R - 2], [C + R, C - R - 2], [C - R - 2, C + R], [C + R, C + R]]) { for (let y = 0; y < 14; y += 2) fr.push([cm, qx, y, qz, 2, 2, 2]); rects.push([qx, qz, 2, 2]); }
    if (level >= 7) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('bastion', C + sx * (R - 14) - 10, C + sz * (R - 14) - 10, face(C + sx * R, C + sz * R), level >= 12 ? 2 : 1, 1);
    else if (level >= 3) for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]].slice(0, level >= 5 ? 4 : 2)) put('tower', C + sx * (R - 10) - 6, C + sz * (R - 10) - 6, 0, 1, 1);
  }
  const inner = R - 8;
  const scatter = (t, n, l = 1, m = 3, rad = inner) => {
    let placed = 0;
    for (let i = 0; i < n; i++) for (let k = 0; k < 50; k++) {
      const x = C + r.range(-rad, rad), z = C + r.range(-rad, rad), rot = face(x, z), fp = footprint(t, rot);
      if (Math.abs(x - C) > rad - fp[0] / 2 || Math.abs(z - C) > rad - fp[1] / 2) continue;
      if (Math.abs(x - C) < 9 && z > C) continue;      // keep the main street clear
      if (put(t, x - fp[0] / 2, z - fp[1] / 2, rot, l, m)) { placed++; break; }
    }
    return placed;
  };
  const style = opts.legion ? ['ashen', 'ashen', 'ashen'] : ['house', 'cabin', 'stonehouse', 'tudor'];
  if (level >= 6) scatter('barracks', clamp(Math.floor(level / 6), 1, 3), level >= 12 ? 2 : 1);
  scatter('vault', clamp(1 + Math.floor(level / 6), 1, 3), clamp(Math.ceil(level / 5), 1, 4));
  if (level >= 14) scatter('bunker', 1);
  if (!opts.legion) { scatter('mill', 1 + (level > 8 ? 1 : 0)); scatter('quarry', level >= 3 ? 1 : 0); scatter('forge', level >= 5 ? 1 : 0); }
  else { scatter('depot', 3 + Math.floor(level / 5)); scatter('tent', 2 + Math.floor(level / 4)); }
  const nh = clamp(2 + Math.floor(level * 0.75), 2, 11);
  for (let i = 0; i < nh; i++) { const pool = level < 3 ? ['cabin', 'house'] : level < 6 ? ['cabin', 'house', 'house', 'stonehouse'] : style; scatter(opts.legion ? 'ashen' : r.pick(pool), 1); }
  if (level < 7 && level >= 2) scatter('tower', level >= 4 ? 1 : 0);
  if (level >= 8) scatter('tower', Math.floor((level - 6) / 3), 1, 2);
  if (level >= 6) scatter('turret', clamp(Math.floor((level - 4) / 2), 1, 6), 1, 2);
  if (!opts.legion) { scatter('market', 1 + (level > 6 ? 1 : 0), 1, 2); scatter('well', 1, 1, 2); scatter('garden', r.int(0, 2), 1, 1); }
  scatter('crates', 1 + r.int(0, 2), 1, 1); scatter('hay', r.int(1, 3), 1, 1); scatter('powder', clamp(Math.floor(level / 3), 0, 5), 1, 2);
  scatter('sandbags', clamp(Math.floor(level / 2), 0, 6), 1, 1); scatter('lamp', 3 + Math.floor(level / 3), 1, 1); scatter('banner', 1 + r.int(0, 2), 1, 1);
  // approach defences outside the gate
  if (level >= 5) { for (let i = 0; i < clamp(level - 3, 2, 8); i++) put('mine', C + r.range(-R, R), C + R + r.range(8, 26), 0, 1, 1); for (let i = 0; i < 3; i++) put('spikes', C + r.range(-R * 0.8, R * 0.8), C + R + r.range(6, 16), r.int(0, 1), 1, 1); }
  put('lamp', C - 9, C + 24, 0, 1, 0); put('lamp', C + 8, C + 24, 0, 1, 0);
  return { b, f: fr, lvl: level, seed };
}

// the hamlet a brand new player starts with
export function starterVillage() {
  const C = GX >> 1;
  return { b: [
    { t: 'hall', x: C - 20, z: C - 20, r: 0, l: 1 },
    { t: 'cabin', x: C - 58, z: C - 8, r: 3, l: 1 }, { t: 'house', x: C + 30, z: C - 12, r: 1, l: 1 },
    { t: 'mill', x: C - 54, z: C + 30, r: 0, l: 1 }, { t: 'quarry', x: C + 30, z: C + 30, r: 0, l: 1 },
    { t: 'tower', x: C + 14, z: C + 40, r: 0, l: 1 }, { t: 'market', x: C - 24, z: C + 34, r: 0, l: 1 },
    { t: 'lamp', x: C - 8, z: C + 26, r: 0, l: 1 }, { t: 'lamp', x: C + 8, z: C + 26, r: 0, l: 1 },
    { t: 'well', x: C + 4, z: C + 28, r: 0, l: 1 }, { t: 'hay', x: C - 44, z: C + 18, r: 0, l: 1 }, { t: 'crates', x: C + 22, z: C + 16, r: 0, l: 1 },
    { t: 'palisade', x: C - 40, z: C + 66, r: 0, l: 1 }, { t: 'palisade', x: C - 24, z: C + 66, r: 0, l: 1 }, { t: 'palisade', x: C + 10, z: C + 66, r: 0, l: 1 }, { t: 'palisade', x: C + 26, z: C + 66, r: 0, l: 1 },
    { t: 'vault', x: C - 28, z: C - 50, r: 0, l: 1 }, { t: 'banner', x: C - 12, z: C + 22, r: 0, l: 1 },
  ], f: [], lvl: 1 };
}

// compact share codes ---------------------------------------------------------------
const TYPES = Object.keys(BP);
export function encodeVillage(v) {
  const bytes = [];
  bytes.push(2, v.b.length & 255, v.b.length >> 8);
  for (const rec of v.b) bytes.push(TYPES.indexOf(rec.t), rec.x, rec.z, (rec.r & 3) | ((rec.l || 1) << 2));
  const f = v.f || []; bytes.push(f.length & 255, f.length >> 8);
  for (const p of f) bytes.push(p[0], p[1], p[2], p[3], p[4] | (p[5] << 4), p[6], (p[7] || 0) & 23);
  let s = ''; for (const c of bytes) s += String.fromCharCode(c & 255);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeVillage(code) {
  try {
    const s = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'));
    const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i));
    if (a[0] !== 2) return null;
    let o = 1; const n = a[o] | (a[o + 1] << 8); o += 2;
    const b = [];
    for (let i = 0; i < n; i++) { const t = TYPES[a[o]]; if (!t || BP[t].cat === 'story') return null; b.push({ t, x: a[o + 1], z: a[o + 2], r: a[o + 3] & 3, l: clamp(a[o + 3] >> 2, 1, 5) }); o += 4; }
    const nf = a[o] | (a[o + 1] << 8); o += 2; const f = [];
    for (let i = 0; i < nf && o + 6 < a.length; i++) { if (a[o] >= MATS.length || a[o] === 14 && false) return null; f.push([a[o], a[o + 1], a[o + 2], a[o + 3], Math.max(1, a[o + 4] & 15), Math.max(1, a[o + 4] >> 4), Math.max(1, a[o + 5]), a[o + 6] & 23]); o += 7; }
    if (!b.some((q) => q.t === 'hall')) return null;
    return { b, f, lvl: 1 };
  } catch (e) { return null; }
}
