// Weapon definitions, procedural first-person view models, firing / reload / ADS logic and projectiles.
import * as THREE from 'three';
import { G, clamp, damp, lerp, rand, terrainH } from './util.js';
import { Input } from './input.js';
import { makeFlashTexture } from './textures.js';

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

// ------------------------------------------------------------------ view models
const MAT = {};
function mats() {
  if (MAT.metal) return MAT;
  const S = THREE.MeshStandardMaterial;
  MAT.metal = new S({ color: 0x4a4e55, metalness: 0.4, roughness: 0.46 });
  MAT.steel = new S({ color: 0x8a8f98, metalness: 0.65, roughness: 0.34 });
  MAT.poly = new S({ color: 0x2e3034, metalness: 0.05, roughness: 0.62 });
  MAT.tan = new S({ color: 0x6f6247, metalness: 0.1, roughness: 0.75 });
  MAT.wood = new S({ color: 0x5b3a20, metalness: 0, roughness: 0.55 });
  MAT.glove = new S({ color: 0x35332c, metalness: 0, roughness: 0.9 });
  MAT.sleeve = new S({ color: 0x424a33, metalness: 0, roughness: 0.95 });
  MAT.brass = new S({ color: 0xb08a3a, metalness: 1, roughness: 0.3 });
  MAT.lens = new S({ color: 0x224455, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.35 });
  MAT.dot = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  MAT.green = new S({ color: 0x3b4a33, metalness: 0.3, roughness: 0.6 });
  MAT.red = new S({ color: 0x7a1c14, metalness: 0.3, roughness: 0.5 });
  return MAT;
}
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), sph: new THREE.SphereGeometry(1, 12, 8) };
function box(g, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(GEO.box, m); o.scale.set(w, h, d); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.receiveShadow = true; g.add(o); return o; }
function cylZ(g, m, r, len, x, y, z, r2) { const o = new THREE.Mesh(GEO.cyl, m); o.scale.set(r, len, r2 || r); o.position.set(x, y, z); o.rotation.x = Math.PI / 2; o.receiveShadow = true; g.add(o); return o; }
function limb(g, m, ax, ay, az, bx, by, bz, r) {
  const o = new THREE.Mesh(GEO.cyl, m), a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), d = b.clone().sub(a);
  o.scale.set(r, d.length(), r); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); o.receiveShadow = true; g.add(o); return o;
}
function hand(g, x, y, z, left) {
  const M_ = mats(), h = new THREE.Group(); h.position.set(x, y, z);
  box(h, M_.glove, 0.07, 0.05, 0.09, 0, 0, 0); box(h, M_.glove, 0.075, 0.03, 0.05, 0, 0.03, -0.02); box(h, M_.glove, 0.025, 0.03, 0.06, left ? 0.04 : -0.04, 0.01, -0.02);
  limb(h, M_.sleeve, 0, -0.01, 0.05, left ? -0.24 : 0.15, -0.34, 0.52, 0.036); limb(h, M_.glove, 0, -0.005, 0.03, left ? -0.03 : 0.02, -0.03, 0.09, 0.032);
  g.add(h); return h;
}

