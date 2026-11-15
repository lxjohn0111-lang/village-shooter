// Shared ballistics: bullets vs bricks / actors / trees / terrain, penetration, explosions.
import * as THREE from 'three';
import { G, terrainH, clamp, lerp } from './util.js';
import { MATS, M } from './materials.js';

const SOFT = new Set([M.WOOD, M.THATCH, M.CLOTH, M.HAY, M.CRATE, M.TILE, M.SLATE, M.PLASTER]);
const _d = new THREE.Vector3(), _p = new THREE.Vector3();

function terrainRay(ox, oy, oz, dx, dy, dz, max) {
  if (dy >= 0 && oy > 70) return -1;
  // flat plot fast path
  if (dy < 0) { const t = -oy / dy; if (t <= max) { const x = ox + dx * t, z = oz + dz * t; if (Math.abs(x) < 37 && Math.abs(z) < 37) return t; } else if (Math.abs(ox) < 37 && Math.abs(oz) < 37 && Math.abs(ox + dx * max) < 37 && Math.abs(oz + dz * max) < 37) return -1; }
  let t = 0, prev = 0, step = 0.6;
  while (t < max) {
    t = Math.min(max, t + step); step *= 1.12;
    if (oy + dy * t < terrainH(ox + dx * t, oz + dz * t)) {
      let a = prev, b = t;
      for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (oy + dy * m < terrainH(ox + dx * m, oz + dz * m)) b = m; else a = m; }
      return b;
    }
    prev = t;
  }
  return -1;
}

// ray vs vertical box (actor body) + head sphere. returns t or -1; sets hitPart
let hitPart = 0;
export function rayActor(ox, oy, oz, dx, dy, dz, ax, ay, az, h, r, max) {
  hitPart = 0;
  // head sphere
  const hx = ax - ox, hy = ay + h - 0.14 - oy, hz = az - oz;
  const tc = hx * dx + hy * dy + hz * dz;
  let best = -1;
  if (tc > 0 && tc < max + 1) { const d2 = hx * hx + hy * hy + hz * hz - tc * tc; if (d2 < 0.17 * 0.17) { best = tc - Math.sqrt(0.17 * 0.17 - d2); hitPart = 2; } }
  let t0 = 0, t1 = max;
  const mn = [ax - r, ay, az - r], mx = [ax + r, ay + h - 0.28, az + r], o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) return best; }
    else { let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i]; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return best; }
  }
  if (best < 0 || t0 < best) { best = t0; hitPart = (oy + dy * t0 - ay) < h * 0.42 ? 0 : 1; }
  return best;
}

export class Combat {
  constructor() { this.res = { kind: 'none', t: 0, actor: null, part: 0, id: -1, tree: null }; this.shots = 0; }

  // nearest thing along a ray. `shooter` is ignored; `team` = team of the shooter (same team is not hit)
  trace(ox, oy, oz, dx, dy, dz, max, shooter, team) {
    const r = this.res; r.kind = 'none'; r.t = max; r.actor = null; r.id = -1; r.tree = null;
    const vh = G.world.raycast(ox, oy, oz, dx, dy, dz, max);
    if (vh.id >= 0) { r.kind = 'piece'; r.t = vh.t; r.id = vh.id; }
    const tg = terrainRay(ox, oy, oz, dx, dy, dz, r.t);
    if (tg >= 0 && tg < r.t) { r.kind = 'ground'; r.t = tg; }
    if (Math.abs(ox) > 36 || Math.abs(oz) > 36 || Math.abs(ox + dx * r.t) > 36 || Math.abs(oz + dz * r.t) > 36) {
      const tt = G.terrain.rayTrees(ox, oy, oz, dx, dy, dz, r.t);
      if (tt) { r.kind = 'tree'; r.t = tt.t; r.tree = tt.tree; }
    }
    if (G.actors) for (const a of G.actors.list) {
      if (a === shooter || a.dead || a.team === team || a.noHit) continue;
      const t = rayActor(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.y, a.pos.z, a.height, a.radius, r.t);
      if (t >= 0 && t < r.t) { r.kind = 'actor'; r.t = t; r.actor = a; r.part = hitPart; }
    }
    const p = G.player;
    if (p && shooter !== p && team !== 0 && !p.dead) {
      const t = rayActor(ox, oy, oz, dx, dy, dz, p.pos.x, p.pos.y, p.pos.z, p.height, 0.3, r.t);
      if (t >= 0 && t < r.t) { r.kind = 'player'; r.t = t; r.part = hitPart; }
    }
    return r;
  }

