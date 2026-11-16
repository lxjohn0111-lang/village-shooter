// Verlet ragdoll for dying soldiers + small rigid props (dropped weapons, helmets shot off heads).
// The skeleton's bones are detached into world space and driven by 15 point masses joined by distance
// constraints, so a body crumples from the pose it was in, gets thrown by blasts and slides off rooftops.
import * as THREE from 'three';
import { G, terrainH, rand } from './util.js';
import { RIG } from './models.js';

const HEAD = 0, NECK = 1, PELV = 2, SHL = 3, SHR = 4, ELL = 5, ELR = 6, HAL = 7, HAR = 8, HIL = 9, HIR = 10, KNL = 11, KNR = 12, FTL = 13, FTR = 14, N = 15;
const RAD = [0.1, 0.09, 0.11, 0.08, 0.08, 0.05, 0.05, 0.045, 0.045, 0.09, 0.09, 0.06, 0.06, 0.055, 0.055];
const RIGID = [[NECK, HEAD], [NECK, PELV], [SHL, SHR], [NECK, SHL], [NECK, SHR], [SHL, PELV], [SHR, PELV], [HIL, HIR], [PELV, HIL], [PELV, HIR], [SHL, HIL], [SHR, HIR], [SHL, HIR], [SHR, HIL], [NECK, HIL], [NECK, HIR],
  [SHL, ELL], [ELL, HAL], [SHR, ELR], [ELR, HAR], [HIL, KNL], [KNL, FTL], [HIR, KNR], [KNR, FTR]];
const SOFT = [[HEAD, SHL, 0.25], [HEAD, SHR, 0.25]];
const MIN = [[HAL, SHL, 0.24], [HAR, SHR, 0.24], [FTL, HIL, 0.4], [FTR, HIR, 0.4], [KNL, KNR, 0.15], [FTL, FTR, 0.15], [HAL, PELV, 0.16], [HAR, PELV, 0.16], [KNL, NECK, 0.34], [KNR, NECK, 0.34], [HAL, HEAD, 0.14], [HAR, HEAD, 0.14]];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _hz = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Prop {
  constructor(obj, vel, radius = 0.08, life = 14, pickup = null) {
    this.obj = obj; this.vel = vel; this.r = radius; this.life = life; this.pickup = pickup; this.rest = false; this.t = 0;
    this.axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); this.spin = rand(4, 11);
  }
  update(dt) {
    this.t += dt; this.life -= dt; const o = this.obj;
    if (this.life < 1.2) { o.position.y -= dt * 0.25; return this.life > 0; }
    if (this.rest) return true;
    this.vel.y -= 17 * dt; const p = o.position;
    let nx = p.x + this.vel.x * dt, ny = p.y + this.vel.y * dt, nz = p.z + this.vel.z * dt;
    if (G.world.solidAt(nx, p.y, nz) && !G.world.solidAt(p.x, p.y, p.z)) { nx = p.x; nz = p.z; this.vel.x *= -0.3; this.vel.z *= -0.3; }
    const g = Math.max(terrainH(nx, nz), G.world.groundAt(nx, nz, ny + 0.25)) + this.r;
    if (ny <= g) {
      ny = g; const imp = -this.vel.y;
      if (imp > 2.5 && G.audio) G.audio.impact('metal', nx, ny, nz);
      if (imp < 1.3 && Math.hypot(this.vel.x, this.vel.z) < 0.8) { this.rest = true; this.vel.set(0, 0, 0); }
      else { this.vel.y = imp * 0.3; this.vel.x *= 0.6; this.vel.z *= 0.6; this.spin *= 0.5; }
    }
    p.set(nx, ny, nz); if (!this.rest) o.rotateOnWorldAxis(this.axis, this.spin * dt);
    return true;
  }
  remove() { if (this.obj.parent) this.obj.parent.remove(this.obj); }
}