// returns {group, mag, bolt, muzzle:Vector3, eject:Vector3, adsY, adsZ, hipPos}
function buildModel(kind) {
  const M_ = mats(), g = new THREE.Group(), o = { group: g, mag: null, bolt: null, pump: null, adsY: -0.09, adsZ: -0.2, hip: [0.19, -0.18, -0.54], muzzle: new THREE.Vector3(0, 0.04, -0.7), eject: new THREE.Vector3(0.04, 0.05, -0.08) };
  if (kind === 'rifle' || kind === 'smg' || kind === 'lmg') {
    const L = kind === 'smg' ? 0.72 : kind === 'lmg' ? 1.12 : 1, body = kind === 'lmg' ? M_.green : M_.metal;
    box(g, body, 0.052, 0.078, 0.27, 0, 0.03, -0.08); box(g, M_.metal, 0.054, 0.02, 0.27, 0, 0.075, -0.08);
    box(g, kind === 'rifle' ? M_.tan : M_.poly, 0.05, 0.058, 0.26 * L, 0, 0.034, -0.215 - 0.13 * L);
    for (let i = 0; i < 4; i++) box(g, M_.metal, 0.054, 0.012, 0.02, 0, 0.05, -0.25 - i * 0.05 * L);
    cylZ(g, M_.steel, 0.011, 0.26 * L, 0, 0.042, -0.345 - 0.26 * L);
    cylZ(g, M_.metal, 0.017, 0.055, 0, 0.042, -0.48 - 0.39 * L); o.muzzle.set(0, 0.042, -0.52 - 0.39 * L);
    if (kind !== 'smg') { box(g, M_.poly, 0.042, 0.062, 0.2, 0, 0.022, 0.155); box(g, M_.poly, 0.046, 0.095, 0.03, 0, 0.012, 0.265); box(g, M_.metal, 0.03, 0.03, 0.06, 0, 0.04, 0.06); }
    else { box(g, M_.metal, 0.012, 0.012, 0.2, 0.02, 0.05, 0.14); box(g, M_.metal, 0.012, 0.012, 0.2, -0.02, 0.05, 0.14); box(g, M_.poly, 0.05, 0.07, 0.02, 0, 0.03, 0.245); }
    box(g, M_.poly, 0.036, 0.095, 0.046, 0, -0.045, 0.025, 0.28);
    box(g, M_.metal, 0.012, 0.03, 0.07, 0, -0.012, -0.03);
    if (kind === 'lmg') { o.mag = box(g, M_.green, 0.11, 0.1, 0.12, -0.02, -0.07, -0.13); box(g, M_.brass, 0.05, 0.012, 0.06, 0, 0.075, -0.13); limb(g, M_.metal, 0, 0.02, -0.6, 0.07, -0.12, -0.66, 0.006); limb(g, M_.metal, 0, 0.02, -0.6, -0.07, -0.12, -0.66, 0.006); box(g, M_.metal, 0.02, 0.05, 0.03, 0, 0.1, -0.62); }
    else o.mag = box(g, M_.metal, 0.03, kind === 'smg' ? 0.2 : 0.16, 0.052, 0, kind === 'smg' ? -0.1 : -0.075, -0.115, kind === 'smg' ? 0 : 0.2);
    o.bolt = box(g, M_.steel, 0.014, 0.014, 0.04, 0.032, 0.05, -0.05);
    // red-dot sight
    box(g, M_.metal, 0.036, 0.012, 0.07, 0, 0.09, -0.08); box(g, M_.metal, 0.006, 0.04, 0.05, 0.02, 0.115, -0.08); box(g, M_.metal, 0.006, 0.04, 0.05, -0.02, 0.115, -0.08); box(g, M_.metal, 0.046, 0.006, 0.05, 0, 0.137, -0.08);
    box(g, M_.lens, 0.036, 0.036, 0.002, 0, 0.115, -0.1);
    const dot = new THREE.Mesh(GEO.sph, M_.dot); dot.scale.setScalar(0.0022); dot.position.set(0, 0.115, -0.101); g.add(dot);
    box(g, M_.metal, 0.008, 0.03, 0.008, 0, 0.085, -0.45 - 0.2 * L);
    o.adsY = -0.115; o.adsZ = -0.16; o.eject.set(0.035, 0.05, -0.06);
    o.lh = hand(g, 0, -0.012, -0.24 - 0.1 * L, true); o.rh = hand(g, 0.002, -0.05, 0.035, false);
  } else if (kind === 'pistol') {
    box(g, M_.metal, 0.03, 0.036, 0.19, 0, 0.045, -0.06); box(g, M_.poly, 0.028, 0.03, 0.13, 0, 0.014, -0.035);
    box(g, M_.poly, 0.03, 0.11, 0.045, 0, -0.045, 0.02, 0.22); o.mag = box(g, M_.metal, 0.022, 0.1, 0.034, 0, -0.045, 0.02, 0.22);
    cylZ(g, M_.steel, 0.008, 0.02, 0, 0.045, -0.165); box(g, M_.metal, 0.006, 0.012, 0.008, 0, 0.068, -0.145); box(g, M_.metal, 0.02, 0.012, 0.008, 0, 0.068, 0.025);
    box(g, M_.metal, 0.008, 0.02, 0.04, 0, -0.005, -0.03);
    o.bolt = box(g, M_.steel, 0.031, 0.02, 0.06, 0, 0.052, 0.0);
    o.muzzle.set(0, 0.045, -0.18); o.adsY = -0.073; o.adsZ = -0.28; o.hip = [0.16, -0.15, -0.5]; o.eject.set(0.02, 0.06, -0.03);
    o.rh = hand(g, 0.002, -0.05, 0.03, false); o.lh = hand(g, -0.02, -0.07, 0.03, true);
  } else if (kind === 'shotgun') {
    box(g, M_.metal, 0.05, 0.07, 0.24, 0, 0.03, -0.07); cylZ(g, M_.steel, 0.014, 0.56, 0, 0.05, -0.47); cylZ(g, M_.metal, 0.013, 0.42, 0, 0.018, -0.4);
    o.pump = box(g, M_.wood, 0.05, 0.05, 0.16, 0, 0.018, -0.36); for (let i = 0; i < 5; i++) box(o.pump, M_.metal, 1.02, 0.3, 0.05, 0, -0.2, -0.4 + i * 0.2);
    box(g, M_.wood, 0.042, 0.062, 0.26, 0, 0.005, 0.17, -0.1); box(g, M_.wood, 0.038, 0.09, 0.05, 0, -0.035, 0.05, 0.35); box(g, M_.poly, 0.046, 0.1, 0.02, 0, -0.01, 0.305);
    box(g, M_.brass, 0.008, 0.01, 0.008, 0, 0.068, -0.74); box(g, M_.metal, 0.012, 0.03, 0.07, 0, -0.012, -0.02);
    o.muzzle.set(0, 0.05, -0.76); o.adsY = -0.074; o.adsZ = -0.14; o.eject.set(0.035, 0.04, -0.05);
    o.lh = hand(g, 0, -0.02, -0.36, true); o.rh = hand(g, 0.002, -0.05, 0.06, false);
  } else if (kind === 'sniper') {
    box(g, M_.green, 0.05, 0.07, 0.3, 0, 0.03, -0.06); box(g, M_.green, 0.046, 0.055, 0.34, 0, 0.022, -0.38); cylZ(g, M_.steel, 0.012, 0.6, 0, 0.045, -0.62); cylZ(g, M_.metal, 0.02, 0.09, 0, 0.045, -0.95);
    box(g, M_.green, 0.044, 0.08, 0.3, 0, 0.012, 0.2); box(g, M_.poly, 0.046, 0.11, 0.025, 0, 0.005, 0.36); box(g, M_.poly, 0.04, 0.025, 0.12, 0, 0.065, 0.2); box(g, M_.poly, 0.036, 0.09, 0.045, 0, -0.045, 0.035, 0.3);
    o.mag = box(g, M_.metal, 0.03, 0.07, 0.07, 0, -0.03, -0.1);
    o.bolt = new THREE.Group(); o.bolt.position.set(0.03, 0.05, 0.02); g.add(o.bolt); cylZ(o.bolt, M_.steel, 0.008, 0.08, 0, 0, 0); limb(o.bolt, M_.steel, 0, 0, 0.03, 0.035, -0.025, 0.03, 0.005); const kn = new THREE.Mesh(GEO.sph, M_.poly); kn.scale.setScalar(0.011); kn.position.set(0.038, -0.028, 0.03); o.bolt.add(kn);
    cylZ(g, M_.metal, 0.021, 0.3, 0, 0.115, -0.08); cylZ(g, M_.metal, 0.028, 0.07, 0, 0.115, -0.26); cylZ(g, M_.metal, 0.025, 0.05, 0, 0.115, 0.09); box(g, M_.metal, 0.02, 0.03, 0.02, 0, 0.085, -0.15); box(g, M_.metal, 0.02, 0.03, 0.02, 0, 0.085, 0.0);
    cylZ(g, M_.metal, 0.008, 0.02, 0.0, 0.142, -0.08).rotation.set(0, 0, 0);
    limb(g, M_.metal, 0, 0.0, -0.5, 0.06, -0.14, -0.56, 0.006); limb(g, M_.metal, 0, 0.0, -0.5, -0.06, -0.14, -0.56, 0.006);
    o.muzzle.set(0, 0.045, -1.0); o.adsY = -0.115; o.adsZ = -0.06; o.eject.set(0.04, 0.05, -0.02); o.hip = [0.19, -0.19, -0.48];
    o.lh = hand(g, 0, -0.015, -0.36, true); o.rh = hand(g, 0.002, -0.05, 0.045, false);
  } else if (kind === 'launcher') {
    cylZ(g, M_.metal, 0.03, 0.34, 0, 0.04, -0.42); cylZ(g, M_.green, 0.062, 0.14, 0, 0.02, -0.17); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; cylZ(g, M_.brass, 0.014, 0.142, Math.cos(a) * 0.04, 0.02 + Math.sin(a) * 0.04, -0.17); }
    box(g, M_.metal, 0.04, 0.05, 0.16, 0, 0.03, -0.02); box(g, M_.poly, 0.04, 0.06, 0.22, 0, 0.015, 0.17); box(g, M_.poly, 0.044, 0.1, 0.025, 0, 0.005, 0.29);
    box(g, M_.poly, 0.036, 0.09, 0.045, 0, -0.045, 0.03, 0.3); box(g, M_.poly, 0.034, 0.08, 0.04, 0, -0.03, -0.32, -0.2);
    box(g, M_.metal, 0.03, 0.01, 0.1, 0, 0.085, -0.3); box(g, M_.metal, 0.006, 0.05, 0.006, 0, 0.11, -0.34); box(g, M_.metal, 0.02, 0.03, 0.006, 0, 0.1, -0.26);
    o.mag = new THREE.Group(); g.add(o.mag);
    o.muzzle.set(0, 0.04, -0.6); o.adsY = -0.11; o.adsZ = -0.12; o.lh = hand(g, 0, -0.07, -0.32, true); o.rh = hand(g, 0.002, -0.05, 0.035, false);
  } else if (kind === 'rocket') {
    cylZ(g, M_.green, 0.045, 0.95, 0.0, 0.07, -0.15); cylZ(g, M_.metal, 0.055, 0.1, 0, 0.07, 0.33, 0.055); cylZ(g, M_.metal, 0.05, 0.05, 0, 0.07, -0.63);
    o.mag = new THREE.Group(); g.add(o.mag); const wh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 10), mats().red); wh.rotation.x = -Math.PI / 2; wh.position.set(0, 0.07, -0.72); o.mag.add(wh); cylZ(o.mag, M_.steel, 0.03, 0.1, 0, 0.07, -0.6);
    box(g, M_.poly, 0.036, 0.1, 0.045, 0, -0.01, -0.02, 0.2); box(g, M_.poly, 0.034, 0.09, 0.04, 0, -0.01, -0.28, -0.1); box(g, M_.wood, 0.05, 0.02, 0.2, 0, 0.115, 0.1);
    box(g, M_.metal, 0.012, 0.07, 0.03, -0.05, 0.13, -0.2); box(g, M_.metal, 0.03, 0.04, 0.004, -0.05, 0.15, -0.2);
    o.muzzle.set(0, 0.07, -0.8); o.adsY = -0.15; o.adsZ = -0.1; o.hip = [0.16, -0.16, -0.44]; o.lh = hand(g, 0, -0.05, -0.28, true); o.rh = hand(g, 0.002, -0.05, 0.0, false);
    o.adsX = 0.05;
  } else if (kind === 'sledge') {
    limb(g, M_.wood, 0, -0.25, 0.1, 0, 0.45, -0.25, 0.017); const hd = new THREE.Group(); hd.position.set(0, 0.47, -0.262); hd.rotation.x = -0.46; g.add(hd);
    box(hd, M_.steel, 0.07, 0.07, 0.2, 0, 0, 0); box(hd, M_.metal, 0.075, 0.075, 0.03, 0, 0, 0.09); box(hd, M_.metal, 0.075, 0.075, 0.03, 0, 0, -0.09);
    o.rh = hand(g, 0.0, -0.17, 0.065, false); o.lh = hand(g, 0.0, 0.0, -0.04, true);
    o.hip = [0.24, -0.3, -0.58]; o.muzzle.set(0, 0.4, -0.4);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
  return o;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class WeaponSys {
  constructor(camera) {
    this.camera = camera;
    this.holder = new THREE.Group(); this.holder.scale.setScalar(0.42); camera.add(this.holder);
    this.rig = new THREE.Group(); this.holder.add(this.rig);
    this.models = {};
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.flash.visible = false; this.flash.material.color.setRGB(3, 2.2, 1.4);
    this.slots = ['rifle', 'pistol', 'sledge']; this.cur = 0; this.state = {};
    this.id = 'rifle'; this.def = WEAPONS.rifle; this.stats = weaponStats('rifle', 1); this.model = null;
    this.cool = 0; this.reloadT = -1; this.reloadDur = 0; this.equipT = 0; this.switchTo = -1; this.adsT = 0; this.kick = 0; this.kickR = 0; this.swayX = 0; this.swayY = 0; this.spread = 0;
    this.flashT = 0; this.swingT = -1; this.swingHit = false; this.boltT = -1; this.pumpT = -1; this.grenades = 3; this.maxGrenades = 3; this.throwT = -1; this.heat = 0;
    this.projectiles = []; this.shotsFired = 0; this.shotsHit = 0; this.rSnd = 0; this.lastShot = 9;
    this.projGeo = new THREE.SphereGeometry(0.055, 8, 6); this.rocketGeo = new THREE.ConeGeometry(0.06, 0.4, 8); this.rocketGeo.rotateX(-Math.PI / 2);
    this.projMat = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.6, metalness: 0.4 });
  }

  // loadout: {primary, secondary}, levels: {id: lvl}
  setLoadout(primary, levels, opts = {}) {
    this.slots = [primary, 'pistol', 'sledge']; this.levels = levels || {};
    this.state = {};
    for (const id of this.slots) { const st = weaponStats(id, this.levels[id] || 1); this.state[id] = { mag: st.mag, reserve: WEAPONS[id].reserve }; }
    this.maxGrenades = opts.grenades || 3; this.grenades = this.maxGrenades;
    this.projectiles.forEach((p) => G.r3.scene.remove(p.mesh)); this.projectiles.length = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.equip(0, true);
  }
  equip(i, instant) {
    if (i === this.cur && !instant) return; if (i < 0 || i >= this.slots.length) return;
    if (instant) { this.cur = i; this._apply(); this.equipT = 0; return; }
    this.switchTo = i; this.reloadT = -1; this.swingT = -1; if (G.audio) G.audio.mech('swap');
  }
  _apply() {
    this.id = this.slots[this.cur]; this.def = WEAPONS[this.id]; this.stats = weaponStats(this.id, this.levels[this.id] || 1);
    if (!this.models[this.id]) this.models[this.id] = buildModel(this.def.kind);
    if (this.model) this.rig.remove(this.model.group);
    this.model = this.models[this.id]; this.rig.add(this.model.group);
    this.model.group.add(this.flash); this.flash.position.copy(this.model.muzzle);
    this.reloadT = -1; this.boltT = -1; this.pumpT = -1; this.cool = 0.25;
    this.resetParts();
  }
  resetParts() { const m = this.model; if (!m) return; if (m.mag) { m.mag.visible = true; if (m._magY === undefined) { m._magY = m.mag.position.y; m._magR = m.mag.rotation.x; } m.mag.position.y = m._magY; } if (m.bolt) { if (m._boltZ === undefined) m._boltZ = m.bolt.position.z; m.bolt.position.z = m._boltZ; m.bolt.rotation.z = 0; } if (m.pump) { if (m._pumpZ === undefined) m._pumpZ = m.pump.position.z; m.pump.position.z = m._pumpZ; } }
  ammo() { return this.state[this.id]; }
  refill(frac = 1) { for (const id of this.slots) { const st = this.state[id], w = WEAPONS[id]; if (w.reserve < 9000) st.reserve = Math.min(w.reserve, Math.ceil(st.reserve + w.reserve * frac)); } this.grenades = Math.min(this.maxGrenades, this.grenades + Math.max(1, Math.round(this.maxGrenades * frac))); }

  startReload() {
    const a = this.ammo(), d = this.def;
    if (d.melee || this.reloadT >= 0 || a.mag >= this.stats.mag || a.reserve <= 0 || this.switchTo >= 0) return;
    this.reloadDur = d.perShell ? d.reload : this.stats.reload; this.reloadT = 0; this.rSnd = 0;
  }
  finishReload() {
    const a = this.ammo(), d = this.def;
    if (d.perShell) { a.mag++; if (d.reserve < 9000) a.reserve--; if (G.audio) G.audio.mech('shell'); if (a.mag < this.stats.mag && a.reserve > 0 && !Input.buttons[0]) { this.reloadT = 0; this.rSnd = 0; return; } this.pumpT = 0; }
    else { const need = this.stats.mag - a.mag, take = Math.min(need, a.reserve); a.mag += take; if (d.reserve < 9000) a.reserve -= take; }
    this.reloadT = -1; this.resetParts();
  }

  fire(player) {
    const d = this.def, a = this.ammo(), cam = this.camera;
    if (d.melee) { if (this.swingT < 0) { this.swingT = 0; this.swingHit = false; this.cool = 60 / d.rpm; if (G.audio) G.audio.mech('swing'); } return; }
    if (a.mag <= 0) { if (G.audio) G.audio.mech('dry'); this.cool = 0.25; this.startReload(); return; }
    if (this.reloadT >= 0) { if (d.perShell && a.mag > 0) { this.reloadT = -1; this.resetParts(); } else return; }
    a.mag--; this.cool = 60 / d.rpm; this.shotsFired++; this.lastShot = 0;
    const moveSp = clamp(player.speed / 6, 0, 1) * (player.onGround ? 1 : 1.6);
    const base = lerp(d.hip * (1 + moveSp * 1.6) * (player.crouch ? 0.7 : 1), d.ads * (1 + moveSp), this.adsT);
    const spread = base + this.heat * d.hip * 0.9 * (1 - this.adsT * 0.75);
    cam.getWorldPosition(_v); cam.getWorldDirection(_v2);
    const muzzle = this.model.muzzle.clone(); this.model.group.localToWorld(muzzle);
    const right = new THREE.Vector3().crossVectors(_v2, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, _v2);
    let hitAny = false, head = false, killed = false;
    if (d.projectile) {
      const dir = _v2.clone().addScaledVector(right, rand(-1, 1) * spread).addScaledVector(up, rand(-1, 1) * spread).normalize();
      this.spawnProjectile(d.projectile, _v.clone().addScaledVector(dir, 0.6).addScaledVector(right, 0.12).addScaledVector(up, -0.08), dir, this.stats, player);
    } else {
      const n = d.pellets || 1;
      for (let i = 0; i < n; i++) {
        const a2 = rand(6.283), rr = Math.sqrt(Math.random()) * spread;
        const dir = _v2.clone().addScaledVector(right, Math.cos(a2) * rr).addScaledVector(up, Math.sin(a2) * rr).normalize();
        const res = G.combat.fireBullet({ origin: _v, dir, dmg: this.stats.dmg, brick: this.stats.brick, range: d.range, shooter: player, team: 0, falloff: d.falloff, head: d.head, tracer: (i % 2 === 0 || n === 1) ? muzzle : null });
        if (res.actor) { hitAny = true; head = head || res.head; killed = killed || res.killed; }
      }
    }
    if (hitAny) { this.shotsHit++; if (G.hud) G.hud.hitmarker(head, killed); }
    // feel
    const rc = d.recoil, rk = this.stats.recoil * (1 - this.adsT * 0.25) * (player.crouch ? 0.8 : 1);
    player.recoilVP += rc[0] * 16 * rk; player.recoilY += rand(-1, 1) * rc[1] * rk + (this.heat > 0.4 ? rc[1] * 0.6 * rk * Math.sin(this.shotsFired * 0.7) : 0);
    player.pitch = clamp(player.pitch + rc[0] * 0.28 * rk, -1.5, 1.5);
    this.kick = Math.min(1.6, this.kick + 0.5 + rc[0] * 9); this.kickR += rc[0] * 2.2;
    this.heat = Math.min(1, this.heat + (d.auto ? 0.09 : 0.25));
    this.flashT = 0.045; this.flash.rotation.z = rand(6.283); this.flash.scale.setScalar(rand(0.8, 1.3) * (d.kind === 'shotgun' || d.kind === 'sniper' ? 1.6 : d.kind === 'pistol' ? 0.7 : 1));
    G.r3.flashLight(muzzle, 0xffb060, 26, 0.06, 14);
    G.fx.muzzleSmoke(muzzle.x, muzzle.y, muzzle.z, _v2.x, _v2.y, _v2.z);
    player.shake = Math.min(1, player.shake + rc[0] * 2.4);
    if (G.audio) { G.audio.shot(d.kind, 0, 0, 0, true); if (!d.projectile && d.kind !== 'shotgun' && d.kind !== 'sniper') G.audio.casing(); }
    if (!d.projectile && d.kind !== 'shotgun' && d.kind !== 'sniper') this.ejectCasing(right, up);
    if (d.kind === 'sniper' && a.mag > 0) this.boltT = 0; if (d.kind === 'shotgun' && a.mag > 0) this.pumpT = 0;
    if (G.actors) G.actors.alert(player.pos.x, player.pos.z, d.kind === 'pistol' ? 34 : 55, player);
    if (G.mode) G.mode.onPlayerShot(this.id);
    if (a.mag <= 0 && a.reserve > 0) this.cool = Math.max(this.cool, 0.2);
  }
  ejectCasing(right, up) {
    const p = this.model.eject.clone(); this.model.group.localToWorld(p);
    const v = right.clone().multiplyScalar(rand(1.8, 3)).addScaledVector(up, rand(1.2, 2.4)).add(G.player.vel);
    G.world.spawnDebris(p.x, p.y, p.z, 0.012, 0.012, 0.032, v.x, v.y, v.z, 0.75, 0.55, 0.18, 0.3, 1, 7, 0.5, 2.5);
  }
  spawnProjectile(type, pos, dir, stats, owner, team = 0) {
    const mesh = new THREE.Mesh(type === 'rocket' ? this.rocketGeo : this.projGeo, this.projMat); mesh.position.copy(pos); G.r3.scene.add(mesh);
    const speed = type === 'rocket' ? 62 : type === 'gl' ? 34 : 17;
    const vel = dir.clone().multiplyScalar(speed); if (type === 'frag') vel.y += 3.5;
    if (type === 'rocket') mesh.lookAt(pos.clone().add(dir));
    this.projectiles.push({ type, pos: pos.clone(), vel, mesh, life: type === 'frag' ? 2.4 : 8, dmg: stats.dmg, radius: stats.radius, owner, team, trail: 0 });
  }
  throwGrenade(player) {
    if (this.grenades <= 0 || this.throwT >= 0 || this.switchTo >= 0) return;
    this.throwT = 0; if (G.audio) G.audio.mech('pin');
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
            if (G.audio && p.vel.length() > 1.5) G.audio.impact('metal', p.pos.x, p.pos.y, p.pos.z);
            break;
          } else boom = true;
        } else p.pos.set(nx, ny, nz);
      }
      p.mesh.position.copy(p.pos);
      if (p.type === 'rocket') { p.trail += dt; if (p.trail > 0.012) { p.trail = 0; G.fx.trail(p.pos.x, p.pos.y, p.pos.z, 1); } }
      else if (p.type === 'gl') { p.trail += dt; if (p.trail > 0.04) { p.trail = 0; G.fx.trail(p.pos.x, p.pos.y, p.pos.z, 0.4); } p.mesh.rotation.x += dt * 12; }
      else p.mesh.rotation.x += dt * 9;
      if (boom) { G.r3.scene.remove(p.mesh); this.projectiles.splice(i, 1); G.combat.explosion(p.pos.x, p.pos.y + 0.1, p.pos.z, p.radius, p.dmg, p.owner, p.team === 0 ? -1 : p.team); }
    }
  }

  update(dt, player, active) {
    const d = this.def, m = this.model, inp = Input;
    this.cool -= dt; this.lastShot += dt; this.heat = Math.max(0, this.heat - dt * (this.lastShot > 0.12 ? 2.2 : 0.4));
    // switching
    if (this.switchTo >= 0) { this.equipT += dt * 5.5; if (this.equipT >= 1) { this.cur = this.switchTo; this.switchTo = -1; this._apply(); } }
    else this.equipT = Math.max(0, this.equipT - dt * 5.5);
    const canAct = active && !player.dead && this.switchTo < 0 && this.equipT < 0.3;
    if (active && !player.dead) {
      if (inp.pressed.Digit1) this.equip(0); if (inp.pressed.Digit2) this.equip(1); if (inp.pressed.Digit3) this.equip(2);
      if (inp.wheel !== 0 && this.switchTo < 0) this.equip((this.cur + (inp.wheel > 0 ? 1 : 2)) % 3);
      if (inp.pressed.KeyQ && this.switchTo < 0) this.equip(this.cur === 0 ? 1 : 0);
      if (inp.pressed.KeyR) this.startReload();
      if (inp.pressed.KeyG) this.throwGrenade(player);
      if (inp.pressed.KeyV && this.swingT < 0 && this.cur !== 2) { this.equip(2); }
    }
    const wantAds = canAct && inp.buttons[2] && !d.melee && this.reloadT < 0 && !player.sprinting;
    const prevAds = this.adsT;
    this.adsT = clamp(this.adsT + (wantAds ? dt : -dt) * (d.kind === 'sniper' || d.kind === 'lmg' ? 4.2 : 6.5), 0, 1);
    if (wantAds && prevAds === 0 && G.audio) G.audio.mech('ads');
    player.adsT = this.adsT; player.fovMul = d.adsFov; player.speedMul *= d.move;
    if (canAct && this.cool <= 0 && this.throwT < 0 && !(player.sprinting && !d.melee)) {
      if (d.auto ? inp.buttons[0] : inp.bPressed[0]) this.fire(player);
    }
    if (canAct && !d.melee && this.ammo().mag <= 0 && this.reloadT < 0 && this.cool <= 0 && this.ammo().reserve > 0) this.startReload();
    // reload timeline
    let rl = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt; const t = this.reloadT / this.reloadDur; rl = Math.sin(clamp(t, 0, 1) * Math.PI);
      if (!d.perShell && m.mag) {
        if (t > 0.18 && this.rSnd < 1) { this.rSnd = 1; if (G.audio) G.audio.mech('magout'); }
        if (t > 0.6 && this.rSnd < 2) { this.rSnd = 2; if (G.audio) G.audio.mech('magin'); }
        if (t > 0.85 && this.rSnd < 3) { this.rSnd = 3; if (G.audio) G.audio.mech('bolt'); }
        const out = clamp((t - 0.15) / 0.15, 0, 1) - clamp((t - 0.5) / 0.14, 0, 1);
        m.mag.position.y = m._magY - out * 0.3; m.mag.visible = !(t > 0.3 && t < 0.5);
        if (m.bolt && t > 0.82) m.bolt.position.z = m._boltZ + Math.sin(clamp((t - 0.82) / 0.15, 0, 1) * Math.PI) * 0.05;
      }
      if (this.reloadT >= this.reloadDur) this.finishReload();
    }
    if (this.boltT >= 0 && m.bolt) { this.boltT += dt; const t = this.boltT / 0.85; if (t > 0.25 && t - dt / 0.85 <= 0.25 && G.audio) G.audio.mech('bolt'); m.bolt.rotation.z = Math.sin(clamp(t * 2, 0, 1) * Math.PI) * 0.9; m.bolt.position.z = m._boltZ + Math.sin(clamp((t - 0.2) / 0.6, 0, 1) * Math.PI) * 0.07; if (t >= 1) { this.boltT = -1; m.bolt.rotation.z = 0; m.bolt.position.z = m._boltZ; } this.cool = Math.max(this.cool, 0.05); }
    if (this.pumpT >= 0 && m.pump) { this.pumpT += dt; const t = this.pumpT / 0.42; if (t > 0.3 && t - dt / 0.42 <= 0.3 && G.audio) G.audio.mech('bolt'); m.pump.position.z = m._pumpZ + Math.sin(clamp(t, 0, 1) * Math.PI) * 0.09; if (t >= 1) { this.pumpT = -1; m.pump.position.z = m._pumpZ; } }
    // melee swing
    let sw = 0;
    if (this.swingT >= 0) {
      this.swingT += dt; const t = this.swingT / 0.5; sw = Math.sin(clamp(t, 0, 1) * Math.PI);
      if (t > 0.34 && !this.swingHit) { this.swingHit = true; this.meleeHit(player); }
      if (t >= 1) this.swingT = -1;
    }
    // grenade throw
    if (this.throwT >= 0) {
      this.throwT += dt;
      if (this.throwT > 0.28 && this.throwT - dt <= 0.28) {
        this.grenades--; this.camera.getWorldPosition(_v); this.camera.getWorldDirection(_v2);
        this.spawnProjectile('frag', _v.clone().addScaledVector(_v2, 0.5), _v2.clone(), { dmg: 240, radius: 5 }, player);
        this.projectiles[this.projectiles.length - 1].vel.add(player.vel); if (G.audio) G.audio.mech('swing'); if (G.mode) G.mode.onPlayerShot('frag');
      }
      if (this.throwT > 0.55) this.throwT = -1;
    }
    this.updateProjectiles(dt);
    // ---- view model pose
    this.kick = damp(this.kick, 0, 13, dt); this.kickR = damp(this.kickR, 0, 11, dt);
    this.swayX = damp(this.swayX, clamp(-inp.mdx * 0.0016, -0.06, 0.06), 9, dt); this.swayY = damp(this.swayY, clamp(inp.mdy * 0.0016, -0.06, 0.06), 9, dt);
    const a = this.adsT, hip = m.hip, bob = player.bob, ba = player.bobAmt * (1 - a * 0.85);
    const sprint = player.sprinting && !d.melee ? 1 : 0; this.sprintT = damp(this.sprintT || 0, sprint, 9, dt);
    const s = this.sprintT, eq = this.equipT, th = this.throwT >= 0 ? Math.sin(clamp(this.throwT / 0.55, 0, 1) * Math.PI) : 0;
    const t0 = G.r3.time;
    let x = lerp(hip[0], m.adsX || 0, a) + Math.cos(bob) * 0.012 * ba + this.swayX * (1 - a * 0.7) + s * -0.06;
    let y = lerp(hip[1], m.adsY, a) + Math.sin(bob * 2) * 0.01 * ba + Math.sin(t0 * 1.6) * 0.003 * (1 - a) - this.swayY * (1 - a * 0.7) - eq * 0.34 - rl * 0.09 - s * 0.05 - th * 0.3 - player.landDip * 0.25 + player.vel.y * -0.004;
    let z = lerp(hip[2], m.adsZ, a) + this.kick * 0.045 * (1 - a * 0.4) + s * 0.05;
    let rx = this.kickR * (1 - a * 0.5) + eq * -0.9 + rl * -0.5 + s * -0.25 - th * 0.8 + this.swayY * 0.6, ry = this.swayX * 1.3 + s * 0.75 + rl * 0.35, rz = this.swayX * -1.4 + rl * 0.5 + Math.cos(bob) * 0.012 * ba + s * 0.12;
    if (d.melee) { x += -sw * 0.22; y += sw * 0.12; z += -sw * 0.26; rx += -sw * 1.6 + 0.25; rz += sw * 0.5 - 0.2; ry += sw * 0.4; }
    this.rig.position.set(x, y, z); this.rig.rotation.set(rx, ry, rz);
    this.flashT -= dt; this.flash.visible = this.flashT > 0 && a < 0.92 || (this.flashT > 0 && !d.scope);
    this.holder.visible = !(d.scope && a > 0.9) && !player.dead;
    { const f = Math.tan(27 * Math.PI / 180) / Math.tan(this.camera.fov * Math.PI / 360) * (1 + a * 0.12); this.holder.scale.set(0.42 * Math.min(1, f), 0.42 * Math.min(1, f), 0.42); }
    this.spread = lerp(d.hip * (1 + clamp(player.speed / 6, 0, 1) * 1.6) * (player.crouch ? 0.7 : 1) + this.heat * d.hip * 0.9, d.ads, a);
  }

  meleeHit(player) {
    const cam = this.camera, w = G.world; cam.getWorldPosition(_v); cam.getWorldDirection(_v2);
    const res = G.combat.trace(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, this.def.range, player, 0);
    if (res.kind === 'none') return;
    const px = _v.x + _v2.x * res.t, py = _v.y + _v2.y * res.t, pz = _v.z + _v2.z * res.t;
    player.shake = Math.min(1, player.shake + 0.5); this.kick = 1.2;
    if (res.kind === 'actor') { const k = res.actor.damage(this.stats.dmg * (res.part === 2 ? 1.5 : 1), player, 'melee', _v2); G.fx.impact(px, py, pz, -_v2.x, 0.3, -_v2.z, 'flesh'); if (G.audio) G.audio.impact('flesh', px, py, pz); if (G.hud) G.hud.hitmarker(false, k); return; }
    if (res.kind === 'tree') { G.terrain.damageTree(res.tree, 130, _v2.x, _v2.z); G.fx.impact(px, py, pz, -_v2.x, 0.3, -_v2.z, 'tree'); if (G.audio) G.audio.impact('wood', px, py, pz); return; }
    if (res.kind === 'ground') { G.fx.impact(px, py, pz, 0, 1, 0, 'ground'); if (G.audio) G.audio.thud(px, py, pz, 0.8); return; }
    // smash every brick within reach of the hammer head
    const r = 0.42, ids = new Set();
    for (let dx = -r; dx <= r; dx += 0.21) for (let dy = -r; dy <= r; dy += 0.21) for (let dz = -r; dz <= r; dz += 0.21) { if (dx * dx + dy * dy + dz * dz > r * r * 1.1) continue; const id = w.pieceAtWorld(px + _v2.x * 0.1 + dx, py + _v2.y * 0.1 + dy, pz + _v2.z * 0.1 + dz); if (id >= 0) ids.add(id); }
    const dir = _v2.clone();
    for (const id of ids) { const mat = w.pm[id]; const gone = w.damagePiece(id, this.stats.brick, dir); if (G.mode) G.mode.onPlayerHitPiece(id, mat, gone); }
    G.fx.impact(px, py, pz, -_v2.x, -_v2.y, -_v2.z, 'stone', w.pm[res.id]); if (G.audio) G.audio.thud(px, py, pz, 1);
    if (G.actors) G.actors.alert(player.pos.x, player.pos.z, 18, player);
  }
}
