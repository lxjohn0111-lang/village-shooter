// First-person controller: sprint, crouch, slide, jump, mantle; collides with the brick grid and terrain.
import * as THREE from 'three';
import { G, CELL, clamp, damp, lerp, terrainH, rand } from './util.js';
import { MATS } from './materials.js';
import { Input } from './input.js';

const R = 0.3;

// touch aim assist: the look stick slows down while the crosshair sits on an enemy
const _af = new THREE.Vector3();
function aimFriction(p) {
  let best = 1;
  for (const a of G.actors.list) {
    if (a.dead || a.team === 0 || a.T.civilian) continue;
    _af.set(a.pos.x - p.eyePos.x, a.pos.y + a.height * 0.6 - p.eyePos.y, a.pos.z - p.eyePos.z); const d = _af.length(); if (d > 60 || d < 0.5) continue;
    const c = _af.dot(p.fwd) / d, tol = Math.max(0.0012, 0.12 / d);
    if (c > 1 - tol * 3) best = Math.min(best, c > 1 - tol ? 0.45 : 0.7);
  }
  return best;
}

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 46); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = false; this.crouch = false; this.height = 1.8; this.eye = 1.62;
    this.hp = 100; this.maxHp = 100; this.dead = false; this.lastHurt = 99; this.team = 0;
    this.slideT = 0; this.stepAcc = 0; this.bob = 0; this.bobAmt = 0; this.landDip = 0; this.stepSmooth = 0; this.roll = 0;
    this.recoilP = 0; this.recoilY = 0; this.recoilVP = 0; this.fovKick = 0; this.sprinting = false; this.moving = false; this.speed = 0;
    this.fallStart = 0; this.adsT = 0; this.speedMul = 1; this.fovMul = 1; this.invuln = 0; this.shake = 0; this.stats = { dmgTaken: 0 };
    this.fwd = new THREE.Vector3(); this.eyePos = new THREE.Vector3(0, 1.6, 46);
    this.recAccP = 0; this.recAccY = 0; this.swayP = 0; this.swayY = 0; this.lean = 0; this.leanT = 0; this.strafe = 0; this.suppress = 0;
  }
  reset(x, z, yaw = 0) {
    this.pos.set(x, Math.max(terrainH(x, z), G.world.groundAt(x, z, 3)), z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.dead = false; this.lastHurt = 99; this.crouch = false; this.slideT = 0; this.recoilP = this.recoilY = 0; this.invuln = 1.5; this.shake = 0;
    this.recAccP = this.recAccY = 0; this.swayP = this.swayY = 0; this.lean = this.leanT = 0; this.suppress = 0; this.eyePos.set(x, this.pos.y + 1.6, z);
  }
  free(x, y, z, h) { return G.world.boxFree(x - R, y + 0.02, z - R, x + R, y + h - 0.02, z + R); }

  damage(amount, from, kind) {
    if (this.dead || this.invuln > 0 || G.godMode) return;
    amount *= G.diffDmg || 1;
    this.hp -= amount; this.lastHurt = 0; this.stats.dmgTaken += amount; this.recoilVP += (Math.random() - 0.3) * Math.min(1.2, amount / 20); this.recoilY += (Math.random() - 0.5) * Math.min(0.05, amount / 500);
    G.r3.fx.damage = Math.min(1, G.r3.fx.damage + amount / 45);
    this.shake = Math.min(1.2, this.shake + amount / 60);
    if (G.audio) G.audio.hurt();
    if (G.hud) G.hud.damageFrom(from, this);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; if (G.mode) G.mode.onPlayerDeath(kind); }
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  update(dt, active) {
    const w = G.world, inp = Input, s = G.settings;
    this.invuln = Math.max(0, this.invuln - dt); this.lastHurt += dt;
    if (!this.dead && this.lastHurt > 4.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 14 * dt);
    if (active && !this.dead) {
      let sens = 0.0022 * (s.sens || 1) * (1 - this.adsT * (1 - this.fovMul) * 0.9);
      if (inp.touch && G.actors) sens *= aimFriction(this);
      const dP = -inp.mdy * sens * (s.invertY ? -1 : 1);
      this.yaw -= inp.mdx * sens; this.pitch += dP;
      if (dP < 0 && this.recAccP > 0) this.recAccP = Math.max(0, this.recAccP + dP);      // you pulled the muzzle down yourself: less to settle
      if (inp.mdx !== 0) this.recAccY *= 0.9;
      this.pitch = clamp(this.pitch, -1.5, 1.5);
    }
    // --- input
    let ix = 0, iz = 0;
    if (active && !this.dead) {
      if (inp.keys.KeyW || inp.keys.ArrowUp) iz -= 1; if (inp.keys.KeyS || inp.keys.ArrowDown) iz += 1;
      if (inp.keys.KeyA || inp.keys.ArrowLeft) ix -= 1; if (inp.keys.KeyD || inp.keys.ArrowRight) ix += 1;
    }
    let il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
    // analogue stick (touch joystick): partial deflection walks slower
    if (active && !this.dead && (inp.ax || inp.ay)) { ix = inp.ax; iz = inp.ay; il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; } }
    this.strafe = damp(this.strafe, ix, 8, dt);
    // lean out of cover with Q / E
    this.lean = active && !this.dead && this.onGround && !this.sprinting ? (inp.keys.KeyE ? 1 : 0) - (inp.keys.KeyQ ? 1 : 0) : 0;
    this.leanT = damp(this.leanT, this.lean, 11, dt); this.suppress = Math.max(0, this.suppress - dt * 0.55);
    const wantCrouch = active && (inp.keys.ControlLeft || inp.keys.KeyC);
    const wantSprint = active && (inp.keys.ShiftLeft || inp.touch && iz < -0.93) && iz < 0 && !wantCrouch && this.adsT < 0.3;
    if (active && inp.pressed.KeyC || active && inp.pressed.ControlLeft) { if (this.sprinting && this.onGround && this.slideT <= 0 && this.speed > 5.5) { this.slideT = 0.75; } }
    // crouch / stand (needs headroom)
    if (wantCrouch || this.slideT > 0) this.crouch = true; else if (this.crouch && this.free(this.pos.x, this.pos.y, this.pos.z, 1.8)) this.crouch = false;
    const th = this.crouch ? 1.2 : 1.8; this.height = th;
    this.eye = damp(this.eye, this.crouch ? 1.02 : 1.62, 14, dt);
    this.sprinting = wantSprint && !this.crouch;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = ix * cos + iz * sin, wz = -ix * sin + iz * cos;
    let maxSp = (this.crouch ? 2.3 : this.sprinting ? 6.9 : 4.5) * this.speedMul * (1 - this.adsT * 0.35);
    if (this.slideT > 0) {
      this.slideT -= dt; const sl = Math.hypot(this.vel.x, this.vel.z);
      if (sl > 0.1) { const k = Math.max(0, 1 - dt * 1.1); this.vel.x *= k; this.vel.z *= k; }
      if (this.slideT > 0.6 && sl < 8.5) { this.vel.x *= 1.06; this.vel.z *= 1.06; }
    } else if (this.onGround) {
      const acc = 58, fr = 11;
      this.vel.x += (wx * maxSp * fr - this.vel.x * fr) * Math.min(1, dt * 1) * 1; this.vel.z += (wz * maxSp * fr - this.vel.z * fr) * Math.min(1, dt * 1);
      void acc;
    } else {
      this.vel.x += wx * 9 * dt; this.vel.z += wz * 9 * dt;
      const sp = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(maxSp, 4.5);
      if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp; }
    }
    if (active && !this.dead && inp.pressed.Space && this.onGround) { this.vel.y = 5.6; this.onGround = false; this.slideT = 0; if (G.audio) G.audio.step('ground', true); }
    this.vel.y -= 17.5 * dt;
    if (this.vel.y < -40) this.vel.y = -40;
    // --- move & collide (sub-stepped)
    const wasGround = this.onGround, vyBefore = this.vel.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt / 0.2));
    const sdt = dt / steps; let grounded = false;
    for (let i = 0; i < steps; i++) {
      for (const ax of ['x', 'z']) {
        const d = this.vel[ax] * sdt; if (d === 0) continue;
        const nx = ax === 'x' ? this.pos.x + d : this.pos.x, nz = ax === 'z' ? this.pos.z + d : this.pos.z;
        if (this.free(nx, this.pos.y, nz, th)) { this.pos.x = nx; this.pos.z = nz; continue; }
        let stepped = false;
        if (wasGround || this.vel.y <= 0.5) for (const up of [CELL, CELL * 2]) {
          if (this.free(nx, this.pos.y + up, nz, th) && (wasGround || up === CELL)) { this.pos.x = nx; this.pos.z = nz; this.pos.y += up; this.stepSmooth -= up; stepped = true; break; }
        }
        if (!stepped) {
          // mantle onto ledges up to ~1.3 m while holding jump/forward
          if (active && inp.keys.Space && this.vel.y > -3 && !this.crouch) for (let up = 0.75; up <= 1.35; up += CELL) { if (this.free(nx, this.pos.y + up, nz, th) && this.free(this.pos.x, this.pos.y + up, this.pos.z, th)) { this.vel.y = Math.max(this.vel.y, 4.6); break; } }
          this.vel[ax] = 0;
        }
      }
      const ny = this.pos.y + this.vel.y * sdt;
      if (this.free(this.pos.x, ny, this.pos.z, th)) this.pos.y = ny;
      else if (this.vel.y < 0) { this.pos.y = Math.ceil((ny + 0.02) / CELL - 1e-6) * CELL; if (!this.free(this.pos.x, this.pos.y, this.pos.z, th)) this.pos.y = Math.floor(this.pos.y / CELL + 1) * CELL; this.vel.y = 0; grounded = true; }
      else this.vel.y = Math.min(0, this.vel.y);
      const g = terrainH(this.pos.x, this.pos.z);
      if (this.pos.y <= g) { this.pos.y = g; if (this.vel.y < 0) this.vel.y = 0; grounded = true; }
    }
    // tree trunks and boulders
    if (Math.abs(this.pos.x) > 38 || Math.abs(this.pos.z) > 38) {
      for (const t of G.terrain.treesNear(this.pos.x, this.pos.z)) { if (t.dead) continue; const dx = this.pos.x - t.x, dz = this.pos.z - t.z, d = Math.hypot(dx, dz), rr = 0.3 * t.s + R; if (d < rr && d > 0.001) { this.pos.x = t.x + dx / d * rr; this.pos.z = t.z + dz / d * rr; } }
      for (const k of G.terrain.rocks) { const dx = this.pos.x - k.x, dz = this.pos.z - k.z, d = Math.hypot(dx, dz), rr = k.r + R; if (d < rr && d > 0.001 && this.pos.y < k.h) { this.pos.x = k.x + dx / d * rr; this.pos.z = k.z + dz / d * rr; } }
    }
    const far = Math.hypot(this.pos.x, this.pos.z);
    if (far > 135) { this.pos.x *= 135 / far; this.pos.z *= 135 / far; if (G.hud) G.hud.toast('Turn back — the Ashlands lie beyond', 1.5, 'bounds'); }
    if (terrainH(this.pos.x, this.pos.z) < -1.6 && this.pos.y < -1.2) { this.speedMul = 0.55; } else this.speedMul = 1;
    if (!grounded && wasGround && this.vel.y <= 0) {
      // stick to descending stairs
      for (const dn of [CELL, CELL * 2]) if (!this.free(this.pos.x, this.pos.y - dn - 0.03, this.pos.z, th) && this.free(this.pos.x, this.pos.y - dn + 0.001, this.pos.z, th)) { this.pos.y -= dn - 0.001; this.pos.y = Math.round(this.pos.y / CELL) * CELL; this.stepSmooth += dn; grounded = true; this.vel.y = 0; break; }
    }
    if (grounded && !wasGround) {
      const impact = -vyBefore;
      if (impact > 5) { this.landDip = Math.min(0.35, impact * 0.02); if (G.audio) G.audio.land(Math.min(2, impact / 8)); }
      if (impact > 14) this.damage((impact - 14) * 7, null, 'fall');
    }
    this.onGround = grounded;
    // --- feel
    this.speed = Math.hypot(this.vel.x, this.vel.z); this.moving = this.speed > 0.5 && this.onGround;
    this.stepSmooth = damp(this.stepSmooth, 0, 16, dt); this.landDip = damp(this.landDip, 0, 9, dt);
    this.bobAmt = damp(this.bobAmt, this.moving && this.slideT <= 0 ? clamp(this.speed / 5, 0, 1.3) : 0, 8, dt);
    if (this.moving && this.slideT <= 0) {
      this.bob += dt * (this.sprinting ? 12.5 : this.crouch ? 7 : 9.5);
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > (this.sprinting ? 2.5 : 1.9)) { this.stepAcc = 0; if (G.audio) { const pid = w.pieceAtWorld(this.pos.x, this.pos.y - 0.1, this.pos.z); G.audio.step(pid >= 0 ? (MATS[w.pm[pid]].snd === 'wood' ? 'wood' : 'stone') : 'ground', this.sprinting); } }
    }
    this.roll = damp(this.roll, -ix * 0.025 * (this.moving ? 1 : 0) + (this.slideT > 0 ? 0.06 : 0), 8, dt);
    // recoil spring
    this.recoilVP = damp(this.recoilVP, 0, 14, dt);
    this.recoilP += this.recoilVP * dt; this.recoilP = damp(this.recoilP, 0, 5.5, dt); this.recoilY = damp(this.recoilY, 0, 5.5, dt);
    this.fovKick = damp(this.fovKick, this.sprinting ? 6 : this.slideT > 0 ? 8 : 0, 7, dt);
    this.shake = damp(this.shake, 0, 5, dt);
  }

  applyCamera(cam, baseFov) {
    const bobY = Math.sin(this.bob * 2) * 0.028 * this.bobAmt * (1 - this.adsT * 0.7), bobX = Math.cos(this.bob) * 0.02 * this.bobAmt * (1 - this.adsT * 0.7);
    const sh = this.shake + G.r3.fx.shake;
    const ey = this.pos.y + this.eye + this.stepSmooth - this.landDip + bobY - Math.abs(this.leanT) * 0.07;
    // leaning shifts the eye sideways as far as the wall beside you allows
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); let off = this.leanT * 0.36;
    if (Math.abs(off) > 0.01) { const w = G.world; for (let k = 0; k < 3; k++) { const x = this.pos.x + rx * off, z = this.pos.z + rz * off; if (w.boxFree(x - 0.1, ey - 0.12, z - 0.1, x + 0.1, ey + 0.12, z + 0.1)) break; off *= 0.5; if (k === 2) off = 0; } }
    this.eyePos.set(this.pos.x + rx * off, ey, this.pos.z + rz * off);
    cam.position.copy(this.eyePos);
    cam.position.x += rx * bobX; cam.position.z += rz * bobX;
    cam.rotation.set(this.pitch + this.recoilP + this.swayP + rand(-1, 1) * sh * 0.02, this.yaw + this.recoilY + this.swayY + rand(-1, 1) * sh * 0.02, this.roll - this.leanT * 0.15 + rand(-1, 1) * sh * 0.015);
    const fov = lerp(baseFov + this.fovKick, baseFov * this.fovMul, this.adsT);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.getWorldDirection(this.fwd);
    G.r3.fx.supp = this.suppress;
  }
}
