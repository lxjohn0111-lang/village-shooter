// Soldiers (enemies, allied guards, hostages), turrets, mines and pickups — models, animation and AI.
import * as THREE from 'three';
import { G, clamp, damp, rand, randi, pick, terrainH, TAU } from './util.js';

export const ETYPES = {
  guard: { name: 'Guard', hp: 90, speed: 3.3, dmg: 8, rpm: 430, burst: [3, 5], rest: [0.9, 1.7], spread: 0.05, range: 55, pref: 18, xp: 50, snd: 'rifle', scale: 1 },
  scout: { name: 'Scout', hp: 62, speed: 4.7, dmg: 5, rpm: 760, burst: [5, 9], rest: [0.7, 1.3], spread: 0.075, range: 32, pref: 10, xp: 50, snd: 'smg', scale: 0.95 },
  heavy: { name: 'Heavy Gunner', hp: 280, speed: 2.2, dmg: 8, rpm: 620, burst: [12, 20], rest: [1.6, 2.6], spread: 0.07, range: 55, pref: 20, xp: 130, snd: 'lmg', scale: 1.14, armor: 0.6 },
  elite: { name: 'Hall Guard', hp: 160, speed: 3.7, dmg: 11, rpm: 520, burst: [4, 7], rest: [0.7, 1.3], spread: 0.04, range: 60, pref: 16, xp: 100, snd: 'rifle', scale: 1.04, nades: true, armor: 0.85 },
  sentry: { name: 'Marksman', hp: 75, speed: 0, dmg: 34, rpm: 30, burst: [1, 1], rest: [2.4, 3.8], spread: 0.012, range: 120, pref: 60, xp: 80, snd: 'sniper', scale: 1, static: true, charge: 1.5 },
  brute: { name: 'Breaker', hp: 230, speed: 4.3, dmg: 26, rpm: 60, burst: [1, 1], rest: [0.9, 0.9], spread: 0, range: 1.7, pref: 1, xp: 90, snd: 'melee', scale: 1.12, melee: true, armor: 0.8 },
  sapper: { name: 'Sapper', hp: 80, speed: 4.1, dmg: 6, rpm: 380, burst: [2, 3], rest: [1.2, 2], spread: 0.08, range: 26, pref: 12, xp: 80, snd: 'pistol', scale: 0.98, sapper: true },
  boss: { name: 'Warlord Varro', hp: 3200, speed: 2.7, dmg: 10, rpm: 640, burst: [14, 22], rest: [1.2, 2], spread: 0.06, range: 80, pref: 22, xp: 1500, snd: 'lmg', scale: 1.38, armor: 0.5, rockets: true, boss: true },
  turret: { name: 'Sentry Turret', hp: 220, speed: 0, dmg: 6, rpm: 560, burst: [8, 14], rest: [1, 1.6], spread: 0.045, range: 42, pref: 20, xp: 90, snd: 'turret', scale: 1, static: true, turret: true },
  hostage: { name: 'Mason', hp: 60, speed: 3.6, dmg: 0, rpm: 0, burst: [0, 0], rest: [1, 1], spread: 0, range: 0, pref: 0, xp: 0, snd: '', scale: 0.98, civilian: true },
};

const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), sph: new THREE.SphereGeometry(1, 10, 8), dome: new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI * 0.55) };
const matCache = new Map();
function mat(color, rough = 0.85, metal = 0) { const k = color + ':' + rough + ':' + metal; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); return matCache.get(k); }
function mesh(parent, geo, m, sx, sy, sz, x, y, z, shadow = true) { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; }
function limb(parent, m, ax, ay, az, bx, by, bz, r) { const a = new THREE.Vector3(ax, ay, az), d = new THREE.Vector3(bx, by, bz).sub(a); const o = new THREE.Mesh(GEO.cyl, m); o.scale.set(r, d.length(), r); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }

export const LOOKS = {
  legion: { cloth: 0x34373a, armor: 0x5e1d18, helmet: 0x232326, skin: 0xb98a6a, accent: 0x8a1a12 },
  ally: { cloth: 0x3a4a5e, armor: 0x6b5a3c, helmet: 0x6e7378, skin: 0xc49a78, accent: 0x2f7fd0 },
  civilian: { cloth: 0x8a7a5c, armor: 0x6b5a3c, helmet: 0, skin: 0xc49a78 },
};
export function clanLook(color) { const c = new THREE.Color(color).lerp(new THREE.Color(0x3b3a36), 0.62); return { cloth: c.getHex(), armor: 0x5a4a32, helmet: 0x5c6166, skin: 0xbf9272, accent: color }; }

