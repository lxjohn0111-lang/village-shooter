// Weapon definitions and the first-person weapon system: firing, spray patterns, reloads, aiming, melee, grenades.
import * as THREE from 'three';
import { G, clamp, damp, lerp, rand, terrainH } from './util.js';
import { Input } from './input.js';
import { makeFlashTexture } from './textures.js';
import { GB, modelMats } from './geo.js';
import { makeGun, makeHand } from './guns.js';

export const WEAPONS = {
  pistol: { name: 'P9 Warden', cls: 'Sidearm', kind: 'pistol', dmg: 30, head: 2.0, rpm: 400, auto: false, mag: 14, reserve: 9999, reload: 1.35, hip: 0.014, ads: 0.0025, recoil: [0.020, 0.008], brick: 0.9, range: 90, falloff: [16, 50, 0.5], adsFov: 0.82, move: 1, unlock: 1, cost: 0, desc: 'Reliable sidearm with bottomless reserves. Never leaves your hip.' },
  rifle: { name: 'KR-7 Bulwark', cls: 'Assault Rifle', kind: 'rifle', dmg: 25, head: 2.0, rpm: 650, auto: true, mag: 30, reserve: 180, reload: 2.1, hip: 0.024, ads: 0.003, recoil: [0.013, 0.006], brick: 1, range: 160, falloff: [35, 90, 0.6], adsFov: 0.7, move: 0.96, unlock: 1, cost: 0, desc: 'The all-rounder. Controllable, accurate and good for chewing through brick.' },
  smg: { name: 'Hornet-9', cls: 'SMG', kind: 'smg', dmg: 18, head: 1.8, rpm: 920, auto: true, mag: 36, reserve: 252, reload: 1.7, hip: 0.026, ads: 0.006, recoil: [0.009, 0.007], brick: 0.7, range: 80, falloff: [14, 40, 0.45], adsFov: 0.8, move: 1.06, unlock: 3, cost: 1400, desc: 'Sprays fast and keeps you light on your feet. Brutal indoors.' },
  shotgun: { name: 'Breaker 12', cls: 'Shotgun', kind: 'shotgun', dmg: 15, pellets: 9, head: 1.5, rpm: 78, auto: false, mag: 7, reserve: 49, reload: 0.5, perShell: true, hip: 0.07, ads: 0.05, recoil: [0.06, 0.012], brick: 1.9, range: 45, falloff: [8, 28, 0.25], adsFov: 0.85, move: 0.98, unlock: 5, cost: 2800, desc: 'Nine pellets per shell. Opens doors, walls and anyone behind them.' },
  sniper: { name: 'Longbow .338', cls: 'Marksman', kind: 'sniper', dmg: 170, head: 2.6, rpm: 44, auto: false, mag: 5, reserve: 35, reload: 2.8, hip: 0.07, ads: 0.0002, recoil: [0.075, 0.012], brick: 4.5, range: 500, adsFov: 0.2, scope: true, move: 0.9, unlock: 8, cost: 5200, desc: 'Bolt-action. Punches clean through stone blocks and anything wearing a helmet.' },
  lmg: { name: 'Mauler', cls: 'LMG', kind: 'lmg', dmg: 28, head: 1.8, rpm: 570, auto: true, mag: 90, reserve: 270, reload: 4.2, hip: 0.036, ads: 0.008, recoil: [0.014, 0.008], brick: 1.5, range: 160, falloff: [40, 100, 0.65], adsFov: 0.72, move: 0.84, unlock: 12, cost: 8500, desc: 'Ninety rounds of belt-fed demolition. Saws buildings in half.' },
  launcher: { name: 'Thumper GL', cls: 'Launcher', kind: 'launcher', dmg: 190, radius: 4.2, rpm: 70, auto: false, mag: 6, reserve: 18, reload: 3.4, hip: 0.01, ads: 0.004, recoil: [0.05, 0.01], brick: 1, range: 0, projectile: 'gl', adsFov: 0.85, move: 0.92, unlock: 15, cost: 14000, desc: 'Six-shot grenade launcher. Lobs explosive rounds over walls.' },
  rocket: { name: 'Ramrod RPG', cls: 'Launcher', kind: 'rocket', dmg: 420, radius: 6.5, rpm: 30, auto: false, mag: 1, reserve: 7, reload: 3.0, hip: 0.01, ads: 0.002, recoil: [0.09, 0.02], brick: 1, range: 0, projectile: 'rocket', adsFov: 0.8, move: 0.86, unlock: 20, cost: 24000, desc: 'Turns a gatehouse into a crater. Mind the backblast.' },
  sledge: { name: "Mason's Sledge", cls: 'Melee', kind: 'sledge', dmg: 95, head: 1, rpm: 78, auto: true, mag: 1, reserve: 0, reload: 0, hip: 0, ads: 0, recoil: [0, 0], brick: 170, range: 2.4, melee: true, adsFov: 1, move: 1.04, unlock: 1, cost: 0, desc: 'Ten pounds of steel. Knock a wall out one brick at a time.' },
};
for (const k in WEAPONS) WEAPONS[k].id = k;
export const PRIMARIES = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'launcher', 'rocket'];
export function upgradeCost(id, lvl) { const w = WEAPONS[id], b = 400 + w.unlock * 220; return { gold: Math.round(b * Math.pow(1.9, lvl - 1) / 50) * 50, iron: Math.round(b * 0.25 * Math.pow(1.8, lvl - 1) / 10) * 10 }; }
export function weaponStats(id, lvl = 1) {
  const w = WEAPONS[id], k = lvl - 1;
  return { dmg: w.dmg * (1 + k * 0.09), mag: w.melee ? 1 : Math.round(w.mag * (1 + k * 0.1)), reload: w.reload * (1 - k * 0.05), recoil: 1 - k * 0.07, brick: w.brick * (1 + k * 0.1), radius: (w.radius || 0) * (1 + k * 0.05) };
}

