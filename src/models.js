// Detailed soldier models. Each skeleton bone carries ONE merged, vertex-coloured mesh, so a fully kitted
// soldier (plate carrier, pouches, radio, helmet with goggles, holster, knee pads, fingers…) is ~14 draw calls.
// The model faces +Z; +X is the character's left. All bones hang along -Y so the ragdoll can drive them.
import * as THREE from 'three';
import { GB, modelMats } from './geo.js';
import { makeGun } from './guns.js';

export const RIG = { hipsY: 0.96, torsoY: 0.1, neckY: 0.53, shX: 0.205, shY: 0.445, upper: 0.29, fore: 0.27, hand: 0.36, hipX: 0.1, hipY: -0.05, thigh: 0.44, shin: 0.43, foot: 0.47, headC: 0.13 };
const SKIN = [0xc79b78, 0xb98562, 0x9a6b4a, 0x7a5236, 0xd4ab8a, 0x5e3f2a];
const HAIR = [0x2a1e14, 0x1a1512, 0x4a3320, 0x5c4a36, 0x777066];
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// what each soldier class wears
const KIT = {
  guard: { gun: 'rifle', helm: ['combat', 'combat', 'cap'], vest: 1, pack: [1, 0, 0], pads: 1 },
  scout: { gun: 'smg', helm: ['cap', 'boonie', 'none'], vest: 0, pack: [0, 0, 1], pads: 0, rolled: 1 },
  heavy: { gun: 'lmg', helm: ['heavy', 'heavy', 'heavy'], vest: 2, pack: [1, 1, 0], pads: 1, bulk: 1.18 },
  elite: { gun: 'rifle', helm: ['combat', 'beret', 'combat'], vest: 1, pack: [0, 1, 0], pads: 1, headset: 1 },
  sentry: { gun: 'sniper', helm: ['boonie', 'hood', 'boonie'], vest: 0, pack: [0, 0, 0], pads: 0, cloak: 1 },
  brute: { gun: null, helm: ['mask', 'mask', 'mask'], vest: 0, pack: [0, 0, 0], pads: 1, bare: 1, bulk: 1.22, apron: 1 },
  sapper: { gun: 'pistol', helm: ['cap', 'combat', 'none'], vest: 1, pack: [1, 1, 1], pads: 1, goggles: 1, satchel: 1 },
  boss: { gun: 'lmg', helm: ['crest', 'crest', 'crest'], vest: 2, pack: [0, 0, 0], pads: 1, bulk: 1.2, cape: 1 },
  hostage: { gun: null, helm: ['none', 'none', 'cap'], vest: 0, pack: [0, 0, 0], pads: 0, apron: 1, civilian: 1 },
};

