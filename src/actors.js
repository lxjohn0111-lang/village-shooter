// Soldiers (enemies, allied guards, hostages), turrets, mines and pickups: skeletal animation with arm IK,
// cover-using AI that reloads and can be suppressed, helmets that can be shot off, ragdoll deaths.
import * as THREE from 'three';
import { G, clamp, damp, lerp, rand, randi, pick, terrainH, TAU } from './util.js';
import { buildSoldier, buildTurret, RIG } from './models.js';
import { Ragdoll, Prop } from './ragdoll.js';
import { GB, modelMats } from './geo.js';

export const ETYPES = {
  guard: { name: 'Guard', hp: 90, speed: 3.3, dmg: 8, rpm: 430, burst: [3, 5], rest: [0.9, 1.7], spread: 0.05, range: 55, pref: 18, xp: 50, snd: 'rifle', scale: 1, mag: 30, reload: 2.4, vel: 230 },
  scout: { name: 'Scout', hp: 62, speed: 4.7, dmg: 5, rpm: 760, burst: [5, 9], rest: [0.7, 1.3], spread: 0.075, range: 32, pref: 10, xp: 50, snd: 'smg', scale: 0.95, mag: 32, reload: 1.9, vel: 210 },
  heavy: { name: 'Heavy Gunner', hp: 280, speed: 2.2, dmg: 8, rpm: 620, burst: [12, 20], rest: [1.6, 2.6], spread: 0.07, range: 55, pref: 20, xp: 130, snd: 'lmg', scale: 1.12, armor: 0.6, mag: 100, reload: 4.6, vel: 230, helmet: 2 },
  elite: { name: 'Hall Guard', hp: 160, speed: 3.7, dmg: 11, rpm: 520, burst: [4, 7], rest: [0.7, 1.3], spread: 0.04, range: 60, pref: 16, xp: 100, snd: 'rifle', scale: 1.04, nades: true, armor: 0.85, mag: 30, reload: 2.0, vel: 250, helmet: 1 },
  sentry: { name: 'Marksman', hp: 75, speed: 0, dmg: 34, rpm: 30, burst: [1, 1], rest: [2.4, 3.8], spread: 0.012, range: 120, pref: 60, xp: 80, snd: 'sniper', scale: 1, static: true, charge: 1.5, mag: 5, reload: 3.2, vel: 420 },
  brute: { name: 'Breaker', hp: 230, speed: 4.3, dmg: 26, rpm: 60, burst: [1, 1], rest: [0.9, 0.9], spread: 0, range: 1.7, pref: 1, xp: 90, snd: 'melee', scale: 1.1, melee: true, armor: 0.8, helmet: 1 },
  sapper: { name: 'Sapper', hp: 80, speed: 4.1, dmg: 6, rpm: 380, burst: [2, 3], rest: [1.2, 2], spread: 0.08, range: 26, pref: 12, xp: 80, snd: 'pistol', scale: 0.98, sapper: true, mag: 12, reload: 1.8, vel: 200 },
  boss: { name: 'Warlord Varro', hp: 3200, speed: 2.7, dmg: 10, rpm: 640, burst: [14, 22], rest: [1.2, 2], spread: 0.06, range: 80, pref: 22, xp: 1500, snd: 'lmg', scale: 1.3, armor: 0.5, rockets: true, boss: true, mag: 150, reload: 4, vel: 240 },
  turret: { name: 'Sentry Turret', hp: 220, speed: 0, dmg: 6, rpm: 560, burst: [8, 14], rest: [1, 1.6], spread: 0.045, range: 42, pref: 20, xp: 90, snd: 'turret', scale: 1, static: true, turret: true, mag: 99999, reload: 1, vel: 260 },
  hostage: { name: 'Mason', hp: 60, speed: 3.6, dmg: 0, rpm: 0, burst: [0, 0], rest: [1, 1], spread: 0, range: 0, pref: 0, xp: 0, snd: '', scale: 0.98, civilian: true },
};

export const LOOKS = {
  legion: { cloth: 0x50535a, armor: 0x7a2a22, helmet: 0x34353a, accent: 0xa82018, gear: 0x4a4640, masked: true },
  ally: { cloth: 0x4a5a48, armor: 0x5a5236, helmet: 0x4f5540, accent: 0x2f7fd0, gear: 0x7a6a48 },
  civilian: { cloth: 0x8a7a5c, armor: 0x6b5a3c, helmet: 0, accent: 0x8a7a5c },
};
export function clanLook(color) { const c = new THREE.Color(color).lerp(new THREE.Color(0x45443c), 0.66); return { cloth: c.getHex(), armor: 0x4c4a38, helmet: new THREE.Color(color).lerp(new THREE.Color(0x3c3f36), 0.8).getHex(), accent: color, gear: 0x6e6248 }; }

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _tg = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), _pole = new THREE.Vector3(), _dir = new THREE.Vector3(), _perp = new THREE.Vector3(), _S = new THREE.Vector3();

// two-bone IK in the torso's space: bend the arm (upper+fore, both hanging along -Y) so the hand reaches `target`
function armIK(upper, fore, sx, target, a, b, side) {
  _tg.copy(target); _S.set(sx, RIG.shY, 0); _dir.subVectors(_tg, _S); let d = _dir.length(); if (d < 1e-4) return; _dir.multiplyScalar(1 / d);
  d = clamp(d, Math.abs(a - b) + 0.02, a + b - 0.004);
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _pole.set(side * 0.75, -1, -0.35); _perp.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir)).normalize();
  _e.copy(_S).addScaledVector(_dir, a * ca).addScaledVector(_perp, a * sa);                 // elbow
  _v.subVectors(_e, _S).normalize(); upper.quaternion.setFromUnitVectors(DOWN, _v);
  _t.copy(_S).addScaledVector(_dir, d).sub(_e).normalize();
  _qa.copy(upper.quaternion).invert(); _qb.setFromUnitVectors(DOWN, _t); fore.quaternion.multiplyQuaternions(_qa, _qb);
}

