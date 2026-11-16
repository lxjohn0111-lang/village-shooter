// Detailed weapon models, shared by the first-person view and by soldiers in the world.
// Convention: muzzle points down -Z, +Y up, +X is the shooter's right; origin sits at the top of the pistol grip.
import * as THREE from 'three';
import { GB, modelMats } from './geo.js';

const C = { park: 0x33363b, black: 0x1c1e21, steel: 0x666b73, bright: 0xa9adb5, poly: 0x25272a, rubber: 0x141414, tan: 0x8c7a58, od: 0x4c543b, wood: 0x7a4f2b, walnut: 0x5c3920, brass: 0xc09a45, red: 0x8a2018, white: 0xd8d8d0, glove: 0x2c2b27, gloveHard: 0x1a1a18, sleeve: 0x4a5236, skin: 0xc49a78, shell: 0xa82a20 };
const sets = () => ({ metal: new GB(), poly: new GB(), wood: new GB() });
const PI = Math.PI;

// ---- reusable sub-assemblies -------------------------------------------------------
function rail(g, y, z0, z1, w = 0.021) {            // picatinny: base + teeth
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  g.box(C.park, w * 0.72, 0.006, len, 0, y, zc);
  for (let z = Math.min(z0, z1) + 0.004; z < Math.max(z0, z1) - 0.003; z += 0.0105) g.box(C.park, w, 0.0045, 0.0055, 0, y + 0.005, z);
}
function redDot(p, y, z) {                           // open reflex sight with hood
  const g = p.body.metal;
  g.rbox(C.black, 0.034, 0.012, 0.05, 0, y + 0.006, z); g.box(C.black, 0.004, 0.034, 0.016, 0.016, y + 0.027, z - 0.016); g.box(C.black, 0.004, 0.034, 0.016, -0.016, y + 0.027, z - 0.016);
  g.box(C.black, 0.036, 0.004, 0.02, 0, y + 0.045, z - 0.016); g.box(C.black, 0.004, 0.02, 0.03, 0.016, y + 0.02, z + 0.006, 0.5); g.box(C.black, 0.004, 0.02, 0.03, -0.016, y + 0.02, z + 0.006, 0.5);
  g.cylX(C.park, 0.007, 0.012, 0.022, y + 0.008, z + 0.012, 8); g.box(C.bright, 0.003, 0.004, 0.006, -0.0175, y + 0.01, z + 0.008); g.box(C.bright, 0.003, 0.004, 0.006, -0.0175, y + 0.01, z + 0.018);
  g.box(C.park, 0.03, 0.006, 0.012, 0, y + 0.002, z + 0.018);
  p.glass.push({ w: 0.028, h: 0.03, x: 0, y: y + 0.027, z: z - 0.018 }); p.dot = [0, y + 0.027, z - 0.0185];
  return y + 0.027;
}
function holo(p, y, z) {                             // boxy holographic sight
  const g = p.body.metal;
  g.rbox(C.black, 0.04, 0.02, 0.07, 0, y + 0.01, z + 0.005); g.box(C.black, 0.005, 0.034, 0.04, 0.02, y + 0.035, z - 0.012); g.box(C.black, 0.005, 0.034, 0.04, -0.02, y + 0.035, z - 0.012);
  g.box(C.black, 0.045, 0.005, 0.045, 0, y + 0.054, z - 0.012); g.rbox(C.park, 0.044, 0.026, 0.028, 0, y + 0.03, z + 0.03); g.cylX(C.park, 0.008, 0.05, 0, y + 0.012, z + 0.03, 8);
  p.glass.push({ w: 0.034, h: 0.03, x: 0, y: y + 0.036, z: z - 0.03 }); p.dot = [0, y + 0.036, z - 0.0305];
  return y + 0.036;
}
function scope(p, y, z, len = 0.34) {                // variable-power scope with turrets and rings
  const g = p.body.metal, cy = y + 0.034;
  g.cylZ(C.black, 0.0165, len * 0.5, 0, cy, z, 14); g.cylZ(C.black, 0.027, 0.085, 0, cy, z - len * 0.5 + 0.02, 16, 0.0185); g.cylZ(C.black, 0.028, 0.03, 0, cy, z - len * 0.5 - 0.035, 16);
  g.cylZ(C.black, 0.0165, 0.06, 0, cy, z + len * 0.3, 14, 0.022); g.cylZ(C.black, 0.0235, 0.06, 0, cy, z + len * 0.42, 16); g.cylZ(C.rubber, 0.0255, 0.02, 0, cy, z + len * 0.5, 16);
  g.rbox(C.black, 0.04, 0.04, 0.045, 0, cy, z + 0.01); g.cyl(C.park, 0.013, 0.013, 0.022, 0, cy + 0.03, z + 0.01, 0, 0, 0, 12); g.cylX(C.park, 0.013, 0.022, 0.03, cy, z + 0.01, 12); g.cylX(C.park, 0.011, 0.016, -0.028, cy, z + 0.01, 12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.box(C.bright, 0.002, 0.004, 0.002, Math.cos(a) * 0.0125, cy + 0.04, z + 0.01 + Math.sin(a) * 0.0125); }
  for (const rz of [z - 0.055, z + 0.075]) { g.cylZ(C.park, 0.0205, 0.018, 0, cy, rz, 12); g.box(C.park, 0.03, 0.016, 0.018, 0, y + 0.008, rz); g.cylX(C.bright, 0.003, 0.046, 0, cy + 0.02, rz, 6); g.cylX(C.bright, 0.003, 0.034, 0, y + 0.004, rz, 6); }
  p.round.push({ r: 0.0245, x: 0, y: cy, z: z - len * 0.5 - 0.049 }, { r: 0.021, x: 0, y: cy, z: z + len * 0.5 + 0.009 });
  return cy;
}
function muzzleBrake(g, y, z, r = 0.013, len = 0.05) {
  g.cylZ(C.park, r, len, 0, y, z, 12); g.cylZ(C.black, r * 0.55, 0.004, 0, y, z - len / 2 - 0.001, 10); g.cylZ(C.steel, r * 1.06, 0.006, 0, y, z + len / 2, 12);
  for (let i = 0; i < 3; i++) { const zz = z - len * 0.3 + i * len * 0.28; g.box(C.black, r * 2.05, r * 0.55, len * 0.14, 0, y, zz); g.box(C.black, r * 0.5, r * 2.05, len * 0.1, 0, y, zz + len * 0.1); }
}
function pistolGrip(g, col, z = 0, rake = 1) {
  g.profile(col, [[-0.074 - z, 0.01], [-0.03 - z, 0.01], [-0.036 - z, -0.02], [-0.05 * rake - z, -0.088], [-0.094 * rake - z, -0.084], [-0.088 - z, -0.04], [-0.082 - z, -0.008]], 0.03, 0, 0, 0, 0.006);
  for (let i = 0; i < 6; i++) g.box(C.rubber, 0.0315, 0.0025, 0.03, 0, -0.022 - i * 0.01, 0.062 + z + i * 0.0032, 0.24);
  g.box(C.rubber, 0.027, 0.004, 0.04, 0, -0.087, 0.07 * rake + z + 0.002, 0.06);
}
function triggerGroup(g, z = 0) {
  g.torus(C.park, 0.024, 0.0032, 0, 0.004, z + 0.002, 0, PI / 2, PI, PI);
  g.box(C.park, 0.007, 0.004, 0.05, 0, 0.004, z + 0.002);
  g.box(C.steel, 0.006, 0.02, 0.006, 0, -0.008, z + 0.004, -0.35); g.box(C.steel, 0.006, 0.008, 0.005, 0, -0.017, z + 0.0005, 0.4);
}
function stockSkeleton(g, col, z0 = 0.105) {          // adjustable carbine stock on a buffer tube
  const m = g;
  m.profile(col, [[-z0 - 0.02, 0.072], [-z0 - 0.18, 0.076], [-z0 - 0.195, 0.07], [-z0 - 0.195, -0.04], [-z0 - 0.18, -0.048], [-z0 - 0.14, -0.012], [-z0 - 0.07, 0.03], [-z0 - 0.02, 0.034]], 0.036, 0, 0, 0, 0.005,
    [[[-z0 - 0.09, 0.036], [-z0 - 0.15, 0.002], [-z0 - 0.168, 0.01], [-z0 - 0.168, 0.05], [-z0 - 0.1, 0.05]]]);
  m.rbox(C.rubber, 0.04, 0.124, 0.014, 0, 0.016, z0 + 0.2); for (let i = 0; i < 6; i++) m.box(C.black, 0.041, 0.003, 0.015, 0, -0.03 + i * 0.019, z0 + 0.2);
  m.box(col, 0.03, 0.012, 0.09, 0, 0.082, z0 + 0.09); m.box(C.black, 0.012, 0.016, 0.03, 0, 0.026, z0 + 0.05);
}
function bipod(g, y, z, deployed = 0) {
  g.rbox(C.park, 0.03, 0.016, 0.03, 0, y, z);
  for (const s of [-1, 1]) { const ex = s * (0.03 + deployed * 0.07), ey = y - 0.02 - deployed * 0.2, ez = z - 0.2 + deployed * 0.19; g.tube(C.park, 0.006, 0.005, s * 0.014, y - 0.006, z, ex, ey, ez, 8); g.tube(C.steel, 0.0045, 0.0045, ex, ey, ez, ex + s * 0.004 * deployed, ey - 0.03 * deployed, ez - 0.04 * (1 - deployed), 6); g.rbox(C.rubber, 0.014, 0.012, 0.02, ex + s * 0.004 * deployed, ey - 0.034 * deployed, ez - 0.05 * (1 - deployed)); }
}

