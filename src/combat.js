// Shared ballistics: bullets vs bricks / actors / trees / terrain, penetration, explosions.
import * as THREE from 'three';
import { G, terrainH, clamp, lerp } from './util.js';
import { MATS, M } from './materials.js';

const SOFT = new Set([M.WOOD, M.THATCH, M.CLOTH, M.HAY, M.CRATE, M.TILE, M.SLATE, M.PLASTER]);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
// squared distance from a point to a segment (start + unit dir * len)
function distSeg(px, py, pz, sx, sy, sz, dx, dy, dz, len) { const t = clamp((px - sx) * dx + (py - sy) * dy + (pz - sz) * dz, 0, len), cx = sx + dx * t - px, cy = sy + dy * t - py, cz = sz + dz * t - pz; return cx * cx + cy * cy + cz * cz; }

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
export function rayActor(ox, oy, oz, dx, dy, dz, ax, ay, az, h, r, max, headX = ax, headZ = az) {
  hitPart = 0;
  // head sphere
  const hx = headX - ox, hy = ay + h - 0.14 - oy, hz = headZ - oz;
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
  constructor() { this.res = { kind: 'none', t: 0, actor: null, part: 0, id: -1, tree: null }; this.shots = 0; this.bullets = []; }

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
      const t = rayActor(ox, oy, oz, dx, dy, dz, p.pos.x, p.pos.y, p.pos.z, p.height, 0.3, r.t, p.eyePos.x, p.eyePos.z);
      if (t >= 0 && t < r.t) { r.kind = 'player'; r.t = t; r.part = hitPart; }
    }
    return r;
  }

  // Bullets are real projectiles: they take time to arrive, drop with gravity, punch through soft materials,
  // suppress whoever they pass close to and can skip off stone and steel.
  // o: {origin, dir, dmg, brick, range, shooter, team, falloff:[a,b,min], head, speed, impulse, vis:Vector3 (muzzle), shot, tracer, color, kind}
  fireBullet(o) {
    const sp = o.speed || 500;
    const b = { x: o.origin.x, y: o.origin.y, z: o.origin.z, vx: o.dir.x * sp, vy: o.dir.y * sp, vz: o.dir.z * sp, dmg: o.dmg, brick: o.brick || 1, left: o.range, travelled: 0, pen: 0,
      shooter: o.shooter, team: o.team, falloff: o.falloff, head: o.head || 2, impulse: o.impulse || 3, shot: o.shot || 0, tracer: o.tracer !== false && o.tracer !== null, color: o.color || [1, 0.85, 0.5],
      ox: o.vis ? o.vis.x - o.origin.x : 0, oy: o.vis ? o.vis.y - o.origin.y : 0, oz: o.vis ? o.vis.z - o.origin.z : 0, dead: false, whiz: false, cos: !!o.cos, sx: o.origin.x, sy: o.origin.y, sz: o.origin.z };
    this.bullets.push(b);
    this.stepBullet(b, 1 / 120);          // point-blank shots land on the frame they are fired
    return b;
  }
  clear() { this.bullets.length = 0; }
  update(dt) {
    const B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) { const b = B[i]; if (!b.dead) this.stepBullet(b, dt); if (b.dead) { B[i] = B[B.length - 1]; B.pop(); } }
  }
  stepBullet(b, dt) {
    const w = G.world, fx = G.fx, au = G.audio;
    b.vy -= 9.8 * dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz), dx = b.vx / sp, dy = b.vy / sp, dz = b.vz / sp;
    let rem = Math.min(sp * dt, b.left), ox = b.x, oy = b.y, oz = b.z;
    const s0x = b.x, s0y = b.y, s0z = b.z;
    const fade0 = Math.max(0, 1 - b.travelled / 14), ax = ox + b.ox * fade0, ay = oy + b.oy * fade0, az = oz + b.oz * fade0;
    const segLen = rem; let ex = ox, ey = oy, ez = oz;
    for (let i = 0; i < 4 && rem > 0; i++) {
      const r = this.trace(ox, oy, oz, dx, dy, dz, rem, b.shooter, b.team), t = r.t;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t; ex = px; ey = py; ez = pz;
      if (r.kind === 'none') { rem = 0; break; }
      b.travelled += t;
      if (b.cos) { b.dead = true; fx.sparks(px, py, pz, 2, 3); break; }
      if (r.kind === 'actor' || r.kind === 'player') {
        let d = b.dmg;
        if (b.falloff) d *= lerp(1, b.falloff[2], clamp((b.travelled - b.falloff[0]) / (b.falloff[1] - b.falloff[0]), 0, 1));
        const head = r.part === 2; if (head) d *= b.head; else if (r.part === 0) d *= 0.75;
        fx.impact(px, py, pz, -dx, -dy, -dz, 'flesh'); if (au) au.impact('flesh', px, py, pz);
        _d.set(dx, dy, dz);
        if (r.kind === 'player') { _p.set(b.sx, b.sy, b.sz); G.player.damage(d, _p, 'bullet'); }
        else { const killed = r.actor.damage(d, b.shooter, head ? 'head' : 'bullet', _d, { part: r.part, power: b.impulse }); if (b.shooter === G.player && G.weapons) G.weapons.onBulletHit(b, head, killed); }
        b.dead = true; break;
      }
      if (r.kind === 'ground') { fx.impact(px, py + 0.02, pz, 0, 1, 0, 'ground'); if (au && this.shots++ % 2 === 0) au.impact('ground', px, py, pz); b.dead = true; break; }
      if (r.kind === 'tree') { fx.impact(px, py, pz, -dx, 0.2, -dz, 'tree'); if (au) au.impact('wood', px, py, pz); G.terrain.damageTree(r.tree, b.dmg * b.brick * 0.6, dx, dz); b.dead = true; break; }
      // brick / beam / plate
      const id = r.id, mat = w.pm[id], md = MATS[mat], h = w.hit, nx = h.nx, ny = h.ny, nz = h.nz;
      fx.impact(px, py, pz, nx, ny, nz, md.snd === 'metal' ? 'metal' : md.snd === 'wood' ? 'wood' : 'stone', mat);
      if (au && (b.shooter === G.player || this.shots++ % 3 === 0)) au.impact(md.snd, px, py, pz);
      _d.set(dx, dy, dz);
      const destroyed = w.damagePiece(id, b.dmg * b.brick, _d);
      if (b.shooter === G.player && G.mode) G.mode.onPlayerHitPiece(id, mat, destroyed);
      const soft = mat === M.GLASS || (SOFT.has(mat) && b.pen < 2) || (destroyed && b.pen < 1);
      if (!soft) {
        // glancing hits on hard surfaces skip off as a (harmless) ricochet
        const dn = dx * nx + dy * ny + dz * nz;
        if (!destroyed && dn > -0.45 && (md.snd === 'metal' || md.snd === 'stone') && Math.random() < 0.7) {
          const rx = dx - 2 * dn * nx + (Math.random() - 0.5) * 0.3, ry = dy - 2 * dn * ny + (Math.random() - 0.5) * 0.3 + 0.1, rz = dz - 2 * dn * nz + (Math.random() - 0.5) * 0.3, rl = Math.hypot(rx, ry, rz);
          this.fireBullet({ origin: _p.set(px + nx * 0.05, py + ny * 0.05, pz + nz * 0.05), dir: _q.set(rx / rl, ry / rl, rz / rl), dmg: 0, range: 10 + Math.random() * 14, shooter: null, team: -1, speed: 150, cos: true, color: [1, 0.7, 0.3] });
          if (au && Math.random() < 0.6) au.ricochet(px, py, pz);
        }
        b.dead = true; break;
      }
      b.pen++; if (mat !== M.GLASS) b.dmg *= 0.6;
      const adv = t + 0.27; ox += dx * adv; oy += dy * adv; oz += dz * adv; rem -= adv; b.travelled += 0.27;
      if (b.dmg < 2) { b.dead = true; break; }
    }
    if (!b.dead) { b.x += dx * segLen; b.y += dy * segLen; b.z += dz * segLen; b.travelled += segLen; ex = b.x; ey = b.y; ez = b.z; }
    b.left -= segLen; if (b.left <= 0.01) b.dead = true;
    // tracer streak for this frame (drawn from the muzzle, converging onto the true path)
    if (b.tracer || b.cos) { const f1 = Math.max(0, 1 - b.travelled / 14); let tx = ax, ty = ay, tz = az; const len = Math.hypot(ex - ax, ey - ay, ez - az); if (len > 13) { const k = 1 - 13 / len; tx = ax + (ex - ax) * k; ty = ay + (ey - ay) * k; tz = az + (ez - az) * k; }
      fx.seg(tx, ty, tz, ex + b.ox * f1, ey + b.oy * f1, ez + b.oz * f1, b.color[0], b.color[1], b.color[2], b.cos ? 0.012 : b.team === 0 ? 0.018 : 0.03, b.cos ? 0.7 : 1); }
    if (b.cos) return;
    // suppression: rounds cracking past pin people down
    if (b.team === 0 && G.actors) { for (const a of G.actors.list) { if (a.dead || a.team === 0 || a.T.civilian) continue; const d2 = distSeg(a.pos.x, a.pos.y + 1.2, a.pos.z, s0x, s0y, s0z, dx, dy, dz, segLen); if (d2 < 1.7) a.suppress = Math.min(1, a.suppress + 0.2); } }
    else if (b.team > 0 && G.player && !G.player.dead && !b.whiz) { const p = G.player.eyePos, d2 = distSeg(p.x, p.y, p.z, s0x, s0y, s0z, dx, dy, dz, segLen); if (d2 < 2.0) { b.whiz = true; G.player.suppress = Math.min(1, G.player.suppress + 0.22); if (au) au.whiz(); } }
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
      else { _d.set(cx - x, 0.35, cz - z).normalize(); const killed = target.damage(amount, owner, 'explosion', _d, { part: 1, power: 5 + 9 * (1 - d / R), stagger: 1 }); if (killed && owner === G.player && G.mode) G.mode.onExplosiveKill(target); }
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