function helmetGeo(kind, L) {
  const g = new GB(1), H = L.helmet || 0x4a4f3c, D = 0x16171a;
  if (kind === 'combat') {
    g.loft(H, [{ y: 0.105, rx: 0.095, rz: 0.11, z: -0.006 }, { y: 0.145, rx: 0.099, rz: 0.116, z: -0.004 }, { y: 0.2, rx: 0.095, rz: 0.11, z: -0.006 }, { y: 0.245, rx: 0.072, rz: 0.086, z: -0.008 }, { y: 0.268, rx: 0.03, rz: 0.036, z: -0.008 }], 14);
    g.loft(shade(H, 0.8), [{ y: 0.1, rx: 0.1, rz: 0.116, z: -0.005 }, { y: 0.112, rx: 0.1005, rz: 0.1165, z: -0.005 }], 14, null, false, false);
    for (const s of [-1, 1]) { g.rbox(D, 0.008, 0.016, 0.085, s * 0.099, 0.165, -0.005); g.rbox(D, 0.03, 0.045, 0.03, s * 0.092, 0.118, -0.02); }
    g.rbox(D, 0.04, 0.034, 0.014, 0, 0.215, 0.098, -0.25); g.rbox(shade(H, 0.7), 0.06, 0.03, 0.03, 0, 0.17, -0.116);
    for (let i = 0; i < 5; i++) g.box(shade(H, 0.75), 0.022, 0.004, 0.012, Math.sin(i * 1.3) * 0.06, 0.262 - Math.abs(Math.sin(i * 1.3)) * 0.03, Math.cos(i * 1.3) * 0.06);
    // goggles pushed up on the brow
    g.loft(D, [{ y: 0.176, rx: 0.1, rz: 0.115, z: -0.005 }, { y: 0.192, rx: 0.1, rz: 0.115, z: -0.005 }], 14, null, false, false);
    g.rbox(0x2a2c30, 0.13, 0.042, 0.026, 0, 0.19, 0.1, -0.2); g.rbox(0x0e1a22, 0.052, 0.03, 0.006, 0.031, 0.19, 0.114, -0.2); g.rbox(0x0e1a22, 0.052, 0.03, 0.006, -0.031, 0.19, 0.114, -0.2);
  } else if (kind === 'cap') {
    g.loft(L.cloth, [{ y: 0.15, rx: 0.086, rz: 0.1, z: -0.004 }, { y: 0.2, rx: 0.086, rz: 0.1, z: -0.006 }, { y: 0.238, rx: 0.074, rz: 0.086, z: -0.008 }, { y: 0.25, rx: 0.03, rz: 0.04, z: -0.008 }], 12);
    g.rbox(L.cloth, 0.13, 0.008, 0.075, 0, 0.158, 0.118, 0.14); g.box(L.accent === undefined ? 0x8a8a8a : L.accent, 0.03, 0.02, 0.004, 0, 0.2, 0.097);
  } else if (kind === 'boonie') {
    g.loft(L.cloth, [{ y: 0.16, rx: 0.088, rz: 0.1 }, { y: 0.215, rx: 0.084, rz: 0.096 }, { y: 0.24, rx: 0.05, rz: 0.06 }], 12);
    g.loft(L.cloth, [{ y: 0.15, rx: 0.165, rz: 0.175 }, { y: 0.166, rx: 0.09, rz: 0.102 }], 14); g.loft(shade(L.cloth, 0.7), [{ y: 0.17, rx: 0.09, rz: 0.103 }, { y: 0.182, rx: 0.089, rz: 0.102 }], 12, null, false, false);
    for (let i = 0; i < 9; i++) g.box(mix(L.cloth, 0x55602a, 0.6), 0.014, 0.04, 0.006, Math.cos(i * 0.7) * 0.15, 0.145 - (i % 3) * 0.012, Math.sin(i * 0.7) * 0.16, 0.2, i, 0.3);
  } else if (kind === 'beret') {
    g.loft(L.accent === undefined ? 0x6a1410 : shade(L.accent, 0.7), [{ y: 0.172, rx: 0.088, rz: 0.1 }, { y: 0.205, rx: 0.105, rz: 0.11, x: 0.012 }, { y: 0.235, rx: 0.09, rz: 0.095, x: 0.03 }, { y: 0.246, rx: 0.03, rz: 0.03, x: 0.035 }], 12);
    g.loft(D, [{ y: 0.165, rx: 0.087, rz: 0.099 }, { y: 0.178, rx: 0.088, rz: 0.1 }], 12, null, false, false); g.cyl(0xc9a23a, 0.012, 0.012, 0.004, -0.045, 0.2, 0.09, Math.PI / 2, 0, 0, 8);
  } else if (kind === 'heavy') {
    g.loft(H, [{ y: -0.02, rx: 0.098, rz: 0.11 }, { y: 0.06, rx: 0.108, rz: 0.124 }, { y: 0.16, rx: 0.112, rz: 0.128 }, { y: 0.225, rx: 0.1, rz: 0.115 }, { y: 0.268, rx: 0.07, rz: 0.08 }, { y: 0.285, rx: 0.025, rz: 0.03 }], 14);
    g.rbox(0x0a1016, 0.15, 0.062, 0.03, 0, 0.128, 0.112, 0, 0, 0, 0.5); g.rbox(shade(H, 0.7), 0.17, 0.02, 0.05, 0, 0.17, 0.105); g.rbox(shade(H, 0.7), 0.1, 0.06, 0.04, 0, 0.045, 0.108);
    for (let i = 0; i < 4; i++) g.box(D, 0.012, 0.03, 0.006, -0.03 + i * 0.02, 0.045, 0.13); for (const s of [-1, 1]) g.cyl(D, 0.03, 0.03, 0.024, s * 0.112, 0.1, 0.0, 0, 0, Math.PI / 2, 10);
    g.loft(shade(H, 0.8), [{ y: -0.06, rx: 0.12, rz: 0.125, z: -0.01 }, { y: -0.01, rx: 0.1, rz: 0.112 }], 12, null, false, false);
  } else if (kind === 'mask') {
    g.dome(0x5a1612, 0.086, 0.07, 0.1, 0, 0.17, -0.004); g.box(0x5a1612, 0.03, 0.05, 0.004, 0, 0.14, -0.1, 0.2);
    g.rbox(0xcfc8b4, 0.125, 0.165, 0.022, 0, 0.1, 0.092, 0, 0, 0, 0.6); g.rbox(0x0a0a0a, 0.034, 0.02, 0.008, 0.03, 0.128, 0.101); g.rbox(0x0a0a0a, 0.034, 0.02, 0.008, -0.03, 0.128, 0.101);
    for (let i = 0; i < 3; i++) for (const s of [-1, 0, 1]) g.cyl(0x0a0a0a, 0.005, 0.005, 0.006, s * 0.018, 0.075 - i * 0.02, 0.103, Math.PI / 2, 0, 0, 6);
    g.box(0x7a1c14, 0.008, 0.08, 0.004, 0.035, 0.14, 0.104, 0, 0, 0.3); g.loft(D, [{ y: 0.09, rx: 0.084, rz: 0.098 }, { y: 0.105, rx: 0.084, rz: 0.098 }], 12, null, false, false);
  } else if (kind === 'crest') {
    g.loft(0x26262a, [{ y: 0.02, rx: 0.094, rz: 0.108 }, { y: 0.12, rx: 0.104, rz: 0.12 }, { y: 0.2, rx: 0.098, rz: 0.113 }, { y: 0.25, rx: 0.074, rz: 0.088 }, { y: 0.275, rx: 0.03, rz: 0.036 }], 14);
    g.profile(0x9a1a12, [[-0.11, 0.22], [-0.06, 0.34], [0.03, 0.37], [0.1, 0.33], [0.115, 0.24], [0.06, 0.27], [-0.04, 0.26]], 0.014, 0, 0, 0, 0.003);
    g.rbox(0xd9d2c0, 0.12, 0.14, 0.022, 0, 0.1, 0.106, 0, 0, 0, 0.5); g.rbox(0x050505, 0.036, 0.03, 0.01, 0.03, 0.125, 0.114); g.rbox(0x050505, 0.036, 0.03, 0.01, -0.03, 0.125, 0.114); g.box(0x050505, 0.012, 0.022, 0.01, 0, 0.088, 0.116);
    for (let i = 0; i < 5; i++) g.box(0x050505, 0.004, 0.026, 0.008, -0.03 + i * 0.015, 0.05, 0.116); for (const s of [-1, 1]) g.cone(0xd9d2c0, 0.016, 0.09, s * 0.1, 0.22, 0.02, 0, 0, s * -0.7, 6);
  } else if (kind === 'hood') {
    g.loft(L.cloth, [{ y: -0.03, rx: 0.115, rz: 0.11, z: -0.02 }, { y: 0.08, rx: 0.105, rz: 0.118, z: -0.014 }, { y: 0.18, rx: 0.1, rz: 0.118, z: -0.012 }, { y: 0.245, rx: 0.075, rz: 0.095, z: -0.02 }, { y: 0.27, rx: 0.03, rz: 0.05, z: -0.03 }], 12);
    g.rbox(shade(L.cloth, 0.85), 0.17, 0.03, 0.06, 0, 0.2, 0.09, 0.3);
  }
  return g.count ? g.build(10) : null;
}

