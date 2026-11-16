// Geometry toolkit for the detailed character and weapon models.
// GB merges many transformed primitives (boxes, tapered tubes, lofted organic shapes, extruded side-profiles)
// into ONE vertex-coloured geometry, so a soldier with ~150 visible parts still costs one draw call per bone.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const base = {};
function prim(key, make) { if (!base[key]) { let g = make(); if (g.index) g = g.toNonIndexed(); base[key] = g; } return base[key]; }

// smooth closed surface through elliptical / super-elliptical cross-sections stacked along Y
// sections: [{ y, rx, rz, x?, z?, e? }]  (e = 2 ellipse, larger = boxier)
export function loftGeo(sections, radial = 10, capTop = true, capBot = true) {
  const pos = [], idx = [], n = sections.length;
  for (const s of sections) {
    const e = s.e || 2.4;
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * s.rx, pz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e) * s.rz;
      pos.push((s.x || 0) + px, s.y, (s.z || 0) + pz);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * radial + i, b = j * radial + (i + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (j, flip) => { const s = sections[j], ci = pos.length / 3; pos.push(s.x || 0, s.y, s.z || 0); for (let i = 0; i < radial; i++) { const a = j * radial + i, b = j * radial + (i + 1) % radial; if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); } };
  if (capBot) cap(0, true); if (capTop) cap(n - 1, false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}

export class GB {
  // detail 2 = close-up (first-person weapons), 1 = world models seen from a distance
  constructor(detail = 2) { this.pos = []; this.nor = []; this.col = []; this.count = 0; this.detail = detail; }
  // add any BufferGeometry with a transform and a flat colour (hex or THREE.Color)
  add(geo, color, mat) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, N = g.attributes.normal.array;
    if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
    if (mat) _n3.getNormalMatrix(mat);
    for (let i = 0; i < P.length; i += 3) {
      _p.set(P[i], P[i + 1], P[i + 2]); _s.set(N[i], N[i + 1], N[i + 2]);
      if (mat) { _p.applyMatrix4(mat); _s.applyMatrix3(_n3).normalize(); }
      this.pos.push(_p.x, _p.y, _p.z); this.nor.push(_s.x, _s.y, _s.z); this.col.push(_c.r, _c.g, _c.b);
    }
    this.count += P.length / 3; return this;
  }
  trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone(); }
  box(color, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(prim('box', () => new THREE.BoxGeometry(1, 1, 1)), color, this.trs(x, y, z, rx, ry, rz, w, h, d)); }
  // box with chamfered long edges (reads as machined / moulded rather than a toy block)
  rbox(color, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, r = 0.22) {
    const key = 'rbox' + r + ':' + this.detail;
    const g = prim(key, () => loftGeo([{ y: -0.5, rx: 0.5 - r * 0.25, rz: 0.5 - r * 0.25, e: 7 }, { y: -0.5 + r * 0.3, rx: 0.5, rz: 0.5, e: 7 }, { y: 0.5 - r * 0.3, rx: 0.5, rz: 0.5, e: 7 }, { y: 0.5, rx: 0.5 - r * 0.25, rz: 0.5 - r * 0.25, e: 7 }], this.detail > 1 ? 12 : 8));
    return this.add(g, color, this.trs(x, y, z, rx, ry, rz, w, h, d));
  }
  // cylinder along local Y, then transformed
  cyl(color, rTop, rBot, len, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10) {
    const k = 'cyl' + seg + ':' + (rTop / (rBot || 1e-6)).toFixed(3);
    const g = prim(k, () => new THREE.CylinderGeometry(rTop / (rBot || 1e-6), 1, 1, seg, 1));
    return this.add(g, color, this.trs(x, y, z, rx, ry, rz, rBot, len, rBot));
  }
  // cylinder whose axis runs along Z (barrels, tubes, scopes)
  cylZ(color, r, len, x, y, z, seg = 12, r2) { return this.cyl(color, r2 === undefined ? r : r2, r, len, x, y, z, Math.PI / 2, 0, 0, seg); }
  cylX(color, r, len, x, y, z, seg = 10) { return this.cyl(color, r, r, len, x, y, z, 0, 0, Math.PI / 2, seg); }
  sph(color, rx, ry, rz, x = 0, y = 0, z = 0, seg = 10) { if (this.detail < 2) seg = Math.min(seg, 7); return this.add(prim('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg - 3))), color, this.trs(x, y, z, 0, 0, 0, rx, ry, rz)); }
  dome(color, rx, ry, rz, x = 0, y = 0, z = 0, rxr = 0, ryr = 0, rzr = 0) { return this.add(prim('dome', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)), color, this.trs(x, y, z, rxr, ryr, rzr, rx, ry, rz)); }
  torus(color, R, r, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) { const hi = this.detail > 1, k = 'tor' + (r / R).toFixed(3) + ':' + arc.toFixed(2) + hi; return this.add(prim(k, () => new THREE.TorusGeometry(1, r / R, hi ? 6 : 4, hi ? 14 : 9, arc)), color, this.trs(x, y, z, rx, ry, rz, R, R, R)); }
  cone(color, r, len, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) { return this.add(prim('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg)), color, this.trs(x, y, z, rx, ry, rz, r, len, r)); }
  // tapered tube between two points (limbs, straps, slings)
  tube(color, r1, r2, ax, ay, az, bx, by, bz, seg = 10) {
    _a.set(ax, ay, az); _b.set(bx, by, bz); const d = _b.clone().sub(_a), len = d.length(); if (len < 1e-5) return this;
    const k = 'cyl' + seg + ':' + (r2 / r1).toFixed(3);
    const g = prim(k, () => new THREE.CylinderGeometry(r2 / r1, 1, 1, seg, 1));
    const m = new THREE.Matrix4().compose(_a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(r1, len, r1));
    return this.add(g, color, m);
  }
  // capsule-ish limb: tube plus rounded ends
  limb(color, r1, r2, ax, ay, az, bx, by, bz, seg = 10) { if (this.detail < 2) seg = Math.min(seg, 8); this.tube(color, r1, r2, ax, ay, az, bx, by, bz, seg); this.sph(color, r1, r1, r1, ax, ay, az, 6); this.sph(color, r2, r2, r2, bx, by, bz, 6); return this; }
  loft(color, sections, radial = 10, mat = null, capTop = true, capBot = true) { return this.add(loftGeo(sections, radial, capTop, capBot), color, mat); }
  // extruded 2D side profile. Profile X runs along -Z (forward), profile Y is up; thickness is centred on X.
  profile(color, pts, thick, x = 0, y = 0, z = 0, bevel = 0.004, holes = null) {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const b = Math.min(bevel, thick * 0.3);
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 5 });
    g.translate(0, 0, -(thick - b * 2) / 2);
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2); m.setPosition(x, y, z);
    return this.add(g, color, m);
  }
  build(uvScale = 6) {
    const g = new THREE.BufferGeometry(), n = this.count, uv = new Float32Array(n * 2), P = this.pos, N = this.nor;
    for (let i = 0; i < n; i++) {           // box-projected UVs for the detail texture
      const ax = Math.abs(N[i * 3]), ay = Math.abs(N[i * 3 + 1]), az = Math.abs(N[i * 3 + 2]);
      let u, v; if (ax >= ay && ax >= az) { u = P[i * 3 + 2]; v = P[i * 3 + 1]; } else if (ay >= az) { u = P[i * 3]; v = P[i * 3 + 2]; } else { u = P[i * 3]; v = P[i * 3 + 1]; }
      uv[i * 2] = u * uvScale; uv[i * 2 + 1] = v * uvScale;
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- shared detail textures & materials
function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function noiseFill(x, S, lo, hi, cell = 2) { for (let j = 0; j < S; j += cell) for (let i = 0; i < S; i += cell) { const v = lo + Math.random() * (hi - lo); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, j, cell, cell); } }
let MATS = null;
export function modelMats() {
  if (MATS) return MATS;
  const metalTex = canvasTex(256, (x, S) => {
    noiseFill(x, S, 196, 236, 2);
    for (let i = 0; i < 260; i++) { const px = Math.random() * S, py = Math.random() * S, l = 6 + Math.random() * 40, a = Math.random() * 6.28; x.strokeStyle = `rgba(${Math.random() < 0.6 ? '255,255,255' : '40,40,40'},${0.05 + Math.random() * 0.16})`; x.lineWidth = 0.6 + Math.random(); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`; x.beginPath(); x.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 5, 0, 6.3); x.fill(); }
  });
  const polyTex = canvasTex(128, (x, S) => { noiseFill(x, S, 205, 245, 1); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); } });
  const woodTex = canvasTex(256, (x, S) => {
    x.fillStyle = '#d8d0c4'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) { const py = Math.random() * S, v = 120 + Math.random() * 110; x.strokeStyle = `rgba(${v},${v * 0.9},${v * 0.8},${0.15 + Math.random() * 0.3})`; x.lineWidth = 0.6 + Math.random() * 2.2; x.beginPath(); x.moveTo(0, py); x.bezierCurveTo(S * 0.3, py + (Math.random() - 0.5) * 9, S * 0.7, py + (Math.random() - 0.5) * 9, S, py + (Math.random() - 0.5) * 5); x.stroke(); }
  });
  const clothTex = canvasTex(128, (x, S) => {
    noiseFill(x, S, 196, 240, 1);
    for (let i = 0; i < S; i += 2) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i, 0, 1, S); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, i, S, 1); }
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.07})`; x.beginPath(); x.ellipse(Math.random() * S, Math.random() * S, 6 + Math.random() * 18, 4 + Math.random() * 10, Math.random() * 3, 0, 6.3); x.fill(); }
  });
  for (const t of [metalTex, polyTex, woodTex, clothTex]) t.colorSpace = THREE.SRGBColorSpace;
  const S = THREE.MeshStandardMaterial;
  MATS = {
    metal: new S({ vertexColors: true, map: metalTex, bumpMap: metalTex, bumpScale: 0.6, metalness: 0.62, roughness: 0.4 }),
    poly: new S({ vertexColors: true, map: polyTex, bumpMap: polyTex, bumpScale: 0.5, metalness: 0.05, roughness: 0.66 }),
    wood: new S({ vertexColors: true, map: woodTex, bumpMap: woodTex, bumpScale: 0.4, metalness: 0, roughness: 0.5 }),
    cloth: new S({ vertexColors: true, map: clothTex, bumpMap: clothTex, bumpScale: 0.8, metalness: 0, roughness: 0.88 }),
    glass: new S({ color: 0x1a3a44, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.42 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
  };
  // first-person copies get a little self-illumination so the gun never turns into a black silhouette in shade
  for (const k of ['metal', 'poly', 'wood', 'cloth']) { const m = MATS[k].clone(); m.emissive.setRGB(1, 1, 1); m.emissiveMap = MATS[k].map; m.emissiveIntensity = k === 'metal' ? 0.035 : 0.05; MATS['fp_' + k] = m; }
  return MATS;
}
