// Landscape: heightfield ground with procedural shading, grass, forests you can fell, boulders and a lake.
import * as THREE from 'three';
import { G, CELL, GX, GZ, HALF, terrainH, fbm2, noise2, rng, clamp, smooth } from './util.js';
import { makeLeafTexture, makeBarkTexture } from './textures.js';

function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const SPLAT_N = 192, SPLAT_W = 96;

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.uTime = { value: 0 };
    this.buildGround(); this.buildWater(); this.buildTrees(); this.buildRocks();
    this.grass = null; this.buildGrass(G.settings ? G.settings.quality : 2);
  }

  buildGround() {
    const N = 230, geo = new THREE.BufferGeometry();
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const map = (u) => Math.sign(u) * Math.pow(Math.abs(u), 1.9) * 900;
    let p = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = map((i / N) * 2 - 1), z = map((j / N) * 2 - 1);
      pos[p++] = x; pos[p++] = terrainH(x, z); pos[p++] = z;
    }
    const idx = new Uint32Array(N * N * 6); p = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.splatData = new Uint8Array(SPLAT_N * SPLAT_N * 4);
    this.splat = new THREE.DataTexture(this.splatData, SPLAT_N, SPLAT_N, THREE.RGBAFormat);
    this.splat.magFilter = this.splat.minFilter = THREE.LinearFilter; this.splat.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNoise = { value: G.noiseTex }; sh.uniforms.uSplat = { value: this.splat };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(position,1.0)).xyz; vTN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uNoise; uniform sampler2D uSplat; varying vec3 vTW; varying vec3 vTN; vec3 tWN;`)
        .replace('#include <map_fragment>', `
{
  vec2 p = vTW.xz;
  vec4 na = texture2D(uNoise, p * 0.019); vec4 nb = texture2D(uNoise, p * 0.23 + 0.4); vec4 nc = texture2D(uNoise, p * 1.3); vec4 nd = texture2D(uNoise, p * 6.1);
  vec2 suv = p / ${SPLAT_W.toFixed(1)} + 0.5;
  vec4 sp = (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) ? texture2D(uSplat, suv) : vec4(0.0);
  vec3 grass = mix(vec3(0.09, 0.16, 0.035), vec3(0.24, 0.3, 0.07), na.r) * (0.62 + 0.76 * nc.g) * (0.8 + 0.4 * nd.r);
  grass = mix(grass, vec3(0.34, 0.31, 0.12) * (0.7 + 0.6 * nc.r), smoothstep(0.5, 0.85, nb.b) * 0.55);
  vec3 dirt = mix(vec3(0.17, 0.115, 0.07), vec3(0.33, 0.25, 0.16), nb.r) * (0.7 + 0.6 * nd.g);
  dirt = mix(dirt, vec3(0.42, 0.4, 0.37) * (0.6 + 0.8 * nd.r), smoothstep(0.78, 0.9, nd.b) * 0.7);
  vec3 rock = vec3(0.3, 0.29, 0.27) * (0.5 + 0.9 * nb.r) * (0.8 + 0.4 * nd.g);
  float dAmt = smoothstep(0.3, 0.62, sp.r + (nb.r - 0.5) * 0.55 + (nc.r - 0.5) * 0.2);
  vec3 col = mix(grass, dirt, dAmt);
  float slope = 1.0 - normalize(vTN).y;
  col = mix(col, rock, smoothstep(0.22, 0.5, slope + (nb.g - 0.5) * 0.2));
  col = mix(col, vec3(0.2, 0.17, 0.12) * (0.6 + 0.6 * nc.g), smoothstep(-0.6, -1.5, vTW.y));
  col = mix(col, vec3(0.85, 0.87, 0.92), smoothstep(70.0, 120.0, vTW.y + nb.r * 30.0) * (1.0 - slope * 1.2));
  col *= 1.0 - 0.6 * sp.g;
  diffuseColor.rgb = col;
  float bs = mix(0.35, 0.6, dAmt);
  tWN = normalize(normalize(vTN) + vec3(nc.r - 0.5, 0.0, nc.g - 0.5) * bs + vec3(nd.r - 0.5, 0.0, nd.g - 0.5) * bs * 0.8);
}`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tWN, 0.0)).xyz);');
    };
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  // rebuild dirt / contact-shadow map from the current buildings
  updateSplat(world, paths = []) {
    const N = SPLAT_N, fp = new Float32Array(N * N), tmp = new Float32Array(N * N), ao = new Float32Array(N * N), dirt = new Float32Array(N * N);
    const occ = world.occ;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i + 0.5) / N * SPLAT_W - SPLAT_W / 2, wz = (j + 0.5) / N * SPLAT_W - SPLAT_W / 2;
      const gx = Math.floor((wx + HALF) / CELL), gz = Math.floor((wz + HALF) / CELL);
      let f = 0;
      if (gx >= 0 && gz >= 0 && gx < GX - 1 && gz < GZ - 1) {
        for (let y = 0; y < 3 && !f; y++) { const b = gx + GX * (gz + GZ * y); if (occ[b] || occ[b + 1] || occ[b + GX] || occ[b + GX + 1]) f = 1; }
      }
      fp[j * N + i] = f;
    }
    const blur = (src, dst, r) => {
      for (let j = 0; j < N; j++) { let s = 0; for (let i = -r; i <= r; i++) s += src[j * N + clamp(i, 0, N - 1)];
        for (let i = 0; i < N; i++) { tmp[j * N + i] = s / (2 * r + 1); s += src[j * N + clamp(i + r + 1, 0, N - 1)] - src[j * N + clamp(i - r, 0, N - 1)]; } }
      for (let i = 0; i < N; i++) { let s = 0; for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, N - 1) * N + i];
        for (let j = 0; j < N; j++) { dst[j * N + i] = s / (2 * r + 1); s += tmp[clamp(j + r + 1, 0, N - 1) * N + i] - tmp[clamp(j - r, 0, N - 1) * N + i]; } }
    };
    blur(fp, ao, 2); blur(fp, dirt, 6);
    const d = this.splatData;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i + 0.5) / N * SPLAT_W - SPLAT_W / 2, wz = (j + 0.5) / N * SPLAT_W - SPLAT_W / 2;
      let pd = 0;
      for (const s of paths) {
        const vx = s[2] - s[0], vz = s[3] - s[1], l2 = vx * vx + vz * vz || 1;
        const t = clamp(((wx - s[0]) * vx + (wz - s[1]) * vz) / l2, 0, 1);
        const dd = Math.hypot(wx - s[0] - vx * t, wz - s[1] - vz * t);
        pd = Math.max(pd, 1 - smooth(s[4] * 0.5, s[4], dd));
      }
      const inside = 1 - smooth(31, 36, Math.max(Math.abs(wx), Math.abs(wz)));
      const k = (j * N + i) * 4, a = ao[j * N + i];
      d[k] = clamp(dirt[j * N + i] * 2.2 + pd * 0.85 + inside * 0.24, 0, 1) * 255;
      d[k + 1] = clamp(a * (1 - fp[j * N + i] * 0.3) * 1.25, 0, 1) * 255;
      d[k + 2] = inside * 255; d[k + 3] = 255;
    }
    this.splat.needsUpdate = true;
  }

  buildWater() {
    const geo = new THREE.CircleGeometry(74, 40); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x18323a, roughness: 0.07, metalness: 0.55, transparent: true, opacity: 0.93 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNoise = { value: G.noiseTex }; sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform float uTime; varying vec3 vTW;')
        .replace('#include <normal_fragment_maps>', `