export class Ragdoll {
  // hit: { dir:Vector3|null, power, part (0 legs,1 torso,2 head), kind }
  constructor(actor, hit) {
    const P = actor.P, s = actor.T.scale, scene = G.r3.scene;
    this.P = P; this.s = s; this.t = 0; this.acc = 0; this.calm = 0; this.frozen = false; this.sinking = false; this.life = 15;
    this.p = new Float32Array(N * 3); this.o = new Float32Array(N * 3);
    P.root.updateMatrixWorld(true);
    const set = (i, bone, lx = 0, ly = 0, lz = 0) => { _a.set(lx, ly, lz); bone.localToWorld(_a); this.p[i * 3] = _a.x; this.p[i * 3 + 1] = _a.y; this.p[i * 3 + 2] = _a.z; };
    set(NECK, P.head); set(HEAD, P.head, 0, RIG.headC, 0); set(PELV, P.hips);
    set(SHL, P.upL); set(ELL, P.foL); set(HAL, P.foL, 0, -0.3, 0); set(SHR, P.upR); set(ELR, P.foR); set(HAR, P.foR, 0, -0.3, 0);
    set(HIL, P.thL); set(KNL, P.shL); set(FTL, P.shL, 0, -0.44, 0.02); set(HIR, P.thR); set(KNR, P.shR); set(FTR, P.shR, 0, -0.44, 0.02);
    // constraints with rest lengths taken from the pose at the moment of death
    this.c = [];
    const d = (a, b) => Math.hypot(this.p[a * 3] - this.p[b * 3], this.p[a * 3 + 1] - this.p[b * 3 + 1], this.p[a * 3 + 2] - this.p[b * 3 + 2]);
    for (const [a, b] of RIGID) this.c.push([a, b, d(a, b), 1, 0]);
    for (const [a, b, k] of SOFT) this.c.push([a, b, d(a, b), k, 0]);
    for (const [a, b, m] of MIN) this.c.push([a, b, m * s, 1, 1]);
    // initial velocities: what the body was doing + the hit
    const h = 1 / 60, v = new Float32Array(N * 3);
    const bvx = (actor.moveX || 0) * (actor.moving || 0) * actor.T.speed * 0.8, bvz = (actor.moveZ || 0) * (actor.moving || 0) * actor.T.speed * 0.8;
    for (let i = 0; i < N; i++) { v[i * 3] = bvx + rand(-0.4, 0.4); v[i * 3 + 1] = (actor.vy || 0) - 0.6 + rand(-0.3, 0.3); v[i * 3 + 2] = bvz + rand(-0.4, 0.4); }
    const add = (i, k, up = 0) => { if (!hit.dir) return; v[i * 3] += hit.dir.x * k; v[i * 3 + 1] += hit.dir.y * k + up; v[i * 3 + 2] += hit.dir.z * k; };
    const pw = hit.power || 3;
    if (hit.kind === 'explosion') { for (let i = 0; i < N; i++) add(i, pw * rand(0.7, 1.35), rand(2.5, 5.5)); }
    else if (hit.kind === 'melee') { for (const i of [HEAD, NECK, SHL, SHR, ELL, ELR]) add(i, pw * rand(0.8, 1.2), 1.2); add(PELV, pw * 0.5); }
    else if (hit.part === 2) { add(HEAD, pw * 1.7, 0.8); add(NECK, pw * 0.8); add(SHL, pw * 0.4); add(SHR, pw * 0.4); for (const i of [KNL, KNR]) add(i, -pw * 0.25); }
    else if (hit.part === 0) { const left = Math.random() < 0.5; add(left ? KNL : KNR, pw * 1.5); add(left ? FTL : FTR, pw * 1.3); add(PELV, pw * 0.5); add(NECK, -pw * 0.2); }
    else { add(NECK, pw); add(SHL, pw * rand(0.6, 1.3)); add(SHR, pw * rand(0.6, 1.3)); add(PELV, pw * 0.55); add(HEAD, pw * 0.5); }
    // arms fly loose
    for (const i of [HAL, HAR, ELL, ELR]) { v[i * 3] += rand(-1.5, 1.5); v[i * 3 + 1] += rand(-0.5, 1.8); v[i * 3 + 2] += rand(-1.5, 1.5); }
    for (let i = 0; i < N * 3; i++) this.o[i] = this.p[i] - v[i] * h;
    // free the bones into world space
    this.objs = [];
    for (const b of P.bones) { scene.attach(b); this.objs.push(b); }
    this.props = [];
    if (P.gun) { scene.attach(P.gun); this.props.push(new Prop(P.gun, new THREE.Vector3(v[HAR * 3] + rand(-1, 1), v[HAR * 3 + 1] + rand(1, 2.5), v[HAR * 3 + 2] + rand(-1, 1)), 0.05, 16, 'ammo')); }
    if (P.helmet && P.helmet.parent && (hit.part === 2 || hit.kind === 'explosion') && Math.random() < 0.85) this.popHelmet(P, hit.dir, 4);
    scene.remove(P.root);
    this.apply();
  }
  popHelmet(P, dir, power) {
    G.r3.scene.attach(P.helmet);
    const v = new THREE.Vector3((dir ? dir.x : 0) * power + rand(-1, 1), 2.5 + rand(0, 2), (dir ? dir.z : 0) * power + rand(-1, 1));
    this.props.push(new Prop(P.helmet, v, 0.11, 14)); P.helmet = null;
  }

