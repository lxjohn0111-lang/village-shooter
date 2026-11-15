// Particles, tracers, explosions, weather and ambient motes.
import * as THREE from 'three';
import { G, rand, clamp, terrainH } from './util.js';
import { MATS, M } from './materials.js';
import { makeParticleAtlas } from './textures.js';

const P_VS = `attribute vec4 aColor; attribute vec2 aSize; uniform float uScale; varying vec4 vColor; varying float vSprite;
void main(){ vColor = aColor; vSprite = aSize.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(900.0, aSize.x * uScale / max(0.05, -mv.z)); }`;
const P_FS = `uniform sampler2D uTex; uniform vec3 uFog; uniform float uFogD; varying vec4 vColor; varying float vSprite;
void main(){ vec2 o = vec2(mod(vSprite, 2.0), floor(vSprite / 2.0)) * 0.5; vec2 uv = o + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * 0.5;
  float a = texture2D(uTex, uv).a * vColor.a; if (a < 0.004) discard; gl_FragColor = vec4(vColor.rgb, a); }`;

class PSys {
  constructor(scene, cap, additive, atlas) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap * 2);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    this.fade = new Float32Array(cap);    // colour multiplier at end of life
    this.c0 = new Float32Array(cap * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: atlas }, uScale: { value: 600 }, uFog: { value: new THREE.Color() }, uFogD: { value: 0 } },
      vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 21 : 20;
    geo.setDrawRange(0, 0); scene.add(this.points);
    this.geo = geo;
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, sprite, grav = 0, drag = 0, fade = 1) {
    let i;
    if (this.n < this.cap) i = this.n++; else i = (Math.random() * this.cap) | 0;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag; this.fade[i] = fade;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b; this.size[i * 2 + 1] = sprite;
  }
  update(dt) {
    const { pos, vel, life, max, col, size } = this;
    for (let i = 0; i < this.n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {            // swap-remove
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { pos[i * 3 + k] = pos[l * 3 + k]; vel[i * 3 + k] = vel[l * 3 + k]; this.c0[i * 3 + k] = this.c0[l * 3 + k]; }
          life[i] = life[l]; max[i] = max[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l]; this.a0[i] = this.a0[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.fade[i] = this.fade[l];
          size[i * 2 + 1] = size[l * 2 + 1];
        }
        i--; continue;
      }
      const i3 = i * 3, t = 1 - life[i] / max[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt; vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (this.grav[i] > 4 && pos[i3 + 1] < 0.02 && Math.abs(pos[i3]) < 37 && Math.abs(pos[i3 + 2]) < 37) { pos[i3 + 1] = 0.02; vel[i3 + 1] *= -0.3; vel[i3] *= 0.5; vel[i3 + 2] *= 0.5; }
      size[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const f = 1 + (this.fade[i] - 1) * t, i4 = i * 4;
      col[i4] = this.c0[i3] * f; col[i4 + 1] = this.c0[i3 + 1] * f; col[i4 + 2] = this.c0[i3 + 2] * f;
      col[i4 + 3] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1) * (1 - t * t);
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _col = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene;
    const atlas = makeParticleAtlas();
    this.smoke = new PSys(scene, 2600, false, atlas);
    this.fireP = new PSys(scene, 1600, true, atlas);
    this.light = 1;                // ambient brightness for smoke/dust
    this.fires = [];
    // tracers: camera-facing quads
    const TN = 48;
    this.tr = []; this.trPos = new Float32Array(TN * 12); this.trCol = new Float32Array(TN * 16);
    const tg = new THREE.BufferGeometry(); const idx = [];
    for (let i = 0; i < TN; i++) { idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3); this.tr.push({ t: 0 }); }
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 4).setUsage(THREE.DynamicDrawUsage));
    tg.setIndex(idx);
    this.trMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.trMesh.frustumCulled = false; this.trMesh.renderOrder = 22; scene.add(this.trMesh);
    this.trNext = 0;
    // weather: stateless rain streaks + ambient motes around the camera
    const RN = 1400, rp = new Float32Array(RN * 6), ro = new Float32Array(RN * 2);
    for (let i = 0; i < RN; i++) { const x = rand(-16, 16), y = rand(0, 22), z = rand(-16, 16); rp.set([x, y, z, x, y, z], i * 6); ro[i * 2] = 0; ro[i * 2 + 1] = 1; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(ro, 1));
    this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; void main(){ vec3 p = position; p.y = mod(p.y - uTime * 26.0 - p.x * 3.7, 22.0) - 6.0 + aEnd * 0.7; p.x += aEnd * 0.06;
        p.xz = mod(p.xz - uCam.xz + 16.0, 32.0) - 16.0; p += vec3(uCam.x, uCam.y, uCam.z); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uAlpha; void main(){ gl_FragColor = vec4(0.75, 0.82, 0.9, uAlpha); }`,
    }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 23; scene.add(this.rain);
    const MN = 260, mp = new Float32Array(MN * 3), ms = new Float32Array(MN);
    for (let i = 0; i < MN; i++) { mp.set([rand(-14, 14), rand(0, 9), rand(-14, 14)], i * 3); ms[i] = Math.random(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
    this.moteU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Vector4(1, 1, 1, 0.3) }, uRise: { value: 0.1 }, uSize: { value: 5 } };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uRise, uSize; uniform vec3 uCam; varying float vA; void main(){ vec3 p = position;
        p.y = mod(p.y + uTime * uRise * (0.5 + aSeed), 9.0); p.x += sin(uTime * 0.5 + aSeed * 40.0) * 0.6; p.z += cos(uTime * 0.4 + aSeed * 31.0) * 0.6;
        p.xz = mod(p.xz - uCam.xz + 14.0, 28.0) - 14.0; p += vec3(uCam.x, 0.0, uCam.z); p.y += max(0.0, uCam.y - 4.0);
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (0.5 + aSeed) * 6.0 / max(0.5, -mv.z);
        vA = (0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 90.0)) * smoothstep(14.0, 8.0, length(p.xz - uCam.xz)); }`,
      fragmentShader: `uniform vec4 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * uCol.a * vA; gl_FragColor = vec4(uCol.rgb, a); }`,
    }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 19; scene.add(this.motes);
  }

  setEnv(e) {
    this.light = e.moon ? 0.16 : e.rain ? 0.42 : clamp(e.sunI / 3.4, 0.3, 1);
    this.rain.visible = !!e.rain; this.rainU.uAlpha.value = e.rain ? 0.26 : 0;
    const u = this.moteU;
    if (e.embers) { u.uCol.value.set(1.0, 0.45, 0.1, 0.9); u.uRise.value = 1.1; u.uSize.value = 7; }
    else if (e.moon) { u.uCol.value.set(0.7, 1.0, 0.4, 0.8); u.uRise.value = 0.05; u.uSize.value = 6; }
    else if (e.rain) { u.uCol.value.set(1, 1, 1, 0); }
    else { u.uCol.value.set(1.0, 0.92, 0.75, 0.22); u.uRise.value = 0.12; u.uSize.value = 4.5; }
    this.tintCol = _col.set(e.sun).clone().lerp(new THREE.Color(e.horizon), 0.5);
  }

  dust(x, y, z, count = 4, spread = 1, col = null) {
    const L = this.light, r = (col ? col[0] : 0.55) * L, g = (col ? col[1] : 0.5) * L, b = (col ? col[2] : 0.44) * L;
    for (let i = 0; i < count; i++) {
      this.smoke.add(x + rand(-spread, spread) * 0.5, y + rand(0, spread * 0.5), z + rand(-spread, spread) * 0.5, rand(-1, 1) * spread * 0.6, rand(0.2, 1.2), rand(-1, 1) * spread * 0.6,
        rand(1.4, 3.2), rand(0.5, 1) * spread, rand(2.2, 4) * spread, r, g, b, rand(0.25, 0.5), 1, -0.15, 1.2);
    }
  }

  chips(x, y, z, r, g, b, count, speed = 3, nx = 0, ny = 1, nz = 0) {
    const L = 0.35 + this.light * 0.65;
    for (let i = 0; i < count; i++) {
      this.smoke.add(x, y, z, nx * speed * 0.6 + rand(-1, 1) * speed * 0.6, ny * speed * 0.6 + rand(0, 1) * speed, nz * speed * 0.6 + rand(-1, 1) * speed * 0.6,
        rand(0.5, 1.2), rand(0.03, 0.09), rand(0.02, 0.05), r * L, g * L, b * L, 1, 2, 14, 0.4);
    }
  }
  sparks(x, y, z, count, speed = 6, nx = 0, ny = 1, nz = 0) {
    for (let i = 0; i < count; i++) this.fireP.add(x, y, z, nx * speed * 0.5 + rand(-1, 1) * speed, ny * speed * 0.5 + rand(-0.3, 1) * speed, nz * speed * 0.5 + rand(-1, 1) * speed, rand(0.15, 0.5), rand(0.04, 0.09), 0.01, 1.0, 0.75, 0.3, 1, 0, 12, 1, 0.4);
  }

  pieceBreak(x, y, z, mat, how, cells) {
    const md = MATS[mat]; _col.setHex(md.color);
    const n = how === 'fall' ? 1 : Math.min(7, 2 + cells);
    if (mat === M.GLASS) { for (let i = 0; i < 9; i++) this.smoke.add(x, y, z, rand(-2, 2), rand(0, 3), rand(-2, 2), rand(0.5, 1), 0.06, 0.03, 0.8, 0.95, 1, 0.9, 2, 13, 0.3); return; }
    if (how !== 'fall' || Math.random() < 0.25) this.chips(x, y, z, _col.r, _col.g, _col.b, n, how === 'blast' ? 6 : 3);
    if (how !== 'fall' && md.snd !== 'metal') this.dust(x, y, z, how === 'blast' ? 1 : 2, 0.5 + cells * 0.05, md.snd === 'wood' ? [0.5, 0.4, 0.28] : md.snd === 'soft' ? [0.6, 0.55, 0.35] : [_col.r * 0.6 + 0.3, _col.g * 0.6 + 0.3, _col.b * 0.6 + 0.3]);
    if (mat === M.EMBER) { this.sparks(x, y, z, 14, 7); this.fireP.add(x, y, z, 0, 1, 0, 0.5, 1, 3, 1, 0.5, 0.1, 0.8, 0, 0, 0, 0.2); }
  }

  impact(x, y, z, nx, ny, nz, kind, mat = -1) {
    if (kind === 'ground') { this.chips(x, y, z, 0.25, 0.18, 0.1, 5, 3.5, nx, ny, nz); this.dust(x, y, z, 1, 0.35, [0.4, 0.32, 0.22]); return; }
    if (kind === 'flesh') { for (let i = 0; i < 5; i++) this.smoke.add(x, y, z, nx * 1.5 + rand(-1, 1), ny + rand(-0.5, 1.2), nz * 1.5 + rand(-1, 1), rand(0.25, 0.5), 0.08, 0.3, 0.35, 0.02, 0.02, 0.7, 1, 3, 2); return; }
    if (kind === 'wood' || kind === 'tree') { this.chips(x, y, z, 0.5, 0.36, 0.2, 5, 3, nx, ny, nz); this.dust(x, y, z, 1, 0.2, [0.5, 0.4, 0.28]); return; }
    if (kind === 'metal') { this.sparks(x, y, z, 7, 5, nx, ny, nz); return; }
    if (mat >= 0) _col.setHex(MATS[mat].color); else _col.setRGB(0.5, 0.5, 0.5);
    this.chips(x, y, z, _col.r, _col.g, _col.b, 4, 3, nx, ny, nz);
    this.dust(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, 1, 0.25, [_col.r * 0.5 + 0.35, _col.g * 0.5 + 0.35, _col.b * 0.5 + 0.35]);
    if (Math.random() < 0.35) this.sparks(x, y, z, 2, 4, nx, ny, nz);
  }

  explosion(x, y, z, radius) {
    const s = radius / 4;
    for (let i = 0; i < 16; i++) { const a = rand(6.283), e = rand(-0.2, 1.3), sp = rand(1, 5) * s; this.fireP.add(x, y + 0.2, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp, rand(0.3, 0.65), 1.2 * s, rand(3, 5) * s, 1.0, rand(0.45, 0.7), 0.15, 0.9, 3, -1, 2.2, 0.15); }
    this.fireP.add(x, y + 0.3, z, 0, 0, 0, 0.14, 7 * s, 11 * s, 1, 0.9, 0.7, 1, 0, 0, 0, 0.5);
    this.sparks(x, y + 0.2, z, 26, 13 * s);
    const L = this.light;
    for (let i = 0; i < 14; i++) { const a = rand(6.283), sp = rand(0.5, 3.5) * s; this.smoke.add(x + Math.cos(a) * s, y + rand(0.2, 1.5), z + Math.sin(a) * s, Math.cos(a) * sp, rand(1.5, 5) * s, Math.sin(a) * sp, rand(2.2, 4.5), 1.6 * s, rand(5, 8) * s, 0.14 * L + 0.03, 0.13 * L + 0.03, 0.12 * L + 0.03, rand(0.5, 0.8), 1, -0.5, 1.0); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; this.smoke.add(x + Math.cos(a) * s, y + 0.2, z + Math.sin(a) * s, Math.cos(a) * 7 * s, 0.4, Math.sin(a) * 7 * s, rand(1.2, 2), 1.5 * s, 4 * s, 0.5 * L, 0.45 * L, 0.38 * L, 0.4, 1, 0, 2.5); }
    this.chips(x, y + 0.2, z, 0.25, 0.2, 0.14, 22, 10 * s);
    G.r3.flashLight(_a.set(x, y + 1, z), 0xffa040, 700 * s, 0.35, 40 * s);
    this.fires.push({ x, y: Math.max(y, terrainH(x, z)) + 0.1, z, t: rand(2.5, 5), acc: 0 });
  }

  muzzleSmoke(x, y, z, dx, dy, dz) {
    const L = this.light * 0.6 + 0.15;
    this.smoke.add(x, y, z, dx * 2 + rand(-0.3, 0.3), dy * 2 + 0.3, dz * 2 + rand(-0.3, 0.3), rand(0.4, 0.8), 0.12, 0.7, 0.6 * L, 0.6 * L, 0.6 * L, 0.18, 1, -0.3, 3);
  }
  muzzleFlash(x, y, z, big = 1) { this.fireP.add(x, y, z, 0, 0, 0, 0.05, 0.5 * big, 0.9 * big, 1, 0.8, 0.45, 1, 3, 0, 0); }
  trail(x, y, z, s = 1) { const L = this.light * 0.5 + 0.2; this.smoke.add(x, y, z, rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3), rand(0.8, 1.6), 0.25 * s, 1.3 * s, 0.75 * L, 0.75 * L, 0.75 * L, 0.4, 1, -0.2, 1); this.fireP.add(x, y, z, 0, 0, 0, 0.1, 0.5 * s, 0.1, 1, 0.6, 0.2, 0.9, 0); }
  heal(x, y, z) { for (let i = 0; i < 10; i++) this.fireP.add(x + rand(-0.4, 0.4), y + rand(0, 1.5), z + rand(-0.4, 0.4), 0, rand(0.5, 1.5), 0, rand(0.5, 1), 0.12, 0.02, 0.3, 1, 0.4, 0.8, 0); }
  goldBurst(x, y, z) { for (let i = 0; i < 10; i++) this.fireP.add(x, y, z, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.4, 0.9), 0.12, 0.02, 1, 0.8, 0.2, 1, 0, 9); }

  tracer(ax, ay, az, bx, by, bz, r = 1, g = 0.85, b = 0.5, width = 0.035) {
    const t = this.tr[this.trNext]; this.trNext = (this.trNext + 1) % this.tr.length;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    t.ax = ax; t.ay = ay; t.az = az; t.dx = (bx - ax) / len; t.dy = (by - ay) / len; t.dz = (bz - az) / len; t.len = len; t.head = Math.min(len, 2.5); t.t = 1; t.r = r; t.g = g; t.b = b; t.w = width;
  }

  update(dt, cam) {
    this.smoke.mat.uniforms.uScale.value = this.fireP.mat.uniforms.uScale.value = G.r3.renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.smoke.update(dt); this.fireP.update(dt);
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.t -= dt; f.acc += dt;
      if (f.t <= 0) { this.fires.splice(i, 1); continue; }
      if (f.acc > 0.07) { f.acc = 0; this.fireP.add(f.x + rand(-0.5, 0.5), f.y, f.z + rand(-0.5, 0.5), rand(-0.2, 0.2), rand(1, 2.4), rand(-0.2, 0.2), rand(0.35, 0.7), rand(0.6, 1), 0.2, 1, rand(0.4, 0.6), 0.1, 0.7, 3, 0, 0.5, 0.2);
        if (Math.random() < 0.4) { const L = this.light; this.smoke.add(f.x, f.y + 0.8, f.z, rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), rand(2, 3.5), 0.8, 3, 0.1 * L + 0.02, 0.1 * L + 0.02, 0.1 * L + 0.02, 0.4, 1, -0.3, 0.5); } }
    }
    // tracers
    const P = this.trPos, C = this.trCol, cp = cam.position;
    for (let i = 0; i < this.tr.length; i++) {
      const t = this.tr[i], o = i * 12, oc = i * 16;
      if (t.t <= 0) { for (let k = 0; k < 16; k++) C[oc + k] = 0; continue; }
      t.head += dt * 320;
      if (t.head >= t.len + 7) { t.t = 0; for (let k = 0; k < 16; k++) C[oc + k] = 0; continue; }
      const h = Math.min(t.head, t.len), tl = Math.max(0, t.head - 7);
      if (tl >= t.len) { t.t = 0; continue; }
      _a.set(t.ax + t.dx * tl, t.ay + t.dy * tl, t.az + t.dz * tl); _b.set(t.ax + t.dx * h, t.ay + t.dy * h, t.az + t.dz * h);
      _c.set(t.dx, t.dy, t.dz).cross(new THREE.Vector3().subVectors(cp, _a)).normalize().multiplyScalar(t.w * (1 + _a.distanceTo(cp) * 0.02));
      P[o] = _a.x - _c.x; P[o + 1] = _a.y - _c.y; P[o + 2] = _a.z - _c.z; P[o + 3] = _a.x + _c.x; P[o + 4] = _a.y + _c.y; P[o + 5] = _a.z + _c.z;
      P[o + 6] = _b.x - _c.x; P[o + 7] = _b.y - _c.y; P[o + 8] = _b.z - _c.z; P[o + 9] = _b.x + _c.x; P[o + 10] = _b.y + _c.y; P[o + 11] = _b.z + _c.z;
      for (let v = 0; v < 4; v++) { C[oc + v * 4] = t.r * 2; C[oc + v * 4 + 1] = t.g * 2; C[oc + v * 4 + 2] = t.b * 2; C[oc + v * 4 + 3] = v < 2 ? 0 : 1; }
    }
    this.trMesh.geometry.attributes.position.needsUpdate = true; this.trMesh.geometry.attributes.color.needsUpdate = true;
    this.rainU.uTime.value += dt; this.rainU.uCam.value.copy(cp);
    this.moteU.uTime.value += dt; this.moteU.uCam.value.copy(cp);
  }

  clear() { this.smoke.clear(); this.fireP.clear(); this.fires.length = 0; for (const t of this.tr) t.t = 0; }
}