// ---- individual weapons ----------------------------------------------------------------
const BUILD = {
  rifle(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.046;
    // upper + lower receiver
    g.rbox(C.park, 0.042, 0.042, 0.215, 0, 0.064, -0.028, 0, 0, 0, 0.3);
    g.profile(C.park, [[-0.105, 0.044], [0.118, 0.044], [0.118, 0.0], [0.074, -0.014], [0.022, -0.014], [0.022, 0.006], [-0.02, 0.006], [-0.032, -0.004], [-0.105, 0.012]], 0.04, 0, 0, 0, 0.004);
    rail(g, 0.087, 0.075, -0.135);
    g.box(C.bright, 0.002, 0.015, 0.052, 0.0215, 0.066, -0.05); g.box(C.park, 0.003, 0.004, 0.056, 0.0225, 0.056, -0.05); g.box(C.park, 0.008, 0.014, 0.014, 0.024, 0.068, -0.012, 0, 0.5, 0);
    g.cyl(C.park, 0.006, 0.006, 0.018, 0.026, 0.07, 0.02, 0, 0, -1.1, 8); g.cylX(C.steel, 0.004, 0.044, 0, 0.028, -0.095, 8); g.cylX(C.steel, 0.004, 0.044, 0, 0.03, 0.085, 8);
    g.cylX(C.steel, 0.0055, 0.006, 0.0215, 0.022, -0.065, 8); g.box(C.steel, 0.003, 0.02, 0.01, -0.0215, 0.03, -0.055); g.box(C.steel, 0.004, 0.006, 0.02, -0.022, 0.026, 0.045, 0.5); g.cylX(C.steel, 0.005, 0.004, -0.022, 0.026, 0.055, 8);
    triggerGroup(g); pistolGrip(pl, C.poly);
    // charging handle + bolt carrier (animated)
    p.bolt.metal.box(C.black, 0.034, 0.008, 0.028, 0, 0.083, 0.088); p.bolt.metal.box(C.black, 0.012, 0.008, 0.06, 0, 0.083, 0.06); p.bolt.metal.box(C.steel, 0.0015, 0.011, 0.03, 0.0222, 0.066, -0.04);
    // magazine (animated)
    p.mag.metal.profile(C.black, [[0.03, 0.0], [0.092, 0.0], [0.099, -0.06], [0.113, -0.128], [0.06, -0.14], [0.048, -0.068]], 0.024, 0, 0, 0, 0.003);
    for (let i = 0; i < 3; i++) p.mag.metal.box(C.park, 0.0255, 0.1, 0.004, 0, -0.07, -0.062 - i * 0.012, -0.16);
    p.mag.poly.box(C.rubber, 0.028, 0.008, 0.06, 0, -0.137, -0.087, -0.2); p.mag.metal.box(C.brass, 0.01, 0.006, 0.03, 0, 0.002, -0.06);
    // free-float handguard with M-LOK slots, barrel, muzzle
    g.cylZ(C.steel, 0.03, 0.016, 0, 0.05, -0.143, 10); pl.cylZ(C.tan, 0.0285, 0.27, 0, 0.05, -0.285, 8);
    rail(g, 0.079, -0.15, -0.42);
    for (let i = 0; i < 5; i++) { const z = -0.19 - i * 0.047; for (const s of [-1, 1]) { g.box(C.black, 0.002, 0.008, 0.03, s * 0.0272, 0.05, z); g.box(C.black, 0.008, 0.002, 0.03, s * 0.019, 0.0305, z, 0, 0, s * 0.78); } g.box(C.black, 0.008, 0.002, 0.03, 0, 0.0228, z); }
    g.cylZ(C.steel, 0.0095, 0.25, 0, BY, -0.52, 10); g.cylZ(C.park, 0.014, 0.03, 0, BY, -0.3, 8); muzzleBrake(g, BY, -0.665);
    g.rbox(C.black, 0.02, 0.012, 0.026, 0, 0.09, -0.4); g.box(C.black, 0.003, 0.03, 0.012, 0.008, 0.108, -0.4); g.box(C.black, 0.003, 0.03, 0.012, -0.008, 0.108, -0.4); g.box(C.bright, 0.002, 0.024, 0.003, 0, 0.105, -0.4);
    // foregrip, weapon light
    pl.rbox(C.poly, 0.03, 0.012, 0.04, 0, 0.018, -0.3); pl.cyl(C.poly, 0.013, 0.015, 0.075, 0, -0.022, -0.3, 0.08, 0, 0, 10); for (let i = 0; i < 4; i++) pl.torus(C.rubber, 0.0145, 0.002, 0, -0.005 - i * 0.014, -0.3 + i * 0.0012, PI / 2, 0, 0);
    g.rbox(C.black, 0.024, 0.024, 0.06, 0.04, 0.05, -0.37); g.cylZ(C.park, 0.014, 0.016, 0.04, 0.05, -0.405, 10); g.box(C.park, 0.012, 0.008, 0.03, 0.03, 0.05, -0.37); p.round.push({ r: 0.011, x: 0.04, y: 0.05, z: -0.4135, lamp: true });
    // buffer tube + stock
    g.cylZ(C.park, 0.0145, 0.2, 0, 0.052, 0.2, 10); g.cylZ(C.steel, 0.019, 0.012, 0, 0.052, 0.108, 10); stockSkeleton(pl, C.poly);
    const sy = redDot(p, 0.092, -0.04);
    Object.assign(p.pts, { muzzle: [0, BY, -0.7], eject: [0.03, 0.066, -0.05], grip: [0, -0.03, 0.058], fore: [0, -0.02, -0.3], foreV: true, adsY: -sy, adsZ: -0.3, hip: [0.19, -0.185, -0.52], butt: [0, 0.03, 0.31] });
  },

  smg(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.05;
    g.rbox(C.park, 0.044, 0.062, 0.3, 0, 0.052, -0.09, 0, 0, 0, 0.3); pl.rbox(C.poly, 0.04, 0.03, 0.19, 0, 0.012, -0.05);
    rail(g, 0.086, 0.05, -0.22);
    g.box(C.bright, 0.002, 0.018, 0.05, 0.0225, 0.06, -0.07); g.box(C.park, 0.004, 0.006, 0.02, -0.024, 0.06, -0.12); g.cylX(C.steel, 0.004, 0.046, 0, 0.03, 0.03, 8); g.cylX(C.steel, 0.004, 0.046, 0, 0.03, -0.17, 8);
    triggerGroup(g); pistolGrip(pl, C.poly);
    p.bolt.metal.cylX(C.steel, 0.006, 0.03, -0.035, 0.06, -0.16, 8); p.bolt.metal.sph(C.black, 0.009, 0.009, 0.009, -0.05, 0.06, -0.16, 8);
    // long straight magazine ahead of the trigger
    p.mag.metal.profile(C.black, [[0.04, 0.0], [0.082, 0.0], [0.09, -0.2], [0.05, -0.205]], 0.026, 0, 0, 0, 0.003); for (let i = 0; i < 5; i++) p.mag.metal.box(C.park, 0.0275, 0.004, 0.036, 0, -0.04 - i * 0.034, -0.065 - i * 0.0012);
    p.mag.poly.box(C.rubber, 0.03, 0.008, 0.046, 0, -0.204, -0.07);
    pl.rbox(C.poly, 0.038, 0.04, 0.05, 0, 0.0, -0.062);
    // slim handguard, barrel, compensator
    pl.cylZ(C.poly, 0.027, 0.13, 0, BY, -0.3, 8); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.box(C.black, 0.002, 0.008, 0.026, s * 0.0258, BY, -0.262 - i * 0.038);
    g.cylZ(C.steel, 0.009, 0.1, 0, BY, -0.4, 10); g.cylZ(C.park, 0.0125, 0.02, 0, BY, -0.378, 8); muzzleBrake(g, BY, -0.47, 0.014, 0.06);
    pl.rbox(C.poly, 0.026, 0.05, 0.03, 0, 0.0, -0.3, 0.5); pl.rbox(C.poly, 0.028, 0.014, 0.05, 0, 0.022, -0.29);
    // folding wire stock
    for (const s of [-1, 1]) g.tube(C.park, 0.0048, 0.0048, s * 0.016, 0.07, 0.06, s * 0.016, 0.07, 0.27, 8); g.rbox(C.park, 0.044, 0.02, 0.02, 0, 0.07, 0.06);
    g.rbox(C.rubber, 0.044, 0.1, 0.016, 0, 0.035, 0.275); g.tube(C.park, 0.0048, 0.0048, 0, 0.07, 0.27, 0, -0.01, 0.27, 8);
    const sy = holo(p, 0.091, -0.06);
    Object.assign(p.pts, { muzzle: [0, BY, -0.51], eject: [0.03, 0.06, -0.07], grip: [0, -0.03, 0.058], fore: [0, 0.0, -0.3], foreV: true, adsY: -sy, adsZ: -0.3, hip: [0.18, -0.18, -0.5], butt: [0, 0.03, 0.28] });
  },

  shotgun(p) {
    const g = p.body.metal, w = p.body.wood, BY = 0.052;
    g.rbox(C.park, 0.046, 0.064, 0.25, 0, 0.038, -0.07, 0, 0, 0, 0.3); g.box(C.bright, 0.002, 0.022, 0.07, 0.0235, 0.046, -0.07); g.box(C.black, 0.03, 0.004, 0.09, 0, 0.004, -0.11);
    g.cylX(C.steel, 0.004, 0.048, 0, 0.03, 0.02, 8); g.cylX(C.steel, 0.004, 0.048, 0, 0.024, -0.15, 8); g.box(C.steel, 0.004, 0.008, 0.016, 0.024, 0.012, 0.02);
    triggerGroup(g, 0.01);
    // barrel + magazine tube
    g.cylZ(C.park, 0.0125, 0.62, 0, BY, -0.5, 12); g.cylZ(C.black, 0.0095, 0.004, 0, BY, -0.812, 10); g.cylZ(C.park, 0.0118, 0.46, 0, 0.022, -0.42, 12); g.cylZ(C.steel, 0.013, 0.014, 0, 0.022, -0.655, 12);
    g.rbox(C.park, 0.034, 0.05, 0.016, 0, 0.037, -0.6); g.sph(C.brass, 0.0035, 0.0035, 0.0035, 0, 0.068, -0.795, 8); g.box(C.park, 0.008, 0.004, 0.62, 0, 0.066, -0.5);
    for (let i = 0; i < 9; i++) g.box(C.black, 0.009, 0.002, 0.012, 0, 0.0685, -0.24 - i * 0.06);
    // ribbed pump (animated)
    p.pump.wood.cylZ(C.wood, 0.026, 0.17, 0, 0.026, -0.36, 12); for (let i = 0; i < 9; i++) p.pump.wood.torus(C.walnut, 0.0262, 0.0026, 0, 0.026, -0.29 - i * 0.017, 0, 0, 0);
    p.pump.metal.box(C.park, 0.006, 0.006, 0.2, 0.02, 0.03, -0.25); p.pump.metal.box(C.park, 0.006, 0.006, 0.2, -0.02, 0.03, -0.25);
    // walnut stock with pistol-grip wrist
    w.profile(C.walnut, [[-0.05, 0.062], [-0.1, 0.05], [-0.33, 0.03], [-0.335, -0.085], [-0.31, -0.092], [-0.17, -0.03], [-0.115, -0.04], [-0.085, -0.075], [-0.05, -0.068], [-0.04, -0.02], [-0.05, 0.01]], 0.04, 0, 0, 0, 0.008);
    p.body.poly.rbox(C.rubber, 0.042, 0.125, 0.018, 0, -0.03, 0.342);
    // side saddle with spare shells
    g.rbox(C.park, 0.008, 0.04, 0.13, -0.027, 0.04, -0.07); for (let i = 0; i < 5; i++) { g.cyl(C.shell, 0.0095, 0.0095, 0.05, -0.036, 0.046, -0.02 - i * 0.025, 0, 0, 0, 8); g.cyl(C.brass, 0.0098, 0.0098, 0.012, -0.036, 0.016, -0.02 - i * 0.025, 0, 0, 0, 8); }
    Object.assign(p.pts, { muzzle: [0, BY, -0.82], eject: [0.03, 0.046, -0.06], grip: [0, -0.035, 0.07], fore: [0, 0.0, -0.36], foreV: false, adsY: -0.074, adsZ: -0.28, hip: [0.19, -0.18, -0.5], butt: [0, 0, 0.35] });
  },

  sniper(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.05;
    // chassis with thumbhole stock and adjustable cheek piece
    pl.profile(C.od, [[0.36, 0.03], [0.36, 0.0], [0.12, -0.012], [0.03, -0.016], [-0.03, -0.012], [-0.07, -0.085], [-0.115, -0.08], [-0.1, -0.02], [-0.14, 0.0], [-0.3, -0.03], [-0.385, -0.05], [-0.39, 0.06], [-0.12, 0.062], [-0.06, 0.04], [0.1, 0.04]], 0.046, 0, 0, 0, 0.007,
      [[[-0.16, 0.028], [-0.29, 0.0], [-0.33, 0.004], [-0.33, 0.04], [-0.18, 0.045]]]);
    pl.rbox(C.poly, 0.04, 0.026, 0.13, 0, 0.076, 0.24); g.cyl(C.steel, 0.005, 0.005, 0.03, 0.012, 0.056, 0.2, 0, 0, 0, 6); g.cyl(C.steel, 0.005, 0.005, 0.03, 0.012, 0.056, 0.28, 0, 0, 0, 6);
    pl.rbox(C.rubber, 0.048, 0.118, 0.02, 0, 0.004, 0.398);
    // action, fluted heavy barrel, brake
    g.cylZ(C.park, 0.021, 0.26, 0, BY, -0.06, 14); g.box(C.bright, 0.002, 0.014, 0.07, 0.0205, 0.056, -0.05); rail(g, 0.074, 0.06, -0.16);
    g.cylZ(C.steel, 0.011, 0.62, 0, BY, -0.5, 12, 0.0135); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.box(C.black, 0.004, 0.003, 0.4, Math.cos(a) * 0.0125, BY + Math.sin(a) * 0.0125, -0.45, 0, 0, a + PI / 2); }
    muzzleBrake(g, BY, -0.85, 0.017, 0.075);
    triggerGroup(g, 0.01);
    // bolt (animated) + magazine (animated)
    p.bolt.metal.cylZ(C.bright, 0.0085, 0.09, 0, BY, 0.075, 10); p.bolt.metal.tube(C.bright, 0.005, 0.0045, 0.012, BY, 0.1, 0.05, BY - 0.03, 0.105, 8); p.bolt.metal.sph(C.black, 0.012, 0.012, 0.012, 0.055, BY - 0.035, 0.106, 10); p.bolt.metal.cylZ(C.park, 0.011, 0.02, 0, BY, 0.125, 10);
    p.mag.metal.profile(C.black, [[0.03, -0.012], [0.11, -0.012], [0.108, -0.075], [0.034, -0.08]], 0.03, 0, 0, 0, 0.004); p.mag.poly.box(C.rubber, 0.034, 0.008, 0.082, 0, -0.08, -0.07);
    bipod(g, 0.0, -0.33, 0);
    const sy = scope(p, 0.08, -0.05, 0.34);
    Object.assign(p.pts, { muzzle: [0, BY, -0.9], eject: [0.03, 0.056, -0.04], grip: [0, -0.035, 0.085], fore: [0, -0.012, -0.25], foreV: false, adsY: -sy, adsZ: -0.1, hip: [0.19, -0.19, -0.48], butt: [0, 0, 0.4], scopeZ: 0.13 });
  },

  lmg(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.05;
    g.rbox(C.park, 0.056, 0.085, 0.36, 0, 0.045, -0.1, 0, 0, 0, 0.25); g.rbox(C.park, 0.058, 0.02, 0.2, 0, 0.095, -0.1); g.box(C.steel, 0.06, 0.006, 0.012, 0, 0.1, 0.0); g.box(C.steel, 0.004, 0.03, 0.02, 0.03, 0.09, -0.19);
    rail(g, 0.108, -0.02, -0.18); g.box(C.bright, 0.002, 0.02, 0.06, 0.0285, 0.03, -0.1);
    for (let i = 0; i < 5; i++) g.cylX(C.steel, 0.0035, 0.06, 0, 0.012 + (i % 2) * 0.06, 0.05 - i * 0.075, 6);
    triggerGroup(g); pistolGrip(pl, C.poly);
    p.bolt.metal.box(C.steel, 0.02, 0.012, 0.03, 0.036, 0.05, -0.02); p.bolt.metal.cyl(C.black, 0.008, 0.008, 0.03, 0.05, 0.05, -0.02, 0, 0, PI / 2, 8);
    // belt box + visible belt feeding into the tray
    p.mag.poly.rbox(C.od, 0.11, 0.12, 0.13, -0.06, -0.055, -0.12, 0, 0, 0, 0.18); p.mag.metal.box(C.park, 0.112, 0.01, 0.132, -0.06, 0.006, -0.12); p.mag.metal.box(C.park, 0.03, 0.006, 0.05, -0.06, 0.014, -0.12);
    for (let i = 0; i < 7; i++) { const t = i / 6, x = -0.075 + t * 0.075, y = 0.02 + Math.sin(t * PI) * 0.03 + t * 0.06; p.mag.metal.cylZ(C.brass, 0.0052, 0.05, x, y, -0.12, 6); p.mag.metal.cylZ(0xb87333, 0.0048, 0.014, x, y, -0.152, 6, 0.002); p.mag.metal.box(C.park, 0.013, 0.004, 0.02, x, y - 0.002, -0.115, 0, 0, t * 0.6); }
    // heavy barrel with perforated shroud, carry handle, front sight, bipod
    g.cylZ(C.park, 0.024, 0.3, 0, BY, -0.43, 10); for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2 + (i % 2) * 0.5; g.box(C.black, 0.012, 0.002, 0.018, Math.cos(a) * 0.0236, BY + Math.sin(a) * 0.0236, -0.31 - i * 0.045, 0, 0, a + PI / 2); }
    g.cylZ(C.steel, 0.0125, 0.22, 0, BY, -0.69, 10); muzzleBrake(g, BY, -0.82, 0.016, 0.06);
    g.tube(C.park, 0.006, 0.006, 0.0, 0.1, -0.3, 0.03, 0.135, -0.3, 8); g.tube(C.park, 0.007, 0.007, 0.03, 0.135, -0.25, 0.03, 0.135, -0.36, 8); pl.cylZ(C.poly, 0.011, 0.07, 0.03, 0.135, -0.305, 10);
    g.rbox(C.park, 0.02, 0.02, 0.02, 0, 0.082, -0.56); g.box(C.park, 0.003, 0.04, 0.012, 0.009, 0.108, -0.56); g.box(C.park, 0.003, 0.04, 0.012, -0.009, 0.108, -0.56); g.box(C.bright, 0.002, 0.03, 0.003, 0, 0.106, -0.56);
    bipod(g, 0.02, -0.55, 0);
    pl.profile(C.poly, [[-0.08, 0.085], [-0.3, 0.08], [-0.31, -0.06], [-0.28, -0.07], [-0.2, -0.01], [-0.08, 0.0]], 0.05, 0, 0, 0, 0.007, [[[-0.13, 0.03], [-0.25, 0.0], [-0.27, 0.05], [-0.14, 0.06]]]); pl.rbox(C.rubber, 0.052, 0.14, 0.016, 0, 0.012, 0.315);
    const sy = holo(p, 0.113, -0.08);
    Object.assign(p.pts, { muzzle: [0, BY, -0.86], eject: [0.035, 0.03, -0.1], grip: [0, -0.03, 0.058], fore: [0, 0.004, -0.4], foreV: false, adsY: -sy, adsZ: -0.28, hip: [0.2, -0.2, -0.5], butt: [0, 0.01, 0.32] });
  },

  launcher(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.04;
    g.rbox(C.park, 0.05, 0.07, 0.12, 0, 0.03, 0.03); rail(g, 0.068, 0.07, -0.3); g.rbox(C.park, 0.03, 0.024, 0.34, 0, 0.068, -0.14);
    // six-chamber cylinder (animated as "mag")
    const m = p.mag.metal; m.cylZ(C.od, 0.064, 0.15, 0, BY - 0.02, -0.12, 18);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.52, x = Math.cos(a) * 0.04, y = BY - 0.02 + Math.sin(a) * 0.04; m.cylZ(C.black, 0.0185, 0.004, x, y, -0.196, 12); m.cylZ(C.brass, 0.019, 0.006, x, y, -0.043, 12); m.cylZ(C.bright, 0.006, 0.007, x, y, -0.0425, 8); m.box(C.park, 0.008, 0.004, 0.11, Math.cos(a + 0.52) * 0.064, BY - 0.02 + Math.sin(a + 0.52) * 0.064, -0.12, 0, 0, a + 0.52 + PI / 2); }
    m.cylZ(C.steel, 0.012, 0.16, 0, BY - 0.02, -0.12, 8);
    g.cylZ(C.park, 0.027, 0.26, 0, BY + 0.02, -0.33, 14); g.cylZ(C.black, 0.0215, 0.004, 0, BY + 0.02, -0.461, 14); g.cylZ(C.steel, 0.03, 0.02, 0, BY + 0.02, -0.21, 14); g.cylZ(C.steel, 0.029, 0.014, 0, BY + 0.02, -0.45, 14);
    triggerGroup(g); pistolGrip(pl, C.poly);
    pl.rbox(C.poly, 0.03, 0.012, 0.05, 0, 0.022, -0.32); pl.cyl(C.poly, 0.014, 0.016, 0.08, 0, -0.022, -0.32, 0.1, 0, 0, 10);
    g.cylZ(C.park, 0.0145, 0.19, 0, 0.05, 0.19, 10); stockSkeleton(pl, C.poly, 0.1);
    const sy = redDot(p, 0.074, -0.02);
    Object.assign(p.pts, { muzzle: [0, BY + 0.02, -0.47], eject: [0.04, 0.04, -0.1], grip: [0, -0.03, 0.058], fore: [0, -0.02, -0.32], foreV: true, adsY: -sy, adsZ: -0.28, hip: [0.19, -0.185, -0.5], butt: [0, 0.03, 0.3] });
  },

  rocket(p) {
    const g = p.body.metal, w = p.body.wood, BY = 0.07;
    g.cylZ(C.od, 0.04, 0.62, 0, BY, -0.22, 16); g.cylZ(C.od, 0.047, 0.03, 0, BY, -0.52, 16); g.cylZ(C.park, 0.043, 0.016, 0, BY, -0.3, 16); g.cylZ(C.park, 0.043, 0.016, 0, BY, 0.02, 16);
    g.cylZ(C.od, 0.04, 0.2, 0, BY, 0.2, 16, 0.064); g.cylZ(C.park, 0.066, 0.012, 0, BY, 0.3, 16); g.cylZ(C.black, 0.058, 0.004, 0, BY, 0.307, 16);
    w.cylZ(C.wood, 0.046, 0.2, 0, BY, -0.09, 14); for (let i = 0; i < 5; i++) w.torus(C.walnut, 0.0462, 0.002, 0, BY, -0.17 + i * 0.04, 0, 0, 0);
    pistolGrip(p.body.poly, C.poly, 0, 1); triggerGroup(g); g.rbox(C.park, 0.03, 0.03, 0.09, 0, 0.022, 0.03);
    w.profile(C.walnut, [[0.2, 0.03], [0.24, 0.03], [0.235, -0.07], [0.2, -0.065]], 0.03, 0, 0, 0, 0.006); g.rbox(C.park, 0.03, 0.02, 0.05, 0, 0.03, -0.22);
    // iron sights + optical sight on the left
    g.box(C.park, 0.004, 0.05, 0.012, 0, 0.13, -0.36); g.box(C.bright, 0.002, 0.012, 0.003, 0, 0.158, -0.36); g.box(C.park, 0.02, 0.04, 0.006, 0, 0.128, -0.06); g.box(C.park, 0.016, 0.01, 0.05, 0, 0.112, -0.06);
    g.rbox(C.park, 0.03, 0.05, 0.11, -0.06, 0.12, -0.12); g.cylZ(C.park, 0.018, 0.05, -0.06, 0.13, -0.2, 12); g.cylZ(C.rubber, 0.02, 0.03, -0.06, 0.13, -0.05, 12); g.box(C.park, 0.02, 0.012, 0.04, -0.035, 0.1, -0.12);
    p.round.push({ r: 0.016, x: -0.06, y: 0.13, z: -0.2255 });
    // PG-7 style warhead (animated as "mag")
    const m = p.mag.metal; m.cylZ(C.od, 0.022, 0.12, 0, BY, -0.58, 12); m.cylZ(C.od, 0.048, 0.11, 0, BY, -0.685, 14, 0.022); m.cylZ(C.od, 0.048, 0.05, 0, BY, -0.765, 14); m.cylZ(C.od, 0.012, 0.13, 0, BY, -0.855, 14, 0.048);
    m.cylZ(C.bright, 0.006, 0.03, 0, BY, -0.932, 10, 0.012); m.torus(C.park, 0.0485, 0.0025, 0, BY, -0.765, 0, 0, 0); m.torus(0xc9a23a, 0.049, 0.002, 0, BY, -0.79, 0, 0, 0);
    Object.assign(p.pts, { muzzle: [0, BY, -0.95], eject: [0, 0, 0], grip: [0, -0.03, 0.058], fore: [0, -0.025, -0.22], foreV: true, adsY: -0.146, adsZ: -0.2, adsX: 0.0, hip: [0.17, -0.2, -0.42], butt: [0, 0.07, 0.3] });
  },

  pistol(p) {
    const g = p.body.metal, pl = p.body.poly, BY = 0.046;
    // polymer frame with accessory rail
    pl.profile(C.poly, [[-0.062, 0.03], [0.118, 0.03], [0.118, 0.008], [0.05, 0.004], [0.03, -0.004], [0.022, -0.03], [-0.012, -0.03], [-0.02, -0.012], [-0.038, -0.092], [-0.085, -0.086], [-0.068, -0.01], [-0.075, 0.018]], 0.028, 0, 0, 0, 0.005, [[[0.016, -0.006], [0.016, -0.024], [-0.008, -0.024], [-0.012, -0.008]]]);
    for (let i = 0; i < 4; i++) pl.box(C.rubber, 0.0285, 0.003, 0.004, 0, 0.004, -0.07 - i * 0.011);
    for (let i = 0; i < 7; i++) pl.box(C.rubber, 0.029, 0.002, 0.026, 0, -0.025 - i * 0.009, 0.048 + i * 0.0024, 0.2);
    g.box(C.steel, 0.006, 0.018, 0.006, 0, -0.012, -0.004, -0.3); g.cylX(C.steel, 0.003, 0.03, 0, 0.012, -0.02, 6); g.box(C.steel, 0.004, 0.006, 0.014, -0.0155, 0.02, 0.01);
    g.cylZ(C.steel, 0.0068, 0.03, 0, BY, -0.118, 10); g.cylZ(C.black, 0.0045, 0.002, 0, BY, -0.1335, 8); g.cylZ(C.park, 0.004, 0.02, 0, 0.022, -0.118, 8);
    // slide (animated)
    const s = p.bolt.metal; s.rbox(C.park, 0.027, 0.03, 0.195, 0, 0.047, -0.027, 0, 0, 0, 0.35); s.box(C.bright, 0.0015, 0.012, 0.03, 0.0138, 0.052, -0.03);
    for (let i = 0; i < 6; i++) { s.box(C.black, 0.0278, 0.02, 0.0025, 0, 0.047, 0.03 + i * 0.006, 0, 0, 0); }
    s.box(C.black, 0.014, 0.008, 0.008, 0, 0.066, 0.058); s.box(C.white, 0.003, 0.003, 0.001, 0.0042, 0.068, 0.0625); s.box(C.white, 0.003, 0.003, 0.001, -0.0042, 0.068, 0.0625); s.box(C.black, 0.004, 0.007, 0.01, 0, 0.0655, -0.112); s.box(C.white, 0.0028, 0.0028, 0.001, 0, 0.067, -0.1065);
    // magazine base (animated)
    p.mag.metal.box(C.park, 0.02, 0.09, 0.032, 0, -0.045, 0.038, 0.2); p.mag.poly.rbox(C.rubber, 0.03, 0.01, 0.046, 0, -0.092, 0.05, 0.2);
    Object.assign(p.pts, { muzzle: [0, BY, -0.14], eject: [0.02, 0.055, -0.03], grip: [0, -0.04, 0.045], fore: [-0.012, -0.05, 0.036], foreV: true, adsY: -0.0705, adsZ: -0.38, hip: [0.16, -0.15, -0.5], butt: [0, 0, 0.07], oneHand: true });
  },

  sledge(p) {
    const w = p.body.wood, g = p.body.metal;
    w.loft(C.wood, [{ y: 0, rx: 0.019, rz: 0.015 }, { y: 0.25, rx: 0.016, rz: 0.013 }, { y: 0.6, rx: 0.017, rz: 0.014 }, { y: 0.74, rx: 0.02, rz: 0.016 }], 10, new THREE.Matrix4().makeRotationX(-0.47).setPosition(0, -0.25, 0.1));
    const m = new THREE.Matrix4().makeRotationX(-0.47).setPosition(0, -0.25, 0.1), at = (y, z = 0) => new THREE.Vector3(0, y, z).applyMatrix4(m);
    for (let i = 0; i < 8; i++) { const c = at(0.02 + i * 0.026); p.body.poly.torus(C.rubber, 0.0185, 0.0035, c.x, c.y, c.z, PI / 2 - 0.47, 0, 0); }
    const h = at(0.72); const rx = -0.47;
    g.rbox(C.steel, 0.066, 0.066, 0.19, h.x, h.y, h.z, rx, 0, 0, 0.3); for (const s of [-1, 1]) { const f = at(0.72, s * 0.098); g.rbox(C.bright, 0.06, 0.06, 0.012, f.x, f.y, f.z, rx, 0, 0, 0.5); }
    const b1 = at(0.72, 0.04), b2 = at(0.72, -0.04); g.box(C.park, 0.069, 0.069, 0.01, b1.x, b1.y, b1.z, rx); g.box(C.park, 0.069, 0.069, 0.01, b2.x, b2.y, b2.z, rx); const t = at(0.765); g.box(C.bright, 0.012, 0.004, 0.02, t.x, t.y, t.z, rx);
    Object.assign(p.pts, { muzzle: [0, 0.4, -0.4], eject: [0, 0, 0], grip: [0, -0.16, 0.058], fore: [0, 0.02, -0.035], foreV: true, adsY: -0.09, adsZ: -0.2, hip: [0.24, -0.3, -0.6], butt: [0, 0, 0], melee: true });
  },
};