  step(h) {
    const p = this.p, o = this.o, w = G.world; let motion = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 3; const vx = (p[k] - o[k]) * 0.992, vy = (p[k + 1] - o[k + 1]) * 0.992, vz = (p[k + 2] - o[k + 2]) * 0.992;
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2];
      p[k] += vx; p[k + 1] += vy - 17 * h * h; p[k + 2] += vz;
      motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (let it = 0; it < 7; it++) for (const c of this.c) {
      const a = c[0] * 3, b = c[1] * 3; let dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5; if (c[4] && d >= c[2]) continue;
      const f = (d - c[2]) / d * 0.5 * c[3]; dx *= f; dy *= f; dz *= f;
      p[a] += dx; p[a + 1] += dy; p[a + 2] += dz; p[b] -= dx; p[b + 1] -= dy; p[b + 2] -= dz;
    }
    for (let i = 0; i < N; i++) {
      const k = i * 3, r = RAD[i] * this.s;
      if (w.solidAt(p[k], p[k + 1], p[k + 2]) && !w.solidAt(o[k], p[k + 1], o[k + 2])) { p[k] = o[k]; p[k + 2] = o[k + 2]; }
      const g = Math.max(terrainH(p[k], p[k + 2]), w.groundAt(p[k], p[k + 2], p[k + 1] + 0.22)) + r;
      if (p[k + 1] < g) { p[k + 1] = g; o[k + 1] = g + (p[k + 1] - o[k + 1]) * 0.15; o[k] = p[k] - (p[k] - o[k]) * 0.45; o[k + 2] = p[k + 2] - (p[k + 2] - o[k + 2]) * 0.45; }
    }
    return motion / N / h;
  }
  get(i, out) { return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]); }
  // orient a bone that hangs along -Y so it runs from joint a to joint b, twisting toward `hint`
  bone(obj, a, b, hint) {
    this.get(a, _a); this.get(b, _b); _y.subVectors(_a, _b); if (_y.lengthSq() < 1e-8) return; _y.normalize();
    _z.copy(hint).addScaledVector(_y, -hint.dot(_y)); if (_z.lengthSq() < 1e-6) _z.set(_y.y, -_y.x, 0); _z.normalize();
    _x.crossVectors(_y, _z); obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); obj.position.copy(_a);
  }
  apply() {
    const P = this.P;
    this.get(NECK, _a); this.get(PELV, _b); _u.subVectors(_a, _b).normalize();
    this.get(SHL, _a); this.get(SHR, _x); _r.subVectors(_a, _x).normalize(); _f.crossVectors(_r, _u).normalize(); _r.crossVectors(_u, _f);
    P.torso.quaternion.setFromRotationMatrix(_m.makeBasis(_r, _u, _f)); P.torso.position.copy(_b).addScaledVector(_u, RIG.torsoY * this.s);
    this.get(HIL, _a); this.get(HIR, _x); _x.subVectors(_a, _x).normalize(); _hz.crossVectors(_x, _u).normalize(); _y.crossVectors(_hz, _x);
    P.hips.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _hz)); P.hips.position.copy(_b);
    const f = _f.clone(), hz = _hz.clone();
    // head: local +Y points from neck to the skull centre
    this.get(HEAD, _a); this.get(NECK, _b); _y.subVectors(_a, _b).normalize(); _z.copy(f).addScaledVector(_y, -f.dot(_y)).normalize(); _x.crossVectors(_y, _z);
    P.head.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); P.head.position.copy(_b);
    this.bone(P.upL, SHL, ELL, f); this.bone(P.foL, ELL, HAL, f); this.bone(P.upR, SHR, ELR, f); this.bone(P.foR, ELR, HAR, f);
    this.bone(P.thL, HIL, KNL, hz); this.bone(P.shL, KNL, FTL, hz); this.bone(P.thR, HIR, KNR, hz); this.bone(P.shR, KNR, FTR, hz);
  }
  // an explosion near a body throws it again
  shove(x, y, z, radius, power) {
    if (this.sinking) return; let hit = false;
    for (let i = 0; i < N; i++) { const k = i * 3, dx = this.p[k] - x, dy = this.p[k + 1] - y + 0.4, dz = this.p[k + 2] - z, d = Math.hypot(dx, dy, dz); if (d < radius) { const f = power * (1 - d / radius) / 60 / (d || 1); this.o[k] -= dx * f; this.o[k + 1] -= dy * f + 0.02; this.o[k + 2] -= dz * f; hit = true; } }
    if (hit) { this.frozen = false; this.calm = 0; }
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    for (let i = this.props.length - 1; i >= 0; i--) if (!this.props[i].update(dt)) { this.props[i].remove(); this.props.splice(i, 1); }
    if (this.life < 0) { this.sinking = true; for (const o of this.objs) o.position.y -= dt * 0.35; return this.life > -2.2; }
    if (this.frozen) return true;
    this.acc = Math.min(this.acc + dt, 0.05);
    let m = 0;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; m = this.step(1 / 60); }
    if (m < 0.35 && this.t > 0.6) { this.calm += dt; if (this.calm > 1.2) this.frozen = true; } else this.calm = 0;
    this.apply();
    return true;
  }
  expire() { if (this.life > 0.3) this.life = 0.3; }
  center(out) { return this.get(PELV, out); }
  remove() { for (const o of this.objs) if (o.parent) o.parent.remove(o); for (const p of this.props) p.remove(); }
}