function buildParts(type, L, v, rs) {
  const K = KIT[type] || KIT.guard, B = K.bulk || 1;
  const skin = SKIN[Math.floor(rs() * SKIN.length)], hair = HAIR[Math.floor(rs() * HAIR.length)];
  const cloth = L.cloth, pants = shade(L.cloth, 0.8), vest = L.armor, gear = L.gear || mix(L.armor, 0x6e6248, 0.55), boot = 0x1f1a15, D = 0x17181a, glove = 0x26251f;
  const acc = L.accent === undefined ? 0x8a8a8a : L.accent, strap = shade(gear, 0.6);
  const helm = K.helm[v], pack = K.pack[v], rolled = K.rolled || (v === 1 && !K.vest2), bare = !!K.bare;
  const g = {}; for (const k of ['hips', 'torso', 'head', 'upL', 'upR', 'foL', 'foR', 'thL', 'thR', 'shL', 'shR']) g[k] = new GB(1);

  // ---- hips
  let b = g.hips;
  b.loft(pants, [{ y: -0.14, rx: 0.155 * B, rz: 0.112 * B, e: 3 }, { y: -0.03, rx: 0.172 * B, rz: 0.126 * B, e: 3 }, { y: 0.1, rx: 0.156 * B, rz: 0.112 * B, e: 3 }], 12);
  b.loft(D, [{ y: 0.05, rx: 0.164 * B, rz: 0.12 * B, e: 3 }, { y: 0.095, rx: 0.161 * B, rz: 0.117 * B, e: 3 }], 12, null, false, false); b.rbox(0x8c8f96, 0.04, 0.034, 0.012, 0, 0.072, 0.118 * B);
  if (!K.civilian) { b.rbox(gear, 0.06, 0.085, 0.04, -0.15 * B, 0.03, 0.05); b.rbox(gear, 0.05, 0.07, 0.04, 0.155 * B, 0.03, -0.03); b.rbox(gear, 0.1, 0.09, 0.05, 0.06, 0.02, -0.13 * B); b.cyl(0x39402c, 0.034, 0.034, 0.1, -0.09, 0.02, -0.125 * B, 0, 0, 0, 10); b.cyl(D, 0.014, 0.018, 0.02, -0.09, 0.08, -0.125 * B, 0, 0, 0, 8); }
  if (K.apron) b.rbox(K.civilian ? 0x6b5a3c : 0x3a2a1c, 0.26 * B, 0.3, 0.012, 0, -0.1, 0.122 * B, 0.06);
  if (K.vest === 2) b.rbox(vest, 0.15, 0.13, 0.03, 0, -0.07, 0.125 * B, 0.12);

  // ---- torso
  b = g.torso; const top = bare ? skin : cloth;
  b.loft(top, [{ y: 0, rx: 0.15 * B, rz: 0.105 * B, e: 2.8 }, { y: 0.14, rx: 0.158 * B, rz: 0.112 * B, e: 2.8 }, { y: 0.3, rx: 0.186 * B, rz: 0.126 * B, z: 0.006, e: 2.6 }, { y: 0.42, rx: 0.2 * B, rz: 0.12 * B, e: 2.6 }, { y: 0.49, rx: 0.165 * B, rz: 0.1 * B }, { y: 0.535, rx: 0.07, rz: 0.066 }], 14);
  for (const s of [-1, 1]) b.sph(top, 0.068 * B, 0.062 * B, 0.07 * B, s * RIG.shX, RIG.shY, 0, 10);
  b.cyl(skin, 0.047, 0.052, 0.09, 0, 0.565, -0.002, 0, 0, 0, 10);
  if (!bare) b.torus(shade(cloth, 0.85), 0.06, 0.014, 0, 0.535, 0, Math.PI / 2, 0, 0);
  if (K.vest) {
    const vz = 0.118 * B, heavy = K.vest === 2, vc = vest;
    b.rbox(vc, 0.3 * B, heavy ? 0.36 : 0.3, 0.055, 0, 0.3, vz, -0.05, 0, 0, 0.35); b.rbox(vc, 0.3 * B, heavy ? 0.38 : 0.32, 0.05, 0, 0.3, -vz, 0.04, 0, 0, 0.35);
    b.loft(shade(vc, 0.85), [{ y: 0.12, rx: 0.17 * B, rz: 0.125 * B, e: 3 }, { y: 0.3, rx: 0.192 * B, rz: 0.132 * B, e: 3 }], 12, null, false, false);
    for (const s of [-1, 1]) { b.rbox(strap, 0.055, 0.02, 0.26, s * 0.115, 0.5, 0, 0, 0, 0, 0.4); b.rbox(strap, 0.02, 0.12, 0.02, s * 0.185 * B, 0.21, 0.0); }
    for (let i = 0; i < 3; i++) { const x = (-0.088 + i * 0.088) * B; b.rbox(gear, 0.074, 0.125, 0.042, x, 0.2, vz + 0.045, -0.04); b.rbox(shade(gear, 0.75), 0.076, 0.03, 0.044, x, 0.255, vz + 0.046, -0.04); b.box(D, 0.05, 0.02, 0.022, x, 0.272, vz + 0.04); b.box(shade(gear, 0.6), 0.02, 0.014, 0.004, x, 0.238, vz + 0.068); }
    b.rbox(gear, 0.11, 0.065, 0.024, 0.06, 0.39, vz + 0.035); b.box(acc, 0.055, 0.032, 0.004, -0.075, 0.4, vz + 0.03); b.box(0xd8d8d0, 0.03, 0.006, 0.005, -0.075, 0.4, vz + 0.0315);
    b.rbox(D, 0.046, 0.11, 0.032, 0.135 * B, 0.42, vz + 0.02); b.tube(D, 0.003, 0.002, 0.15 * B, 0.47, vz + 0.02, 0.17 * B, 0.66, vz - 0.02, 5); b.rbox(D, 0.02, 0.03, 0.02, -0.12, 0.47, vz + 0.02);
    b.rbox(strap, 0.1, 0.02, 0.02, 0, 0.46, -vz - 0.03); for (let i = 0; i < 3; i++) b.box(strap, 0.26 * B, 0.01, 0.004, 0, 0.2 + i * 0.045, -vz - 0.026);
    if (heavy) { b.loft(vc, [{ y: 0.5, rx: 0.1, rz: 0.1 }, { y: 0.58, rx: 0.085, rz: 0.09 }], 12, null, false, false); b.rbox(shade(vc, 0.8), 0.2, 0.1, 0.03, 0, 0.42, vz + 0.035); for (const s of [-1, 1]) b.rbox(vc, 0.04, 0.2, 0.2, s * 0.2 * B, 0.24, 0); }
  } else if (!K.civilian && !bare) {
    b.tube(strap, 0.014, 0.014, -0.15, 0.5, 0.06, 0.14, 0.06, 0.1, 6); b.tube(strap, 0.014, 0.014, -0.15, 0.5, -0.06, 0.14, 0.06, -0.1, 6);
    b.rbox(gear, 0.07, 0.1, 0.04, 0.0, 0.26, 0.135); b.rbox(gear, 0.07, 0.1, 0.04, 0.085, 0.2, 0.125); b.box(acc, 0.05, 0.03, 0.004, -0.08, 0.4, 0.121);
  }
  if (bare) { for (const s of [-1, 1]) b.tube(0x3a2a1c, 0.016, 0.016, s * 0.1, 0.5, 0.09, s * 0.1, 0.12, 0.11, 6); b.rbox(0x3a2a1c, 0.26 * B, 0.2, 0.014, 0, 0.14, 0.12 * B, -0.04); b.sph(skin, 0.09, 0.05, 0.04, 0.085, 0.36, 0.1, 8); b.sph(skin, 0.09, 0.05, 0.04, -0.085, 0.36, 0.1, 8); }
  if (K.civilian) { b.rbox(0x6b5a3c, 0.24, 0.24, 0.012, 0, 0.2, 0.118, -0.04); b.tube(0x6b5a3c, 0.01, 0.01, 0.07, 0.32, 0.12, 0.05, 0.53, 0.02, 5); b.tube(0x6b5a3c, 0.01, 0.01, -0.07, 0.32, 0.12, -0.05, 0.53, 0.02, 5); }
  if (pack) {
    const pz = -(0.118 * B + (K.vest ? 0.11 : 0.075));
    b.rbox(gear, 0.27, 0.34, 0.14, 0, 0.29, pz, 0.03, 0, 0, 0.3); b.rbox(shade(gear, 0.8), 0.275, 0.09, 0.145, 0, 0.44, pz, 0.03, 0, 0, 0.4); b.rbox(shade(gear, 0.85), 0.2, 0.14, 0.05, 0, 0.22, pz - 0.085);
    for (const s of [-1, 1]) { b.rbox(shade(gear, 0.85), 0.05, 0.16, 0.09, s * 0.155, 0.22, pz); b.box(strap, 0.022, 0.3, 0.005, s * 0.07, 0.3, pz - 0.071); }
    b.cyl(mix(cloth, 0x55603a, 0.5), 0.05, 0.05, 0.3, 0, 0.52, pz + 0.01, 0, 0, Math.PI / 2, 10); b.box(strap, 0.02, 0.11, 0.11, 0.09, 0.52, pz + 0.01); b.box(strap, 0.02, 0.11, 0.11, -0.09, 0.52, pz + 0.01);
  }
  if (K.satchel) { b.rbox(0x5a4a2a, 0.16, 0.14, 0.07, -0.19, 0.08, 0.02, 0, 0, 0.1, 0.3); b.tube(strap, 0.012, 0.012, -0.17, 0.15, 0.03, 0.12, 0.5, 0.02, 6); b.cyl(0x8a1a12, 0.02, 0.02, 0.1, -0.19, 0.17, 0.02, 0, 0, Math.PI / 2, 8); }
  if (K.cloak) { b.loft(mix(cloth, 0x4a5530, 0.5), [{ y: 0.05, rx: 0.2, rz: 0.15, z: -0.03 }, { y: 0.3, rx: 0.215, rz: 0.15, z: -0.02 }, { y: 0.5, rx: 0.2, rz: 0.125, z: -0.01 }, { y: 0.56, rx: 0.1, rz: 0.09 }], 12, null, false, false); for (let i = 0; i < 16; i++) b.box(mix(cloth, 0x55602a, 0.7), 0.03, 0.07, 0.008, Math.cos(i * 1.9) * 0.2, 0.12 + (i % 5) * 0.08, Math.sin(i * 1.9) * 0.14 - 0.02, 0.3, i, 0.2); }
  if (K.cape) { b.rbox(0x5a100c, 0.46, 0.86, 0.02, 0, 0.06, -0.19, 0.1, 0, 0, 0.2); b.rbox(0x7a1612, 0.48, 0.06, 0.06, 0, 0.5, -0.12); for (const s of [-1, 1]) b.cyl(0xc9a23a, 0.022, 0.022, 0.012, s * 0.17, 0.5, -0.08, Math.PI / 2, 0, 0, 8); }

  // ---- head
  b = g.head; const masked = (type === 'sentry' && v === 1) || (L.masked && v === 2);
  b.loft(skin, [{ y: 0.0, rx: 0.045, rz: 0.05 }, { y: 0.035, rx: 0.062, rz: 0.07, z: 0.012 }, { y: 0.08, rx: 0.074, rz: 0.086, z: 0.008 }, { y: 0.13, rx: 0.079, rz: 0.093 }, { y: 0.185, rx: 0.076, rz: 0.09, z: -0.004 }, { y: 0.225, rx: 0.058, rz: 0.07, z: -0.006 }, { y: 0.244, rx: 0.028, rz: 0.034, z: -0.006 }], 14);
  b.sph(skin, 0.04, 0.03, 0.034, 0, 0.032, 0.062, 8); b.box(skin, 0.022, 0.042, 0.028, 0, 0.103, 0.094, -0.32); b.sph(skin, 0.014, 0.011, 0.013, 0, 0.086, 0.104, 6);
  b.rbox(skin, 0.112, 0.016, 0.022, 0, 0.142, 0.085); for (const s of [-1, 1]) { b.sph(0xe8e4dc, 0.012, 0.0075, 0.006, s * 0.031, 0.125, 0.085, 6); b.sph(0x1a1410, 0.0058, 0.0058, 0.004, s * 0.031, 0.125, 0.089, 6); b.box(hair, 0.03, 0.006, 0.008, s * 0.031, 0.143, 0.094, 0, 0, s * -0.12); b.sph(skin, 0.011, 0.024, 0.016, s * 0.079, 0.118, -0.004, 6); }
  b.box(shade(skin, 0.62), 0.04, 0.005, 0.006, 0, 0.062, 0.089);
  if (helm === 'none' || helm === 'cap' || helm === 'beret') { b.dome(hair, 0.081, 0.062, 0.095, 0, 0.185, -0.006); b.box(hair, 0.15, 0.07, 0.06, 0, 0.15, -0.06); }
  if (v === 1 && !K.civilian && !masked) { b.loft(hair, [{ y: 0.0, rx: 0.05, rz: 0.054, z: 0.006 }, { y: 0.04, rx: 0.068, rz: 0.075, z: 0.016 }, { y: 0.075, rx: 0.076, rz: 0.08, z: 0.012 }], 12, null, false, true); }
  if (masked || v === 2 && !K.civilian) b.loft(masked ? D : mix(cloth, 0x55503a, 0.5), [{ y: -0.03, rx: 0.07, rz: 0.07 }, { y: 0.02, rx: 0.07, rz: 0.078, z: 0.012 }, { y: 0.085, rx: 0.08, rz: 0.094, z: 0.01 }, { y: masked ? 0.112 : 0.1, rx: 0.082, rz: 0.097, z: 0.006 }], 12, null, false, false);
  if (helm === 'combat' || helm === 'heavy' || helm === 'crest') for (const s of [-1, 1]) { b.tube(D, 0.004, 0.004, s * 0.078, 0.14, 0.01, s * 0.05, 0.02, 0.06, 5); b.tube(D, 0.004, 0.004, s * 0.078, 0.14, -0.03, s * 0.05, 0.02, 0.06, 5); }
  if (K.headset) { for (const s of [-1, 1]) b.cyl(D, 0.03, 0.03, 0.03, s * 0.088, 0.118, -0.004, 0, 0, Math.PI / 2, 10); b.tube(D, 0.003, 0.003, 0.09, 0.11, 0.01, 0.045, 0.062, 0.09, 5); b.sph(D, 0.008, 0.008, 0.008, 0.045, 0.062, 0.09, 6); }
  if (K.goggles) { b.loft(D, [{ y: 0.112, rx: 0.081, rz: 0.095 }, { y: 0.138, rx: 0.081, rz: 0.095 }], 12, null, false, false); for (const s of [-1, 1]) { b.cyl(0x2a2c30, 0.026, 0.026, 0.03, s * 0.032, 0.125, 0.09, Math.PI / 2, 0, 0, 10); b.cyl(0x3a2a10, 0.021, 0.021, 0.004, s * 0.032, 0.125, 0.106, Math.PI / 2, 0, 0, 10); } }

  // ---- arms
  for (const s of [1, -1]) {
    const up = s > 0 ? g.upL : g.upR, fo = s > 0 ? g.foL : g.foR, armTop = bare ? skin : cloth, r = B > 1.1 ? 1.25 : 1;
    up.limb(armTop, 0.06 * r, 0.05 * r, 0, 0, 0, 0, -RIG.upper, 0, 10);
    if (!bare) { up.box(acc, 0.005, 0.06, 0.055, s * 0.058 * r, -0.1, 0); up.box(0xd8d8d0, 0.006, 0.012, 0.03, s * 0.058 * r, -0.1, 0); up.rbox(shade(cloth, 0.85), 0.012, 0.08, 0.07, s * 0.052 * r, -0.2, 0); }
    if (K.vest === 2 || type === 'boss') { up.dome(vest, 0.085, 0.07, 0.09, s * 0.01, -0.015, 0, 0, 0, s * -0.25); up.rbox(shade(vest, 0.8), 0.02, 0.09, 0.12, s * 0.07, -0.08, 0); }
    if (bare) up.torus(0x3a2a1c, 0.058 * r, 0.008, 0, -0.16, 0, Math.PI / 2, 0, 0);
    const lower = (bare || rolled) ? skin : cloth;
    fo.limb(lower, 0.05 * r, 0.038 * r, 0, 0, 0, 0, -0.245, 0, 10);
    if (rolled && !bare) fo.torus(cloth, 0.05, 0.012, 0, -0.03, 0, Math.PI / 2, 0, 0);
    if (K.pads) fo.rbox(shade(vest, 0.8), 0.075, 0.09, 0.03, 0, -0.01, -0.045 * r, 0.1, 0, 0, 0.5);
    if (bare) fo.loft(0x3a2a1c, [{ y: -0.2, rx: 0.045, rz: 0.045 }, { y: -0.1, rx: 0.05 * r, rz: 0.05 * r }], 10, null, false, false);
    // gloved hand with a curled fist and thumb
    const hc = K.civilian ? skin : glove;
    fo.loft(hc, [{ y: -0.235, rx: 0.04, rz: 0.04 }, { y: -0.262, rx: 0.039, rz: 0.03 }], 10, null, false, false);
    fo.rbox(hc, 0.078, 0.088, 0.036, 0, -0.302, 0.006, 0, 0, 0, 0.5);
    for (let i = 0; i < 4; i++) { const x = -0.028 + i * 0.019; fo.tube(hc, 0.0105, 0.0095, x, -0.338, 0.008, x, -0.372, 0.031, 5); fo.tube(hc, 0.0095, 0.009, x, -0.372, 0.031, x, -0.35, 0.048, 5); }
    fo.tube(hc, 0.012, 0.0105, s * -0.036, -0.282, 0.014, s * -0.05, -0.322, 0.036, 5); fo.tube(hc, 0.0105, 0.0095, s * -0.05, -0.322, 0.036, s * -0.036, -0.342, 0.05, 5);
    if (!K.civilian) for (let i = 0; i < 4; i++) fo.rbox(0x17181a, 0.015, 0.012, 0.008, -0.028 + i * 0.019, -0.338, -0.014);
    if (s > 0 && !K.civilian) { fo.rbox(0x16181a, 0.034, 0.012, 0.034, 0, -0.232, -0.04); fo.cyl(0x0c1418, 0.012, 0.012, 0.004, 0, -0.232, -0.048, Math.PI / 2, 0, 0, 8); }
  }
  // ---- legs
  for (const s of [1, -1]) {
    const th = s > 0 ? g.thL : g.thR, sh = s > 0 ? g.shL : g.shR;
    th.limb(pants, 0.09 * B, 0.068 * B, 0, 0, 0, 0, -RIG.thigh, 0, 10);
    if (!K.civilian) { th.rbox(shade(pants, 0.9), 0.035, 0.14, 0.11, s * 0.082 * B, -0.2, 0.0, 0, 0, 0, 0.4); th.box(shade(pants, 0.75), 0.037, 0.03, 0.112, s * 0.082 * B, -0.145, 0.0); }
    if (s < 0 && !K.civilian) { th.rbox(D, 0.036, 0.16, 0.085, s * 0.105 * B, -0.17, 0.01, 0, 0, 0, 0.4); th.rbox(0x25272a, 0.026, 0.06, 0.035, s * 0.108 * B, -0.07, -0.01, 0.25); th.torus(D, 0.086 * B, 0.008, 0, -0.14, 0, Math.PI / 2, 0, 0); th.torus(D, 0.08 * B, 0.008, 0, -0.23, 0, Math.PI / 2, 0, 0); }
    sh.limb(pants, 0.066 * B, 0.05 * B, 0, 0, 0, 0, -0.33, 0, 10);
    if (K.pads) { sh.rbox(shade(vest, 0.75), 0.1, 0.12, 0.05, 0, -0.015, 0.052 * B, -0.1, 0, 0, 0.5); sh.rbox(shade(vest, 0.6), 0.07, 0.07, 0.02, 0, -0.01, 0.075 * B, -0.1); sh.torus(D, 0.066 * B, 0.007, 0, -0.05, 0, Math.PI / 2, 0, 0); }
    // boot: shaft, foot, toe cap, sole with heel, laces
    sh.loft(boot, [{ y: -0.43, rx: 0.052, rz: 0.062, z: 0.004 }, { y: -0.36, rx: 0.056, rz: 0.062 }, { y: -0.28, rx: 0.058, rz: 0.06 }], 10, null, true, false);
    sh.loft(boot, [{ y: -0.455, rx: 0.052, rz: 0.13, z: 0.05, e: 3 }, { y: -0.415, rx: 0.05, rz: 0.12, z: 0.045, e: 3 }, { y: -0.385, rx: 0.042, rz: 0.075, z: 0.012 }], 10);
    sh.sph(shade(boot, 1.25), 0.05, 0.034, 0.05, 0, -0.432, 0.135, 8); sh.rbox(0x0d0d0d, 0.106, 0.024, 0.275, 0, -0.462, 0.05, 0, 0, 0, 0.4); sh.box(0x0d0d0d, 0.1, 0.014, 0.085, 0, -0.474, -0.04);
    for (let i = 0; i < 4; i++) sh.box(0x3a3229, 0.05, 0.004, 0.006, 0, -0.39 + i * 0.027, 0.058 - i * 0.012, -0.6);
    sh.torus(shade(pants, 0.8), 0.058, 0.01, 0, -0.275, 0, Math.PI / 2, 0, 0);
  }
  const out = {}; for (const k in g) out[k] = g[k].build(10);
  return { geo: out, helmGeo: helmetGeo(helm, L), helm, K, skin };
}