function buildHumanoid(type, look) {
  const T = ETYPES[type], root = new THREE.Group(), P = { root };
  const cloth = mat(look.cloth, 0.92), armor = mat(look.armor, 0.6, 0.25), skin = mat(look.skin, 0.75), dark = mat(0x1c1d1f, 0.6, 0.5), boot = mat(0x241c15, 0.8);
  const hips = P.hips = new THREE.Group(); hips.position.y = 0.94; root.add(hips);
  mesh(hips, GEO.box, cloth, 0.34, 0.2, 0.22, 0, 0, 0);
  mesh(hips, GEO.box, dark, 0.36, 0.05, 0.24, 0, 0.09, 0, false);
  const torso = P.torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
  mesh(torso, GEO.box, cloth, 0.38, 0.5, 0.22, 0, 0.3, 0);
  if (!T.civilian) { mesh(torso, GEO.box, armor, 0.42, 0.34, 0.27, 0, 0.35, 0.005); mesh(torso, GEO.box, dark, 0.3, 0.3, 0.12, 0, 0.32, -0.17); for (let i = -1; i <= 1; i++) mesh(torso, GEO.box, dark, 0.08, 0.1, 0.05, i * 0.11, 0.2, 0.15, false); }
  if (T.armor) { mesh(torso, GEO.box, armor, 0.16, 0.08, 0.26, 0.26, 0.56, 0); mesh(torso, GEO.box, armor, 0.16, 0.08, 0.26, -0.26, 0.56, 0); }
  if (look.accent !== undefined && !T.civilian) { mesh(torso, GEO.box, mat(look.accent, 0.85), 0.13, 0.13, 0.25, -0.235, 0.47, 0, false); mesh(torso, GEO.box, mat(look.accent, 0.85), 0.385, 0.06, 0.225, 0, 0.09, 0, false); }
  const head = P.head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
  mesh(head, GEO.cyl, skin, 0.05, 0.08, 0.05, 0, 0.02, 0, false);
  mesh(head, GEO.sph, skin, 0.1, 0.118, 0.105, 0, 0.14, 0);
  if (look.helmet) { mesh(head, GEO.dome, mat(look.helmet, 0.5, 0.5), 0.125, 0.13, 0.13, 0, 0.15, -0.005); mesh(head, GEO.box, dark, 0.17, 0.04, 0.05, 0, 0.16, 0.09, false); }
  else mesh(head, GEO.dome, mat(0x3a2a1c, 0.9), 0.108, 0.1, 0.112, 0, 0.17, -0.01, false);
  if (T.boss) { mesh(head, GEO.box, mat(0x8a1a12, 0.6), 0.03, 0.14, 0.2, 0, 0.3, -0.02); mesh(torso, GEO.box, mat(0x6a1410, 0.9), 0.44, 0.7, 0.03, 0, 0.0, -0.2); }
  // aim pivot carries the weapon and both arms so they always point where the soldier aims
  const aim = P.aim = new THREE.Group(); aim.position.set(0, 0.5, 0.02); torso.add(aim);
  if (!T.civilian && !T.melee) {
    const gun = P.gun = new THREE.Group(); gun.position.set(0.1, -0.06, 0.36); aim.add(gun);
    const gl = T.snd === 'sniper' ? 1.5 : T.snd === 'lmg' ? 1.25 : T.snd === 'smg' ? 0.75 : 1;
    mesh(gun, GEO.box, dark, 0.05, 0.075, 0.34 * gl, 0, 0, 0); mesh(gun, GEO.cyl, dark, 0.014, 0.3 * gl, 0.014, 0, 0.015, 0.3 * gl).rotation.x = Math.PI / 2;
    mesh(gun, GEO.box, dark, 0.035, 0.13, 0.05, 0, -0.09, 0.02); mesh(gun, GEO.box, mat(0x3a2a1c, 0.7), 0.04, 0.06, 0.2, 0, -0.01, -0.26);
    if (T.snd === 'sniper') mesh(gun, GEO.cyl, dark, 0.022, 0.22, 0.022, 0, 0.07, 0).rotation.x = Math.PI / 2;
    if (T.rockets) { mesh(gun, GEO.cyl, mat(0x3b4a33, 0.6, 0.3), 0.05, 0.9, 0.05, 0.02, 0.1, 0.0).rotation.x = Math.PI / 2; }
    limb(aim, cloth, 0.21, 0.02, -0.04, 0.25, -0.2, 0.12, 0.05); limb(aim, cloth, 0.25, -0.2, 0.12, 0.12, -0.1, 0.32, 0.042);
    limb(aim, cloth, -0.21, 0.02, -0.04, -0.2, -0.18, 0.22, 0.05); limb(aim, cloth, -0.2, -0.18, 0.22, 0.08, -0.07, 0.52 * Math.min(1.1, gl), 0.042);
    mesh(aim, GEO.box, dark, 0.07, 0.06, 0.08, 0.12, -0.1, 0.34, false); mesh(aim, GEO.box, dark, 0.07, 0.06, 0.08, 0.08, -0.07, 0.52 * Math.min(1.1, gl), false);
  } else {
    P.armL = new THREE.Group(); P.armL.position.set(-0.23, 0.02, 0); aim.add(P.armL); limb(P.armL, cloth, 0, 0, 0, 0, -0.3, 0.02, 0.05); limb(P.armL, skin, 0, -0.3, 0.02, 0, -0.56, 0.08, 0.04);
    P.armR = new THREE.Group(); P.armR.position.set(0.23, 0.02, 0); aim.add(P.armR); limb(P.armR, cloth, 0, 0, 0, 0, -0.3, 0.02, 0.05); limb(P.armR, skin, 0, -0.3, 0.02, 0, -0.56, 0.08, 0.04);
    if (T.melee) { const hm = new THREE.Group(); hm.position.set(0, -0.56, 0.08); P.armR.add(hm); limb(hm, mat(0x5b3a20, 0.6), 0, -0.1, 0, 0, 0.7, 0.25, 0.02); mesh(hm, GEO.box, mat(0x6c7076, 0.35, 1), 0.1, 0.1, 0.24, 0, 0.72, 0.26); }
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.1, -0.06, 0); hips.add(leg);
    limb(leg, cloth, 0, 0, 0, 0, -0.44, 0, 0.075);
    const shin = new THREE.Group(); shin.position.y = -0.44; leg.add(shin);
    limb(shin, cloth, 0, 0, 0, 0, -0.4, 0, 0.06); mesh(shin, GEO.box, boot, 0.11, 0.1, 0.26, 0, -0.42, 0.04);
    if (!T.civilian) mesh(shin, GEO.box, armor, 0.12, 0.12, 0.1, 0, -0.03, 0.05, false);
    if (s < 0) { P.legL = leg; P.shinL = shin; } else { P.legR = leg; P.shinR = shin; }
  }
  root.scale.setScalar(T.scale);
  return P;
}
function buildTurret() {
  const root = new THREE.Group(), P = { root }, metal = mat(0x3a3d42, 0.45, 0.9), brass = mat(0x8a6a2a, 0.4, 0.9);
  mesh(root, GEO.cyl, metal, 0.3, 0.16, 0.3, 0, 0.08, 0);
  const sw = P.swivel = new THREE.Group(); sw.position.y = 0.22; root.add(sw);
  mesh(sw, GEO.cyl, brass, 0.2, 0.12, 0.2, 0, 0.0, 0);
  const hd = P.aim = new THREE.Group(); hd.position.y = 0.2; sw.add(hd);
  mesh(hd, GEO.box, metal, 0.34, 0.26, 0.42, 0, 0.02, 0); mesh(hd, GEO.box, brass, 0.36, 0.06, 0.2, 0, 0.14, -0.05);
  mesh(hd, GEO.cyl, metal, 0.03, 0.55, 0.03, 0.08, 0.02, 0.45).rotation.x = Math.PI / 2; mesh(hd, GEO.cyl, metal, 0.03, 0.55, 0.03, -0.08, 0.02, 0.45).rotation.x = Math.PI / 2;
  const eye = mesh(hd, GEO.sph, new THREE.MeshBasicMaterial({ color: 0xff3018, toneMapped: false }), 0.035, 0.035, 0.035, 0, 0.09, 0.2, false); P.eye = eye;
  return P;
}

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Actor {
  constructor(sys, type, team, x, y, z, opts = {}) {
    this.sys = sys; this.type = type; this.T = ETYPES[type]; this.team = team; this.opts = opts;
    const dm = opts.hpMul || 1;
    this.maxHp = this.T.hp * dm; this.hp = this.maxHp; this.dmgMul = opts.dmgMul || 1;
    this.pos = new THREE.Vector3(x, y, z); this.vy = 0; this.yaw = opts.yaw || 0; this.aimPitch = 0; this.baseYaw = this.yaw;
    this.height = (this.T.turret ? 0.75 : 1.8) * this.T.scale; this.radius = this.T.turret ? 0.34 : 0.3; this.dead = false; this.deadT = 0; this.noHit = false;
    this.role = opts.role || (this.T.static ? 'sentry' : 'guard'); this.post = new THREE.Vector3(x, y, z); this.hold = !!opts.hold;
    this.alerted = false; this.alertT = 0; this.target = null; this.lastSeen = new THREE.Vector3(x, y, z); this.seenT = 99; this.los = false; this.percT = rand(0.3);
    this.path = null; this.pathI = 0; this.pathT = rand(0.5); this.tactT = 0; this.moveX = 0; this.moveZ = 0; this.moving = 0; this.walk = rand(6);
    this.burst = 0; this.shotT = 0; this.restT = rand(0.5, 1.5); this.chargeT = -1; this.react = 0; this.flinch = 0; this.crouchT = 0; this.crouch = 0; this.nadeT = rand(6, 12); this.rocketT = rand(4, 7);
    this.breachT = 0; this.stuckT = 0; this.goal = opts.goal || null; this.freed = false; this.swing = -1; this.fallFrom = y; this.wanderT = rand(2, 6); this.calledHelp = false;
    this.P = this.T.turret ? buildTurret() : buildHumanoid(type, opts.look || LOOKS.legion);
    this.P.root.position.copy(this.pos); this.P.root.rotation.y = this.yaw;
    G.r3.scene.add(this.P.root);
  }
  eyeY() { return this.pos.y + (this.T.turret ? 0.5 : (this.crouch > 0.5 ? 1.05 : 1.5) * this.T.scale); }

  damage(amount, attacker, kind, dir) {
    if (this.dead) return false;
    if (kind !== 'head' && this.T.armor) amount *= this.T.armor;
    if (kind === 'head' && this.T.boss) amount *= 0.5;
    if (this.T.turret && kind !== 'explosion') amount *= 0.6;
    this.hp -= amount; this.flinch = 0.25;
    if (attacker && attacker.team !== this.team) { this.alert(attacker.pos, true); if (!this.target || this.seenT > 1) { this.target = attacker; this.lastSeen.copy(attacker.pos); this.seenT = 0; } }
    if (G.mode && attacker === G.player) G.mode.onDamageDealt(this, amount, kind);
    if (this.T.boss && !this.calledHelp && this.hp < this.maxHp * 0.5) { this.calledHelp = true; if (G.mode && G.mode.onBossHalf) G.mode.onBossHalf(this); }
    if (this.hp <= 0) { this.die(attacker, kind, dir); return true; }
    return false;
  }
  die(attacker, kind, dir) {
    this.dead = true; this.deadT = 0; this.hp = 0;
    this.fallDir = dir ? Math.sign(dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw)) || -1 : -1;
    if (this.T.turret) { G.combat.explosion(this.pos.x, this.pos.y + 0.3, this.pos.z, 2.2, 60, attacker, this.team); }
    else if (this.team !== 0 && !this.T.civilian && Math.random() < 0.5) this.sys.dropPickup(Math.random() < 0.72 ? 'ammo' : 'med', this.pos.x, this.pos.y, this.pos.z);
    if (G.mode) G.mode.onActorKilled(this, attacker, kind);
  }
  alert(pos, direct) {
    if (this.T.civilian || this.dead) return;
    if (!this.alerted) { this.alerted = true; this.react = rand(0.35, 0.8) / (G.diffAcc || 1); this.sys.shout(this); if (G.mode && G.mode.onAlert) G.mode.onAlert(this); }
    this.alertT = 0;
    if (pos && (direct || this.seenT > 2)) { this.lastSeen.copy(pos); if (!direct) { this.lastSeen.x += rand(-3, 3); this.lastSeen.z += rand(-3, 3); } this.investigate = true; }
  }

  tryMove(dx, dz) {
    const w = G.world, r = 0.28, y = this.pos.y;
    const free = (x, z) => {
      if (!w.boxFree(x - r, y + 0.56, z - r, x + r, y + 1.55, z + r)) return false;
      const g = w.groundAt(x, z, y + 0.56); return g <= y + 0.56;
    };
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (free(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return true; }
    if (dx && free(nx, this.pos.z)) { this.pos.x = nx; return false; }
    if (dz && free(this.pos.x, nz)) { this.pos.z = nz; return false; }
    return false;
  }

  pickTarget() {
    const w = G.world, ey = this.eyeY(), range = this.alerted ? this.T.range * 1.25 : Math.min(this.T.range * 0.55, 30) * (G.r3.env.moon || G.r3.env.rain ? 0.65 : 1);
    let best = null, bd = 1e9;
    const consider = (t, tx, ty, tz) => {
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz); if (d > range || d >= bd) return;
      if (!this.alerted && d > 7) { const f = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d; if (f < 0.25) return; }
      if (!w.los(this.pos.x, ey, this.pos.z, tx, ty, tz)) return;
      best = t; bd = d;
    };
    const p = G.player;
    if (this.team !== 0 && p && !p.dead && !G.noTarget) consider(p, p.pos.x, p.pos.y + (p.crouch ? 0.85 : 1.35), p.pos.z);
    for (const a of this.sys.list) { if (a.dead || a.team === this.team || a.T.civilian) continue; consider(a, a.pos.x, a.pos.y + a.height * 0.7, a.pos.z); }
    if (best) { if (!this.alerted) this.alert(best.pos, true); this.target = best; this.lastSeen.copy(best.pos); this.seenT = 0; this.los = true; this.investigate = false; }
    else { this.los = false; if (this.target && (this.target.dead || this.seenT > 9)) this.target = null; }
  }

  shoot(dt) {
    const T = this.T, t = this.target; if (!t || !this.los) { this.chargeT = -1; return; }
    if (this.react > 0) { this.react -= dt; return; }
    const tx = t.pos.x, ty = t.pos.y + (t === G.player ? (t.crouch ? 0.75 : 1.2) : t.height * 0.65), tz = t.pos.z;
    const ex = this.pos.x + Math.sin(this.yaw) * 0.45, ey = this.eyeY() - 0.08, ez = this.pos.z + Math.cos(this.yaw) * 0.45;
    const dist = Math.hypot(tx - ex, ty - ey, tz - ez); if (dist > T.range * 1.2) return;
    if (T.melee) {
      if (this.swing >= 0) return;
      if (dist < T.range + 0.3 && this.restT <= 0) { this.swing = 0; this.restT = T.rest[0]; if (G.audio) G.audio.mech('swing'); }
      return;
    }
    if (T.rockets) { this.rocketT -= dt; if (this.rocketT <= 0 && dist > 9) { this.rocketT = rand(5, 8); _o.set(ex, ey + 0.2, ez); _d.set(tx - ex, ty - 0.6 - ey, tz - ez).normalize(); G.weapons.spawnProjectile('rocket', _o, _d, { dmg: 110, radius: 4.5 }, this, this.team); if (G.audio) G.audio.shot('rocket', ex, ey, ez); return; } }
    if (this.burst <= 0) {
      this.restT -= dt; if (this.restT > 0) return;
      if (T.charge) { if (this.chargeT < 0) { this.chargeT = 0; } this.chargeT += dt; if (t === G.player && G.hud) G.hud.sniperWarn(this, this.chargeT / T.charge); if (Math.random() < dt * 30) G.fx.tracer(ex, ey, ez, tx, ty, tz, 1, 0.08, 0.05, 0.008); if (this.chargeT < T.charge) return; this.chargeT = -1; }
      this.burst = randi(T.burst[0], T.burst[1]); this.shotT = 0;
    }
    this.shotT -= dt; if (this.shotT > 0) return;
    this.shotT = 60 / T.rpm; this.burst--; if (this.burst <= 0) this.restT = rand(T.rest[0], T.rest[1]);
    const tv = t === G.player ? t.speed : (t.moving || 0) * 3;
    let sp = T.spread * (1 + tv * 0.16) * (1 + Math.max(0, 1.4 - this.alertT) * 1.2) / (G.diffAcc || 1);
    if (t === G.player && t.crouch) sp *= 1.2;
    _o.set(ex, ey, ez); _d.set(tx - ex + rand(-1, 1) * sp * dist, ty - ey + rand(-1, 1) * sp * dist * 0.7, tz - ez + rand(-1, 1) * sp * dist).normalize();
    G.combat.fireBullet({ origin: _o, dir: _d, dmg: T.dmg * this.dmgMul, brick: T.turret ? 0.5 : 0.4, range: T.range * 1.5, shooter: this, team: this.team, head: 1.5, tracer: _o, color: this.team === 0 ? [0.6, 0.85, 1] : [1, 0.5, 0.25] });
    G.fx.muzzleFlash(ex + _d.x * 0.3, ey + _d.y * 0.3, ez + _d.z * 0.3, T.snd === 'sniper' ? 1.6 : 1);
    if (Math.random() < 0.4) G.r3.flashLight(_o, 0xffa050, 14, 0.05, 10);
    if (G.audio) G.audio.shot(T.snd, ex, ey, ez);
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
      if (G.audio) G.audio.ui('beep');
      this.sys.timers.push({ t: 1.1, fn: () => G.combat.explosion(bx, by, bz, 3.4, 320, this, this.team) });
      this.path = null; this.pathT = 1.4; this.retreat = 1.3; this.retX = -dx; this.retZ = -dz;
      return;
    }
    this.breachT = this.T.melee ? 0.7 : 0.5; this.swing = this.T.melee ? 0 : this.swing;
    let hit = false; _d.set(dx, 0, dz); const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let h = 0.3; h < 1.7; h += 0.25) for (const s of [-0.2, 0, 0.2]) {
      const id = w.pieceAtWorld(fx - dz * s, this.pos.y + h, fz + dx * s);
      if (id >= 0 && !seen.has(id) && !(w.pflag[id] & 32)) { seen.add(id); w.damagePiece(id, this.T.melee ? 150 : 45, _d); hit = true; }
    }
    if (hit) { if (G.audio) G.audio.thud(fx, this.pos.y + 1, fz, 0.8); G.fx.dust(fx, this.pos.y + 1, fz, 1, 0.5); }
  }

  update(dt) {
    const T = this.T, w = G.world, P = this.P;
    if (this.dead) {
      this.deadT += dt;
      if (T.turret) { P.aim.rotation.x = Math.min(0.6, this.deadT * 2); if (P.eye) P.eye.visible = false; return this.deadT < 12; }
      const k = Math.min(1, this.deadT / 0.5), e = k * k * (3 - 2 * k);
      const g = Math.max(terrainH(this.pos.x, this.pos.z), w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3));
      if (this.pos.y > g) { this.vy -= 17 * dt; this.pos.y = Math.max(g, this.pos.y + this.vy * dt); }
      P.root.position.set(this.pos.x, this.pos.y + e * 0.12, this.pos.z);
      P.root.rotation.x = e * 1.5 * this.fallDir; P.hips.position.y = 0.94 - e * 0.1;
      P.legL.rotation.x = e * 0.3; P.legR.rotation.x = -e * 0.2; P.shinR.rotation.x = e * 0.7; P.aim.rotation.x = -e * 1.0; P.head.rotation.x = e * 0.4 * this.fallDir;
      if (this.deadT > 7) P.root.scale.setScalar(Math.max(0.001, T.scale * (1 - (this.deadT - 7))));
      return this.deadT < 8;
    }
    this.alertT += dt; this.seenT += dt; this.flinch = Math.max(0, this.flinch - dt);
    // --- gravity / support
    const ground = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.56);
    if (this.pos.y > ground + 0.02) {
      if (this.vy === 0) this.fallFrom = this.pos.y;
      this.vy -= 17 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { const drop = this.fallFrom - ground; this.pos.y = ground; this.vy = 0; if (drop > 2.6) this.damage((drop - 2.2) * 28, null, 'fall'); if (this.dead) return true; }
    } else { this.pos.y = ground; this.vy = 0; }
    if (T.turret && this.pos.y < this.post.y - 0.3) { this.die(null, 'fall'); return true; }
    // --- perception
    this.percT -= dt;
    if (this.percT <= 0 && !T.civilian) { this.percT = 0.22 + rand(0.12); this.pickTarget(); }
    this.moving = 0;
    const speed = T.speed * (this.alerted ? 1 : 0.45);
    if (T.civilian) this.updateCivilian(dt);
    else if (!T.static) {
      this.pathT -= dt; this.tactT -= dt;
      const t = this.target;
      if (this.retreat > 0) { this.retreat -= dt; this.tryMove(this.retX * T.speed * dt, this.retZ * T.speed * dt); this.moveX = this.retX; this.moveZ = this.retZ; this.moving = 1; }
      else if (this.role === 'raider' && (!t || !this.los || T.sapper || T.melee && t !== G.player || (this.goalDist() < 9 && !T.melee))) {
        // push toward the objective, breaching whatever is in the way
        const gl = this.goal || this.post, gd = Math.hypot(gl.x - this.pos.x, gl.z - this.pos.z);
        if (gd < 3.5 && Math.abs(this.pos.y - (gl.y || 0)) < 2.5) { this.path = null; this.yawGoal = Math.atan2(gl.x - this.pos.x, gl.z - this.pos.z); if (G.mode && G.mode.onRaiderAtGoal) G.mode.onRaiderAtGoal(this, dt); }
        else if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = rand(1.6, 2.6); this.path = G.nav.path(this.pos.x, this.pos.z, gl.x, gl.z, T.melee || T.sapper ? 6 : 14); this.pathI = 0; }
        if (gd >= 3.5 && !this.followPath(dt, T.speed)) {
          const d = gd;
          if (!this.path) { const dx = (gl.x - this.pos.x) / d, dz = (gl.z - this.pos.z) / d; if (!this.tryMove(dx * T.speed * dt, dz * T.speed * dt)) this.breach(dt, dx, dz); this.moveX = dx; this.moveZ = dz; this.moving = 1; }
        }
      } else if (t && this.los) {
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
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
      } else if (this.alerted && (t || this.investigate) && this.seenT < 25 && !this.hold) {
        // hunt toward last known position
        const leash = this.role === 'guard' ? Math.hypot(this.lastSeen.x - this.post.x, this.lastSeen.z - this.post.z) < 60 : true;
        if (leash) {
          if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = rand(1.1, 2); this.path = G.nav.path(this.pos.x, this.pos.z, this.lastSeen.x, this.lastSeen.z, T.melee ? 5 : 0); this.pathI = 0; }
          if (!this.followPath(dt, T.speed) && this.path && this.pathI >= this.path.length) { this.investigate = false; if (this.seenT > 6) this.target = null; }
        }
      } else if (!this.hold) {
        // idle: drift back to post, wander a little
        const dx = this.post.x - this.pos.x, dz = this.post.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 2.5) { if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = 3; this.path = G.nav.path(this.pos.x, this.pos.z, this.post.x, this.post.z, 0); this.pathI = 0; } this.followPath(dt, speed); if (this.alertT > 14) this.alerted = false; }
        else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = rand(3, 8); this.yawGoal = rand(TAU); } if (this.alertT > 10) this.alerted = false; }
      }
    }
    // --- facing & aim
    let yawT = this.yawGoal !== undefined ? this.yawGoal : this.yaw, pitchT = this.alerted ? 0 : 0.55;
    if (this.target && this.los) { const t = this.target; yawT = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z); const ty = t.pos.y + (t === G.player ? 1.2 : t.height * 0.65); pitchT = -Math.atan2(ty - this.eyeY(), Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z)); this.yawGoal = undefined; }
    else if (this.moving) { yawT = Math.atan2(this.moveX, this.moveZ); this.yawGoal = undefined; }
    else if (T.static && this.alerted && !this.target) { yawT = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z); }
    else if (T.static && !this.alerted) { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = rand(2.5, 5); this.yawGoal = this.baseYaw + rand(-1.5, 1.5); } }
    let dy = yawT - this.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * Math.min(1, dt * (T.turret ? 4 : 9)); this.aimPitch = damp(this.aimPitch, pitchT, 10, dt);
    if (!T.civilian) this.shoot(dt);
    if (T.nades && this.target === G.player && !this.los && this.seenT > 2.5 && this.seenT < 8) { this.nadeT -= dt; if (this.nadeT <= 0) { this.nadeT = rand(9, 15); const d = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z); if (d < 26 && d > 6) { _o.set(this.pos.x, this.pos.y + 1.6, this.pos.z); _d.set(this.lastSeen.x - this.pos.x, d * 0.35, this.lastSeen.z - this.pos.z).normalize(); G.weapons.spawnProjectile('frag', _o, _d, { dmg: 85, radius: 4.2 }, this, this.team); G.weapons.projectiles[G.weapons.projectiles.length - 1].vel.multiplyScalar(clamp(d / 17, 0.6, 1.25)); if (G.hud) G.hud.toast('GRENADE!', 1.2, 'nade'); } } }
    if (this.swing >= 0) {
      this.swing += dt;
      if (this.swing > 0.32 && this.swing - dt <= 0.32 && this.target && !this.target.dead) { const t = this.target, d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); if (d < T.range + 0.4 && Math.abs(t.pos.y - this.pos.y) < 1.6) { if (t === G.player) t.damage(T.dmg * this.dmgMul, this.pos, 'melee'); else t.damage(T.dmg * this.dmgMul, this, 'melee'); } }
      if (this.swing > 0.7) this.swing = -1;
    }
    this.restT -= T.melee ? dt : 0;
    this.pose(dt);
    return true;
  }
  goalDist() { const g = this.goal || this.post; return Math.hypot(g.x - this.pos.x, g.z - this.pos.z); }

  updateCivilian(dt) {
    if (!this.freed) return;
    const gl = this.goal || { x: 0, z: 60 };
    this.pathT -= dt;
    if (this.pathT <= 0 && this.sys.navBudget > 0) { this.sys.navBudget--; this.pathT = 2.5; this.path = G.nav.path(this.pos.x, this.pos.z, gl.x, gl.z, 0); this.pathI = 0; }
    if (!this.followPath(dt, this.T.speed)) { const d = Math.hypot(gl.x - this.pos.x, gl.z - this.pos.z); if (d > 2) { this.tryMove((gl.x - this.pos.x) / d * this.T.speed * dt, (gl.z - this.pos.z) / d * this.T.speed * dt); this.moveX = (gl.x - this.pos.x) / d; this.moveZ = (gl.z - this.pos.z) / d; this.moving = 1; } else if (!this.escaped) { this.escaped = true; this.noHit = true; this.P.root.visible = false; if (G.mode && G.mode.onHostageEscaped) G.mode.onHostageEscaped(this); } }
  }

  pose(dt) {
    const P = this.P, T = this.T;
    P.root.position.copy(this.pos); P.root.rotation.y = this.yaw;
    if (T.turret) { P.swivel.rotation.y = 0; P.aim.rotation.x = this.aimPitch; P.eye.visible = this.alerted ? (G.r3.time * 6 % 1) < 0.6 : true; return; }
    this.crouchT -= dt; this.crouch = damp(this.crouch, this.crouchT > 0 && !this.moving ? 1 : 0, 8, dt);
    const mv = this.moving; this.mvS = damp(this.mvS || 0, mv, 10, dt);
    if (mv) this.walk += dt * (this.alerted ? T.speed : T.speed * 0.5) * 2.4 / T.scale;
    const s = Math.sin(this.walk), c = Math.cos(this.walk), m = this.mvS, cr = this.crouch;
    P.hips.position.y = 0.94 - cr * 0.34 + Math.abs(c) * 0.03 * m;
    P.legL.rotation.x = s * 0.75 * m - cr * 1.15; P.legR.rotation.x = -s * 0.75 * m - cr * 0.35;
    P.shinL.rotation.x = Math.max(0, -c) * 1.0 * m + cr * 1.7; P.shinR.rotation.x = Math.max(0, c) * 1.0 * m + cr * 1.45;
    P.torso.rotation.x = 0.06 + m * 0.12 + this.flinch * 0.5; P.torso.rotation.y = this.flinch * (this.fallDir || 1) * 0.6;
    P.head.rotation.x = this.aimPitch * 0.5;
    if (P.gun) P.aim.rotation.x = this.aimPitch - (P.torso.rotation.x);
    else {
      const sw = this.swing >= 0 ? Math.sin(Math.min(1, this.swing / 0.6) * Math.PI) : 0;
      P.armL.rotation.x = -s * 0.6 * m + (this.freed && !mv ? -2.6 : 0); P.armR.rotation.x = s * 0.6 * m - sw * 2.4 + (T.melee ? -0.5 : 0) + (this.freed && !mv ? -2.6 : 0);
    }
  }
  remove() { G.r3.scene.remove(this.P.root); }
}

