// Destructible brick world: every wall, roof tile and beam is an individual piece on a 25 cm grid.
// Pieces are rendered with one instanced draw call and a procedural surface shader, support
// per-piece damage, structural collapse (anything no longer connected to the ground falls) and debris physics.
import * as THREE from 'three';
import { CELL, GX, GY, GZ, HALF, G, clamp, hash3, terrainH } from './util.js';
import { MATS, M, F_TILT, F_LOOT, F_EXPLOSIVE } from './materials.js';

const MAXP = 60000, MAXGLASS = 3000, MAXDEB = 1500;
const cidx = (x, y, z) => x + GX * (z + GZ * y);
const SQ = Math.SQRT1_2;

const PIECE_VS_HEAD = `
attribute vec4 iA; attribute vec4 iB;
varying vec3 vLp; varying vec3 vHalf; varying vec3 vON; varying vec4 vA; varying vec4 vB;
varying vec3 vAx0; varying vec3 vAx1; varying vec3 vAx2; varying vec3 vWp;`;
const PIECE_VS_BODY = `
{
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vLp = position * sc; vHalf = sc * 0.5; vON = normal; vA = iA; vB = iB;
  mat3 im = mat3(instanceMatrix); mat3 mv3 = mat3(modelViewMatrix);
  vAx0 = normalize(mv3 * im[0]); vAx1 = normalize(mv3 * im[1]); vAx2 = normalize(mv3 * im[2]);
  vWp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
}`;
const PIECE_FS_HEAD = `
uniform sampler2D uNoise; uniform float uTime;
varying vec3 vLp; varying vec3 vHalf; varying vec3 vON; varying vec4 vA; varying vec4 vB;
varying vec3 vAx0; varying vec3 vAx1; varying vec3 vAx2; varying vec3 vWp;
vec3 pcAlb; float pcRough; float pcMetal; vec3 pcN; vec3 pcEmis;
void pieceSurface() {
  vec3 an = abs(vON);
  vec2 uv; vec2 hf; vec3 axU; vec3 axV; vec3 nrm;
  if (an.x > 0.5) { uv = vLp.zy; hf = vHalf.zy; axU = vec3(0.,0.,1.); axV = vec3(0.,1.,0.); nrm = vec3(sign(vON.x),0.,0.); }
  else if (an.y > 0.5) { uv = vLp.xz; hf = vHalf.xz; axU = vec3(1.,0.,0.); axV = vec3(0.,0.,1.); nrm = vec3(0.,sign(vON.y),0.); }
  else { uv = vLp.xy; hf = vHalf.xy; axU = vec3(1.,0.,0.); axV = vec3(0.,1.,0.); nrm = vec3(0.,0.,sign(vON.z)); }
  float pat = floor(vB.z + 0.5); float seed = vB.w;
  vec2 e = hf - abs(uv);
  float ed = min(e.x, e.y);
  vec2 suv = uv + vec2(seed * 7.31, seed * 3.17);
  vec4 n1 = texture2D(uNoise, suv * 0.83);
  vec4 n2 = texture2D(uNoise, suv * 3.9 + 0.37);
  vec4 nw = texture2D(uNoise, vec2(vWp.x + vWp.z, vWp.y) * 0.06);
  vec3 tint = vA.rgb;
  vec3 alb = tint; float rough = vB.x; float metal = vB.y; float bev = 0.012; float bump = 0.35;
  vec3 emis = vec3(0.0); float mortar = 0.0; vec3 extraN = vec3(0.0); float weather = 1.0;
  if (pat < 0.5) {                       // clay brick
    alb = tint * (0.76 + 0.44 * n1.r) * (0.9 + 0.2 * n2.g);
    alb = mix(alb, alb * 0.5, smoothstep(0.72, 0.9, n2.b) * 0.6);
    mortar = 1.0 - smoothstep(0.004, 0.012, ed + (n2.r - 0.5) * 0.005);
    bev = 0.015;
  } else if (pat < 1.5) {                // stone
    alb = tint * (0.68 + 0.58 * n1.r) * (0.88 + 0.24 * n2.g);
    alb = mix(alb, alb * vec3(0.78, 0.9, 0.66), smoothstep(0.55, 0.85, n1.b) * 0.4);
    mortar = 1.0 - smoothstep(0.006, 0.02, ed + (n1.g - 0.5) * 0.014);
    bev = 0.026; bump = 0.6;
  } else if (pat < 2.5) {                // wood
    vec2 g = hf.x >= hf.y ? vec2(uv.x * 0.33, uv.y * 4.6) : vec2(uv.y * 0.33, uv.x * 4.6);
    vec4 w = texture2D(uNoise, g + seed * 5.0);
    float grain = w.r * 0.65 + texture2D(uNoise, g * vec2(1.0, 6.0) + 0.2).g * 0.35;
    alb = tint * (0.58 + 0.72 * grain);
    alb *= 0.7 + 0.3 * smoothstep(0.0, 0.012, ed);
    bev = 0.007; bump = 0.22; rough = clamp(rough + (grain - 0.5) * 0.25, 0.3, 1.0);
  } else if (pat < 3.5) {                // roof tiles
    float lu = step(hf.y, hf.x);
    float along = mix(uv.y, uv.x, lu); float across = mix(uv.x, uv.y, lu); float ha = mix(hf.x, hf.y, lu);
    float tw = 0.1667;
    float q = along / tw + floor(seed * 8.0) * 0.5;
    float tx = fract(q) - 0.5; float tid = floor(q);
    float trnd = fract(sin(tid * 91.7 + seed * 37.0) * 437.5);
    alb = tint * (0.7 + 0.45 * trnd) * (0.82 + 0.34 * n2.g);
    alb *= 0.4 + 0.6 * smoothstep(0.5, 0.4, abs(tx));
    alb *= 0.62 + 0.38 * smoothstep(-ha, ha * 0.2, across);
    alb = mix(alb, alb * vec3(0.7, 0.85, 0.6), smoothstep(0.6, 0.9, n1.b) * 0.35);
    extraN = mix(axV, axU, lu) * tx * 1.3 * step(0.5, an.y + an.x * 0.0);
    bev = 0.004; bump = 0.3;
  } else if (pat < 4.5) {                // plaster
    alb = tint * (0.88 + 0.16 * n1.r) * (0.95 + 0.1 * n2.g);
    alb = mix(alb, alb * vec3(0.8, 0.76, 0.66), smoothstep(0.5, 0.9, nw.b) * 0.45);
    bev = 0.004; bump = 0.14;
  } else if (pat < 5.5) {                // iron / rusted plate
    alb = tint * (0.75 + 0.4 * n1.r);
    float rust = smoothstep(0.45, 0.8, n1.b) * (1.0 - step(0.95, metal));
    alb = mix(alb, vec3(0.36, 0.15, 0.06) * (0.7 + 0.6 * n2.g), rust);
    metal = mix(metal, 0.2, rust);
    rough = clamp(rough + (n2.r - 0.5) * 0.35 + rust * 0.3, 0.15, 1.0);
    alb += 0.1 * (1.0 - smoothstep(0.0, 0.012, ed));
    bev = 0.009; bump = 0.18;
  } else if (pat < 6.5) {                // thatch / hay
    float s = texture2D(uNoise, vec2(uv.x * 13.0, uv.y * 0.8) + seed).g * 0.6 + texture2D(uNoise, vec2(uv.x * 31.0, uv.y * 1.7)).g * 0.4;
    alb = tint * (0.5 + 0.9 * s);
    bev = 0.03; bump = 0.7;
  } else if (pat < 7.5) {                // gold
    alb = tint * (0.9 + 0.16 * n1.r);
    rough = clamp(rough + (n2.g - 0.5) * 0.16, 0.08, 1.0);
    bev = 0.02; bump = 0.08; weather = 0.0;
  } else if (pat < 8.5) {                // concrete
    alb = tint * (0.84 + 0.22 * n1.r) * (0.95 + 0.1 * n2.g);
    alb *= 1.0 - 0.4 * smoothstep(0.8, 0.95, n2.b);
    bev = 0.006; bump = 0.25;
  } else if (pat < 9.5) {                // sandbag
    float wv = sin(uv.x * 420.0) * sin(uv.y * 420.0);
    alb = tint * (0.78 + 0.3 * n1.r) * (0.92 + 0.08 * wv);
    bev = 0.07; bump = 0.3;
  } else if (pat < 10.5) {               // supply crate
    float grain = texture2D(uNoise, vec2(uv.x * 0.4, uv.y * 5.0) + seed).r;
    alb = tint * (0.6 + 0.7 * grain);
    alb *= 0.5 + 0.5 * smoothstep(0.0, 0.07, abs(fract(uv.y * 8.0 + 0.5) - 0.5));
    alb *= 0.62 + 0.38 * smoothstep(0.035, 0.045, ed);
    bev = 0.01; bump = 0.2;
  } else if (pat < 11.5) {               // blackpowder keg
    float st = step(0.5, fract((uv.x + uv.y) * 7.0));
    float band = step(abs(uv.y), hf.y * 0.34) * step(0.5, an.x + an.z);
    alb = mix(tint * (0.8 + 0.3 * n1.r), mix(vec3(0.95, 0.72, 0.05), vec3(0.03), st), band);
    alb = mix(alb, vec3(0.05), (1.0 - smoothstep(0.015, 0.02, ed)));
    bev = 0.02; bump = 0.1; weather = 0.3;
  } else if (pat < 12.5) {               // ember stone (emissive)
    float veins = smoothstep(0.3, 0.8, n1.a) * 0.8 + smoothstep(0.5, 0.9, n2.r) * 0.5;
    float pulse = 0.75 + 0.25 * sin(uTime * 2.2 + seed * 40.0 + vWp.y * 3.0);
    alb = tint * 0.25;
    emis = tint * (0.9 + 3.2 * veins) * pulse * (1.0 - vA.w * 0.7);
    bev = 0.02; bump = 0.4; weather = 0.0;
  } else {                               // cloth
    float wv = sin(uv.x * 300.0) * sin(uv.y * 300.0);
    alb = tint * (0.82 + 0.2 * n2.g) * (0.95 + 0.05 * wv);
    alb *= 0.8 + 0.2 * sin(uv.x * 9.0 + seed * 20.0);
    bev = 0.0; bump = 0.1; weather = 0.4;
  }
  if (mortar > 0.0) {
    vec3 mc = vec3(0.4, 0.38, 0.34) * (0.7 + 0.4 * n2.r);
    alb = mix(alb, mc, mortar * 0.92); rough = mix(rough, 0.97, mortar);
  }
  alb *= mix(1.0, 0.78 + 0.4 * nw.r, weather);
  float grime = (1.0 - smoothstep(0.0, 0.75, vWp.y + (nw.g - 0.5) * 0.6)) * 0.45 * weather;
  alb = mix(alb, alb * vec3(0.48, 0.44, 0.36), grime * (1.0 - metal));
  float dmg = vA.w;
  if (dmg > 0.01) {
    float cr = texture2D(uNoise, suv * 1.9).a;
    float th = 1.0 - dmg * 0.6;
    float cm = smoothstep(th, th + 0.07, cr);
    alb *= 1.0 - 0.8 * cm; alb *= 1.0 - dmg * 0.22;
  }
  if (bev > 0.0) alb *= 0.7 + 0.3 * smoothstep(0.0, bev * 2.4, ed);
  vec2 bx = bev > 0.0 ? (1.0 - smoothstep(vec2(0.0), vec2(bev), e)) * sign(uv) : vec2(0.0);
  vec3 pn = nrm + axU * bx.x * 0.85 + axV * bx.y * 0.85 + (axU * (n2.r - 0.5) + axV * (n2.g - 0.5)) * bump + extraN;
  pcAlb = alb; pcRough = clamp(rough, 0.04, 1.0); pcMetal = clamp(metal, 0.0, 1.0); pcEmis = emis;
  pcN = normalize(vAx0 * pn.x + vAx1 * pn.y + vAx2 * pn.z);
}`;