// ballistics / handling extras: muzzle velocity (m/s), ragdoll impulse, time to aim, closed-bolt (+1 in the chamber)
const EXTRA = {
  pistol: { vel: 300, imp: 2.4, adsTime: 0.15, chamber: true }, rifle: { vel: 560, imp: 3.2, adsTime: 0.21, chamber: true }, smg: { vel: 380, imp: 2.2, adsTime: 0.17, chamber: true },
  shotgun: { vel: 330, imp: 2.6, adsTime: 0.24 }, sniper: { vel: 760, imp: 8, adsTime: 0.33, chamber: true }, lmg: { vel: 540, imp: 3.6, adsTime: 0.36 },
  launcher: { vel: 34, imp: 0, adsTime: 0.27 }, rocket: { vel: 62, imp: 0, adsTime: 0.32 }, sledge: { vel: 0, imp: 7, adsTime: 0.2 },
};
for (const k in EXTRA) Object.assign(WEAPONS[k], EXTRA[k]);

// deterministic spray pattern: strong initial climb, then an S-shaped horizontal drift you can learn to counter
function pattern(def, i) {
  const ph = def.id.charCodeAt(0) * 0.7 + def.id.length;
  const v = def.recoil[0] * (i < 3 ? 1.3 : i < 9 ? 0.9 : 0.5);
  const h = def.recoil[1] * (Math.sin(i * 0.55 + ph) * 0.9 + (i > 6 ? Math.sin(i * 0.21 + ph * 0.5) * 1.5 : 0));
  return [v * (0.85 + Math.random() * 0.3), h + (Math.random() - 0.5) * def.recoil[1] * 0.5];
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const FUSE = 3.2;

function grenadeGeo() {
  const g = new GB();
  g.sph(0x3d4a30, 0.034, 0.04, 0.034, 0, 0, 0, 12); for (let i = 0; i < 4; i++) g.torus(0x2c3722, 0.0335, 0.003, 0, -0.022 + i * 0.015, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 6; i++) g.box(0x2c3722, 0.004, 0.07, 0.004, Math.cos(i / 6 * 6.28) * 0.033, 0, Math.sin(i / 6 * 6.28) * 0.033);
  g.cyl(0x8c8f96, 0.012, 0.014, 0.02, 0, 0.046, 0, 0, 0, 0, 8); g.box(0x8c8f96, 0.012, 0.004, 0.05, 0.012, 0.05, 0.012, 0.5); g.torus(0xa9adb5, 0.012, 0.0018, -0.016, 0.052, 0, 0, 0, 0);
  return g.build(20);
}
function rocketGeo() {
  const g = new GB();
  g.cylZ(0x4c543b, 0.02, 0.24, 0, 0, 0.12, 10); g.cylZ(0x4c543b, 0.046, 0.1, 0, 0, -0.05, 12, 0.02); g.cylZ(0x4c543b, 0.046, 0.04, 0, 0, -0.12, 12); g.cylZ(0x4c543b, 0.01, 0.12, 0, 0, -0.2, 12, 0.046); g.cylZ(0xa9adb5, 0.005, 0.03, 0, 0, -0.27, 8, 0.01);
  for (let i = 0; i < 4; i++) g.box(0x33363b, 0.002, 0.05, 0.08, Math.cos(i * 1.57) * 0.03, Math.sin(i * 1.57) * 0.03, 0.2, 0, 0, i * 1.57 + 1.57);
  return g.build(12);
}

export class WeaponSys {
  constructor(camera) {
    this.camera = camera;
    this.holder = new THREE.Group(); this.holder.scale.setScalar(0.42); camera.add(this.holder);
    this.rig = new THREE.Group(); this.holder.add(this.rig);
    this.models = {};
    const fm = new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    fm.color.setRGB(3, 2.2, 1.4);
    this.flash = new THREE.Group(); const fg = new THREE.PlaneGeometry(0.34, 0.34);
    this.flash.add(new THREE.Mesh(fg, fm)); const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), fm); f2.rotation.y = Math.PI / 2; f2.position.z = -0.16; this.flash.add(f2);
    const f3 = f2.clone(); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2); this.flash.add(f3);
    this.flash.traverse((o) => { o.frustumCulled = false; }); this.flash.visible = false;
    this.slots = ['rifle', 'pistol', 'sledge']; this.cur = 0; this.state = {}; this.levels = {};
    this.id = 'rifle'; this.def = WEAPONS.rifle; this.stats = weaponStats('rifle', 1); this.model = null;
    this.cool = 0; this.reloadT = -1; this.reloadDur = 0; this.reloadTac = false; this.equipT = 0; this.switchTo = -1; this.adsT = 0; this.kick = 0; this.kickR = 0; this.kickRoll = 0; this.swayX = 0; this.swayY = 0; this.spread = 0;
    this.flashT = 0; this.swingT = -1; this.swingHit = false; this.boltT = -1; this.pumpT = -1; this.boltKick = 0; this.grenades = 3; this.maxGrenades = 3; this.throwT = -1; this.cookT = -1; this.heat = 0;
    this.bashT = -1; this.bashHit = false; this.bashCool = 0; this.sprayI = 0; this.sprintOut = 0; this.breath = 1; this.winded = false; this.holding = false; this.shotId = 0; this.lastHitShot = -1;
    this.projectiles = []; this.shotsFired = 0; this.shotsHit = 0; this.rSnd = 0; this.lastShot = 9; this.sprintT = 0;
    this.projGeo = grenadeGeo(); this.rocketGeo = rocketGeo(); this.glGeo = new THREE.SphereGeometry(0.03, 8, 6);
    this.projMat = modelMats().metal;
  }

  setLoadout(primary, levels, opts = {}) {
    this.slots = [primary, 'pistol', 'sledge']; this.levels = levels || {};
    this.state = {};
    for (const id of this.slots) { const st = weaponStats(id, this.levels[id] || 1); this.state[id] = { mag: st.mag, reserve: WEAPONS[id].reserve }; }
    this.maxGrenades = opts.grenades || 3; this.grenades = this.maxGrenades;
    this.projectiles.forEach((p) => G.r3.scene.remove(p.mesh)); this.projectiles.length = 0;
    this.shotsFired = 0; this.shotsHit = 0; this.cookT = -1; this.throwT = -1; this.bashT = -1; this.breath = 1; this.sprayI = 0;
    this.equip(0, true);
  }
  equip(i, instant) {
    if (i === this.cur && !instant) return; if (i < 0 || i >= this.slots.length) return;
    if (instant) { this.cur = i; this._apply(); this.equipT = 0; return; }
    if (this.cookT >= 0) return;
    this.switchTo = i; this.reloadT = -1; this.swingT = -1; this.bashT = -1; if (G.audio) G.audio.mech('swap');
  }
  buildView(id) {
    const kind = WEAPONS[id].kind, m = makeGun(kind, true), p = m.pts;
    m.muzzle = new THREE.Vector3().fromArray(p.muzzle); m.eject = new THREE.Vector3().fromArray(p.eject);
    m.rh = makeHand('grip', false); m.rh.position.fromArray(p.grip); if (p.melee) m.rh.rotation.x = -0.47; m.group.add(m.rh);
    if (!p.oneHand || true) { m.lh = makeHand(p.foreV ? 'grip' : 'cradle', true); m.lh.position.fromArray(p.fore); if (p.melee) m.lh.rotation.x = -0.47; (m.pump || m.group).add(m.lh); m.lhBase = m.lh.position.clone(); }
    m.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return m;
  }
  _apply() {
    this.id = this.slots[this.cur]; this.def = WEAPONS[this.id]; this.stats = weaponStats(this.id, this.levels[this.id] || 1);
    if (!this.models[this.id]) this.models[this.id] = this.buildView(this.id);
    if (this.model) this.rig.remove(this.model.group);
    this.model = this.models[this.id]; this.rig.add(this.model.group);
    this.model.group.add(this.flash); this.flash.position.copy(this.model.muzzle);
    this.reloadT = -1; this.boltT = -1; this.pumpT = -1; this.cool = 0.25; this.sprayI = 0; this.heat = 0;
    this.resetParts();
  }
  resetParts() { const m = this.model; if (!m) return; for (const k of ['mag', 'bolt', 'pump']) if (m[k]) { m[k].position.set(0, 0, 0); m[k].rotation.set(0, 0, 0); m[k].visible = true; } if (m.lh) m.lh.position.copy(m.lhBase); }
  ammo() { return this.state[this.id]; }
  refill(frac = 1) { for (const id of this.slots) { const st = this.state[id], w = WEAPONS[id]; if (w.reserve < 9000) st.reserve = Math.min(w.reserve, Math.ceil(st.reserve + w.reserve * frac)); } this.grenades = Math.min(this.maxGrenades, this.grenades + Math.max(1, Math.round(this.maxGrenades * frac))); }

  startReload() {
    const a = this.ammo(), d = this.def;
    if (d.melee || this.reloadT >= 0 || a.mag >= this.stats.mag || a.reserve <= 0 || this.switchTo >= 0 || this.bashT >= 0) return;
    this.reloadTac = !!d.chamber && a.mag > 0;                      // round still chambered: faster, and you keep it
    this.reloadDur = d.perShell ? d.reload : this.stats.reload * (this.reloadTac ? 0.82 : 1); this.reloadT = 0; this.rSnd = 0;
  }
  finishReload() {
    const a = this.ammo(), d = this.def;
    if (d.perShell) { a.mag++; if (d.reserve < 9000) a.reserve--; if (G.audio) G.audio.mech('shell'); if (a.mag < this.stats.mag && a.reserve > 0 && !Input.buttons[0]) { this.reloadT = 0; this.rSnd = 0; return; } this.pumpT = 0; }
    else { const cap = this.stats.mag + (this.reloadTac ? 1 : 0), need = cap - a.mag, take = Math.min(need, a.reserve); a.mag += take; if (d.reserve < 9000) a.reserve -= take; }
    this.reloadT = -1; this.resetParts();
  }

  // called by Combat when one of the player's bullets hits an enemy
  onBulletHit(b, head, killed) { if (b.shot !== this.lastHitShot) { this.lastHitShot = b.shot; this.shotsHit++; } if (G.hud) G.hud.hitmarker(head, killed); }

  fire(player) {
    const d = this.def, a = this.ammo(), cam = this.camera;
    if (d.melee) { if (this.swingT < 0) { this.swingT = 0; this.swingHit = false; this.cool = 60 / d.rpm; if (G.audio) G.audio.mech('swing'); } return; }
    if (a.mag <= 0) { if (G.audio) G.audio.mech('dry'); this.cool = 0.25; this.startReload(); return; }
    if (this.reloadT >= 0) { if (d.perShell && a.mag > 0) { this.reloadT = -1; this.resetParts(); } else return; }
    a.mag--; this.cool = 60 / d.rpm; this.shotsFired++; this.lastShot = 0; this.shotId++;
    const moveSp = clamp(player.speed / 6, 0, 1) * (player.onGround ? 1 : 1.8);
    const base = lerp(d.hip * (1 + moveSp * 1.6) * (player.crouch ? 0.7 : 1), d.ads * (1 + moveSp * 1.5), this.adsT);
    const spread = base + this.heat * d.hip * 0.8 * (1 - this.adsT * 0.8);
    cam.getWorldPosition(_v); cam.getWorldDirection(_v2);
    const muzzle = this.model.muzzle.clone(); this.model.group.localToWorld(muzzle);
    const right = new THREE.Vector3().crossVectors(_v2, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, _v2);
    if (d.projectile) {
      const dir = _v2.clone().addScaledVector(right, rand(-1, 1) * spread).addScaledVector(up, rand(-1, 1) * spread).normalize();
      this.spawnProjectile(d.projectile, _v.clone().addScaledVector(dir, 0.6).addScaledVector(right, 0.12).addScaledVector(up, -0.08), dir, this.stats, player);
      if (this.model.mag && d.kind === 'rocket') this.model.mag.visible = false;
    } else {
      const n = d.pellets || 1;
      for (let i = 0; i < n; i++) {
        const a2 = rand(6.283), rr = Math.sqrt(Math.random()) * spread;
        const dir = _v2.clone().addScaledVector(right, Math.cos(a2) * rr).addScaledVector(up, Math.sin(a2) * rr).normalize();
        G.combat.fireBullet({ origin: _v, dir, dmg: this.stats.dmg, brick: this.stats.brick, range: d.range, shooter: player, team: 0, falloff: d.falloff, head: d.head, speed: d.vel * rand(0.97, 1.03), impulse: d.imp, vis: muzzle, shot: this.shotId, tracer: n === 1 || i % 2 === 0, kind: d.kind });
      }
    }
    // recoil: the pattern actually moves your aim (and partly settles back); the visual kick is on top
    const rk = this.stats.recoil * (1 - this.adsT * 0.3) * (player.crouch ? 0.8 : 1) * (player.lean ? 1.1 : 1);
    const pt = pattern(d, Math.floor(this.sprayI)); this.sprayI += 1;
    const dp = pt[0] * rk * 0.55, dy = pt[1] * rk;
    player.pitch = clamp(player.pitch + dp, -1.5, 1.5); player.yaw += dy; player.recAccP += dp * 0.75; player.recAccY += dy * 0.6;
    player.recoilVP += d.recoil[0] * 9 * rk; player.recoilY += rand(-1, 1) * d.recoil[1] * 0.35 * rk;
    this.kick = Math.min(1.7, this.kick + 0.55 + d.recoil[0] * 10); this.kickR += d.recoil[0] * 2.0; this.kickRoll += rand(-1, 1) * d.recoil[1] * 3;
    this.boltKick = 1; this.heat = Math.min(1, this.heat + (d.auto ? 0.085 : 0.25));
    this.flashT = 0.05; this.flash.rotation.z = rand(6.283); this.flash.scale.setScalar(rand(0.8, 1.3) * (d.kind === 'shotgun' || d.kind === 'sniper' ? 1.7 : d.kind === 'pistol' ? 0.7 : d.kind === 'lmg' ? 1.25 : 1));
    G.r3.flashLight(muzzle, 0xffb060, 30, 0.06, 15);
    G.fx.muzzleSmoke(muzzle.x, muzzle.y, muzzle.z, _v2.x, _v2.y, _v2.z); if (d.kind === 'shotgun' || d.kind === 'sniper' || d.projectile) G.fx.muzzleSmoke(muzzle.x, muzzle.y, muzzle.z, _v2.x * 2, _v2.y * 2, _v2.z * 2);
    G.fx.sparks(muzzle.x, muzzle.y, muzzle.z, d.kind === 'shotgun' ? 6 : 2, 7, _v2.x, _v2.y, _v2.z);
    player.shake = Math.min(1, player.shake + d.recoil[0] * 2.2);
    if (G.audio) { G.audio.shot(d.kind, 0, 0, 0, true); if (a.mag <= Math.min(6, this.stats.mag * 0.25)) G.audio.lowAmmo(a.mag / Math.max(1, Math.min(6, this.stats.mag * 0.25))); if (!d.projectile && d.kind !== 'shotgun' && d.kind !== 'sniper') G.audio.casing(); }
    if (!d.projectile && d.kind !== 'shotgun' && d.kind !== 'sniper') this.ejectCasing(right, up, d.kind === 'pistol' || d.kind === 'smg' ? 0.8 : 1);
    if (d.kind === 'sniper' && a.mag > 0) this.boltT = 0; if (d.kind === 'shotgun' && a.mag > 0) this.pumpT = 0;
    if (G.actors) G.actors.alert(player.pos.x, player.pos.z, d.kind === 'pistol' ? 34 : 55, player);
    if (G.mode) G.mode.onPlayerShot(this.id);
    if (a.mag <= 0 && a.reserve > 0) this.cool = Math.max(this.cool, 0.2);
  }
  ejectCasing(right, up, scale = 1, shell = false) {
    const p = this.model.eject.clone(); this.model.group.localToWorld(p);
    const v = right.clone().multiplyScalar(rand(1.8, 3)).addScaledVector(up, rand(1.2, 2.4)).add(G.player.vel);
    if (shell) G.world.spawnDebris(p.x, p.y, p.z, 0.02, 0.02, 0.06, v.x, v.y, v.z, 0.6, 0.08, 0.06, 0.5, 0.1, 7, 0.5, 3);
    else G.world.spawnDebris(p.x, p.y, p.z, 0.012 * scale, 0.012 * scale, 0.034 * scale, v.x, v.y, v.z, 0.75, 0.55, 0.18, 0.3, 1, 7, 0.5, 2.5);
  }
  spawnProjectile(type, pos, dir, stats, owner, team = 0, fuse = 2.4) {
    const mesh = new THREE.Mesh(type === 'rocket' ? this.rocketGeo : type === 'gl' ? this.glGeo : this.projGeo, this.projMat); mesh.position.copy(pos); mesh.castShadow = true; G.r3.scene.add(mesh);
    const speed = type === 'rocket' ? 62 : type === 'gl' ? 34 : 17;
    const vel = dir.clone().multiplyScalar(speed); if (type === 'frag') vel.y += 3.5;
    if (type === 'rocket') mesh.lookAt(pos.clone().add(dir));
    const p = { type, pos: pos.clone(), vel, mesh, life: type === 'frag' ? fuse : 8, dmg: stats.dmg, radius: stats.radius, owner, team, trail: 0, spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)) };
    this.projectiles.push(p); return p;
  }
  throwGrenade(player, fuse) {
    this.grenades--; this.camera.getWorldPosition(_v); this.camera.getWorldDirection(_v2);
    const p = this.spawnProjectile('frag', _v.clone().addScaledVector(_v2, 0.5), _v2.clone(), { dmg: 240, radius: 5 }, player, 0, Math.max(0.06, fuse));
    p.vel.add(player.vel); this.throwT = 0; if (G.audio) G.audio.mech('swing'); if (G.mode) G.mode.onPlayerShot('frag');
  }

  updateProjectiles(dt) {
    const w = G.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.life -= dt;
      let boom = p.life <= 0;
      const g = p.type === 'rocket' ? 0.6 : 11;
      p.vel.y -= g * dt;
      const step = p.vel.length() * dt, n = Math.max(1, Math.ceil(step / 0.2));
      for (let s = 0; s < n && !boom; s++) {
        const nx = p.pos.x + p.vel.x * dt / n, ny = p.pos.y + p.vel.y * dt / n, nz = p.pos.z + p.vel.z * dt / n;
        const solid = w.solidAt(nx, ny, nz), ground = ny < terrainH(nx, nz) + 0.05;
        let actorHit = false;
        if (p.type !== 'frag' && G.actors) for (const a of G.actors.list) { if (!a.dead && a.team !== p.team && Math.abs(a.pos.x - nx) < 0.5 && Math.abs(a.pos.z - nz) < 0.5 && ny > a.pos.y && ny < a.pos.y + a.height) { actorHit = true; break; } }
        if (p.type !== 'frag' && p.team !== 0) { const pl = G.player; if (!pl.dead && Math.abs(pl.pos.x - nx) < 0.45 && Math.abs(pl.pos.z - nz) < 0.45 && ny > pl.pos.y && ny < pl.pos.y + pl.height) actorHit = true; }
        if (solid || ground || actorHit) {
          if (p.type === 'frag') {
            if (ground) { p.vel.y = Math.abs(p.vel.y) * 0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; p.pos.y = terrainH(nx, nz) + 0.06; }
            else { if (!w.solidAt(p.pos.x, ny, p.pos.z)) { p.vel.x *= -0.35; p.vel.z *= -0.35; } else { p.vel.y *= -0.35; } p.vel.multiplyScalar(0.7); }
            p.spin.multiplyScalar(0.6);
            if (G.audio && p.vel.length() > 1.5) G.audio.impact('metal', p.pos.x, p.pos.y, p.pos.z);
            break;
          } else boom = true;
        } else p.pos.set(nx, ny, nz);
      }
      p.mesh.position.copy(p.pos);
      if (p.type === 'rocket') { p.trail += dt; if (p.trail > 0.012) { p.trail = 0; G.fx.trail(p.pos.x, p.pos.y, p.pos.z, 1); } }
      else { if (p.type === 'gl') { p.trail += dt; if (p.trail > 0.04) { p.trail = 0; G.fx.trail(p.pos.x, p.pos.y, p.pos.z, 0.4); } } p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt; }
      if (boom) { G.r3.scene.remove(p.mesh); this.projectiles.splice(i, 1); G.combat.explosion(p.pos.x, p.pos.y + 0.1, p.pos.z, p.radius, p.dmg, p.owner, p.team === 0 ? -1 : p.team); }
    }
  }

  update(dt, player, active) {
    const d = this.def, m = this.model, inp = Input;
    this.cool -= dt; this.lastShot += dt; this.bashCool -= dt; this.heat = Math.max(0, this.heat - dt * (this.lastShot > 0.12 ? 2.4 : 0.4));
    if (this.lastShot > 0.28) this.sprayI = Math.max(0, this.sprayI - dt * 14);
    // recoil settle: the aim drifts most of the way back to where the burst started
    if (this.lastShot > 0.09) {
      const rp = player.recAccP * Math.min(1, dt * 8), ry = player.recAccY * Math.min(1, dt * 8);
      player.pitch -= rp; player.recAccP -= rp; player.yaw -= ry; player.recAccY -= ry;
    }
    // switching
    if (this.switchTo >= 0) { this.equipT += dt * 5.5; if (this.equipT >= 1) { this.cur = this.switchTo; this.switchTo = -1; this._apply(); } }
    else this.equipT = Math.max(0, this.equipT - dt * 5.5);
    const canAct = active && !player.dead && this.switchTo < 0 && this.equipT < 0.3;
    if (player.sprinting && !d.melee) this.sprintOut = 0.16; else this.sprintOut -= dt;
    if (active && !player.dead) {
      if (inp.pressed.Digit1) this.equip(0); if (inp.pressed.Digit2) this.equip(1); if (inp.pressed.Digit3) this.equip(2);
      if (inp.wheel !== 0 && this.switchTo < 0) this.equip((this.cur + (inp.wheel > 0 ? 1 : 2)) % 3);
      if (inp.pressed.KeyR) this.startReload();
      if (inp.pressed.KeyV && canAct && this.bashT < 0 && this.bashCool <= 0 && this.swingT < 0 && this.cookT < 0) { this.bashT = 0; this.bashHit = false; this.bashCool = 0.75; this.reloadT = -1; this.resetParts(); if (G.audio) G.audio.mech('swing'); }
      // grenades: hold G to cook, release to throw
      if (inp.pressed.KeyG && this.grenades > 0 && this.cookT < 0 && this.throwT < 0 && this.switchTo < 0) { this.cookT = 0; this.cookBeep = 1; if (G.audio) G.audio.mech('pin'); }
    }
    if (this.cookT >= 0) {
      this.cookT += dt;
      if (this.cookT >= this.cookBeep) { this.cookBeep += 1; if (G.audio) G.audio.ui('beep'); }
      if (this.cookT >= FUSE) { this.cookT = -1; this.grenades--; G.combat.explosion(player.pos.x, player.pos.y + 1.2, player.pos.z, 5, 240, player); }
      else if (!inp.keys.KeyG || player.dead || !active) { this.throwGrenade(player, FUSE - this.cookT); this.cookT = -1; }
    }
    const busy = this.bashT >= 0 || this.cookT >= 0 || this.throwT >= 0;
    const wantAds = canAct && inp.buttons[2] && !d.melee && this.reloadT < 0 && !player.sprinting && !busy;
    const prevAds = this.adsT;
    this.adsT = clamp(this.adsT + (wantAds ? dt : -dt * 1.25) / (d.adsTime || 0.2), 0, 1);
    if (wantAds && prevAds === 0 && G.audio) G.audio.mech('ads');
    player.adsT = this.adsT; player.fovMul = d.adsFov; player.speedMul *= d.move;
    // breath control for scoped rifles: hold Shift to steady
    const tt = G.r3.time; this.holding = false;
    if (this.adsT > 0.6 && !d.melee) {
      let amp = d.scope ? 0.0052 : 0.0007; amp *= 1 + clamp(player.speed / 4, 0, 1) * 1.5; if (player.crouch) amp *= 0.6;
      if (d.scope && inp.keys.ShiftLeft && !this.winded && this.breath > 0) { this.holding = true; amp *= 0.1; this.breath = Math.max(0, this.breath - dt / 4.5); if (this.breath <= 0) this.winded = true; }
      else { this.breath = Math.min(1, this.breath + dt / 6); if (this.winded) { amp *= 2.1; if (this.breath > 0.45) this.winded = false; } }
      player.swayP = (Math.sin(tt * 1.15) + Math.sin(tt * 2.3) * 0.4) * amp * this.adsT; player.swayY = Math.cos(tt * 0.82) * amp * 1.35 * this.adsT;
    } else { player.swayP = damp(player.swayP, 0, 10, dt); player.swayY = damp(player.swayY, 0, 10, dt); this.breath = Math.min(1, this.breath + dt / 6); if (this.breath > 0.45) this.winded = false; }
    if (canAct && this.cool <= 0 && !busy && this.sprintOut <= 0 && !(player.sprinting && !d.melee)) {
      if (d.auto ? inp.buttons[0] : inp.bPressed[0]) this.fire(player);
    }
    if (canAct && !d.melee && this.ammo().mag <= 0 && this.reloadT < 0 && this.cool <= 0 && this.ammo().reserve > 0 && !busy) this.startReload();
    // ---- animated parts
    this.boltKick = damp(this.boltKick, 0, 30, dt);
    let rl = 0, lhY = 0, lhZ = 0, lhX = 0;
    if (m.bolt && this.boltT < 0 && (d.kind === 'rifle' || d.kind === 'smg' || d.kind === 'lmg' || d.kind === 'pistol')) m.bolt.position.z = this.boltKick * (d.kind === 'pistol' ? 0.032 : 0.04) + (d.kind === 'pistol' && this.ammo().mag <= 0 && this.reloadT < 0 ? 0.03 : 0);
    if (this.reloadT >= 0) {
      this.reloadT += dt; const t = this.reloadT / this.reloadDur; rl = Math.sin(clamp(t, 0, 1) * Math.PI);
      const snd = (at, n, s) => { if (t > at && this.rSnd < n) { this.rSnd = n; if (G.audio) G.audio.mech(s); } };
      if (d.perShell) {            // feed one shell: support hand leaves the pump, pushes a shell into the loading port
        const k = Math.sin(clamp(t, 0, 1) * Math.PI); lhZ = k * 0.24; lhY = -k * 0.03; lhX = k * 0.02;
      } else if (d.kind === 'launcher') {
        snd(0.12, 1, 'magout'); snd(0.6, 2, 'shell'); snd(0.85, 3, 'magin');
        const out = clamp((t - 0.08) / 0.14, 0, 1) - clamp((t - 0.78) / 0.14, 0, 1);
        m.mag.position.x = -out * 0.085; m.mag.position.y = -out * 0.03; m.mag.rotation.z = out * 0.5 + (t > 0.25 && t < 0.75 ? (t - 0.25) * 12.56 : 0); lhX = -out * 0.07; lhY = -out * 0.03 + Math.sin(clamp((t - 0.25) / 0.5, 0, 1) * Math.PI * 6) * 0.012; lhZ = out * 0.14;
      } else if (d.kind === 'rocket') {
        snd(0.35, 1, 'shell'); snd(0.7, 2, 'magin');
        const ins = clamp((t - 0.35) / 0.35, 0, 1); m.mag.visible = t > 0.33; m.mag.position.z = -(1 - ins) * 0.34; m.mag.position.y = -(1 - ins) * 0.05; lhZ = -0.42 + clamp((t - 0.7) / 0.2, 0, 1) * 0.42; lhY = 0.07; if (t < 0.25) { lhZ = -t / 0.25 * 0.42 + 0; lhY = t / 0.25 * 0.07; }
      } else if (m.mag) {
        snd(0.16, 1, 'magout'); snd(0.58, 2, 'magin'); if (!this.reloadTac) snd(0.84, 3, 'bolt');
        const end = this.reloadTac ? 0.72 : 0.6;
        const out = clamp((t - 0.13) / 0.13, 0, 1) - clamp((t - (end - 0.14)) / 0.13, 0, 1);
        m.mag.position.y = -out * 0.3; m.mag.position.z = out * 0.04; m.mag.rotation.x = out * 0.35; m.mag.visible = true;
        lhY = -out * 0.3; lhZ = (m.lhBase ? (-0.09 - m.lhBase.z) : 0) * clamp(t / 0.12, 0, 1) * (1 - clamp((t - end) / 0.14, 0, 1)); lhY += (m.lhBase ? (-0.11 - m.lhBase.y) : 0) * clamp(t / 0.12, 0, 1) * (1 - clamp((t - end) / 0.14, 0, 1));
        if (m.bolt && !this.reloadTac && t > 0.8) { const b = Math.sin(clamp((t - 0.8) / 0.16, 0, 1) * Math.PI); m.bolt.position.z = b * 0.06; if (d.kind === 'sniper') m.bolt.rotation.z = b * 0.9; }
      }
      if (this.reloadT >= this.reloadDur) this.finishReload();
    }
    if (this.boltT >= 0 && m.bolt) { this.boltT += dt; const t = this.boltT / 0.85; if (t > 0.25 && t - dt / 0.85 <= 0.25 && G.audio) G.audio.mech('bolt'); if (t > 0.5 && t - dt / 0.85 <= 0.5) { const cam = this.camera; cam.getWorldDirection(_v2); const r = _v3.crossVectors(_v2, cam.up).normalize(); this.ejectCasing(r.clone(), new THREE.Vector3(0, 1, 0), 1.6); if (G.audio) G.audio.casing(); } m.bolt.rotation.z = Math.sin(clamp(t * 2, 0, 1) * Math.PI) * 0.9; m.bolt.position.z = Math.sin(clamp((t - 0.2) / 0.6, 0, 1) * Math.PI) * 0.075; if (t >= 1) { this.boltT = -1; m.bolt.rotation.z = 0; m.bolt.position.z = 0; } this.cool = Math.max(this.cool, 0.05); }
    if (this.pumpT >= 0 && m.pump) { this.pumpT += dt; const t = this.pumpT / 0.42; if (t > 0.3 && t - dt / 0.42 <= 0.3) { if (G.audio) G.audio.mech('bolt'); const cam = this.camera; cam.getWorldDirection(_v2); const r = _v3.crossVectors(_v2, cam.up).normalize(); this.ejectCasing(r.clone(), new THREE.Vector3(0, 1, 0), 1, true); } m.pump.position.z = Math.sin(clamp(t, 0, 1) * Math.PI) * 0.095; if (t >= 1) { this.pumpT = -1; m.pump.position.z = 0; } }
    if (m.lh && m.lhBase) m.lh.position.set(m.lhBase.x + lhX, m.lhBase.y + lhY, m.lhBase.z + lhZ);
    // melee swing (sledge) and quick weapon-butt strike (V)
    let sw = 0, bash = 0;
    if (this.swingT >= 0) {
      this.swingT += dt; const t = this.swingT / 0.5; sw = Math.sin(clamp(t, 0, 1) * Math.PI);
      if (t > 0.34 && !this.swingHit) { this.swingHit = true; this.meleeHit(player, false); }
      if (t >= 1) this.swingT = -1;
    }
    if (this.bashT >= 0) {
      this.bashT += dt; const t = this.bashT / 0.4; bash = t < 0.35 ? Math.pow(t / 0.35, 0.6) : 1 - (t - 0.35) / 0.65;
      if (t > 0.3 && !this.bashHit) { this.bashHit = true; this.meleeHit(player, true); }
      if (t >= 1) this.bashT = -1;
    }
    if (this.throwT >= 0) { this.throwT += dt; if (this.throwT > 0.5) this.throwT = -1; }
    this.updateProjectiles(dt);
    // ---- view model pose
    this.kick = damp(this.kick, 0, 13, dt); this.kickR = damp(this.kickR, 0, 11, dt); this.kickRoll = damp(this.kickRoll, 0, 9, dt);
    this.swayX = damp(this.swayX, clamp(-inp.mdx * 0.0016, -0.07, 0.07), 9, dt); this.swayY = damp(this.swayY, clamp(inp.mdy * 0.0016, -0.07, 0.07), 9, dt);
    const a = this.adsT, hip = m.pts.hip, bob = player.bob, ba = player.bobAmt * (1 - a * 0.88);
    this.sprintT = damp(this.sprintT, player.sprinting && !d.melee ? 1 : 0, 9, dt);
    const s = this.sprintT, eq = this.equipT;
    const th = this.throwT >= 0 ? Math.sin(clamp(this.throwT / 0.5, 0, 1) * Math.PI) : 0, ck = this.cookT >= 0 ? 1 : 0; this.cookPose = damp(this.cookPose || 0, ck, 12, dt);
    const lean = player.leanT || 0, strafe = clamp(player.strafe || 0, -1, 1);
    let x = lerp(hip[0], m.pts.adsX || 0, a) + Math.cos(bob) * 0.013 * ba + this.swayX * (1 - a * 0.75) + s * -0.07 - strafe * 0.012 * (1 - a);
    let y = lerp(hip[1], m.pts.adsY, a) + Math.sin(bob * 2) * 0.011 * ba + Math.sin(tt * 1.6) * 0.003 * (1 - a) - this.swayY * (1 - a * 0.75) - eq * 0.36 - rl * 0.07 - s * 0.04 - th * 0.1 - this.cookPose * 0.22 - player.landDip * 0.25 + clamp(player.vel.y * -0.004, -0.03, 0.03);
    let z = lerp(hip[2], m.pts.adsZ, a) + this.kick * 0.05 * (1 - a * 0.45) + s * 0.06;
    let rx = this.kickR * (1 - a * 0.55) + eq * -0.9 + rl * 0.42 + s * -0.2 - this.cookPose * 0.5 + this.swayY * 0.6;
    let ry = this.swayX * 1.3 + s * 0.8 + rl * 0.28;
    let rz = this.swayX * -1.5 + rl * 0.55 + Math.cos(bob) * 0.014 * ba + s * 0.14 + this.kickRoll * (1 - a * 0.6) - strafe * 0.035 * (1 - a) - lean * 0.12;
    if (d.melee) { x += -sw * 0.22; y += sw * 0.12; z += -sw * 0.26; rx += -sw * 1.6 + 0.25; rz += sw * 0.5 - 0.2; ry += sw * 0.4; }
    if (bash > 0) { x += -bash * 0.1; y += bash * 0.07; z += -bash * 0.2; rx += bash * 0.5; ry += bash * 0.9; rz += -bash * 0.5; }
    this.rig.position.set(x, y, z); this.rig.rotation.set(rx, ry, rz);
    this.flashT -= dt; this.flash.visible = this.flashT > 0 && !(d.scope && a > 0.9);
    this.holder.visible = !(d.scope && a > 0.9) && !player.dead;
    { const f = Math.tan(27 * Math.PI / 180) / Math.tan(this.camera.fov * Math.PI / 360) * (1 + a * 0.05); this.holder.scale.set(0.42 * Math.min(1, f), 0.42 * Math.min(1, f), 0.42); }
    this.spread = lerp(d.hip * (1 + clamp(player.speed / 6, 0, 1) * 1.6 * (player.onGround ? 1 : 1.8)) * (player.crouch ? 0.7 : 1) + this.heat * d.hip * 0.8, d.ads, a);
  }

  // quick = weapon-butt strike with whatever you are holding; otherwise a full sledgehammer swing
  meleeHit(player, quick) {
    const cam = this.camera, w = G.world; cam.getWorldPosition(_v); cam.getWorldDirection(_v2);
    const range = quick ? 2.0 : this.def.range, dmg = quick ? 60 : this.stats.dmg, brick = quick ? 70 : this.stats.brick, r = quick ? 0.24 : 0.42;
    const res = G.combat.trace(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, range, player, 0);
    if (res.kind === 'none') return;
    const px = _v.x + _v2.x * res.t, py = _v.y + _v2.y * res.t, pz = _v.z + _v2.z * res.t;
    player.shake = Math.min(1, player.shake + (quick ? 0.3 : 0.5)); this.kick = 1.2;
    if (res.kind === 'actor') {
      const k = res.actor.damage(dmg * (res.part === 2 ? 1.5 : 1), player, 'melee', _v2, { part: res.part, power: quick ? 5 : 9, stagger: 1 });
      G.fx.impact(px, py, pz, -_v2.x, 0.3, -_v2.z, 'flesh'); if (G.audio) G.audio.impact('flesh', px, py, pz); if (G.hud) G.hud.hitmarker(false, k); return;
    }
    if (res.kind === 'tree') { G.terrain.damageTree(res.tree, quick ? 40 : 130, _v2.x, _v2.z); G.fx.impact(px, py, pz, -_v2.x, 0.3, -_v2.z, 'tree'); if (G.audio) G.audio.impact('wood', px, py, pz); return; }
    if (res.kind === 'ground') { G.fx.impact(px, py, pz, 0, 1, 0, 'ground'); if (G.audio) G.audio.thud(px, py, pz, 0.8); return; }
    const ids = new Set();
    for (let dx = -r; dx <= r; dx += 0.2) for (let dy = -r; dy <= r; dy += 0.2) for (let dz = -r; dz <= r; dz += 0.2) { if (dx * dx + dy * dy + dz * dz > r * r * 1.1) continue; const id = w.pieceAtWorld(px + _v2.x * 0.1 + dx, py + _v2.y * 0.1 + dy, pz + _v2.z * 0.1 + dz); if (id >= 0) ids.add(id); }
    const dir = _v2.clone();
    for (const id of ids) { const mat = w.pm[id]; const gone = w.damagePiece(id, brick, dir); if (G.mode) G.mode.onPlayerHitPiece(id, mat, gone); }
    G.fx.impact(px, py, pz, -_v2.x, -_v2.y, -_v2.z, 'stone', w.pm[res.id]); if (G.audio) G.audio.thud(px, py, pz, quick ? 0.7 : 1);
    if (G.actors) G.actors.alert(player.pos.x, player.pos.z, 18, player);
  }
}