  // o: {origin:Vector3, dir:Vector3, dmg, brick, range, shooter, team, falloff:[a,b,min], head, tracer:Vector3|null, color}
  fireBullet(o) {
    const w = G.world, fx = G.fx, au = G.audio;
    let ox = o.origin.x, oy = o.origin.y, oz = o.origin.z; const dx = o.dir.x, dy = o.dir.y, dz = o.dir.z;
    let dmg = o.dmg, left = o.range, travelled = 0, pen = 0;
    const out = { actor: null, head: false, killed: false, x: 0, y: 0, z: 0, kind: 'none' };
    for (let i = 0; i < 5; i++) {
      const r = this.trace(ox, oy, oz, dx, dy, dz, left, o.shooter, o.team);
      const t = r.t; travelled += t;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      out.x = px; out.y = py; out.z = pz; out.kind = r.kind;
      if (r.kind === 'none') break;
      if (r.kind === 'actor' || r.kind === 'player') {
        let d = dmg;
        if (o.falloff) d *= lerp(1, o.falloff[2], clamp((travelled - o.falloff[0]) / (o.falloff[1] - o.falloff[0]), 0, 1));
        const head = r.part === 2; if (head) d *= o.head || 2; else if (r.part === 0) d *= 0.8;
        fx.impact(px, py, pz, -dx, -dy, -dz, 'flesh'); if (au) au.impact('flesh', px, py, pz);
        if (r.kind === 'player') { G.player.damage(d, o.origin, 'bullet'); }
        else { out.actor = r.actor; out.head = head; out.killed = r.actor.damage(d, o.shooter, head ? 'head' : 'bullet', o.dir); }
        break;
      }
      if (r.kind === 'ground') { fx.impact(px, py + 0.02, pz, 0, 1, 0, 'ground'); if (au && this.shots++ % 2 === 0) au.impact('ground', px, py, pz); break; }
      if (r.kind === 'tree') { fx.impact(px, py, pz, -dx, 0.2, -dz, 'tree'); if (au) au.impact('wood', px, py, pz); G.terrain.damageTree(r.tree, dmg * (o.brick || 1) * 0.6, dx, dz); break; }
      // piece
      const id = r.id, mat = w.pm[id], md = MATS[mat], h = w.hit;
      fx.impact(px, py, pz, h.nx, h.ny, h.nz, md.snd === 'metal' ? 'metal' : md.snd === 'wood' ? 'wood' : 'stone', mat);
      if (au && (o.shooter === G.player || this.shots++ % 3 === 0)) au.impact(md.snd, px, py, pz);
      _d.set(dx, dy, dz);
      const destroyed = w.damagePiece(id, dmg * (o.brick || 1), _d);
      if (o.shooter === G.player && G.mode) G.mode.onPlayerHitPiece(id, mat, destroyed);
      const soft = mat === M.GLASS || (SOFT.has(mat) && pen < 2) || (destroyed && pen < 1);
      if (!soft) break;
      pen++; if (mat !== M.GLASS) dmg *= 0.6;
      const adv = t + 0.27; ox += dx * adv; oy += dy * adv; oz += dz * adv; left -= adv; travelled += 0.27;
      if (left <= 0 || dmg < 2) break;
    }
    if (o.tracer) fx.tracer(o.tracer.x, o.tracer.y, o.tracer.z, out.x, out.y, out.z, o.color ? o.color[0] : 1, o.color ? o.color[1] : 0.85, o.color ? o.color[2] : 0.5);
    // near-miss whiz for the player
    if (o.team !== 0 && out.kind !== 'player' && G.player && au) { _p.copy(G.player.eyePos).sub(o.origin); const tc = _p.dot(o.dir); if (tc > 2 && tc < travelled + 2) { const d2 = _p.lengthSq() - tc * tc; if (d2 < 2.2 && Math.random() < 0.5) au.whiz(); } }
    return out;
  }

  explosion(x, y, z, radius, dmg, owner, team = -1) {
    const w = G.world;
    w.explode(x, y, z, radius, dmg);
    G.terrain.explodeTrees(x, z, radius, dmg);
    G.fx.explosion(x, y, z, radius);
    if (G.audio) G.audio.explosion(x, y, z, clamp(radius / 5, 0.5, 1.4));
    const hurt = (pos, h, target, isPlayer) => {
      const cx = pos.x, cy = pos.y + h * 0.5, cz = pos.z, d = Math.hypot(cx - x, cy - y, cz - z), R = radius * 1.35;
      if (d > R) return;
      const cover = w.los(x, y + 0.2, z, cx, cy, cz) || w.los(x, y + 0.6, z, cx, pos.y + h * 0.9, cz) ? 1 : 0.25;
      const amount = dmg * 0.75 * Math.pow(1 - d / R, 1.3) * cover;
      if (amount < 1) return;
      if (isPlayer) target.damage(amount * (owner === target ? 0.6 : 0.8), { x, y, z }, 'explosion');
      else { _d.set(cx - x, 0.4, cz - z).normalize(); const killed = target.damage(amount, owner, 'explosion', _d); if (killed && owner === G.player && G.mode) G.mode.onExplosiveKill(target); }
    };
    const friendly = owner === G.player || (owner && owner.team === 0);
    if (G.actors) for (const a of G.actors.list.slice()) { if (!a.dead && !(team >= 0 && a.team === team) && !(friendly && a.team === 0)) hurt(a.pos, a.height, a, false); }
    const p = G.player;
    if (p && !p.dead && team !== 0) hurt(p.pos, p.height, p, true); else if (p && !p.dead && owner === p) hurt(p.pos, p.height, p, true);
    if (p) { const d = Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z); p.shake = Math.min(1.6, p.shake + clamp(radius * 3.5 / (d + 2), 0, 1.4)); if (d < radius * 2) G.r3.fx.flash = Math.max(G.r3.fx.flash, 0.5 * (1 - d / (radius * 2))); }
    if (G.actors) G.actors.alert(x, z, 70, owner);
    if (G.mode && G.mode.onExplosion) G.mode.onExplosion(x, y, z, radius, owner);
  }
}