export function makePieceMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.userData.uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: G.noiseTex };
    sh.uniforms.uTime = mat.userData.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PIECE_VS_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PIECE_VS_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PIECE_FS_HEAD)
      .replace('#include <map_fragment>', 'pieceSurface();\n diffuseColor.rgb = pcAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = pcRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = pcMetal;')
      .replace('#include <normal_fragment_maps>', 'normal = pcN;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += pcEmis;');
  };
  mat.customProgramCacheKey = () => 'piece-v1';
  return mat;
}

class InstPool {
  constructor(cap, material, scene, cast = true) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iA.setUsage(THREE.DynamicDrawUsage); this.iB.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB);
    this.mesh = new THREE.InstancedMesh(geo, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = cast; this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.m = this.mesh.instanceMatrix.array;
    this.free = new Int32Array(cap); this.nfree = 0; this.hwm = 0;
    this.lo = cap; this.hi = -1;
    scene.add(this.mesh);
  }
  alloc() {
    if (this.nfree > 0) return this.free[--this.nfree];
    if (this.hwm >= this.cap) return -1;
    return this.hwm++;
  }
  release(slot) {
    const o = slot * 16, m = this.m;
    for (let i = 0; i < 16; i++) m[o + i] = 0;
    m[o + 15] = 1;
    this.free[this.nfree++] = slot; this.touch(slot);
  }
  touch(slot) { if (slot < this.lo) this.lo = slot; if (slot > this.hi) this.hi = slot; }
  reset() { this.nfree = 0; this.hwm = 0; this.mesh.count = 0; this.lo = this.cap; this.hi = -1; }
  flush() {
    this.mesh.count = this.hwm;
    if (this.hi < this.lo) return;
    const n = this.hi - this.lo + 1;
    for (const [attr, sz] of [[this.mesh.instanceMatrix, 16], [this.iA, 4], [this.iB, 4]]) {
      attr.clearUpdateRanges(); attr.addUpdateRange(this.lo * sz, n * sz); attr.needsUpdate = true;
    }
    this.lo = this.cap; this.hi = -1;
  }
}