const cache = new Map();
function geos(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const p = { body: sets(), mag: sets(), bolt: sets(), pump: sets(), glass: [], round: [], dot: null, pts: {} };
  BUILD[kind](p);
  const out = { pts: p.pts, glass: p.glass, round: p.round, dot: p.dot, groups: {} };
  for (const k of ['body', 'mag', 'bolt', 'pump']) { out.groups[k] = {}; for (const m of ['metal', 'poly', 'wood']) if (p[k][m].count) out.groups[k][m] = p[k][m].build(m === 'wood' ? 5 : 9); }
  cache.set(kind, out); return out;
}

// builds a THREE.Group for a weapon. fp = first-person (separate animated parts, lenses, self-lit materials)
export function makeGun(kind, fp = false) {
  const G0 = geos(kind), M = modelMats(), root = new THREE.Group(), o = { group: root, pts: G0.pts, mag: null, bolt: null, pump: null };
  const pre = fp ? 'fp_' : '';
  for (const k of ['body', 'mag', 'bolt', 'pump']) {
    const parts = G0.groups[k]; if (!Object.keys(parts).length) continue;
    const grp = (k === 'body' || !fp) ? root : new THREE.Group();
    for (const m in parts) { const mesh = new THREE.Mesh(parts[m], M[pre + m]); mesh.castShadow = !fp; mesh.receiveShadow = true; mesh.frustumCulled = !fp; grp.add(mesh); }
    if (grp !== root) { root.add(grp); o[k] = grp; }
  }
  if (fp) {
    for (const l of G0.glass) { const m = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.h), M.glass); m.position.set(l.x, l.y, l.z); m.frustumCulled = false; root.add(m); }
    for (const l of G0.round) { const m = new THREE.Mesh(new THREE.CircleGeometry(l.r, 18), l.lamp ? new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false }) : M.glass); m.position.set(l.x, l.y, l.z); if (l.z > 0) m.rotation.y = 0; else m.rotation.y = Math.PI; if (l.lamp) m.material.color.multiplyScalar(0.6); m.frustumCulled = false; root.add(m); }
    if (G0.dot) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 8, 6), M.dot); d.position.set(G0.dot[0], G0.dot[1], G0.dot[2]); d.frustumCulled = false; root.add(d); }
  }
  return o;
}