export class Actor {
  constructor(sys, type, team, x, y, z, opts = {}) {
    this.sys = sys; this.type = type; this.T = ETYPES[type]; this.team = team; this.opts = opts;
    const T = this.T, dm = opts.hpMul || 1;
    this.maxHp = T.hp * dm; this.hp = this.maxHp; this.dmgMul = opts.dmgMul || 1;
    this.pos = new THREE.Vector3(x, y, z); this.vy = 0; this.yaw = opts.yaw || 0; this.aimPitch = 0; this.baseYaw = this.yaw;
    this.height = (T.turret ? 0.75 : 1.8) * T.scale; this.radius = T.turret ? 0.34 : 0.3; this.dead = false; this.deadT = 0; this.noHit = false;
    this.role = opts.role || (T.static ? 'sentry' : 'guard'); this.post = new THREE.Vector3(x, y, z); this.hold = !!opts.hold;
    this.alerted = false; this.alertT = 0; this.target = null; this.lastSeen = new THREE.Vector3(x, y, z); this.seenT = 99; this.los = false; this.percT = rand(0.3);
    this.path = null; this.pathI = 0; this.pathT = rand(0.5); this.tactT = 0; this.moveX = 0; this.moveZ = 0; this.moving = 0; this.walk = rand(6); this.mvS = 0;
    this.burst = 0; this.shotT = 0; this.restT = rand(0.5, 1.5); this.chargeT = -1; this.react = 0; this.crouchT = 0; this.crouch = 0; this.nadeT = rand(6, 12); this.rocketT = rand(4, 7);
    this.breachT = 0; this.stuckT = 0; this.goal = opts.goal || null; this.freed = false; this.swing = -1; this.fallFrom = y; this.wanderT = rand(2, 6); this.calledHelp = false;
    this.magLeft = T.mag || 0; this.reloadT = -1; this.suppress = 0; this.cover = null; this.atCover = false; this.coverT = rand(0.5, 2); this.stagger = 0; this.helmetLeft = T.helmet || 0;
    this.hitX = 0; this.hitY = 0; this.hitZ = 0; this.gunKick = 0; this.velX = 0; this.velZ = 0; this.phase = rand(6); this.rag = null; this.aimBlend = 0; this.lookYaw = 0;
    if (T.turret) this.P = buildTurret();
    else { this.P = buildSoldier(type, opts.look || LOOKS.legion, randi(0, 2), (x * 131 + z * 71) | 0); this.P.root.scale.setScalar(T.scale * rand(0.97, 1.03)); if (!this.P.helmet) this.helmetLeft = 0; }
    this.P.root.position.copy(this.pos); this.P.root.rotation.y = this.yaw;
    G.r3.scene.add(this.P.root);
    if (!T.turret) this.pose(0.016);
  }
  eyeY() { return this.pos.y + (this.T.turret ? 0.5 : lerp(1.52, 0.98, this.crouch) * this.T.scale); }

