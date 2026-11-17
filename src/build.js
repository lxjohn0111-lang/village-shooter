// Village builder: fly or walk around your plot, drop whole buildings or lay individual bricks.
import * as THREE from 'three';
import { G, CELL, GX, GY, GZ, HALF, clamp, damp } from './util.js';
import { Input } from './input.js';
import { M, MATS, F_TILT, F_EXPLOSIVE, F_FREE } from './materials.js';
import { BP, bpCost, footprint, generate, stamp, villagePaths } from './blueprints.js';

export const BRICKS = [
  { name: 'Clay Brick', mat: M.BRICK, s: [2, 1, 1] }, { name: 'Half Brick', mat: M.BRICK, s: [1, 1, 1] }, { name: 'Ashen Brick', mat: M.DARKBRICK, s: [2, 1, 1] },
  { name: 'Stone Block', mat: M.STONE, s: [4, 2, 2] }, { name: 'Stone Cube', mat: M.STONE, s: [2, 2, 2] }, { name: 'Stone Slab', mat: M.STONE, s: [4, 1, 4] }, { name: 'Field Stone', mat: M.COBBLE, s: [2, 1, 2] }, { name: 'Mossy Stone', mat: M.MOSS, s: [2, 1, 2] },
  { name: 'Oak Plank', mat: M.WOOD, s: [4, 1, 1] }, { name: 'Floor Board', mat: M.WOOD, s: [4, 1, 2] }, { name: 'Timber Post', mat: M.TIMBER, s: [1, 4, 1] }, { name: 'Timber Beam', mat: M.TIMBER, s: [6, 1, 1] },
  { name: 'Plaster Panel', mat: M.PLASTER, s: [4, 2, 1] }, { name: 'Glass Pane', mat: M.GLASS, s: [4, 4, 1] },
  { name: 'Clay Roof Tile', mat: M.TILE, s: [4, 1, 2], tilt: true }, { name: 'Slate Roof Tile', mat: M.SLATE, s: [4, 1, 2], tilt: true }, { name: 'Thatch Bundle', mat: M.THATCH, s: [4, 1, 2], tilt: true },
  { name: 'Iron Bar', mat: M.METAL, s: [1, 4, 1] }, { name: 'Iron Plate', mat: M.METAL, s: [4, 4, 1] }, { name: 'Rusted Plate', mat: M.RUST, s: [4, 4, 1] },
  { name: 'Concrete Block', mat: M.CONCRETE, s: [4, 2, 2] }, { name: 'Sandbag', mat: M.SANDBAG, s: [3, 1, 2] }, { name: 'Supply Crate', mat: M.CRATE, s: [3, 3, 3] }, { name: 'Hay Bale', mat: M.HAY, s: [4, 3, 3] },
  { name: 'Banner Cloth', mat: M.CLOTH, s: [3, 6, 1] }, { name: 'Powder Keg', mat: M.POWDER, s: [2, 3, 2], flags: F_EXPLOSIVE }, { name: 'Ember Lantern', mat: M.EMBER, s: [1, 1, 1], cost: { gold: 150, iron: 20 } },
];
export const CATS = [
  { key: 'homes', name: 'Homes' }, { key: 'economy', name: 'Economy' }, { key: 'defence', name: 'Defence' }, { key: 'decor', name: 'Decor' }, { key: 'bricks', name: 'Bricks' },
];
// build session backed by the player's own village and resources
export function profileCtx() {
  return {
    match: false, village: () => G.profile.village, color: () => G.game.color(), afford: (c) => G.game.canAfford(G.game.buildCost(c)), spend: (c) => G.game.spend(G.game.buildCost(c)), refund: (c) => G.game.addRes(c),
    count: (t) => G.game.count(t), limit: (bp) => bp.max[G.game.hallLevel() - 1], hall: () => G.game.hallLevel(), save: (now) => G.game.save(now), track: (k) => G.game.track(k, 1),
    bounds: [6, 6, GX - 6, GZ - 6], freeLimit: () => 1200 + G.game.hallLevel() * 800,
  };
}
export function brickCost(b) { if (b.cost) return b.cost; const m = MATS[b.mat], n = Math.max(1, Math.ceil(b.s[0] * b.s[1] * b.s[2] * m.cpc)); return { [m.res]: n }; }

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