vec2 wp = vTW.xz * 0.09; vec4 w1 = texture2D(uNoise, wp + uTime * vec2(0.012, 0.007)); vec4 w2 = texture2D(uNoise, wp * 3.1 - uTime * vec2(0.02, 0.013));
vec3 wn = normalize(vec3((w1.r - 0.5) * 0.22 + (w2.g - 0.5) * 0.16, 1.0, (w1.g - 0.5) * 0.22 + (w2.r - 0.5) * 0.16));
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
    };
    const m = new THREE.Mesh(geo, mat); m.position.set(-105, -1.35, 62); m.receiveShadow = true;
    this.scene.add(m);
  }

  buildTrees() {
    const r = rng(4242);
    // --- broadleaf geometry
    const trunkA = new THREE.CylinderGeometry(0.16, 0.36, 5.2, 7, 3).toNonIndexed(); trunkA.translate(0, 2.6, 0);
    const br = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.05, 0.11, 2.4, 5, 1).toNonIndexed();
      b.translate(0, 1.2, 0); b.rotateZ(0.7 + r() * 0.5); b.rotateY(i * 1.57 + r()); b.translate(0, 3.2 + r() * 1.2, 0); br.push(b);
    }
    const crownA = [];
    for (let i = 0; i < 64; i++) {
      const s = 1.5 + r() * 1.4, q = new THREE.PlaneGeometry(s, s).toNonIndexed();
      const a = r() * 6.283, e = (r() - 0.35) * 2.2, rad = 0.7 + Math.pow(r(), 0.6) * 2.3;
      const cx = Math.cos(a) * Math.cos(e) * rad, cy = 5.3 + Math.sin(e) * rad * 0.8, cz = Math.sin(a) * Math.cos(e) * rad;
      q.rotateX((r() - 0.5) * 2.4); q.rotateY(r() * 6.283); q.translate(cx, cy, cz);
      const n = q.attributes.normal.array, pp = q.attributes.position.array;
      for (let k = 0; k < n.length; k += 3) { const nx = pp[k], ny = pp[k + 1] - 4.6, nz = pp[k + 2], l = Math.hypot(nx, ny, nz) || 1; n[k] = nx / l; n[k + 1] = ny / l; n[k + 2] = nz / l; }
      crownA.push(q);
    }
    // --- pine geometry
    const trunkB = new THREE.CylinderGeometry(0.07, 0.3, 9, 6, 2).toNonIndexed(); trunkB.translate(0, 4.5, 0);
    const crownB = [];
    for (let t = 0; t < 8; t++) {
      const y = 2.4 + t * 0.9, rad = 2.6 - t * 0.29;
      for (let i = 0; i < 6; i++) {
        const q = new THREE.PlaneGeometry(rad * 1.25, rad * 1.5).toNonIndexed();
        q.translate(0, -rad * 0.62, 0); q.rotateX(-1.0); q.rotateY(i * 1.047 + t * 0.5 + r() * 0.3); q.translate(0, y + 1.1, 0);
        const n = q.attributes.normal.array, pp = q.attributes.position.array;
        for (let k = 0; k < n.length; k += 3) { const nx = pp[k], nz = pp[k + 2], l = Math.hypot(nx, 0.9, nz) || 1; n[k] = nx / l; n[k + 1] = 0.9 / l; n[k + 2] = nz / l; }
        crownB.push(q);
      }
    }
    const bark = makeBarkTexture();
    const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, color: 0xbbbbbb });
    const mkLeaf = (tex, col) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, color: col });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