  // extra: { part: 0 legs | 1 torso | 2 head, power: ragdoll impulse, stagger }
  damage(amount, attacker, kind, dir, extra) {
    if (this.dead) return false;
    const T = this.T, part = extra && extra.part !== undefined ? extra.part : (kind === 'head' ? 2 : 1);
    if (kind !== 'head' && T.armor) amount *= T.armor;
    if (kind === 'head' && T.boss) amount *= 0.5;
    if (T.turret && kind !== 'explosion') amount *= 0.6;
    if (kind === 'head' && this.helmetLeft > 0) {          // helmet takes the hit; the last one knocks it off
      this.helmetLeft--; amount *= 0.3; this.stagger = Math.max(this.stagger, 0.7);
      const hy = this.pos.y + this.height - 0.12; G.fx.sparks(this.pos.x, hy, this.pos.z, 8, 5); if (G.audio) G.audio.impact('metal', this.pos.x, hy, this.pos.z);
      if (this.helmetLeft <= 0 && this.P.helmet) this.sys.popHelmet(this, dir);
      if (attacker === G.player && G.hud) G.hud.feed(this.helmetLeft > 0 ? 'HELMET HIT' : 'HELMET OFF', '#c9d2dc');
    }
    this.hp -= amount;
    if (dir && !T.turret) {                                  // flinch away from the hit
      const f = dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw), sd = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw), k = clamp(amount / this.maxHp * 2.2 + 0.25, 0.25, 1);
      this.hitX += f * 0.55 * k * (part === 0 ? -0.6 : 1); this.hitY += sd * 0.7 * k; this.hitZ += sd * 0.25 * k;
    }
    if ((extra && extra.stagger) || amount > this.maxHp * 0.38) this.stagger = Math.max(this.stagger, 0.6);
    if (attacker && attacker.team !== this.team) { this.alert(attacker.pos, true); if (!this.target || this.seenT > 1) { this.target = attacker; this.lastSeen.copy(attacker.pos); this.seenT = 0; } this.suppress = Math.min(1, this.suppress + 0.3); }
    if (G.mode && attacker === G.player) G.mode.onDamageDealt(this, amount, kind);
    if (T.boss && !this.calledHelp && this.hp < this.maxHp * 0.5) { this.calledHelp = true; if (G.mode && G.mode.onBossHalf) G.mode.onBossHalf(this); }
    if (this.hp <= 0) { this.die(attacker, kind, dir, { part, power: extra && extra.power ? extra.power : (kind === 'explosion' ? 9 : 3) }); return true; }
    return false;
  }
  die(attacker, kind, dir, extra) {
    if (this.dead) return; this.dead = true; this.deadT = 0; this.hp = 0;
    const T = this.T;
    if (T.turret) G.combat.explosion(this.pos.x, this.pos.y + 0.3, this.pos.z, 2.2, 60, attacker, this.team);
    else {
      this.rag = new Ragdoll(this, { dir: dir || null, power: extra ? extra.power : 3, part: extra ? extra.part : 1, kind });
      this.sys.corpses.push(this);
      if (G.audio) G.audio.deathCry(this.pos.x, this.pos.y + 1.5, this.pos.z, T.scale);
      if (this.team !== 0 && !T.civilian && Math.random() < 0.16) this.sys.dropPickup('med', this.pos.x, this.pos.y, this.pos.z);
    }
    if (G.mode) G.mode.onActorKilled(this, attacker, kind);
  }
  alert(pos, direct) {
    if (this.T.civilian || this.dead) return;
    if (!this.alerted) { this.alerted = true; this.react = rand(0.35, 0.8) / (G.diffAcc || 1); this.sys.shout(this); if (this.team !== 0) this.sys.bark(this, pick(['CONTACT!', 'INTRUDER!', 'OVER THERE!', 'HOSTILE!'])); if (G.mode && G.mode.onAlert) G.mode.onAlert(this); }
    this.alertT = 0;
    if (pos && (direct || this.seenT > 2)) { this.lastSeen.copy(pos); if (!direct) { this.lastSeen.x += rand(-3, 3); this.lastSeen.z += rand(-3, 3); } this.investigate = true; }
  }

  tryMove(dx, dz) {
    const w = G.world, r = 0.28, y = this.pos.y;
    const free = (x, z) => { if (!w.boxFree(x - r, y + 0.56, z - r, x + r, y + 1.55, z + r)) return false; const g = w.groundAt(x, z, y + 0.56); return g <= y + 0.56; };
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (free(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return true; }
    if (dx && free(nx, this.pos.z)) { this.pos.x = nx; return false; }
    if (dz && free(this.pos.x, nz)) { this.pos.z = nz; return false; }
    return false;
  }

  pickTarget() {
    const w = G.world, s = this.T.scale, peekY = this.pos.y + (this.T.turret ? 0.5 : 1.52 * s), ey = this.atCover ? peekY : this.eyeY();
    const range = this.alerted ? this.T.range * 1.25 : Math.min(this.T.range * 0.55, 30) * (G.r3.env.moon || G.r3.env.rain ? 0.65 : 1);
    let best = null, bd = 1e9, bx = 0, by = 0, bz = 0;
    const consider = (t, tx, ty, tz) => {
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz); if (d > range || d >= bd) return false;
      if (!this.alerted && d > 7) { const f = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d; if (f < 0.25) return false; }
      if (!w.los(this.pos.x, ey, this.pos.z, tx, ty, tz)) return false;
      best = t; bd = d; bx = tx; by = ty; bz = tz; return true;
    };
    const p = G.player;
    if (this.team !== 0 && p && !p.dead && !G.noTarget) {
      // body first; if only a leaning head is exposed they can still spot (and shoot at) that
      if (!consider(p, p.pos.x, p.pos.y + (p.crouch ? 0.85 : 1.3), p.pos.z) && (p.leanT > 0.3 || p.leanT < -0.3 || p.crouch)) consider(p, p.eyePos.x, p.eyePos.y - 0.05, p.eyePos.z);
    }
    for (const a of this.sys.list) { if (a.dead || a.team === this.team || a.T.civilian) continue; consider(a, a.pos.x, a.pos.y + a.height * 0.7, a.pos.z); }
    if (best) {
      if (!this.alerted) this.alert(best.pos, true);
      this.target = best; this.lastSeen.copy(best.pos); this.seenT = 0; this.investigate = false; this.aimAt = this.aimAt || new THREE.Vector3(); this.aimAt.set(bx, by, bz);
      this.los = this.atCover && this.crouch > 0.35 ? w.los(this.pos.x, this.eyeY(), this.pos.z, bx, by, bz) : true;
      this.aware = true;
      // cover that no longer hides us is no cover
      if (this.cover && this.atCover && w.los(this.pos.x, this.pos.y + 0.9 * s, this.pos.z, bx, by, bz)) { this.cover = null; this.atCover = false; this.coverT = Math.min(this.coverT, 0.4); }
    } else { this.los = false; this.aware = false; if (this.target && (this.target.dead || this.seenT > 9)) this.target = null; }
  }

  // look for a spot nearby that hides a crouching body from the target, ideally one we can shoot over
  findCover(t) {
    const w = G.world, s = this.T.scale, tx = t.pos.x, tz = t.pos.z, ty = t.pos.y + 1.25;
    let best = null, bs = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = rand(TAU), r = rand(1.2, 9), x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (G.nav.isBlocked(x, z)) continue;
      const gy = w.groundAt(x, z, this.pos.y + 0.56); if (Math.abs(gy - this.pos.y) > 0.6) continue;
      const dT = Math.hypot(x - tx, z - tz); if (dT < 5 || dT > this.T.range) continue;
      if (w.los(x, gy + 0.9 * s, z, tx, ty, tz)) continue;
      const peek = w.los(x, gy + 1.52 * s, z, tx, ty, tz);
      const sc = 2 + (peek ? 2.6 : 0) - r * 0.13 - Math.abs(dT - this.T.pref) * 0.05 + rand(0.9);
      if (sc > bs) { bs = sc; best = { x, z, y: gy, peek }; }
    }
    if (best) { this.cover = best; this.atCover = false; this.path = null; this.pathT = 0; if (Math.random() < 0.25) this.sys.bark(this, pick(['MOVING!', 'COVER ME!', 'TAKING COVER!', 'FLANKING!'])); }
  }

  shoot(dt) {
    const T = this.T, t = this.target; if (!t || !this.los || this.reloadT >= 0 || this.stagger > 0) { this.chargeT = -1; return; }
    if (this.react > 0) { this.react -= dt; return; }
    const A = this.aimAt; let tx = A ? A.x : t.pos.x, ty = A ? A.y - 0.1 : t.pos.y + t.height * 0.65, tz = A ? A.z : t.pos.z;
    const fx_ = Math.sin(this.yaw), fz_ = Math.cos(this.yaw);
    const ex = this.pos.x + fx_ * 0.55 - fz_ * -0.08, ey = this.eyeY() - 0.09, ez = this.pos.z + fz_ * 0.55 + fx_ * -0.08;
    const dist = Math.hypot(tx - ex, ty - ey, tz - ez); if (dist > T.range * 1.2) return;
    if (T.melee) { if (this.swing >= 0) return; if (dist < T.range + 0.3 && this.restT <= 0) { this.swing = 0; this.restT = T.rest[0]; if (G.audio) G.audio.mech('swing'); } return; }
    if (T.rockets) { this.rocketT -= dt; if (this.rocketT <= 0 && dist > 9) { this.rocketT = rand(5, 8); _o.set(ex, ey + 0.2, ez); _d.set(tx - ex, ty - 0.6 - ey, tz - ez).normalize(); G.weapons.spawnProjectile('rocket', _o, _d, { dmg: 110, radius: 4.5 }, this, this.team); if (G.audio) G.audio.shot('rocket', ex, ey, ez); this.sys.bark(this, 'ROCKET!'); return; } }
    if (this.burst <= 0) {
      if (this.restT > 0) return;
      if (this.crouch > 0.3 && !T.static) return;          // still rising out of cover
      if (T.charge) { if (this.chargeT < 0) this.chargeT = 0; this.chargeT += dt; if (t === G.player && G.hud) G.hud.sniperWarn(this, this.chargeT / T.charge); G.fx.seg(ex, ey, ez, tx, ty, tz, 1, 0.06, 0.04, 0.006 + 0.006 * this.chargeT / T.charge, 0.5); if (this.chargeT < T.charge) return; this.chargeT = -1; }
      this.burst = Math.min(this.magLeft, randi(T.burst[0], T.burst[1])); this.shotT = 0;
    }
    this.shotT -= dt; if (this.shotT > 0) return;
    this.shotT = 60 / T.rpm; this.burst--; this.magLeft--; if (this.burst <= 0) this.restT = rand(T.rest[0], T.rest[1]) * (1 + this.suppress * 0.8);
    // lead a moving target (imperfectly), then add aim error
    const tvx = t === G.player ? t.vel.x : (t.velX || 0), tvz = t === G.player ? t.vel.z : (t.velZ || 0), lead = dist / T.vel * (T.static ? 0.85 : 0.55);
    tx += tvx * lead; tz += tvz * lead;
    const tv = Math.hypot(tvx, tvz);
    let sp = T.spread * (1 + tv * 0.14) * (1 + Math.max(0, 1.4 - this.alertT) * 1.2) * (1 + this.suppress * 1.3) / (G.diffAcc || 1);
    if (t === G.player && t.crouch) sp *= 1.2;
    _o.set(ex, ey, ez); _d.set(tx - ex + rand(-1, 1) * sp * dist, ty - ey + rand(-1, 1) * sp * dist * 0.7 + dist * dist / (T.vel * T.vel) * 4.9, tz - ez + rand(-1, 1) * sp * dist).normalize();
    G.combat.fireBullet({ origin: _o, dir: _d, dmg: T.dmg * this.dmgMul, brick: T.turret ? 0.5 : 0.4, range: T.range * 1.5, shooter: this, team: this.team, head: 1.5, speed: T.vel, impulse: 2.5, tracer: true, color: this.team === 0 ? [0.6, 0.85, 1] : [1, 0.5, 0.25], kind: T.snd });
    G.fx.muzzleFlash(ex + _d.x * 0.3, ey + _d.y * 0.3, ez + _d.z * 0.3, T.snd === 'sniper' ? 1.6 : 1);
    if (Math.random() < 0.4) G.r3.flashLight(_o, 0xffa050, 14, 0.05, 10);
    if (G.audio) G.audio.shot(T.snd, ex, ey, ez);
    this.gunKick = 1;
  }

  followPath(dt, speed) {
    const p = this.path; if (!p || this.pathI >= p.length) return false;
    const wp = p[this.pathI], dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.35) { this.pathI++; return this.pathI < p.length; }
    const ok = this.tryMove(dx / d * speed * dt, dz / d * speed * dt);
    this.moveX = dx / d; this.moveZ = dz / d; this.moving = 1;
    if (!ok) { this.stuckT += dt; if (wp.b || this.stuckT > 0.35) this.breach(dt, dx / d, dz / d); if (this.stuckT > 2.5) { this.path = null; this.stuckT = 0; } } else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    return true;
  }
  // smash / shoot whatever blocks the way (raiders and breakers)
  breach(dt, dx, dz) {
    if (this.role !== 'raider' && !this.T.melee) return;
    this.breachT -= dt; if (this.breachT > 0) return;
    const w = G.world, fx = this.pos.x + dx * 0.6, fz = this.pos.z + dz * 0.6;
    if (this.T.sapper) {
      this.breachT = 3.2; const bx = fx, by = this.pos.y + 0.6, bz = fz;
      if (G.audio) G.audio.ui('beep'); this.sys.bark(this, 'CHARGE SET!');
      this.sys.timers.push({ t: 1.1, fn: () => G.combat.explosion(bx, by, bz, 3.4, 320, this, this.team) });
      this.path = null; this.pathT = 1.4; this.retreat = 1.3; this.retX = -dx; this.retZ = -dz;
      return;
    }
    this.breachT = this.T.melee ? 0.7 : 0.5; this.swing = this.T.melee ? 0 : this.swing; if (!this.T.melee) this.gunKick = 1;
    let hit = false; _d.set(dx, 0, dz); const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let h = 0.3; h < 1.7; h += 0.25) for (const s of [-0.2, 0, 0.2]) {
      const id = w.pieceAtWorld(fx - dz * s, this.pos.y + h, fz + dx * s);
      if (id >= 0 && !seen.has(id) && !(w.pflag[id] & 32)) { seen.add(id); w.damagePiece(id, this.T.melee ? 150 : 45, _d); hit = true; }
    }
    if (hit) { if (G.audio) G.audio.thud(fx, this.pos.y + 1, fz, 0.8); G.fx.dust(fx, this.pos.y + 1, fz, 1, 0.5); }
  }

  combatMove(dt, t) {
    const T = this.T, dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    this.coverT -= dt;
    if (!this.hold && !T.melee && !T.boss && (this.coverT <= 0 || (this.suppress > 0.55 && !this.cover && this.coverT < 2)) && this.sys.coverBudget > 0) { this.sys.coverBudget--; this.coverT = rand(4, 7.5); this.findCover(t); }
    if (this.cover) {
      const c = this.cover, cx = c.x - this.pos.x, cz = c.z - this.pos.z, cd = Math.hypot(cx, cz);
      if (cd > 0.4) {
        this.atCover = false;
        if (cd > 2.5 && !this.path && this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = 1.5; this.path = G.nav.path(this.pos.x, this.pos.z, c.x, c.z, 0); this.pathI = 0; }
        if (this.path) { if (!this.followPath(dt, T.speed)) this.path = null; }
        else { if (!this.tryMove(cx / cd * T.speed * dt, cz / cd * T.speed * dt)) { this.stuckT += dt; if (this.stuckT > 1) { this.cover = null; this.stuckT = 0; } } this.moveX = cx / cd; this.moveZ = cz / cd; this.moving = 1; }
      } else {
        this.atCover = true; this.path = null;
        const up = this.restT <= 0.35 && this.reloadT < 0 && this.suppress < 0.8 && c.peek;
        this.crouchT = up ? 0 : 0.25;
        if (!c.peek && this.restT <= 0 && this.reloadT < 0 && this.suppress < 0.5) { this.cover = null; this.atCover = false; this.coverT = rand(1.5, 3); }   // nothing to shoot over: step out
      }
      return;
    }
    this.atCover = false;
    if (this.tactT <= 0) {
      this.tactT = rand(1.2, 2.8); const r = Math.random();
      if (T.melee) { this.tx = dx / d; this.tz = dz / d; this.tactT = 0.2; }
      else if (this.hold) { this.tx = this.tz = 0; this.crouchT = r < 0.4 ? this.tactT : 0; }
      else if (d > T.pref * 1.5 && r < 0.75) { this.tx = dx / d; this.tz = dz / d; }
      else if (d < T.pref * 0.45 && r < 0.6) { this.tx = -dx / d; this.tz = -dz / d; }
      else if (r < 0.55) { const s = Math.random() < 0.5 ? 1 : -1; this.tx = -dz / d * s; this.tz = dx / d * s; }
      else { this.tx = this.tz = 0; this.crouchT = r > 0.8 ? this.tactT : 0; }
    }
    if (T.melee && d < T.range) { this.tx = this.tz = 0; }
    if (this.tx || this.tz) { const sp = T.melee ? T.speed : T.speed * 0.72; if (!this.tryMove(this.tx * sp * dt, this.tz * sp * dt)) { if (T.melee) this.breach(dt, this.tx, this.tz); else this.tactT = 0; } this.moveX = this.tx; this.moveZ = this.tz; this.moving = 1; }
    this.path = null;
  }

  update(dt) {
    const T = this.T, w = G.world, P = this.P;
    if (this.dead) {
      this.deadT += dt;
      if (T.turret) { P.aim.rotation.x = Math.min(0.6, this.deadT * 2); if (P.eye) P.eye.visible = false; return this.deadT < 12; }
      const alive = this.rag.update(dt); this.rag.center(this.pos);
      return alive;
    }
    this.alertT += dt; this.seenT += dt; this.suppress = Math.max(0, this.suppress - dt * 0.33); this.stagger = Math.max(0, this.stagger - dt); this.pathT -= dt; this.tactT -= dt;
    const px0 = this.pos.x, pz0 = this.pos.z;
    // --- gravity / support
    const ground = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.56);
    if (this.pos.y > ground + 0.02) {
      if (this.vy === 0) this.fallFrom = this.pos.y;
      this.vy -= 17 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { const drop = this.fallFrom - ground; this.pos.y = ground; if (drop > 2.6) { _d.set(0, -1, 0); this.damage((drop - 2.2) * 28, null, 'fall', _d, { power: 2 }); } this.vy = 0; if (this.dead) return true; }
    } else { this.pos.y = ground; this.vy = 0; }
    if (T.turret && this.pos.y < this.post.y - 0.3) { this.die(null, 'fall'); return true; }
    // --- perception
    this.percT -= dt;
    if (this.percT <= 0 && !T.civilian) { this.percT = 0.2 + rand(0.12); this.pickTarget(); }
    this.moving = 0;
    const speed = T.speed * (this.alerted ? 1 : 0.45);
    // --- weapon handling
    if (this.burst <= 0) this.restT -= dt; else if (T.melee) this.restT -= dt;
    if (T.mag && !T.melee && !T.turret && this.magLeft <= 0 && this.reloadT < 0) { this.reloadT = T.reload; this.burst = 0; if (this.alerted && Math.random() < 0.6) this.sys.bark(this, pick(['RELOADING!', 'CHANGING MAG!', 'COVER ME!'])); }
    if (this.reloadT >= 0) { this.reloadT -= dt; if (this.atCover || !this.moving) this.crouchT = Math.max(this.crouchT, 0.2); if (this.reloadT < 0) { this.magLeft = T.mag; this.restT = Math.min(this.restT, 0.3); } }
    if (T.civilian) this.updateCivilian(dt);
    else if (!T.static) {
      const t = this.target;
      if (this.retreat > 0) { this.retreat -= dt; this.tryMove(this.retX * T.speed * dt, this.retZ * T.speed * dt); this.moveX = this.retX; this.moveZ = this.retZ; this.moving = 1; }
      else if (this.stagger > 0.15) { const bx = -Math.sin(this.yaw), bz = -Math.cos(this.yaw); this.tryMove(bx * 1.4 * dt, bz * 1.4 * dt); }
      else if (this.role === 'raider' && (!t || !(this.los || this.aware) || T.sapper || T.melee && t !== G.player || (this.goalDist() < 9 && !T.melee))) {
        // push toward the objective, breaching whatever is in the way
        const gl = this.goal || this.post, gd = Math.hypot(gl.x - this.pos.x, gl.z - this.pos.z); this.cover = null; this.atCover = false;
        if (gd < 3.5 && Math.abs(this.pos.y - (gl.y || 0)) < 2.5) { this.path = null; this.yawGoal = Math.atan2(gl.x - this.pos.x, gl.z - this.pos.z); if (G.mode && G.mode.onRaiderAtGoal) G.mode.onRaiderAtGoal(this, dt); }
        else if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = rand(1.6, 2.6); this.path = G.nav.path(this.pos.x, this.pos.z, gl.x, gl.z, T.melee || T.sapper ? 6 : 14); this.pathI = 0; }
        if (gd >= 3.5 && !this.followPath(dt, T.speed)) {
          if (!this.path) { const dx = (gl.x - this.pos.x) / gd, dz = (gl.z - this.pos.z) / gd; if (!this.tryMove(dx * T.speed * dt, dz * T.speed * dt)) this.breach(dt, dx, dz); this.moveX = dx; this.moveZ = dz; this.moving = 1; }
        }
      } else if (t && (this.los || this.aware)) this.combatMove(dt, t);
      else if (this.alerted && (t || this.investigate) && this.seenT < 25 && !this.hold) {
        // hunt toward last known position
        this.cover = null; this.atCover = false;
        const leash = this.role === 'guard' ? Math.hypot(this.lastSeen.x - this.post.x, this.lastSeen.z - this.post.z) < 60 : true;
        if (leash) {
          if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = rand(1.1, 2); this.path = G.nav.path(this.pos.x, this.pos.z, this.lastSeen.x, this.lastSeen.z, T.melee ? 5 : 0); this.pathI = 0; }
          if (!this.followPath(dt, T.speed) && this.path && this.pathI >= this.path.length) { this.investigate = false; if (this.seenT > 6) this.target = null; }
        }
      } else if (!this.hold) {
        // idle: drift back to post, look around
        this.cover = null; this.atCover = false;
        const dx = this.post.x - this.pos.x, dz = this.post.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 2.5) { if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = 3; this.path = G.nav.path(this.pos.x, this.pos.z, this.post.x, this.post.z, 0); this.pathI = 0; } this.followPath(dt, speed); if (this.alertT > 14) this.alerted = false; }
        else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = rand(3, 8); this.yawGoal = rand(TAU); } if (this.alertT > 10) this.alerted = false; }
      }
    }
    this.velX = (this.pos.x - px0) / Math.max(dt, 1e-4); this.velZ = (this.pos.z - pz0) / Math.max(dt, 1e-4);
    // --- facing & aim
    let yawT = this.yawGoal !== undefined ? this.yawGoal : this.yaw, pitchT = 0;
    const A = this.aimAt;
    if (this.target && (this.los || this.aware) && A) { yawT = Math.atan2(A.x - this.pos.x, A.z - this.pos.z); pitchT = -Math.atan2(A.y - this.eyeY(), Math.hypot(A.x - this.pos.x, A.z - this.pos.z)); this.yawGoal = undefined; }
    else if (this.moving) { yawT = Math.atan2(this.moveX, this.moveZ); this.yawGoal = undefined; }
    else if (T.static && this.alerted && !this.target) { yawT = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z); }
    else if (T.static && !this.alerted) { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = rand(2.5, 5); this.yawGoal = this.baseYaw + rand(-1.5, 1.5); } }
    let dy = yawT - this.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * Math.min(1, dt * (T.turret ? 4 : 9)); this.aimPitch = damp(this.aimPitch, pitchT, 10, dt);
    if (!T.civilian) this.shoot(dt);
    if (T.nades && this.target === G.player && !this.los && this.seenT > 2.5 && this.seenT < 8) { this.nadeT -= dt; if (this.nadeT <= 0) { this.nadeT = rand(9, 15); const d = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z); if (d < 26 && d > 6) { _o.set(this.pos.x, this.pos.y + 1.6, this.pos.z); _d.set(this.lastSeen.x - this.pos.x, d * 0.35, this.lastSeen.z - this.pos.z).normalize(); const pr = G.weapons.spawnProjectile('frag', _o, _d, { dmg: 85, radius: 4.2 }, this, this.team); pr.vel.multiplyScalar(clamp(d / 17, 0.6, 1.25)); this.sys.bark(this, 'FRAG OUT!'); this.throwT = 0.5; } } }
    if (this.swing >= 0) {
      this.swing += dt;
      if (this.swing > 0.32 && this.swing - dt <= 0.32 && this.target && !this.target.dead) { const t = this.target, d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); if (d < T.range + 0.4 && Math.abs(t.pos.y - this.pos.y) < 1.6) { _d.set(t.pos.x - this.pos.x, 0.2, t.pos.z - this.pos.z).normalize(); if (t === G.player) t.damage(T.dmg * this.dmgMul, this.pos, 'melee'); else t.damage(T.dmg * this.dmgMul, this, 'melee', _d, { power: 8 }); } }
      if (this.swing > 0.7) this.swing = -1;
    }
    this.pose(dt);
    return true;
  }
  goalDist() { const g = this.goal || this.post; return Math.hypot(g.x - this.pos.x, g.z - this.pos.z); }

  updateCivilian(dt) {
    if (!this.freed) return;
    const gl = this.goal || { x: 0, z: 60 };
    if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = 2.5; this.path = G.nav.path(this.pos.x, this.pos.z, gl.x, gl.z, 0); this.pathI = 0; }
    if (!this.followPath(dt, this.T.speed)) { const d = Math.hypot(gl.x - this.pos.x, gl.z - this.pos.z); if (d > 2) { this.tryMove((gl.x - this.pos.x) / d * this.T.speed * dt, (gl.z - this.pos.z) / d * this.T.speed * dt); this.moveX = (gl.x - this.pos.x) / d; this.moveZ = (gl.z - this.pos.z) / d; this.moving = 1; } else if (!this.escaped) { this.escaped = true; this.noHit = true; this.P.root.visible = false; if (G.mode && G.mode.onHostageEscaped) G.mode.onHostageEscaped(this); } }
  }

  pose(dt) {
    const P = this.P, T = this.T;
    P.root.position.copy(this.pos); P.root.rotation.y = this.yaw;
    if (T.turret) { P.swivel.rotation.y = 0; P.aim.rotation.x = this.aimPitch - this.gunKick * 0.03; this.gunKick = damp(this.gunKick, 0, 25, dt); P.eye.visible = this.alerted ? (G.r3.time * 6 % 1) < 0.6 : true; return; }
    this.crouchT -= dt; this.crouch = damp(this.crouch, this.crouchT > 0 && !this.moving ? 1 : 0, 9, dt);
    this.height = lerp(1.8, 1.28, this.crouch) * T.scale;
    this.mvS = damp(this.mvS, this.moving, 10, dt);
    const run = this.alerted ? 1 : 0.55;
    if (this.moving) this.walk += dt * T.speed * run * 2.5 / T.scale;
    const t0 = G.r3.time + this.phase, sn = Math.sin(this.walk), cs = Math.cos(this.walk), m = this.mvS, cr = this.crouch, st = this.stagger > 0 ? Math.min(1, this.stagger * 2.5) : 0;
    // movement relative to facing: strafing and back-pedalling use the same cycle with different leg planes
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), fw = this.moving ? this.moveX * sy + this.moveZ * cy : 1, sd = this.moving ? this.moveX * cy - this.moveZ * sy : 0;
    this.hitX = damp(this.hitX, 0, 7, dt); this.hitY = damp(this.hitY, 0, 7, dt); this.hitZ = damp(this.hitZ, 0, 7, dt); this.gunKick = damp(this.gunKick, 0, 22, dt);
    const breathe = Math.sin(t0 * 1.7) * 0.012;
    P.hips.position.y = RIG.hipsY - cr * 0.37 + Math.abs(cs) * 0.035 * m * run - st * 0.06;
    P.hips.rotation.set(m * 0.08 * run * fw + cr * 0.05, sn * 0.1 * m, sn * 0.045 * m + sd * 0.08 * m);
    const sw = 0.78 * m * run;
    P.thL.rotation.set(-sn * sw * fw - cr * 1.25 + st * 0.2, 0, -sn * sw * sd * 0.6 + cr * 0.12); P.thR.rotation.set(sn * sw * fw + cr * 0.25 - st * 0.25, 0, sn * sw * sd * 0.6 - cr * 0.1);
    P.shL.rotation.x = Math.max(0, cs) * 1.15 * m * run + cr * 1.9 + st * 0.3; P.shR.rotation.x = Math.max(0, -cs) * 1.15 * m * run + cr * 1.5 + st * 0.35;
    const armed = !!P.gun, aiming = armed && this.alerted && (this.target || this.investigate) ? 1 : 0;
    this.aimBlend = damp(this.aimBlend, aiming && this.reloadT < 0 && !(m > 0.6 && !this.los) ? 1 : 0, 9, dt);
    const ab = this.aimBlend, tx_ = 0.05 + m * 0.13 * run * Math.max(0, fw) + cr * 0.28 + this.hitX + ab * this.aimPitch * 0.3 - st * 0.25;
    P.torso.rotation.set(tx_ + breathe, this.hitY - ab * 0.32 - sn * 0.07 * m, this.hitZ + sd * 0.06 * m);
    P.head.rotation.set(this.aimPitch * 0.55 * ab - tx_ * 0.7 + this.hitX * 0.6 + (ab ? 0.08 : Math.sin(t0 * 0.4) * 0.05), ab * 0.3 + (ab ? 0 : Math.sin(t0 * 0.23) * 0.35) - this.hitY * 0.5, ab * -0.12);
    if (armed) {
      // weapon pose: shouldered / low-ready / port-arms while running / reloading
      const rl = this.reloadT >= 0 ? Math.sin(clamp(1 - this.reloadT / T.reload, 0, 1) * Math.PI) : 0, pistol = P.oneHand;
      const lowX = 0.72, lowY = 0.5, runB = (1 - ab) * m * (this.alerted ? 1 : 0), k = this.gunKick;
      P.aim.rotation.set(lerp(lowX, this.aimPitch - tx_, ab) - runB * 0.9 - rl * 0.5 - k * 0.05, lerp(lowY, 0.3, ab) + runB * 0.45 + rl * 0.25, rl * -0.7 + (1 - ab) * 0.25);
      if (pistol) P.gun.position.set(lerp(0.04, 0.03, ab), lerp(-0.18, 0.13, ab), lerp(0.2, 0.44, ab) - k * 0.03);
      else P.gun.position.set(lerp(-0.04, -0.105, ab), lerp(-0.12, 0.03, ab) - rl * 0.03, lerp(0.17, 0.23, ab) - k * 0.035);
      _eu.set(P.aim.rotation.x, P.aim.rotation.y, P.aim.rotation.z); _q.setFromEuler(_eu);
      // right hand on the grip, left on the fore-end (or fetching a magazine during a reload)
      _t.copy(P.grip).add(P.gun.position).applyQuaternion(_q).add(P.aim.position); armIK(P.upR, P.foR, -RIG.shX, _t, RIG.upper, 0.3, -1);
      _t.copy(P.fore).add(P.gun.position).applyQuaternion(_q).add(P.aim.position);
      if (rl > 0) { const g = Math.sin(clamp((1 - this.reloadT / T.reload - 0.15) / 0.5, 0, 1) * Math.PI); _t.lerp(_o.set(0.13, 0.12, 0.17), g); }
      if (this.throwT > 0) { this.throwT -= dt; const g = Math.sin(clamp(this.throwT / 0.5, 0, 1) * Math.PI); _t.lerp(_o.set(0.3, 0.75, 0.25), g); }
      armIK(P.upL, P.foL, RIG.shX, _t, RIG.upper, 0.3, 1);
    } else {
      const swg = this.swing >= 0 ? Math.sin(Math.min(1, this.swing / 0.6) * Math.PI) : 0, cheer = this.freed && !this.moving ? 1 : 0;
      P.upL.rotation.set(sn * 0.7 * m - cheer * 2.7 + st * -0.6, 0, 0.12 + cheer * 0.3); P.foL.rotation.set(-0.25 - m * 0.5 - cheer * 0.3, 0, 0);
      if (T.melee) { P.upR.rotation.set(-0.9 - swg * 1.9 + m * 0.2, 0, -0.25 + swg * 0.5); P.foR.rotation.set(-1.1 + swg * 1.0, 0, 0); P.torso.rotation.y += swg * 0.5 - 0.2; }
      else { P.upR.rotation.set(-sn * 0.7 * m - cheer * 2.7, 0, -0.12 - cheer * 0.3); P.foR.rotation.set(-0.25 - m * 0.5 - cheer * 0.3, 0, 0); }
    }
  }
  remove() { if (this.rag) this.rag.remove(); G.r3.scene.remove(this.P.root); }
}