export class BuildMode {
  constructor() {
    this.active = false; this.cat = 0; this.sel = 0; this.rot = 0; this.walk = false;
    this.pos = new THREE.Vector3(0, 9, 34); this.yaw = 0; this.pitch = -0.35; this.vel = new THREE.Vector3();
    this.infos = new Map(); this.nextBid = 2; this.ctx = profileCtx(); this.undo = []; this.target = null; this.valid = false; this.reason = ''; this.lastPaint = ''; this.splatT = -1;
    const gm = new THREE.MeshBasicMaterial({ color: 0x55ff77, transparent: true, opacity: 0.4, depthWrite: false });
    this.ghostMat = gm;
    this.ghost = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), gm, 6000); this.ghost.frustumCulled = false; this.ghost.count = 0; this.ghost.visible = false; this.ghost.renderOrder = 30;
    this.ghostKey = '';
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })); this.outline.visible = false; this.outline.renderOrder = 31;
    const pts = [], B = 30.5, y = 0.04; for (const [a, b] of [[-B, -B, B, -B], [B, -B, B, B], [B, B, -B, B], [-B, B, -B, -B]].map((q) => [[q[0], q[1]], [q[2], q[3]]])) pts.push(a[0], y, a[1], b[0], y, b[1]);
    for (let i = -28; i <= 28; i += 4) { pts.push(i, y, -B, i, y, B, -B, y, i, B, y, i); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthWrite: false })); this.grid.visible = false;
  }
  cats() { return this.ctx.cats ? CATS.filter((c) => this.ctx.cats.includes(c.key)) : CATS; }
  items() { const c = this.cats()[clamp(this.cat, 0, this.cats().length - 1)].key; if (c === 'bricks') return BRICKS.map((b, i) => ({ brick: b, i, name: b.name })); return Object.values(BP).filter((b) => b.cat === c && (!this.ctx.allow || this.ctx.allow(b.key))).map((b) => ({ bp: b, name: b.name })); }
  inBounds(x, z, sx, sz) { const b = this.ctx.bounds; return x >= b[0] && z >= b[1] && x + sx <= b[2] && z + sz <= b[3]; }
  item() { const it = this.items(); return it[clamp(this.sel, 0, it.length - 1)]; }

  // ctx: where the plot, money and limits come from (the player's village, or a Build & Battle match)
  enter(ctx = profileCtx()) {
    const w = G.world; this.ctx = ctx; this.cat = 0; this.sel = 0; this.ghostKey = '';
    this.active = true; this.walk = false; this.undo = [];
    if (ctx.match) { this.infos = ctx.infos; this.nextBid = ctx.nextBid(); }
    else {
      const v = ctx.village();
      G.actors.clear(); G.fx.clear(); w.quiet = true; w.clear(); this.infos.clear(); this.nextBid = 2;
      for (const rec of v.b) { const info = stamp(w, rec, this.nextBid++, { tint: ctx.color() }); if (info) this.infos.set(info.bid, info); }
      for (const p of (v.f || [])) w.addPiece(p[0], p[1], p[2], p[3], p[4], p[5], p[6], 1, F_FREE | (p[7] || 0));
      w.quiet = false; this.refreshWorld(true);
      if (G.r3.envName !== 'noon') G.r3.setEnv('noon');
    }
    G.r3.scene.add(this.ghost, this.outline, this.grid); this.grid.visible = !ctx.match;
    const cs = ctx.camStart || [0, 11, 36, 0, -0.4]; this.pos.set(cs[0], cs[1], cs[2]); this.yaw = cs[3]; this.pitch = cs[4];
    G.r3.camera.fov = 70; G.r3.camera.updateProjectionMatrix();
    if (G.audio && !ctx.match) { G.audio.setMusic('build'); G.audio.setAmbience('day'); }
    if (G.weapons) G.weapons.holder.visible = false;
  }
  exit() { this.active = false; G.r3.scene.remove(this.ghost, this.outline, this.grid); this.ghost.visible = false; this.outline.visible = false; if (this.ctx) this.ctx.save(true); }
  refreshWorld(now) {
    if (!now) { this.splatT = 0.4; return; }
    const infos = [...this.infos.values()];
    G.terrain.updateSplat(G.world, villagePaths(infos));
    const lamps = []; for (const i of infos) for (const l of i.lamps) lamps.push(l);
    for (const p of (this.ctx.village().f || [])) if (p[0] === M.EMBER) lamps.push({ x: (p[1] + 0.5) * CELL - HALF, y: (p[2] + 0.5) * CELL, z: (p[3] + 0.5) * CELL - HALF, intensity: 40, color: 0xff9a4a });
    G.r3.lampSources = lamps;
  }
  rects(skipBid = -1) { const out = []; for (const i of this.infos.values()) { if (i.bid === skipBid) continue; const fp = footprint(i.rec.t, i.rec.r); out.push([i.rec.x, i.rec.z, fp[0], fp[1]]); } return out; }
  freeLimit() { return this.ctx.freeLimit(); }

  // ---------------------------------------------------------------- targeting
  aim() {
    const cam = G.r3.camera, w = G.world; cam.getWorldPosition(_v); cam.getWorldDirection(_d);
    const h = w.raycast(_v.x, _v.y, _v.z, _d.x, _d.y, _d.z, 60);
    let t = h.id >= 0 ? h.t : 1e9, res = null;
    if (h.id >= 0) res = { id: h.id, cx: h.cx, cy: h.cy, cz: h.cz, nx: h.nx, ny: h.ny, nz: h.nz, x: h.x, y: h.y, z: h.z, ground: false };
    if (_d.y < -0.001) { const tg = -_v.y / _d.y; if (tg < t && tg < 80) { const x = _v.x + _d.x * tg, z = _v.z + _d.z * tg; res = { id: -1, x, y: 0, z, cx: Math.floor((x + HALF) / CELL), cy: -1, cz: Math.floor((z + HALF) / CELL), nx: 0, ny: 1, nz: 0, ground: true }; } }
    return res;
  }
  brickDims(b) { let [sx, sy, sz] = b.s; const r = this.rot & 3; let tilt = 0; if (b.tilt) { tilt = r + 1; if (tilt === 1 || tilt === 3) { const t = sx; sx = sz; sz = t; } } else if (sy > sx && sy > sz) { if (r === 1) { const t = sx; sx = sy; sy = t; } else if (r === 2) { const t = sz; sz = sy; sy = t; } } else if (r & 1) { const t = sx; sx = sz; sz = t; } else if (r === 2 && sx > sy && sz === 1 && sy === 1) { const t = sx; sx = sy; sy = t; } return { sx, sy, sz, tilt }; }

  updateTarget() {
    const it = this.item(), a = this.aim(), w = G.world; this.target = null; this.valid = false; this.reason = '';
    this.hover = a && a.id >= 0 ? a.id : -1;
    if (!a || !it) return;
    if (it.brick) {
      const b = it.brick, d = this.brickDims(b);
      let x = a.cx - (d.sx >> 1), y = a.cy, z = a.cz - (d.sz >> 1);
      if (a.ground) y = 0;
      else if (a.nx > 0) { x = a.cx + 1; y = a.cy - ((d.sy - 1) >> 1); } else if (a.nx < 0) { x = a.cx - d.sx; y = a.cy - ((d.sy - 1) >> 1); }
      else if (a.nz > 0) { z = a.cz + 1; y = a.cy - ((d.sy - 1) >> 1); } else if (a.nz < 0) { z = a.cz - d.sz; y = a.cy - ((d.sy - 1) >> 1); }
      else if (a.ny > 0) y = a.cy + 1; else y = a.cy - d.sy;
      y = Math.max(0, y);
      this.target = { brick: b, x, y, z, d };
      const cost = brickCost(b);
      if (!this.inBounds(x, z, d.sx, d.sz) || y + d.sy > GY - 2) this.reason = this.ctx.match ? 'Build on your own side' : 'Outside the plot';
      else if (!w.canPlace(x, y, z, d.sx, d.sy, d.sz)) this.reason = 'Blocked';
      else if (!this.supported(x, y, z, d.sx, d.sy, d.sz)) this.reason = 'Needs support';
      else if ((this.ctx.village().f || []).length >= this.freeLimit()) this.reason = 'Brick limit reached';
      else if (!this.ctx.afford(cost)) this.reason = this.ctx.match ? 'Not enough build points' : 'Not enough resources';
      else this.valid = true;
      this.target.cost = cost;
    } else {
      const bp = it.bp, fp = footprint(bp.key, this.rot);
      const x = Math.round((a.x + HALF) / CELL / 2 - fp[0] / 4) * 2, z = Math.round((a.z + HALF) / CELL / 2 - fp[1] / 4) * 2;
      const cost = bpCost(bp.key, 1), lim = this.ctx.limit(bp), have = this.ctx.count(bp.key);
      this.target = { bp, x, z, fp, cost, lim, have };
      if (!this.inBounds(x, z, fp[0], fp[1])) this.reason = this.ctx.match ? 'Build on your own side' : 'Outside the plot';
      else if (have >= lim) this.reason = this.ctx.match ? 'Limit reached' : lim === 0 ? 'Needs a bigger Ember Hall' : 'Limit reached — upgrade the Hall';
      else if (this.rects().some((q) => x < q[0] + q[2] && x + fp[0] > q[0] && z < q[1] + q[3] && z + fp[1] > q[1])) this.reason = 'Overlaps another building';
      else if (!w.boxFree(x * CELL - HALF + 0.01, 0.01, z * CELL - HALF + 0.01, (x + fp[0]) * CELL - HALF - 0.01, 4, (z + fp[1]) * CELL - HALF - 0.01)) this.reason = 'Blocked by bricks';
      else if (!this.ctx.afford(cost)) this.reason = this.ctx.match ? 'Not enough build points' : 'Not enough resources';
      else this.valid = true;
    }
  }
  supported(x, y, z, sx, sy, sz) {
    if (y === 0) return true; const w = G.world;
    for (let j = y; j < y + sy; j++) for (let k = z; k < z + sz; k++) if (w.pieceAt(x - 1, j, k) >= 0 || w.pieceAt(x + sx, j, k) >= 0) return true;
    for (let j = y; j < y + sy; j++) for (let i = x; i < x + sx; i++) if (w.pieceAt(i, j, z - 1) >= 0 || w.pieceAt(i, j, z + sz) >= 0) return true;
    for (let k = z; k < z + sz; k++) for (let i = x; i < x + sx; i++) if (w.pieceAt(i, y - 1, k) >= 0 || w.pieceAt(i, y + sy, k) >= 0) return true;
    return false;
  }

  updateGhost() {
    const t = this.target, g = this.ghost;
    if (!t || !Input.locked) { g.visible = false; this.outline.visible = false; return; }
    this.ghostMat.color.setHex(this.valid ? 0x55ff77 : 0xff4433);
    if (t.brick) {
      g.count = 1; g.visible = true;
      _m.makeScale(t.d.sx * CELL + 0.01, t.d.sy * CELL + 0.01, t.d.sz * CELL + 0.01); _m.setPosition((t.x + t.d.sx / 2) * CELL - HALF, (t.y + t.d.sy / 2) * CELL, (t.z + t.d.sz / 2) * CELL - HALF);
      g.setMatrixAt(0, _m); g.instanceMatrix.needsUpdate = true; g.position.set(0, 0, 0); this.ghostKey = '';
      this.outline.visible = true; this.outline.scale.set(t.d.sx * CELL + 0.02, t.d.sy * CELL + 0.02, t.d.sz * CELL + 0.02); this.outline.position.set((t.x + t.d.sx / 2) * CELL - HALF, (t.y + t.d.sy / 2) * CELL, (t.z + t.d.sz / 2) * CELL - HALF);
    } else {
      const key = t.bp.key + ':' + this.rot;
      if (key !== this.ghostKey) {
        this.ghostKey = key; const b = generate(t.bp.key, 1, 7, {}), w = t.bp.w, d = t.bp.d, r = this.rot; let n = 0;
        for (const p of b.p) { if (n >= 6000) break; let x = p[1], z = p[3], sx = p[4], sz = p[6]; if (r === 1) { [x, z, sx, sz] = [d - z - sz, x, sz, sx]; } else if (r === 2) { x = w - x - sx; z = d - z - sz; } else if (r === 3) { [x, z, sx, sz] = [z, w - x - sx, sz, sx]; }
          _m.makeScale(sx * CELL, p[5] * CELL, sz * CELL); _m.setPosition((x + sx / 2) * CELL, (p[2] + p[5] / 2) * CELL, (z + sz / 2) * CELL); g.setMatrixAt(n++, _m); }
        if (!n) { _m.makeScale(0.5, 0.1, 0.5); _m.setPosition(0.25, 0.05, 0.25); g.setMatrixAt(n++, _m); }
        g.count = n; g.instanceMatrix.needsUpdate = true;
      }
      g.visible = true; g.position.set(t.x * CELL - HALF, 0, t.z * CELL - HALF);
      this.outline.visible = true; this.outline.scale.set(t.fp[0] * CELL, 0.08, t.fp[1] * CELL); this.outline.position.set((t.x + t.fp[0] / 2) * CELL - HALF, 0.05, (t.z + t.fp[1] / 2) * CELL - HALF);
    }
  }

  // ---------------------------------------------------------------- actions
  place() {
    const t = this.target, w = G.world, v = this.ctx.village();
    if (!t) return;
    if (!this.valid) { if (G.hud) G.hud.toast(this.reason, 1.4, 'build'); if (G.audio && !t.brick) G.audio.ui('deny'); return; }
    if (t.brick) {
      const fl = (t.d.tilt || 0) | (t.brick.flags || 0);
      const id = w.addPiece(t.brick.mat, t.x, t.y, t.z, t.d.sx, t.d.sy, t.d.sz, 1, F_FREE | fl); if (id < 0) return;
      this.ctx.spend(t.cost); const rec = [t.brick.mat, t.x, t.y, t.z, t.d.sx, t.d.sy, t.d.sz, fl]; v.f.push(rec);
      this.undo.push({ type: 'brick', rec, cost: t.cost }); if (this.ctx.onPlace) this.ctx.onPlace({ f: rec });
      if (t.brick.mat === M.EMBER) this.refreshWorld(true);
    } else {
      const rec = { t: t.bp.key, x: t.x, z: t.z, r: this.rot, l: 1 }; this.ctx.spend(t.cost);
      const info = stamp(w, rec, this.nextBid++, { tint: this.ctx.color() }); v.b.push(rec); this.infos.set(info.bid, info);
      this.undo.push({ type: 'building', bid: info.bid, cost: t.cost }); this.refreshWorld(); if (this.ctx.onPlace) this.ctx.onPlace({ b: rec });
      G.fx.dust(info.cx, 0.3, info.cz, 8, info.radius);
    }
    if (this.undo.length > 60) this.undo.shift();
    this.ctx.track('built'); this.ctx.save(); if (G.audio) G.audio.ui('place');
    this.ghostKey = this.ghostKey;
  }
  removeBuilding(bid, refund) {
    const info = this.infos.get(bid), w = G.world, v = this.ctx.village(); if (!info) return false;
    for (let i = 0; i < w.phwm; i++) if (w.palive[i] && w.pbid[i] === bid) w.removePiece(i, 'silent');
    const k = v.b.indexOf(info.rec); if (k >= 0) v.b.splice(k, 1);
    this.infos.delete(bid);
    const c = bpCost(info.rec.t, info.rec.l || 1), back = {}; for (const r in c) back[r] = Math.floor(c[r] * refund); this.ctx.refund(back);
    this.refreshWorld(); return true;
  }
  removeAt() {
    const id = this.hover, w = G.world, v = this.ctx.village(); if (id < 0 || !w.palive[id]) return;
    const bid = w.pbid[id];
    if (bid >= 2) {
      const info = this.infos.get(bid); if (!info) return;
      if (info.rec.t === 'hall') { if (G.hud) G.hud.toast('The Ember Hall cannot be removed', 1.5, 'build'); if (G.audio) G.audio.ui('deny'); return; }
      this.removeBuilding(bid, 0.8); if (G.hud) G.hud.toast(info.bp.name + ' removed (80% refunded)', 1.4, 'build');
    } else {
      const x = w.px[id], y = w.py[id], z = w.pz[id], k = v.f.findIndex((p) => p[1] === x && p[2] === y && p[3] === z);
      const mat = w.pm[id], cells = w.sx[id] * w.sy[id] * w.sz[id];
      w.removePiece(id, 'silent');
      if (k >= 0) { v.f.splice(k, 1); const m = MATS[mat]; if (mat === M.EMBER) { this.ctx.refund({ gold: 150, iron: 20 }); this.refreshWorld(true); } else this.ctx.refund({ [m.res]: Math.max(1, Math.ceil(cells * m.cpc)) }); }
      // anything that was resting on it comes down too (and is refunded)
      this.dropUnsupported();
    }
    this.ctx.save(); if (G.audio) G.audio.ui('remove');
  }
  // free bricks left floating after a removal are removed and refunded
  dropUnsupported() {
    const w = G.world, v = this.ctx.village(); w.checkIntegrityDry = true;
    const n = w.phwm, visit = w.visit, stack = w.stack; visit.fill(0, 0, n); let sp = 0;
    for (let i = 0; i < n; i++) if (w.palive[i] && w.py[i] === 0) { visit[i] = 1; stack[sp++] = i; }
    const push = (id) => { if (id >= 0 && !visit[id]) { visit[id] = 1; stack[sp++] = id; } };
    while (sp > 0) { const id = stack[--sp]; const x = w.px[id], y = w.py[id], z = w.pz[id], x1 = x + w.sx[id], y1 = y + w.sy[id], z1 = z + w.sz[id];
      for (let j = y; j < y1; j++) for (let k = z; k < z1; k++) { push(w.pieceAt(x - 1, j, k)); push(w.pieceAt(x1, j, k)); }
      for (let j = y; j < y1; j++) for (let i = x; i < x1; i++) { push(w.pieceAt(i, j, z - 1)); push(w.pieceAt(i, j, z1)); }
      for (let k = z; k < z1; k++) for (let i = x; i < x1; i++) { push(w.pieceAt(i, y - 1, k)); push(w.pieceAt(i, y1, k)); } }
    let dropped = 0;
    for (let i = 0; i < n; i++) if (w.palive[i] && !visit[i] && w.pbid[i] === 1) {
      const x = w.px[i], y = w.py[i], z = w.pz[i], k = v.f.findIndex((p) => p[1] === x && p[2] === y && p[3] === z), m = MATS[w.pm[i]], cells = w.sx[i] * w.sy[i] * w.sz[i];
      w.removePiece(i, 'silent'); if (k >= 0) { v.f.splice(k, 1); this.ctx.refund({ [m.res]: Math.max(1, Math.ceil(cells * m.cpc)) }); } dropped++;
    }
    if (dropped && G.hud) G.hud.toast(dropped + ' unsupported bricks returned to stock', 1.6, 'build');
  }
  undoLast() {
    const u = this.undo.pop(), w = G.world, v = this.ctx.village(); if (!u) { if (G.audio) G.audio.ui('deny'); return; }
    if (u.type === 'brick') { const id = w.pieceAt(u.rec[1], u.rec[2], u.rec[3]); if (id >= 0 && w.pbid[id] === 1) { w.removePiece(id, 'silent'); const k = v.f.indexOf(u.rec); if (k >= 0) v.f.splice(k, 1); this.ctx.refund(u.cost); if (u.rec[0] === M.EMBER) this.refreshWorld(true); } }
    else if (this.infos.has(u.bid)) this.removeBuilding(u.bid, 1);
    this.ctx.save(); if (G.audio) G.audio.ui('back');
  }
  upgradeHall() {
    const lvl = this.ctx.hall(); if (lvl >= 5) return false;
    const cost = bpCost('hall', lvl + 1); if (!this.ctx.spend(cost)) { if (G.audio) G.audio.ui('deny'); return false; }
    let hall = null; for (const i of this.infos.values()) if (i.rec.t === 'hall') hall = i;
    if (!hall) return false;
    const w = G.world; for (let i = 0; i < w.phwm; i++) if (w.palive[i] && w.pbid[i] === hall.bid) w.removePiece(i, 'silent');
    hall.rec.l = lvl + 1; this.infos.delete(hall.bid);
    const info = stamp(w, hall.rec, this.nextBid++, { tint: this.ctx.color() }); this.infos.set(info.bid, info);
    this.refreshWorld(true); G.fx.dust(info.cx, 1, info.cz, 14, 6); if (G.audio) G.audio.ui('levelup'); this.ctx.save(true);
    return true;
  }
  clearBricks() { const w = G.world, v = this.ctx.village(), back = {}; for (let i = 0; i < w.phwm; i++) if (w.palive[i] && w.pbid[i] === 1) { const m = MATS[w.pm[i]]; back[m.res] = (back[m.res] || 0) + Math.max(1, Math.ceil(w.sx[i] * w.sy[i] * w.sz[i] * m.cpc)); w.removePiece(i, 'silent'); } v.f.length = 0; this.ctx.refund(back); this.undo = []; this.refreshWorld(true); this.ctx.save(true); }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const inp = Input, cam = G.r3.camera, locked = inp.locked;
    if (this.splatT >= 0) { this.splatT -= dt; if (this.splatT < 0) this.refreshWorld(true); }
    if (locked) {
      if (inp.pressed.KeyF && !this.ctx.match) { this.walk = !this.walk; if (this.walk) { G.player.reset(clamp(this.pos.x, -30, 30), clamp(this.pos.z, -30, 30), this.yaw); G.player.pos.y = G.world.groundAt(G.player.pos.x, G.player.pos.z, 14); G.player.pitch = this.pitch; } else { this.pos.copy(G.player.pos); this.pos.y += 3; this.yaw = G.player.yaw; this.pitch = G.player.pitch; } if (G.hud) G.hud.toast(this.walk ? 'Walk mode' : 'Fly mode', 1, 'build'); }
      for (let i = 0; i < this.cats().length; i++) if (inp.pressed['Digit' + (i + 1)]) { this.cat = i; this.sel = 0; this.ghostKey = ''; if (G.ui) G.ui.buildRefresh(); if (G.audio) G.audio.ui('click'); }
      if (inp.wheel) { const n = this.items().length; this.sel = (this.sel + (inp.wheel > 0 ? 1 : n - 1)) % n; this.ghostKey = ''; if (G.ui) G.ui.buildRefresh(); if (G.audio) G.audio.ui('hover'); }
      if (inp.pressed.KeyR) { this.rot = (this.rot + 1) & 3; if (G.audio) G.audio.ui('hover'); }
      if (inp.pressed.KeyZ) this.undoLast();
      if (inp.bPressed[1] && this.hover >= 0 && G.world.pbid[this.hover] === 1) { const w = G.world, id = this.hover, k = BRICKS.findIndex((b) => b.mat === w.pm[id]); if (k >= 0) { this.cat = this.cats().findIndex((c) => c.key === 'bricks'); this.sel = k; if (G.ui) G.ui.buildRefresh(); } }
    }
    if (this.walk) { G.player.update(dt, locked); G.player.applyCamera(cam, 70); }
    else {
      if (locked) { this.yaw -= inp.mdx * 0.0022 * (G.settings.sens || 1); this.pitch = clamp(this.pitch - inp.mdy * 0.0022 * (G.settings.sens || 1), -1.5, 1.5); }
      let ix = 0, iy = 0, iz = 0;
      if (locked) { if (inp.keys.KeyW) iz -= 1; if (inp.keys.KeyS) iz += 1; if (inp.keys.KeyA) ix -= 1; if (inp.keys.KeyD) ix += 1; if (inp.keys.Space) iy += 1; if (inp.keys.ControlLeft || inp.keys.KeyC) iy -= 1; }
      const sp = inp.keys.ShiftLeft ? 26 : 11, s = Math.sin(this.yaw), c = Math.cos(this.yaw), cp = Math.cos(this.pitch);
      const tx = (ix * c + iz * s * cp) * sp, tz = (-ix * s + iz * c * cp) * sp, ty = (iy - iz * Math.sin(this.pitch) * -1 * 0 + (iz < 0 ? Math.sin(this.pitch) : iz > 0 ? -Math.sin(this.pitch) : 0)) * sp;
      this.vel.x = damp(this.vel.x, tx, 10, dt); this.vel.y = damp(this.vel.y, ty, 10, dt); this.vel.z = damp(this.vel.z, tz, 10, dt);
      this.pos.addScaledVector(this.vel, dt);
      const lim = this.ctx.camBounds || [-48, -48, 48, 48]; this.pos.x = clamp(this.pos.x, lim[0], lim[2]); this.pos.z = clamp(this.pos.z, lim[1], lim[3]); this.pos.y = clamp(this.pos.y, 0.5, 38);
      cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0);
    }
    cam.updateMatrixWorld();
    this.updateTarget(); this.updateGhost();
    if (locked) {
      const t = this.target;
      if (inp.bPressed[0]) { this.place(); this.lastPaint = t && t.brick ? t.x + ',' + t.y + ',' + t.z : ''; }
      else if (inp.buttons[0] && t && t.brick && this.valid) { const k = t.x + ',' + t.y + ',' + t.z; if (k !== this.lastPaint) { this.lastPaint = k; this.place(); } }
      if (inp.bPressed[2] || inp.pressed.KeyX) this.removeAt();
    }
  }
}