export class Actors {
  constructor() {
    this.list = []; this.mines = []; this.pickups = []; this.timers = []; this.navBudget = 2; this.shoutT = 0;
    this.mineGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.07, 12); this.mineMat = mat(0x2d2f2a, 0.7, 0.5);
    this.pkGeo = new THREE.BoxGeometry(0.34, 0.22, 0.24);
    this.pkMat = { ammo: new THREE.MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.6, emissive: 0x334411, emissiveIntensity: 0.6 }), med: new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, emissive: 0x661111, emissiveIntensity: 0.9 }) };
  }
  spawn(type, team, x, y, z, opts) { const a = new Actor(this, type, team, x, y, z, opts); this.list.push(a); return a; }
  addMine(x, y, z, team) { const m = new THREE.Mesh(this.mineGeo, this.mineMat); m.position.set(x, y + 0.02, z); m.receiveShadow = true; G.r3.scene.add(m); const mine = { x, y, z, team, mesh: m, dead: false }; this.mines.push(mine); return mine; }
  dropPickup(kind, x, y, z) { if (this.pickups.length > 14) return; const m = new THREE.Mesh(this.pkGeo, this.pkMat[kind]); m.position.set(x, y + 0.3, z); m.castShadow = true; G.r3.scene.add(m); this.pickups.push({ kind, x, y, z, mesh: m, t: 0 }); }
  shout(a) { for (const b of this.list) { if (b !== a && !b.dead && b.team === a.team && !b.alerted && b.pos.distanceToSquared(a.pos) < 15 * 15) { b.alerted = true; b.react = rand(0.5, 1); b.alertT = 0; b.lastSeen.copy(a.lastSeen); b.investigate = true; } } }
  alert(x, z, radius, src) {
    const team = src ? src.team : -1; _v.set(x, src ? src.pos.y : 0, z);
    for (const a of this.list) { if (a.dead || a.team === team) continue; const d = Math.hypot(a.pos.x - x, a.pos.z - z); if (d < radius) a.alert(_v, d < radius * 0.35); }
  }
  countAlive(team, filter) { let n = 0; for (const a of this.list) if (!a.dead && a.team === team && !a.T.civilian && (!filter || filter(a))) n++; return n; }
  explosionAt(x, y, z, r) { for (const m of this.mines) if (!m.dead && Math.hypot(m.x - x, m.z - z) < r * 0.9) { m.dead = true; this.timers.push({ t: rand(0.1, 0.3), fn: () => this.detonate(m) }); } }
  detonate(m) { m.dead = true; G.r3.scene.remove(m.mesh); G.combat.explosion(m.x, m.y + 0.2, m.z, 4.6, 170, null, m.team); }
  update(dt) {
    this.navBudget = 2;
    if (G.world.navDirty) { this.navT = (this.navT || 0) - dt; if (this.navT <= 0) { G.nav.rebuild(G.world); G.world.navDirty = false; this.navT = 0.5; } }
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    for (let i = this.list.length - 1; i >= 0; i--) { const a = this.list[i]; if (!a.update(dt)) { a.remove(); this.list.splice(i, 1); } }
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
  }
  clear() {
    for (const a of this.list) a.remove(); this.list.length = 0;
    for (const m of this.mines) G.r3.scene.remove(m.mesh); this.mines.length = 0;
    for (const k of this.pickups) G.r3.scene.remove(k.mesh); this.pickups.length = 0;
    this.timers.length = 0;
  }
}