// ---- first-person arms: gloved hands with individual fingers ------------------------------------
// pose 'grip'  : wrapped round a vertical grip at the origin (trigger hand, or support hand on a foregrip)
// pose 'cradle': cupping a handguard / pump from below
const handCache = new Map();
export function makeHand(pose, left, fp = true) {
  const key = pose + left + fp; let geo = handCache.get(key);
  if (!geo) {
    const g = new GB(), s = left ? -1 : 1, G_ = C.glove, H = C.gloveHard;
    const finger = (pts, r = 0.0095) => { for (let i = 0; i < pts.length - 1; i++) g.limb(i === pts.length - 2 ? H : G_, r, r * 0.9, pts[i][0] * s, pts[i][1], pts[i][2], pts[i + 1][0] * s, pts[i + 1][1], pts[i + 1][2], 7); };
    if (pose === 'grip') {
      g.rbox(G_, 0.026, 0.092, 0.07, s * 0.027, -0.022, 0.018, 0.1, 0, 0, 0.5);                    // palm
      for (let i = 0; i < 3; i++) { const y = -0.012 - i * 0.021; finger([[0.026, y, -0.012], [0.017, y - 0.002, -0.036], [-0.008, y - 0.003, -0.041], [-0.026, y - 0.002, -0.022]], 0.0098 - i * 0.0006); }
      finger(left ? [[0.026, 0.01, -0.012], [0.017, 0.008, -0.036], [-0.008, 0.007, -0.041], [-0.026, 0.008, -0.022]] : [[0.027, 0.014, -0.006], [0.023, 0.02, -0.04], [0.017, 0.021, -0.068], [0.013, 0.019, -0.088]], 0.0092);   // index: wrapped (support) or along the frame (trigger)
      finger([[0.02, 0.012, 0.04], [0.002, 0.024, 0.036], [-0.02, 0.028, 0.016], [-0.027, 0.026, -0.006]], 0.0105);     // thumb
      for (let i = 0; i < 4; i++) g.rbox(H, 0.006, 0.016, 0.014, s * 0.042, 0.012 - i * 0.021, -0.004, 0, 0, 0, 0.6);     // hard knuckles
      g.cyl(G_, 0.031, 0.033, 0.04, s * 0.034, -0.045, 0.062, 1.15, 0, s * 0.2, 10); g.box(H, 0.004, 0.02, 0.036, s * 0.05, -0.03, 0.045, 1.15, 0, s * 0.2);
      g.tube(C.sleeve, 0.036, 0.052, s * 0.036, -0.05, 0.075, s * 0.2, -0.36, 0.5, 12); g.torus(C.sleeve, 0.039, 0.007, s * 0.042, -0.062, 0.092, 1.15 + Math.PI / 2, 0, s * 0.2);
      if (left) { g.rbox(0x16181a, 0.03, 0.012, 0.03, s * 0.058, -0.072, 0.105, 1.15, 0, s * 0.2); g.cyl(0x0c1418, 0.011, 0.011, 0.004, s * 0.064, -0.077, 0.108, 0, 0, s * 1.57, 10); }
    } else {
      g.rbox(G_, 0.09, 0.026, 0.075, s * -0.008, -0.044, 0.004, 0, 0, s * 0.25, 0.5);
      for (let i = 0; i < 4; i++) { const z = -0.028 + i * 0.021; finger([[0.018, -0.046, z], [0.04, -0.03, z], [0.047, -0.004, z], [0.038, 0.02, z]], 0.0096 - Math.abs(i - 1.5) * 0.0004); }
      finger([[-0.036, -0.04, 0.03], [-0.048, -0.016, 0.018], [-0.045, 0.01, 0.002], [-0.036, 0.026, -0.012]], 0.0105);
      for (let i = 0; i < 4; i++) g.rbox(H, 0.014, 0.006, 0.014, s * 0.03, -0.058, -0.028 + i * 0.021, 0, 0, s * 0.5, 0.6);
      g.cyl(G_, 0.031, 0.033, 0.04, s * -0.045, -0.058, 0.045, 0.9, 0, s * 0.7, 10);
      g.tube(C.sleeve, 0.036, 0.052, s * -0.05, -0.065, 0.058, s * -0.3, -0.36, 0.46, 12); g.torus(C.sleeve, 0.039, 0.007, s * -0.06, -0.078, 0.074, 0.9 + Math.PI / 2, 0, s * 0.7);
      if (left) g.rbox(0x16181a, 0.03, 0.012, 0.03, s * -0.075, -0.095, 0.092, 0.9, 0, s * 0.7);
    }
    geo = g.build(14); handCache.set(key, geo);
  }
  const M = modelMats(), mesh = new THREE.Mesh(geo, fp ? M.fp_cloth : M.cloth); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}