const partCache = new Map();
export function buildSoldier(type, look, variant, seed) {
  const key = type + '|' + look.cloth + '|' + look.armor + '|' + (look.accent || 0) + '|' + variant;
  let parts = partCache.get(key);
  if (!parts) { let s = (seed >>> 0) || 7; const rs = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; parts = buildParts(type, look, variant, rs); partCache.set(key, parts); }
  const M = modelMats(), mat = M.cloth, P = { type, kit: parts.K, helmKind: parts.helm };
  const bone = (geoKey, parent, x, y, z) => { const b = new THREE.Group(); b.position.set(x, y, z); if (geoKey) { const m = new THREE.Mesh(parts.geo[geoKey], mat); m.castShadow = true; m.receiveShadow = true; b.add(m); b.userData.mesh = m; } parent.add(b); return b; };
  P.root = new THREE.Group();
  P.hips = bone('hips', P.root, 0, RIG.hipsY, 0);
  P.torso = bone('torso', P.hips, 0, RIG.torsoY, 0);
  P.head = bone('head', P.torso, 0, RIG.neckY, 0);
  if (parts.helmGeo) { P.helmet = new THREE.Mesh(parts.helmGeo, mat); P.helmet.castShadow = true; P.helmet.receiveShadow = true; P.head.add(P.helmet); }
  P.upL = bone('upL', P.torso, RIG.shX, RIG.shY, 0); P.foL = bone('foL', P.upL, 0, -RIG.upper, 0);
  P.upR = bone('upR', P.torso, -RIG.shX, RIG.shY, 0); P.foR = bone('foR', P.upR, 0, -RIG.upper, 0);
  P.thL = bone('thL', P.hips, RIG.hipX, RIG.hipY, 0); P.shL = bone('shL', P.thL, 0, -RIG.thigh, 0);
  P.thR = bone('thR', P.hips, -RIG.hipX, RIG.hipY, 0); P.shR = bone('shR', P.thR, 0, -RIG.thigh, 0);
  // weapon: built muzzle-forward along -Z, so spin it to face +Z; grip points are mirrored the same way
  P.aim = new THREE.Group(); P.aim.position.set(-0.03, 0.42, 0.06); P.torso.add(P.aim);
  const gk = parts.K.gun;
  if (gk) {
    const gun = makeGun(gk, false); P.gunKind = gk; P.gun = new THREE.Group(); gun.group.rotation.y = Math.PI; P.gun.add(gun.group); P.aim.add(P.gun);
    const p = gun.pts; P.grip = new THREE.Vector3(-p.grip[0], p.grip[1] - 0.02, -p.grip[2]); P.fore = new THREE.Vector3(-p.fore[0], p.fore[1] - 0.02, Math.min(0.2, -p.fore[2])); P.muzzle = new THREE.Vector3(-p.muzzle[0], p.muzzle[1], -p.muzzle[2]); P.oneHand = !!p.oneHand;
    P.butt = new THREE.Vector3(0, p.butt[1], -p.butt[2]);
  }
  if (type === 'brute') { const h = makeGun('sledge', false); P.hammer = new THREE.Group(); h.group.rotation.set(0.47 + Math.PI / 2, 0, 0); h.group.position.set(0, -0.3, 0.02); h.group.scale.setScalar(1.25); P.hammer.add(h.group); P.foR.add(P.hammer); }
  if (type === 'boss') { const r = makeGun('rocket', false); r.group.rotation.set(0.5, Math.PI, 0.9); r.group.position.set(0.1, 0.36, -0.24); P.torso.add(r.group); }
  P.bones = [P.hips, P.torso, P.head, P.upL, P.foL, P.upR, P.foR, P.thL, P.shL, P.thR, P.shR];
  return P;
}