const _c = new THREE.Color();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export class World {
  constructor(scene) {
    this.occ = new Int32Array(GX * GY * GZ);
    this.px = new Int16Array(MAXP); this.py = new Int16Array(MAXP); this.pz = new Int16Array(MAXP);
    this.sx = new Uint8Array(MAXP); this.sy = new Uint8Array(MAXP); this.sz = new Uint8Array(MAXP);
    this.pm = new Uint8Array(MAXP); this.pflag = new Uint8Array(MAXP); this.palive = new Uint8Array(MAXP);
    this.php = new Float32Array(MAXP); this.pmax = new Float32Array(MAXP);
    this.pbid = new Uint16Array(MAXP); this.pslot = new Int32Array(MAXP); this.ptint = new Int32Array(MAXP);
    this.pfree = new Int32Array(MAXP); this.npfree = 0; this.phwm = 0; this.alive = 0;
    this.bTotal = new Int32Array(2048); this.bAlive = new Int32Array(2048); this.bDead = new Uint8Array(2048);
    this.visit = new Uint8Array(MAXP); this.stack = new Int32Array(MAXP); this.stamp = new Int32Array(MAXP); this.stampN = 1;
    this.material = makePieceMaterial();
    this.pool = new InstPool(MAXP, this.material, scene);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe0ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 2.2, depthWrite: false });
    this.glass = new InstPool(MAXGLASS, glassMat, scene, false);
    this.glass.mesh.renderOrder = 5;
    this.debris = new InstPool(MAXDEB, this.material, scene);
    this.debris.hwm = MAXDEB; this.debris.mesh.count = MAXDEB;
    const D = MAXDEB;
    this.dp = new Float32Array(D * 3); this.dv = new Float32Array(D * 3); this.dq = new Float32Array(D * 4); this.dw = new Float32Array(D * 3);
    this.ds = new Float32Array(D * 3); this.dlife = new Float32Array(D); this.dstate = new Uint8Array(D); // 0 free 1 moving 2 resting
    this.dnext = 0; this.dactive = 0;
    this.integrityTimer = -1; this.navDirty = true; this.changed = 0; this.soundBudget = 0;
    this.hit = { id: -1, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, cx: 0, cy: 0, cz: 0 };
    this.pendingBooms = [];
    this.quiet = false;
  }

  clear() {
    this.occ.fill(0); this.palive.fill(0); this.npfree = 0; this.phwm = 0; this.alive = 0;
    this.pool.m.fill(0, 0, this.pool.hwm * 16); this.glass.m.fill(0, 0, this.glass.hwm * 16);
    this.pool.lo = 0; this.pool.hi = Math.max(0, this.pool.hwm - 1); this.pool.flush();
    this.glass.lo = 0; this.glass.hi = Math.max(0, this.glass.hwm - 1); this.glass.flush();
    this.pool.reset(); this.glass.reset();
    this.bTotal.fill(0); this.bAlive.fill(0); this.bDead.fill(0);
    for (let i = 0; i < MAXDEB; i++) if (this.dstate[i]) this._freeDebris(i);
    this.integrityTimer = -1; this.navDirty = true; this.pendingBooms.length = 0;
  }

  canPlace(x, y, z, sx, sy, sz) {
    if (x < 0 || y < 0 || z < 0 || x + sx > GX || y + sy > GY || z + sz > GZ) return false;
    const occ = this.occ;
    for (let j = y; j < y + sy; j++) for (let k = z; k < z + sz; k++) { let i = cidx(x, j, k); for (let n = 0; n < sx; n++) if (occ[i + n]) return false; }
    return true;
  }

  addPiece(mat, x, y, z, sx, sy, sz, bid = 0, flags = 0, tint = -1) {
    if (!this.canPlace(x, y, z, sx, sy, sz)) return -1;
    const pool = mat === M.GLASS ? this.glass : this.pool;
    const slot = pool.alloc(); if (slot < 0) return -1;
    let id;
    if (this.npfree > 0) id = this.pfree[--this.npfree]; else if (this.phwm < MAXP) id = this.phwm++; else { pool.release(slot); return -1; }
    this.px[id] = x; this.py[id] = y; this.pz[id] = z; this.sx[id] = sx; this.sy[id] = sy; this.sz[id] = sz;
    this.pm[id] = mat; this.pflag[id] = flags; this.palive[id] = 1; this.pbid[id] = bid; this.pslot[id] = slot; this.ptint[id] = tint;
    const cells = sx * sy * sz;
    const hp = MATS[mat].hp * Math.pow(Math.max(1, cells) / 2, 0.55);
    this.php[id] = hp; this.pmax[id] = hp;
    const occ = this.occ, v = id + 1;
    for (let j = y; j < y + sy; j++) for (let k = z; k < z + sz; k++) { let i = cidx(x, j, k); for (let n = 0; n < sx; n++) occ[i + n] = v; }
    this.bTotal[bid]++; this.bAlive[bid]++; this.alive++;
    this._write(id);
    this.navDirty = true;
    return id;
  }

  _write(id) {
    const mat = this.pm[id], md = MATS[mat], glass = mat === M.GLASS;
    const pool = glass ? this.glass : this.pool, slot = this.pslot[id];
    const m = pool.m, o = slot * 16;
    let w = this.sx[id] * CELL, h = this.sy[id] * CELL, d = this.sz[id] * CELL;
    const cx = (this.px[id] + this.sx[id] / 2) * CELL - HALF, cy = (this.py[id] + this.sy[id] / 2) * CELL, cz = (this.pz[id] + this.sz[id] / 2) * CELL - HALF;
    const tilt = this.pflag[id] & F_TILT;
    for (let i = 0; i < 16; i++) m[o + i] = 0;
    m[o + 15] = 1;
    if (tilt) {
      const sl = CELL * 1.62, th = mat === M.THATCH ? 0.13 : 0.075;
      const yoff = -0.03;
      if (tilt === 1 || tilt === 3) {
        const s = tilt === 1 ? SQ : -SQ;
        m[o] = SQ * sl; m[o + 1] = s * sl; m[o + 4] = -s * th; m[o + 5] = SQ * th; m[o + 10] = d;
      } else {
        const s = tilt === 2 ? -SQ : SQ;
        m[o] = w; m[o + 5] = SQ * th; m[o + 6] = s * th; m[o + 9] = -s * sl; m[o + 10] = SQ * sl;
      }
      m[o + 12] = cx; m[o + 13] = cy + yoff; m[o + 14] = cz;
    } else {
      if (glass) { if (w <= d && w <= h) w = 0.035; else if (d <= w && d <= h) d = 0.035; else h = 0.035; }
      m[o] = w; m[o + 5] = h; m[o + 10] = d; m[o + 12] = cx; m[o + 13] = cy; m[o + 14] = cz;
    }
    const h1 = hash3(this.px[id], this.py[id] * 7 + mat, this.pz[id]), h2 = hash3(this.pz[id] + 91, this.py[id], this.px[id] * 3);
    if (this.ptint[id] >= 0) _c.setHex(this.ptint[id]); else _c.setHex(md.color);
    const v = 1 + (h1 - 0.5) * md.vary, v2 = (h2 - 0.5) * md.vary * 0.35;
    const a = pool.iA.array, b = pool.iB.array, o4 = slot * 4;
    a[o4] = _c.r * v * (1 + v2); a[o4 + 1] = _c.g * v; a[o4 + 2] = _c.b * v * (1 - v2);
    a[o4 + 3] = 1 - this.php[id] / this.pmax[id];
    b[o4] = md.rough; b[o4 + 1] = md.metal; b[o4 + 2] = md.pat; b[o4 + 3] = h2;
    pool.touch(slot);
  }

  pieceAt(cx, cy, cz) {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= GX || cy >= GY || cz >= GZ) return -1;
    return this.occ[cidx(cx, cy, cz)] - 1;
  }
  pieceAtWorld(x, y, z) { return this.pieceAt(Math.floor((x + HALF) / CELL), Math.floor(y / CELL), Math.floor((z + HALF) / CELL)); }
  solidAt(x, y, z) { return this.pieceAtWorld(x, y, z) >= 0; }
  pieceCenter(id, out) {
    out.x = (this.px[id] + this.sx[id] / 2) * CELL - HALF; out.y = (this.py[id] + this.sy[id] / 2) * CELL; out.z = (this.pz[id] + this.sz[id] / 2) * CELL - HALF;
    return out;
  }

  // world-space AABB free of pieces?
  boxFree(x0, y0, z0, x1, y1, z1) {
    let a = Math.floor((x0 + HALF) / CELL), b = Math.floor((x1 + HALF) / CELL);
    let c = Math.floor(y0 / CELL), d = Math.floor(y1 / CELL);
    let e = Math.floor((z0 + HALF) / CELL), f = Math.floor((z1 + HALF) / CELL);
    if (b < 0 || f < 0 || d < 0 || a >= GX || e >= GZ || c >= GY) return true;
    if (a < 0) a = 0; if (c < 0) c = 0; if (e < 0) e = 0;
    if (b >= GX) b = GX - 1; if (d >= GY) d = GY - 1; if (f >= GZ) f = GZ - 1;
    const occ = this.occ;
    for (let j = c; j <= d; j++) for (let k = e; k <= f; k++) { const base = cidx(0, j, k); for (let i = a; i <= b; i++) if (occ[base + i]) return false; }
    return true;
  }

  // top surface (world y) of the highest solid cell at or below y in the column, else terrain
  groundAt(x, z, y) {
    const gx = Math.floor((x + HALF) / CELL), gz = Math.floor((z + HALF) / CELL);
    const th = terrainH(x, z);
    if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) return th;
    let j = Math.min(GY - 1, Math.floor(y / CELL));
    const occ = this.occ;
    for (; j >= 0; j--) if (occ[cidx(gx, j, gz)]) return (j + 1) * CELL;
    return th;
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const h = this.hit; h.id = -1;
    let gx = (ox + HALF) / CELL, gy = oy / CELL, gz = (oz + HALF) / CELL;
    let tmin = 0, tmax = maxDist / CELL;
    const o = [gx, gy, gz], dd = [dx, dy, dz], N = [GX, GY, GZ];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dd[a]) < 1e-9) { if (o[a] < 0 || o[a] >= N[a]) return h; }
      else {
        let t1 = (0 - o[a]) / dd[a], t2 = (N[a] - o[a]) / dd[a];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return h;
      }
    }
    let t = tmin + 1e-4;
    gx += dx * t; gy += dy * t; gz += dz * t;
    let ix = clamp(Math.floor(gx), 0, GX - 1), iy = clamp(Math.floor(gy), 0, GY - 1), iz = clamp(Math.floor(gz), 0, GZ - 1);
    const stx = dx > 0 ? 1 : -1, sty = dy > 0 ? 1 : -1, stz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e30, tdy = dy !== 0 ? Math.abs(1 / dy) : 1e30, tdz = dz !== 0 ? Math.abs(1 / dz) : 1e30;
    let tmx = dx !== 0 ? t + (dx > 0 ? ix + 1 - gx : gx - ix) * tdx : 1e30;
    let tmy = dy !== 0 ? t + (dy > 0 ? iy + 1 - gy : gy - iy) * tdy : 1e30;
    let tmz = dz !== 0 ? t + (dz > 0 ? iz + 1 - gz : gz - iz) * tdz : 1e30;
    let axis = -1;
    const occ = this.occ;
    while (t <= tmax) {
      const v = occ[cidx(ix, iy, iz)];
      if (v) {
        h.id = v - 1; h.t = t * CELL;
        h.x = ox + dx * h.t; h.y = oy + dy * h.t; h.z = oz + dz * h.t;
        h.nx = axis === 0 ? -stx : 0; h.ny = axis === 1 ? -sty : 0; h.nz = axis === 2 ? -stz : 0;
        if (axis < 0) { h.nx = -dx; h.ny = -dy; h.nz = -dz; }
        h.cx = ix; h.cy = iy; h.cz = iz;
        return h;
      }
      if (tmx < tmy && tmx < tmz) { t = tmx; tmx += tdx; ix += stx; axis = 0; if (ix < 0 || ix >= GX) break; }
      else if (tmy < tmz) { t = tmy; tmy += tdy; iy += sty; axis = 1; if (iy < 0 || iy >= GY) break; }
      else { t = tmz; tmz += tdz; iz += stz; axis = 2; if (iz < 0 || iz >= GZ) break; }
    }
    return h;
  }

  // line of sight between two world points (ignores glass)
  los(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
    dx /= d; dy /= d; dz /= d;
    let ox = ax, oy = ay, oz = az, left = d;
    for (let i = 0; i < 4; i++) {
      const h = this.raycast(ox, oy, oz, dx, dy, dz, left);
      if (h.id < 0) return true;
      if (this.pm[h.id] !== M.GLASS) return false;
      const adv = h.t + 0.3; ox += dx * adv; oy += dy * adv; oz += dz * adv; left -= adv;
      if (left <= 0) return true;
    }
    return false;
  }

  damagePiece(id, dmg, dir) {
    if (id < 0 || !this.palive[id]) return false;
    this.php[id] -= dmg;
    if (this.php[id] <= 0) { this.removePiece(id, 'break', dir); return true; }
    const pool = this.pm[id] === M.GLASS ? this.glass : this.pool, slot = this.pslot[id];
    pool.iA.array[slot * 4 + 3] = 1 - this.php[id] / this.pmax[id]; pool.touch(slot);
    return false;
  }

  // how: 'silent' | 'break' | 'fall' | 'blast'
  removePiece(id, how = 'silent', dir = null, power = 1) {
    if (id < 0 || !this.palive[id]) return;
    const x = this.px[id], y = this.py[id], z = this.pz[id], sx = this.sx[id], sy = this.sy[id], sz = this.sz[id];
    const occ = this.occ;
    for (let j = y; j < y + sy; j++) for (let k = z; k < z + sz; k++) { let i = cidx(x, j, k); for (let n = 0; n < sx; n++) occ[i + n] = 0; }
    const mat = this.pm[id], glass = mat === M.GLASS, pool = glass ? this.glass : this.pool, slot = this.pslot[id];
    const flags = this.pflag[id], bid = this.pbid[id];
    this.palive[id] = 0; this.pfree[this.npfree++] = id; this.alive--;
    this.bAlive[bid]--;
    const cx = (x + sx / 2) * CELL - HALF, cy = (y + sy / 2) * CELL, cz = (z + sz / 2) * CELL - HALF;
    if (how !== 'silent') {
      const a = pool.iA.array, b = pool.iB.array, o4 = slot * 4;
      const w = sx * CELL, h = sy * CELL, d = sz * CELL;
      const tr = a[o4], tg = a[o4 + 1], tb = a[o4 + 2], pr = b[o4], pmt = b[o4 + 1], pp = b[o4 + 2], ps = b[o4 + 3];
      if (how === 'break' && !glass) {
        const n = Math.min(5, Math.max(2, Math.round(sx * sy * sz / 2)));
        for (let i = 0; i < n; i++) {
          const f = 0.35 + Math.random() * 0.3;
          this.spawnDebris(cx + (Math.random() - 0.5) * w * 0.6, cy + (Math.random() - 0.5) * h * 0.6, cz + (Math.random() - 0.5) * d * 0.6,
            Math.max(0.05, w * f), Math.max(0.05, h * f), Math.max(0.05, d * f),
            (dir ? dir.x * 2.5 : 0) + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (dir ? dir.z * 2.5 : 0) + (Math.random() - 0.5) * 3,
            tr, tg, tb, pr, pmt, pp, ps, 5 + Math.random() * 5);
        }
      } else if (!glass) {
        let vx = (Math.random() - 0.5) * 0.9, vy = Math.random() * 0.4, vz = (Math.random() - 0.5) * 0.9;
        if (how === 'blast' && dir) { vx = dir.x * power + (Math.random() - 0.5) * 3; vy = dir.y * power + 2 + Math.random() * 3; vz = dir.z * power + (Math.random() - 0.5) * 3; }
        const tilt = flags & F_TILT;
        this.spawnDebris(cx, cy, cz, tilt ? Math.max(w, CELL * 1.5) : w, tilt ? 0.075 : h, tilt ? Math.max(d, CELL * 1.5) : d, vx, vy, vz, tr, tg, tb, pr, pmt, pp, ps, 9 + Math.random() * 9);
      }
      if (G.fx) G.fx.pieceBreak(cx, cy, cz, mat, how, sx * sy * sz);
      if (G.audio && this.soundBudget > 0 && !this.quiet) { this.soundBudget--; G.audio.breakSound(MATS[mat].snd, cx, cy, cz, sx * sy * sz); }
      if (flags & F_EXPLOSIVE) this.pendingBooms.push({ x: cx, y: cy, z: cz, t: 0.06 + Math.random() * 0.18 });
      if (G.onPieceGone) G.onPieceGone(id, mat, bid, flags, cx, cy, cz, how);
      this.integrityTimer = this.integrityTimer < 0 ? 0.1 : this.integrityTimer;
      this.changed++;
    }
    pool.release(slot);
    this.navDirty = true;
  }

  spawnDebris(x, y, z, w, h, d, vx, vy, vz, tr, tg, tb, pr, pm, pp, ps, life) {
    let i = -1;
    for (let n = 0; n < 24; n++) { const k = (this.dnext + n) % MAXDEB; if (!this.dstate[k]) { i = k; break; } }
    if (i < 0) { i = this.dnext; }      // recycle oldest-ish
    this.dnext = (i + 1) % MAXDEB;
    if (!this.dstate[i]) this.dactive++;
    this.dstate[i] = 1; this.dlife[i] = life;
    const i3 = i * 3, i4 = i * 4;
    this.dp[i3] = x; this.dp[i3 + 1] = y; this.dp[i3 + 2] = z;
    this.dv[i3] = vx; this.dv[i3 + 1] = vy; this.dv[i3 + 2] = vz;
    this.ds[i3] = w; this.ds[i3 + 1] = h; this.ds[i3 + 2] = d;
    this.dq[i4] = 0; this.dq[i4 + 1] = 0; this.dq[i4 + 2] = 0; this.dq[i4 + 3] = 1;
    const sp = 2 + Math.hypot(vx, vy, vz) * 0.8;
    this.dw[i3] = (Math.random() - 0.5) * sp; this.dw[i3 + 1] = (Math.random() - 0.5) * sp; this.dw[i3 + 2] = (Math.random() - 0.5) * sp;
    const a = this.debris.iA.array, b = this.debris.iB.array;
    a[i4] = tr; a[i4 + 1] = tg; a[i4 + 2] = tb; a[i4 + 3] = 0.5; b[i4] = pr; b[i4 + 1] = pm; b[i4 + 2] = pp; b[i4 + 3] = ps;
    this._writeDebris(i, 1);
  }
  _freeDebris(i) { if (this.dstate[i]) this.dactive--; this.dstate[i] = 0; const o = i * 16, m = this.debris.m; for (let k = 0; k < 15; k++) m[o + k] = 0; this.debris.touch(i); }
  _writeDebris(i, scale) {
    const i3 = i * 3, i4 = i * 4;
    _q.set(this.dq[i4], this.dq[i4 + 1], this.dq[i4 + 2], this.dq[i4 + 3]);
    _v.set(this.dp[i3], this.dp[i3 + 1], this.dp[i3 + 2]); _s.set(this.ds[i3] * scale, this.ds[i3 + 1] * scale, this.ds[i3 + 2] * scale);
    _m4.compose(_v, _q, _s); _m4.toArray(this.debris.m, i * 16); this.debris.touch(i);
  }

  updateDebris(dt) {
    if (!this.dactive) return;
    const dp = this.dp, dv = this.dv, dw = this.dw, dq = this.dq, ds = this.ds;
    const actors = G.actors ? G.actors.list : null, player = G.player;
    for (let i = 0; i < MAXDEB; i++) {
      const st = this.dstate[i]; if (!st) continue;
      this.dlife[i] -= dt;
      if (this.dlife[i] <= 0) { this._freeDebris(i); continue; }
      const i3 = i * 3, i4 = i * 4;
      if (st === 2) {
        if (this.dlife[i] < 0.6) this._writeDebris(i, this.dlife[i] / 0.6);
        continue;
      }
      dv[i3 + 1] -= 17 * dt;
      let x = dp[i3] + dv[i3] * dt, y = dp[i3 + 1] + dv[i3 + 1] * dt, z = dp[i3 + 2] + dv[i3 + 2] * dt;
      const r = (ds[i3] + ds[i3 + 1] + ds[i3 + 2]) / 6;
      if (this.solidAt(x, dp[i3 + 1], z) && !this.solidAt(dp[i3], dp[i3 + 1], dp[i3 + 2])) { x = dp[i3]; z = dp[i3 + 2]; dv[i3] *= -0.3; dv[i3 + 2] *= -0.3; }
      let floor = terrainH(x, z);
      if (dv[i3 + 1] <= 0) {
        const pid = this.pieceAtWorld(x, y - r, z);
        if (pid >= 0) floor = Math.max(floor, (this.py[pid] + this.sy[pid]) * CELL);
      }
      if (y - r <= floor) {
        const impact = -dv[i3 + 1];
        y = floor + r;
        if (impact > 4 && this.soundBudget > 0 && G.audio && !this.quiet) { this.soundBudget--; G.audio.thud(x, y, z, Math.min(1, impact / 14) * Math.min(1, r * 6)); }
        if (impact > 5 && G.fx && Math.random() < 0.3) G.fx.dust(x, y, z, 1, r * 3);
        if (impact < 1.6 && Math.hypot(dv[i3], dv[i3 + 2]) < 1) { this.dstate[i] = 2; dv[i3] = dv[i3 + 1] = dv[i3 + 2] = 0; }
        else { dv[i3 + 1] = impact * 0.28; dv[i3] *= 0.55; dv[i3 + 2] *= 0.55; dw[i3] *= 0.5; dw[i3 + 1] *= 0.5; dw[i3 + 2] *= 0.5; }
      } else if (dv[i3 + 1] < -6 && r > 0.07) {
        // heavy falling masonry hurts whoever is underneath
        if (actors) for (const a of actors) {
          if (a.dead) continue;
          if (Math.abs(a.pos.x - x) < 0.45 && Math.abs(a.pos.z - z) < 0.45 && y > a.pos.y + 0.8 && y < a.pos.y + 2.1) { a.damage(18 + r * 160, null, 'debris'); dv[i3 + 1] *= 0.4; }
        }
        if (player && !player.dead && Math.abs(player.pos.x - x) < 0.4 && Math.abs(player.pos.z - z) < 0.4 && y > player.pos.y + 1.0 && y < player.pos.y + 2.1) { player.damage(6 + r * 60, null, 'debris'); dv[i3 + 1] *= 0.4; }
      }
      dp[i3] = x; dp[i3 + 1] = y; dp[i3 + 2] = z;
      // integrate rotation
      const wx = dw[i3], wy = dw[i3 + 1], wz = dw[i3 + 2];
      const qx = dq[i4], qy = dq[i4 + 1], qz = dq[i4 + 2], qw = dq[i4 + 3], hdt = dt * 0.5;
      let nx = qx + hdt * (wx * qw + wy * qz - wz * qy), ny = qy + hdt * (wy * qw + wz * qx - wx * qz), nz = qz + hdt * (wz * qw + wx * qy - wy * qx), nw = qw - hdt * (wx * qx + wy * qy + wz * qz);
      const il = 1 / Math.hypot(nx, ny, nz, nw);
      dq[i4] = nx * il; dq[i4 + 1] = ny * il; dq[i4 + 2] = nz * il; dq[i4 + 3] = nw * il;
      this._writeDebris(i, 1);
    }
  }

  checkIntegrity() {
    const n = this.phwm, visit = this.visit, stack = this.stack, occ = this.occ;
    visit.fill(0, 0, n);
    let sp = 0;
    for (let i = 0; i < n; i++) if (this.palive[i] && this.py[i] === 0) { visit[i] = 1; stack[sp++] = i; }
    const push = (v) => { if (v) { const q = v - 1; if (!visit[q]) { visit[q] = 1; stack[sp++] = q; } } };
    while (sp > 0) {
      const id = stack[--sp];
      const x = this.px[id], y = this.py[id], z = this.pz[id], x1 = x + this.sx[id], y1 = y + this.sy[id], z1 = z + this.sz[id];
      for (let j = y; j < y1; j++) for (let k = z; k < z1; k++) { if (x > 0) push(occ[cidx(x - 1, j, k)]); if (x1 < GX) push(occ[cidx(x1, j, k)]); }
      for (let j = y; j < y1; j++) for (let i = x; i < x1; i++) { if (z > 0) push(occ[cidx(i, j, z - 1)]); if (z1 < GZ) push(occ[cidx(i, j, z1)]); }
      for (let k = z; k < z1; k++) for (let i = x; i < x1; i++) { if (y > 0) push(occ[cidx(i, y - 1, k)]); if (y1 < GY) push(occ[cidx(i, y1, k)]); }
    }
    let fell = 0, sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < n; i++) if (this.palive[i] && !visit[i]) {
      if (fell < 4) { sx = (this.px[i]) * CELL - HALF; sy = this.py[i] * CELL; sz = this.pz[i] * CELL - HALF; }
      this.removePiece(i, 'fall'); fell++;
    }
    if (fell > 12 && !this.quiet) {
      if (G.audio) G.audio.collapse(sx, sy, sz, Math.min(1, fell / 150));
      if (G.fx) G.fx.dust(sx, sy, sz, Math.min(14, 3 + fell / 12), 2.5);
      if (G.onCollapse) G.onCollapse(fell, sx, sy, sz);
    }
    return fell;
  }

  explode(x, y, z, radius, dmg, owner = null) {
    const r = radius / CELL;
    const gx = (x + HALF) / CELL, gy = y / CELL, gz = (z + HALF) / CELL;
    const x0 = Math.max(0, Math.floor(gx - r)), x1 = Math.min(GX - 1, Math.ceil(gx + r));
    const y0 = Math.max(0, Math.floor(gy - r)), y1 = Math.min(GY - 1, Math.ceil(gy + r));
    const z0 = Math.max(0, Math.floor(gz - r)), z1 = Math.min(GZ - 1, Math.ceil(gz + r));
    const stampN = ++this.stampN, stamp = this.stamp, occ = this.occ;
    const ids = [];
    for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) for (let i = x0; i <= x1; i++) {
      const v = occ[cidx(i, j, k)];
      if (v && stamp[v - 1] !== stampN) { stamp[v - 1] = stampN; ids.push(v - 1); }
    }
    const dir = _v; let destroyed = 0;
    for (const id of ids) {
      if (!this.palive[id]) continue;
      const cx = (this.px[id] + this.sx[id] / 2) * CELL - HALF, cy = (this.py[id] + this.sy[id] / 2) * CELL, cz = (this.pz[id] + this.sz[id] / 2) * CELL - HALF;
      const d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > radius) continue;
      const f = 1 - d / radius, amount = dmg * f * f * 1.6;
      if (amount >= this.php[id]) {
        dir.set(cx - x, cy - y + 0.3, cz - z).normalize();
        this.removePiece(id, destroyed < 90 ? 'blast' : 'break', dir, 4 + f * 9); destroyed++;
      } else this.damagePiece(id, amount, null);
    }
    return destroyed;
  }

  update(dt) {
    this.material.userData.uTime.value += dt;
    this.soundBudget = Math.min(6, this.soundBudget + dt * 30);
    for (let i = this.pendingBooms.length - 1; i >= 0; i--) {
      const b = this.pendingBooms[i]; b.t -= dt;
      if (b.t <= 0) { this.pendingBooms.splice(i, 1); if (G.combat) G.combat.explosion(b.x, b.y, b.z, 3.6, 220, null); else this.explode(b.x, b.y, b.z, 3.6, 220); }
    }
    if (this.integrityTimer >= 0) {
      this.integrityTimer -= dt;
      if (this.integrityTimer < 0) { const fell = this.checkIntegrity(); this.integrityTimer = -1; if (fell) this.navDirty = true; }
    }
    this.updateDebris(dt);
    this.pool.flush(); this.glass.flush(); this.debris.flush();
  }
}