export class Actors {
  constructor() {
    this.list = []; this.mines = []; this.pickups = []; this.timers = []; this.props = []; this.corpses = []; this.navBudget = 2; this.coverBudget = 1; this.barkT = 0;
    const mg = new GB(1); mg.cyl(0x2d2f2a, 0.2, 0.26, 0.06, 0, 0.03, 0, 0, 0, 0, 14); mg.cyl(0x3a3d36, 0.08, 0.08, 0.03, 0, 0.07, 0, 0, 0, 0, 10); for (let i = 0; i < 6; i++) mg.box(0x1a1b18, 0.03, 0.02, 0.05, Math.cos(i * 1.047) * 0.17, 0.06, Math.sin(i * 1.047) * 0.17, 0, -i * 1.047, 0);
    this.mineGeo = mg.build(8); this.mineMat = modelMats().metal;
    const mk = (body, band, cross) => { const g = new GB(1); g.rbox(body, 0.34, 0.2, 0.24, 0, 0, 0, 0, 0, 0, 0.3); g.rbox(band, 0.345, 0.03, 0.245, 0, 0.06, 0); g.box(0x17181a, 0.08, 0.02, 0.02, 0, 0.11, 0); g.box(cross, 0.1, 0.03, 0.004, 0, 0, 0.121); if (cross === 0xc02018) g.box(cross, 0.03, 0.1, 0.004, 0, 0, 0.121); else for (let i = 0; i < 3; i++) g.cyl(0xc09a45, 0.012, 0.012, 0.05, -0.05 + i * 0.05, 0.02, 0.123, 0, 0, 0, 6); return g.build(8); };
    this.pkGeo = { ammo: mk(0x4d5a36, 0x39402c, 0xd8d8d0), med: mk(0xdedede, 0xb8b8b8, 0xc02018) };
    this.pkMat = modelMats().poly;
  }
  spawn(type, team, x, y, z, opts) { const a = new Actor(this, type, team, x, y, z, opts); this.list.push(a); return a; }
  addMine(x, y, z, team) { const m = new THREE.Mesh(this.mineGeo, this.mineMat); m.position.set(x, y + 0.01, z); m.receiveShadow = true; G.r3.scene.add(m); const mine = { x, y, z, team, mesh: m, dead: false }; this.mines.push(mine); return mine; }
  dropPickup(kind, x, y, z) { if (this.pickups.length > 14) return; const m = new THREE.Mesh(this.pkGeo[kind], this.pkMat); m.position.set(x, y + 0.3, z); m.castShadow = true; G.r3.scene.add(m); this.pickups.push({ kind, x, y, z, mesh: m, t: 0 }); }
  popHelmet(a, dir) {
    const h = a.P.helmet; if (!h) return; G.r3.scene.attach(h); a.P.helmet = null;
    this.props.push(new Prop(h, new THREE.Vector3((dir ? dir.x : 0) * 4 + rand(-1, 1), 3 + rand(0, 2), (dir ? dir.z : 0) * 4 + rand(-1, 1)), 0.11, 12));
  }
  bark(a, text) { if (this.barkT > 0 || a.dead || a.team === 0 && !text) return; this.barkT = 1.4; if (G.hud && G.hud.bark) G.hud.bark(a, text); }
  shout(a) { for (const b of this.list) { if (b !== a && !b.dead && b.team === a.team && !b.alerted && b.pos.distanceToSquared(a.pos) < 15 * 15) { b.alerted = true; b.react = rand(0.5, 1); b.alertT = 0; b.lastSeen.copy(a.lastSeen); b.investigate = true; } } }
  alert(x, z, radius, src) {
    const team = src ? src.team : -1; _v.set(x, src ? src.pos.y : 0, z);
    for (const a of this.list) { if (a.dead || a.team === team) continue; const d = Math.hypot(a.pos.x - x, a.pos.z - z); if (d < radius) a.alert(_v, d < radius * 0.35); }
  }
  countAlive(team, filter) { let n = 0; for (const a of this.list) if (!a.dead && a.team === team && !a.T.civilian && (!filter || filter(a))) n++; return n; }
  explosionAt(x, y, z, r) {
    for (const m of this.mines) if (!m.dead && Math.hypot(m.x - x, m.z - z) < r * 0.9) { m.dead = true; this.timers.push({ t: rand(0.1, 0.3), fn: () => this.detonate(m) }); }
    for (const a of this.corpses) if (a.rag) a.rag.shove(x, y, z, r * 1.4, 11);
  }
  detonate(m) { m.dead = true; G.r3.scene.remove(m.mesh); G.combat.explosion(m.x, m.y + 0.2, m.z, 4.6, 170, null, m.team); }
  update(dt) {
    this.navBudget = 2; this.coverBudget = 1; this.barkT -= dt;
    if (G.world.navDirty) { this.navT = (this.navT || 0) - dt; if (this.navT <= 0) { G.nav.rebuild(G.world); G.world.navDirty = false; this.navT = 0.5; } }
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    for (let i = this.list.length - 1; i >= 0; i--) { const a = this.list[i]; if (!a.update(dt)) { a.remove(); this.list.splice(i, 1); const k = this.corpses.indexOf(a); if (k >= 0) this.corpses.splice(k, 1); } }
    for (let i = this.props.length - 1; i >= 0; i--) if (!this.props[i].update(dt)) { this.props[i].remove(); this.props.splice(i, 1); }
    while (this.corpses.length > 10) this.corpses.shift().rag.expire();
    // soft separation
    const L = this.list;
    for (let i = 0; i < L.length; i++) { const a = L[i]; if (a.dead || a.T.static) continue; for (let j = i + 1; j < L.length; j++) { const b = L[j]; if (b.dead || b.T.static) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.36 && d2 > 1e-5 && Math.abs(a.pos.y - b.pos.y) < 1) { const d = Math.sqrt(d2), p = (0.6 - d) * 0.5; a.tryMove(-dx / d * p, -dz / d * p); b.tryMove(dx / d * p, dz / d * p); } } }
    const p = G.player;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i]; if (m.dead) { if (!m.mesh.parent) this.mines.splice(i, 1); continue; }
      let trig = false;
      if (m.team !== 0 && p && !p.dead && Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < 1.25 && Math.abs(p.pos.y - m.y) < 1) trig = true;
      if (!trig) for (const a of L) if (!a.dead && a.team !== m.team && !a.T.static && Math.hypot(a.pos.x - m.x, a.pos.z - m.z) < 1.25 && Math.abs(a.pos.y - m.y) < 1) { trig = true; break; }
      if (trig) { if (G.audio) G.audio.ui('beep'); m.dead = true; this.timers.push({ t: 0.28, fn: () => this.detonate(m) }); }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.t += dt; k.mesh.rotation.y += dt * 1.5; k.mesh.position.y = k.y + 0.32 + Math.sin(k.t * 3) * 0.06;
      if (p && !p.dead && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 1.3 && Math.abs(p.pos.y - k.y) < 1.6) {
        if (k.kind === 'med' && p.hp >= p.maxHp) continue;
        if (k.kind === 'ammo') { G.weapons.refill(0.3); if (G.hud) G.hud.toast('+ AMMO', 1, 'pk'); } else { p.heal(45); G.fx.heal(p.pos.x, p.pos.y, p.pos.z); if (G.hud) G.hud.toast('+ HEALTH', 1, 'pk'); }
        if (G.audio) G.audio.ui('pickup'); G.r3.scene.remove(k.mesh); this.pickups.splice(i, 1);
      } else if (k.t > 60) { G.r3.scene.remove(k.mesh); this.pickups.splice(i, 1); }
    }
    // walk over a fallen enemy's weapon to scavenge its ammunition
    if (p && !p.dead) for (const a of this.corpses) { if (a.team === 0 || !a.rag) continue; const pr = a.rag.props; for (let i = pr.length - 1; i >= 0; i--) { const q = pr[i]; if (q.pickup && q.t > 0.6 && Math.hypot(q.obj.position.x - p.pos.x, q.obj.position.z - p.pos.z) < 1.1 && Math.abs(q.obj.position.y - p.pos.y) < 1.4) { q.remove(); pr.splice(i, 1); G.weapons.refill(0.14); if (G.hud) G.hud.toast('+ AMMO', 0.9, 'pk'); if (G.audio) G.audio.ui('pickup'); } } }
  }
  clear() {
    for (const a of this.list) a.remove(); this.list.length = 0; this.corpses.length = 0;
    for (const q of this.props) q.remove(); this.props.length = 0;
    for (const m of this.mines) G.r3.scene.remove(m.mesh); this.mines.length = 0;
    for (const k of this.pickups) G.r3.scene.remove(k.mesh); this.pickups.length = 0;
    this.timers.length = 0;
  }
}