// ---- sentry turret --------------------------------------------------------------------------
let turretGeo = null;
export function buildTurret() {
  if (!turretGeo) {
    const base = new GB(1), sw = new GB(1), head = new GB(1), M0 = 0x3a3d42, BR = 0x8a6a2a, D = 0x17181a;
    base.cyl(M0, 0.2, 0.3, 0.08, 0, 0.04, 0, 0, 0, 0, 12); base.cyl(D, 0.1, 0.12, 0.14, 0, 0.14, 0, 0, 0, 0, 10);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; base.tube(M0, 0.024, 0.018, Math.cos(a) * 0.08, 0.14, Math.sin(a) * 0.08, Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36, 6); base.rbox(D, 0.09, 0.03, 0.09, Math.cos(a) * 0.37, 0.015, Math.sin(a) * 0.37); }
    sw.cyl(BR, 0.17, 0.2, 0.07, 0, 0.0, 0, 0, 0, 0, 14); for (let i = 0; i < 10; i++) sw.box(D, 0.02, 0.03, 0.02, Math.cos(i * 0.628) * 0.195, 0, Math.sin(i * 0.628) * 0.195, 0, -i * 0.628, 0);
    for (const s of [-1, 1]) sw.rbox(M0, 0.04, 0.22, 0.14, s * 0.19, 0.13, 0);
    head.rbox(M0, 0.32, 0.22, 0.4, 0, 0.02, 0, 0, 0, 0, 0.3); head.rbox(BR, 0.34, 0.05, 0.22, 0, 0.14, -0.06); head.rbox(M0, 0.44, 0.3, 0.03, 0, 0.03, 0.2); head.box(D, 0.2, 0.1, 0.034, 0, 0.02, 0.2);
    for (const s of [-1, 1]) { head.cylZ(M0, 0.034, 0.34, s * 0.08, 0.02, 0.39, 10); for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) head.box(D, 0.014, 0.003, 0.02, s * 0.08 + Math.cos(k * 1.57 + 0.78) * 0.034, 0.02 + Math.sin(k * 1.57 + 0.78) * 0.034, 0.27 + i * 0.055, 0, 0, k * 1.57 + 0.78 + 1.57); head.cylZ(0x666b73, 0.016, 0.2, s * 0.08, 0.02, 0.62, 8); head.cylZ(D, 0.022, 0.04, s * 0.08, 0.02, 0.72, 8); }
    head.rbox(0x4c543b, 0.14, 0.16, 0.2, -0.24, -0.02, -0.03, 0, 0, 0, 0.3); head.box(BR, 0.04, 0.03, 0.14, -0.17, 0.05, 0.02); head.cyl(D, 0.03, 0.03, 0.06, 0.1, 0.17, 0.1, 0, 0, 0, 10); head.cyl(D, 0.006, 0.004, 0.22, -0.12, 0.26, -0.14, 0, 0, 0.1, 5);
    turretGeo = { base: base.build(6), sw: sw.build(6), head: head.build(6) };
  }
  const M = modelMats(), root = new THREE.Group(), P = { root };
  const mk = (geo, parent) => { const m = new THREE.Mesh(geo, M.metal); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  mk(turretGeo.base, root);
  P.swivel = new THREE.Group(); P.swivel.position.y = 0.24; root.add(P.swivel); mk(turretGeo.sw, P.swivel);
  P.aim = new THREE.Group(); P.aim.position.y = 0.2; P.swivel.add(P.aim); mk(turretGeo.head, P.aim);
  P.eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3018, toneMapped: false })); P.eye.position.set(0.1, 0.17, 0.134); P.aim.add(P.eye);
  return P;
}