transformed.x += sin(uTime * 1.1 + ph + position.y * 0.5) * 0.035 * position.y + sin(uTime * 3.7 + position.z * 2.0 + ph) * 0.04;
transformed.z += cos(uTime * 0.9 + ph + position.y * 0.4) * 0.03 * position.y;`);
      };
      return m;
    };
    const leafA = mkLeaf(makeLeafTexture(false), 0xc9d8b0), leafB = mkLeaf(makeLeafTexture(true), 0xb8cbb0);
    // --- placement
    this.trees = []; this.treeHash = new Map();
    const tr = rng(99);
    let guard = 0;
    while (this.trees.length < 330 && guard++ < 9000) {
      const a = tr() * 6.283, d = 43 + Math.pow(tr(), 1.6) * 330;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) < 41) continue;
      const h = terrainH(x, z);
      if (h < -0.6 || h > 62) continue;
      const forest = fbm2(x * 0.012 + 3, z * 0.012 + 8, 3);
      if (forest < 0.47 && tr() > 0.16) continue;
      let ok = true;
      for (const t of this.treesNear(x, z)) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 9) { ok = false; break; }
      if (!ok) continue;
      const pine = h > 14 ? tr() < 0.8 : tr() < 0.34;
      const t = { x, y: h - 0.15, z, s: 0.8 + tr() * 0.75, rot: tr() * 6.283, pine, hp: 380, fall: 0, fdx: 0, fdz: 0, dead: false, idx: 0 };
      this.trees.push(t);
      const key = (Math.floor(x / 16) + 512) * 1024 + Math.floor(z / 16) + 512;
      if (!this.treeHash.has(key)) this.treeHash.set(key, []);
      this.treeHash.get(key).push(t);
    }
    const A = this.trees.filter((t) => !t.pine), B = this.trees.filter((t) => t.pine);
    const mk = (geo, mat, n, cast) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m); return m; };
    this.tMesh = [
      [mk(mergeGeos([trunkA, ...br]), barkMat, A.length, true), mk(mergeGeos(crownA), leafA, A.length, true)],
      [mk(trunkB, barkMat, B.length, true), mk(mergeGeos(crownB), leafB, B.length, true)],
    ];
    A.forEach((t, i) => { t.idx = i; this.writeTree(t); }); B.forEach((t, i) => { t.idx = i; this.writeTree(t); });
    const col = new THREE.Color(), cr = rng(5);
    for (const [list, set] of [[A, this.tMesh[0]], [B, this.tMesh[1]]]) {
      list.forEach((t, i) => { const v = 0.75 + cr() * 0.4; col.setRGB(v * (0.9 + cr() * 0.25), v, v * (0.8 + cr() * 0.3)); set[1].setColorAt(i, col); });
      if (set[1].instanceColor) set[1].instanceColor.needsUpdate = true;
    }
    this.falling = [];
  }

  writeTree(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    q.setFromEuler(e.set(0, t.rot, 0));
    if (t.fall > 0) {
      const ang = Math.min(1.5, t.fall * t.fall * 1.4);
      const axis = new THREE.Vector3(t.fdz, 0, -t.fdx).normalize();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
    }
    const sink = t.fall > 2.2 ? (t.fall - 2.2) * 1.2 : 0;
    const s = t.s * (t.fall > 4 ? Math.max(0.001, 1 - (t.fall - 4)) : 1);
    m.compose(new THREE.Vector3(t.x, t.y - sink, t.z), q, new THREE.Vector3(s, s, s));
    const set = this.tMesh[t.pine ? 1 : 0];
    set[0].setMatrixAt(t.idx, m); set[1].setMatrixAt(t.idx, m);
    set[0].instanceMatrix.needsUpdate = true; set[1].instanceMatrix.needsUpdate = true;
  }

  treesNear(x, z) {
    const out = [], cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const l = this.treeHash.get((cx + i + 512) * 1024 + cz + j + 512);
      if (l) for (const t of l) out.push(t);
    }
    return out;
  }

  // ray vs tree trunks; returns nearest {t, tree} or null
  rayTrees(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    const steps = Math.min(12, Math.ceil(maxT / 16));
    const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let s = 0; s <= steps; s++) {
      const px = ox + dx * s * 16, pz = oz + dz * s * 16;
      for (const t of this.treesNear(px, pz)) {
        if (t.dead || seen.has(t)) continue; seen.add(t);
        const rx = t.x - ox, rz = t.z - oz, r = 0.3 * t.s;
        const dl = dx * dx + dz * dz; if (dl < 1e-6) continue;
        const tc = (rx * dx + rz * dz) / dl; if (tc < 0 || tc > maxT) continue;
        const px2 = rx - dx * tc, pz2 = rz - dz * tc, d2 = px2 * px2 + pz2 * pz2;
        if (d2 > r * r) continue;
        const th = tc - Math.sqrt((r * r - d2) / dl), y = oy + dy * th;
        if (y < t.y || y > t.y + (t.pine ? 9 : 5.2) * t.s) continue;
        if (!best || th < best.t) best = { t: th, tree: t };
      }
    }
    return best;
  }

  damageTree(t, dmg, dx, dz) {
    if (t.dead) return;
    t.hp -= dmg;
    if (t.hp <= 0) {
      t.dead = true; t.fall = 0.01; const l = Math.hypot(dx, dz) || 1; t.fdx = dx / l; t.fdz = dz / l;
      this.falling.push(t);
      if (G.audio) G.audio.treeFall(t.x, t.y, t.z);
    }
  }
  explodeTrees(x, z, radius, dmg) {
    for (const t of this.treesNear(x, z)) { const d = Math.hypot(t.x - x, t.z - z); if (d < radius + 1) this.damageTree(t, dmg * (1 - d / (radius + 1)) * 2, t.x - x, t.z - z); }
  }
  resetTrees() {
    for (const t of this.trees) if (t.dead || t.hp < 380) { t.dead = false; t.hp = 380; t.fall = 0; this.writeTree(t); }
    this.falling.length = 0;
  }

  buildRocks() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const n = 0.72 + fbm2(p[i] * 1.3 + 5 + p[i + 1], p[i + 2] * 1.3 + p[i + 1] * 0.7, 3) * 0.62;
      p[i] *= n; p[i + 1] *= n * 0.72; p[i + 2] *= n;
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.93 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNoise = { value: G.noiseTex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; varying vec3 vRP;')
        .replace('#include <map_fragment>', 'vec4 rn = texture2D(uNoise, vRP.xz * 0.6 + vRP.y * 0.3); vec4 rn2 = texture2D(uNoise, vRP.xy * 2.7);\n diffuseColor.rgb *= (0.55 + 0.8 * rn.r) * (0.8 + 0.4 * rn2.g); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.26, 0.1), smoothstep(0.55, 0.8, rn.b) * smoothstep(0.0, 0.5, vRP.y) * 0.6);');
    };
    const N = 150, mesh = new THREE.InstancedMesh(geo, mat, N), r = rng(77), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.rocks = [];
    for (let i = 0; i < N; i++) {
      let x, z, tries = 0;
      do { const a = r() * 6.283, d = 40 + Math.pow(r(), 1.5) * 260; x = Math.cos(a) * d; z = Math.sin(a) * d; } while (Math.max(Math.abs(x), Math.abs(z)) < 39 && tries++ < 20);
      const s = 0.4 + Math.pow(r(), 2.2) * 2.6;
      q.setFromEuler(e.set(r() * 0.5, r() * 6.283, r() * 0.5));
      m.compose(new THREE.Vector3(x, terrainH(x, z) + s * 0.12, z), q, new THREE.Vector3(s * (0.8 + r() * 0.6), s * (0.6 + r() * 0.5), s * (0.8 + r() * 0.6)));
      mesh.setMatrixAt(i, m);
      if (s > 0.9) this.rocks.push({ x, z, r: s * 0.8, h: terrainH(x, z) + s * 0.55 });
    }
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildGrass(quality) {
    if (this.grass) { this.scene.remove(this.grass); this.grass.geometry.dispose(); this.grass.material.dispose(); }
    const count = [5000, 13000, 26000, 42000][quality] || 13000;
    const r = rng(31);
    const BL = 10, pos = [], col = [], nor = [];
    for (let b = 0; b < BL; b++) {
      const a = r() * 6.283, d = r() * 0.2, bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const dir = r() * 6.283, w = 0.006 + r() * 0.007, h = 0.16 + r() * 0.3, lean = 0.05 + r() * 0.12;
      const wx = Math.cos(dir) * w, wz = Math.sin(dir) * w, lx = -Math.sin(dir) * lean, lz = Math.cos(dir) * lean;
      const v = [[bx - wx, 0, bz - wz], [bx + wx, 0, bz + wz], [bx - wx * 0.6 + lx * 0.4, h * 0.5, bz - wz * 0.6 + lz * 0.4], [bx + wx * 0.6 + lx * 0.4, h * 0.5, bz + wz * 0.6 + lz * 0.4], [bx + lx, h, bz + lz]];
      for (const k of [0, 1, 2, 1, 3, 2, 2, 3, 4]) { pos.push(...v[k]); const t = v[k][1] / h; col.push(0.35 + t * 0.65, 0.4 + t * 0.6, 0.3 + t * 0.5); nor.push(0, 1, 0); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float gph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
float gw = sin(uTime * 1.7 + gph) * 0.5 + sin(uTime * 3.1 + gph * 1.7) * 0.25;
transformed.x += gw * position.y * 0.22; transformed.z += gw * position.y * 0.1;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    };
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 6) {
      const a = r() * 6.283, d = 33 + Math.pow(r(), 1.7) * 62;
      const x = Math.cos(a) * d * (1 + r() * 0.2), z = Math.sin(a) * d * (1 + r() * 0.2);
      const md = Math.max(Math.abs(x), Math.abs(z));
      if (md < 32.5) continue;
      if (md < 36 && r() > (md - 32.5) / 3.5) continue;
      const h = terrainH(x, z); if (h < -0.4) continue;
      if (noise2(x * 0.15 + 7, z * 0.15) < 0.28) continue;
      const s = 0.9 + r() * 1.3;
      q.setFromEuler(e.set(0, r() * 6.283, 0));
      m.compose(new THREE.Vector3(x, h - 0.02, z), q, new THREE.Vector3(s, s * (0.7 + r() * 0.8), s));
      mesh.setMatrixAt(n, m);
      const dry = noise2(x * 0.05 + 40, z * 0.05 + 3);
      c.setRGB(0.1 + dry * 0.22 + r() * 0.06, 0.24 + dry * 0.06 + r() * 0.1, 0.045 + r() * 0.03); mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    this.grass = mesh; this.scene.add(mesh);
  }

  update(dt) {
    this.uTime.value += dt;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const t = this.falling[i]; t.fall += dt;
      this.writeTree(t);
      if (t.fall > 5) this.falling.splice(i, 1);
    }
  }
}
