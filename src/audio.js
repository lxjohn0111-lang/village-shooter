// Fully synthesized audio (WebAudio): weapons, explosions, masonry, footsteps, ambience and adaptive music.
import { G, clamp, rand, pick } from './util.js';

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.adMuted = false;
    this.vol = { master: 0.8, sfx: 1, music: 0.55 };
    this.musicMode = 'off'; this.intensity = 0; this.nextBeat = 0; this.beat = 0; this.ambMode = '';
    this.voices = 0;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.music = c.createGain(); this.amb = c.createGain();
    this.sfx.connect(this.master); this.music.connect(this.master); this.amb.connect(this.master);
    // noise buffers
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const pb = c.createBuffer(1, len, c.sampleRate), pd = pb.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; pd[i] = last * 3.5; }
    this.brown = pb;
    // reverb impulse
    const rl = c.sampleRate * 1.8, ib = c.createBuffer(2, rl, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const id = ib.getChannelData(ch); for (let i = 0; i < rl; i++) id[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6) * (i < 400 ? i / 400 : 1); }
    this.rev = c.createConvolver(); this.rev.buffer = ib;
    this.revGain = c.createGain(); this.revGain.gain.value = 0.32; this.rev.connect(this.revGain); this.revGain.connect(this.master);
    this.applyVolume();
    this.startAmbience();
  }
  resume() { if (!this.ctx) this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  applyVolume() {
    if (!this.ctx) return;
    const m = (this.muted || this.adMuted) ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.sfx.gain.value = this.vol.sfx; this.music.gain.value = this.vol.music * 0.6; this.amb.gain.value = this.vol.sfx * 0.5;
  }
  setMuted(m) { this.muted = m; this.applyVolume(); }
  setAdMuted(m) { this.adMuted = m; this.applyVolume(); }

  // distance / pan relative to the camera
  spatial(x, y, z, ref = 12) {
    const cam = G.r3 ? G.r3.camera : null; if (!cam || x === undefined) return { g: 1, pan: 0, lp: 20000, d: 0 };
    const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz);
    const yaw = cam.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.8 : 0;
    return { g: ref / (ref + d * d * 0.045 + d), pan, lp: clamp(20000 / (1 + d * 0.06), 700, 20000), d };
  }
  out(sp, gain = 1, wet = 0.25) {
    const c = this.ctx, g = c.createGain(); g.gain.value = gain * (sp ? sp.g : 1);
    let node = g;
    if (sp && sp.pan !== 0 && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); node = p; }
    if (sp && sp.lp < 16000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.lp; node.connect(f); node = f; }
    node.connect(this.sfx);
    if (wet > 0) { const w = c.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.rev); }
    return g;
  }
  nz(dest, t, dur, type, f0, f1, q, peak, attack = 0.002, buf = null) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf || this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(20, f0), t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(dest, t, dur, type, f0, f1, peak, attack = 0.002) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  ok() { return this.ctx && this.ctx.state === 'running'; }

  shot(kind, x, y, z, own = false) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, sp = own ? null : this.spatial(x, y, z, 26);
    if (sp && sp.g < 0.01) return;
    const P = { pistol: [0.16, 3200, 150, 0.8], rifle: [0.2, 2600, 120, 1], smg: [0.12, 3800, 170, 0.7], shotgun: [0.34, 1500, 70, 1.25], sniper: [0.5, 1900, 60, 1.4], lmg: [0.22, 2100, 95, 1.05], launcher: [0.3, 600, 90, 0.9], rocket: [0.6, 900, 50, 1.2], turret: [0.14, 2900, 140, 0.7] }[kind] || [0.2, 2600, 120, 1];
    const o = this.out(sp, (own ? 0.5 : 0.75) * P[3], own ? 0.35 : 0.5);
    const far = sp ? clamp(sp.d / 60, 0, 1) : 0;
    this.nz(o, t, P[0] * (1 + far), 'lowpass', P[1] * 3 * (1 - far * 0.7), 300, 0.7, 1.0, 0.001);
    this.nz(o, t, 0.035, 'highpass', 2500, 5000, 0.5, 0.7 * (1 - far));
    this.tone(o, t, P[0] * 0.8, 'sine', P[2] * 1.6, P[2] * 0.4, 0.9);
    this.tone(o, t, 0.05, 'square', P[2] * 5, P[2] * 2, 0.16 * (1 - far));
    if (kind === 'rocket' || kind === 'launcher') this.nz(o, t, 0.7, 'bandpass', 700, 200, 1, 0.5, 0.05);
  }
  mech(kind) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.32, 0.08);
    if (kind === 'magout') { this.nz(o, t, 0.05, 'bandpass', 1800, 900, 3, 0.9); this.tone(o, t + 0.02, 0.05, 'square', 320, 180, 0.15); }
    else if (kind === 'magin') { this.nz(o, t, 0.04, 'bandpass', 1200, 2400, 3, 0.9); this.tone(o, t, 0.07, 'square', 180, 260, 0.2); this.nz(o, t + 0.06, 0.03, 'highpass', 3000, 3000, 1, 0.5); }
    else if (kind === 'bolt') { this.nz(o, t, 0.035, 'bandpass', 2600, 1800, 4, 1); this.nz(o, t + 0.09, 0.04, 'bandpass', 2000, 3200, 4, 1); this.tone(o, t + 0.09, 0.05, 'square', 420, 300, 0.12); }
    else if (kind === 'shell') { this.nz(o, t, 0.05, 'bandpass', 900, 1400, 2, 0.8); this.tone(o, t + 0.03, 0.04, 'square', 240, 200, 0.14); }
    else if (kind === 'dry') { this.nz(o, t, 0.02, 'highpass', 3500, 3500, 1, 0.7); this.tone(o, t, 0.03, 'square', 900, 700, 0.08); }
    else if (kind === 'swap') { this.nz(o, t, 0.12, 'bandpass', 600, 1500, 1, 0.5, 0.04); this.nz(o, t + 0.1, 0.03, 'highpass', 2800, 2800, 1, 0.5); }
    else if (kind === 'swing') { this.nz(o, t, 0.22, 'bandpass', 400, 1600, 1.2, 0.9, 0.08); }
    else if (kind === 'pin') { this.tone(o, t, 0.04, 'triangle', 2400, 1800, 0.3); this.nz(o, t + 0.03, 0.03, 'highpass', 4000, 4000, 1, 0.4); }
    else if (kind === 'ads') { this.nz(o, t, 0.08, 'bandpass', 900, 1300, 1, 0.22, 0.03); }
  }
  casing() { if (!this.ok()) return; const t = this.ctx.currentTime + 0.35 + Math.random() * 0.2, o = this.out(null, 0.1, 0.1); this.tone(o, t, 0.07, 'sine', rand(3800, 5200), rand(3000, 3600), 0.5); this.tone(o, t + 0.08, 0.05, 'sine', rand(4200, 5600), 3400, 0.3); }
  explosion(x, y, z, size = 1) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, sp = this.spatial(x, y, z, 45), o = this.out(sp, 1.3 * size, 0.6);
    const delay = Math.min(0.25, sp.d / 340);
    this.tone(o, t + delay, 0.9, 'sine', 110, 26, 1.3, 0.004);
    this.nz(o, t + delay, 1.3, 'lowpass', 2600, 90, 0.6, 1.2, 0.004, this.brown);
    this.nz(o, t + delay, 0.3, 'lowpass', 6000, 500, 0.5, 1.0, 0.002);
    for (let i = 0; i < 6; i++) this.nz(o, t + delay + 0.25 + Math.random() * 1.1, 0.08, 'bandpass', rand(700, 2500), 500, 2, 0.2);
  }
  impact(snd, x, y, z) {
    if (!this.ok()) return;
    const sp = this.spatial(x, y, z, 8); if (sp.g < 0.03) return;
    const t = this.ctx.currentTime, o = this.out(sp, 0.5, 0.15);
    if (snd === 'metal') { this.tone(o, t, 0.16, 'triangle', rand(1800, 3200), rand(1500, 2400), 0.5); this.nz(o, t, 0.04, 'highpass', 3000, 3000, 1, 0.5); }
    else if (snd === 'wood' || snd === 'tree') { this.nz(o, t, 0.07, 'bandpass', rand(500, 900), 300, 3, 1); this.tone(o, t, 0.05, 'sine', 240, 120, 0.4); }
    else if (snd === 'glass') { this.nz(o, t, 0.05, 'highpass', 5000, 3000, 1, 0.6); }
    else if (snd === 'flesh') { this.nz(o, t, 0.07, 'lowpass', 900, 250, 1, 1); this.tone(o, t, 0.06, 'sine', 160, 70, 0.5); }
    else if (snd === 'ground' || snd === 'soft') { this.nz(o, t, 0.09, 'lowpass', 1200, 300, 1, 0.9); }
    else { this.nz(o, t, 0.06, 'bandpass', rand(1400, 2600), 800, 2, 1); this.nz(o, t, 0.03, 'highpass', 4000, 4000, 1, 0.3); }
  }
  breakSound(snd, x, y, z, cells = 2) {
    if (!this.ok()) return;
    const sp = this.spatial(x, y, z, 14); if (sp.g < 0.02) return;
    const t = this.ctx.currentTime, o = this.out(sp, 0.55 + Math.min(0.5, cells * 0.02), 0.25), k = 1 / (1 + cells * 0.03);
    if (snd === 'glass') { for (let i = 0; i < 5; i++) this.tone(o, t + i * 0.025, 0.2, 'sine', rand(2500, 6500), rand(2000, 5000), 0.2); this.nz(o, t, 0.25, 'highpass', 4500, 2500, 1, 0.8); }
    else if (snd === 'wood') { this.nz(o, t, 0.16, 'bandpass', 700 * k, 250, 2, 1.1); this.tone(o, t, 0.1, 'sawtooth', 190 * k, 70, 0.3); this.nz(o, t + 0.04, 0.06, 'bandpass', 1800, 900, 4, 0.5); }
    else if (snd === 'metal') { this.tone(o, t, 0.4, 'triangle', rand(500, 900), rand(300, 500), 0.5); this.tone(o, t, 0.3, 'square', rand(1400, 2200), 1100, 0.12); this.nz(o, t, 0.1, 'bandpass', 2400, 1000, 2, 0.7); }
    else if (snd === 'tile') { this.nz(o, t, 0.09, 'bandpass', 2600, 1300, 3, 1); this.tone(o, t, 0.06, 'triangle', 900, 500, 0.25); }
    else if (snd === 'soft') { this.nz(o, t, 0.2, 'lowpass', 900, 200, 0.8, 0.8, 0.02); }
    else { this.nz(o, t, 0.14, 'bandpass', 1100 * k + 300, 350, 1.6, 1.1); this.tone(o, t, 0.09, 'sine', 150 * k + 40, 50, 0.6); this.nz(o, t + 0.05, 0.1, 'lowpass', 2500, 400, 1, 0.4); }
  }
  thud(x, y, z, power = 0.5) {
    if (!this.ok()) return;
    const sp = this.spatial(x, y, z, 10); if (sp.g * power < 0.02) return;
    const t = this.ctx.currentTime, o = this.out(sp, 0.7 * power, 0.2);
    this.tone(o, t, 0.12, 'sine', rand(90, 150), 45, 0.9); this.nz(o, t, 0.08, 'bandpass', rand(600, 1500), 400, 1.5, 0.7);
  }
  collapse(x, y, z, size) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, sp = this.spatial(x, y, z, 40), o = this.out(sp, 0.9 + size * 0.5, 0.5);
    this.nz(o, t, 1.4 + size * 1.5, 'lowpass', 900, 70, 0.7, 1.1, 0.25, this.brown);
    for (let i = 0; i < 10 + size * 14; i++) this.nz(o, t + Math.random() * (1 + size * 1.5), 0.07, 'bandpass', rand(500, 2400), 400, 2, 0.35);
  }
  treeFall(x, y, z) { if (!this.ok()) return; const t = this.ctx.currentTime, o = this.out(this.spatial(x, y, z, 30), 0.8, 0.4); for (let i = 0; i < 8; i++) this.nz(o, t + i * 0.09 + Math.random() * 0.05, 0.06, 'bandpass', rand(500, 1300), 300, 4, 0.7); this.nz(o, t + 1.2, 0.7, 'lowpass', 1500, 100, 0.7, 1, 0.02, this.brown); this.tone(o, t + 1.2, 0.3, 'sine', 80, 35, 0.9); }
  thunder() { if (!this.ok()) return; const t = this.ctx.currentTime + rand(0.2, 1.2), o = this.out(null, 0.9, 0.7); this.nz(o, t, 3.5, 'lowpass', 500, 50, 0.6, 1.2, 0.08, this.brown); this.nz(o, t, 0.4, 'lowpass', 3000, 300, 0.5, 0.6, 0.01); }
  whiz() { if (!this.ok()) return; const t = this.ctx.currentTime, o = this.out({ g: 1, pan: rand(-0.8, 0.8), lp: 20000 }, 0.3, 0.1); this.nz(o, t, 0.12, 'bandpass', rand(2500, 4500), rand(800, 1400), 6, 1, 0.02); }
  step(surface, run) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, o = this.out(null, run ? 0.22 : 0.14, 0.05);
    if (surface === 'wood') { this.nz(o, t, 0.07, 'bandpass', rand(260, 420), 160, 2.5, 1); this.tone(o, t, 0.05, 'sine', 130, 70, 0.5); }
    else if (surface === 'stone') { this.nz(o, t, 0.05, 'bandpass', rand(900, 1500), 500, 2, 0.9); }
    else { this.nz(o, t, 0.09, 'lowpass', rand(1500, 2400), 300, 0.8, 0.8, 0.01); this.nz(o, t + 0.02, 0.06, 'highpass', 3500, 5000, 1, 0.12); }
  }
  land(power) { if (!this.ok()) return; const t = this.ctx.currentTime, o = this.out(null, 0.3 * power, 0.1); this.tone(o, t, 0.12, 'sine', 110, 45, 1); this.nz(o, t, 0.12, 'lowpass', 1400, 200, 1, 0.9); }
  hurt() { if (!this.ok()) return; const t = this.ctx.currentTime, o = this.out(null, 0.4, 0.1); this.nz(o, t, 0.12, 'lowpass', 700, 150, 1, 1); this.tone(o, t, 0.14, 'sine', 95, 50, 0.9); }
  ui(kind) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.22, 0.12);
    if (kind === 'hover') this.tone(o, t, 0.03, 'sine', 1400, 1500, 0.25);
    else if (kind === 'click') { this.tone(o, t, 0.06, 'triangle', 700, 1000, 0.6); this.nz(o, t, 0.02, 'highpass', 4000, 4000, 1, 0.3); }
    else if (kind === 'back') this.tone(o, t, 0.08, 'triangle', 700, 420, 0.5);
    else if (kind === 'deny') { this.tone(o, t, 0.09, 'square', 180, 150, 0.4); this.tone(o, t + 0.1, 0.12, 'square', 150, 120, 0.4); }
    else if (kind === 'hit') { this.tone(o, t, 0.035, 'square', 1800, 1500, 0.35); this.nz(o, t, 0.02, 'highpass', 5000, 5000, 1, 0.4); }
    else if (kind === 'headshot') { this.tone(o, t, 0.18, 'sine', 2300, 2250, 0.7); this.tone(o, t, 0.05, 'square', 2900, 2400, 0.25); }
    else if (kind === 'kill') { this.tone(o, t, 0.07, 'triangle', 900, 880, 0.7); this.tone(o, t + 0.07, 0.16, 'triangle', 1350, 1320, 0.7); }
    else if (kind === 'coin') { this.tone(o, t, 0.06, 'square', 1250, 1250, 0.3); this.tone(o, t + 0.06, 0.2, 'square', 1680, 1680, 0.3); }
    else if (kind === 'pickup') { this.tone(o, t, 0.08, 'triangle', 500, 900, 0.6); this.nz(o, t, 0.06, 'bandpass', 1500, 2500, 2, 0.4); }
    else if (kind === 'place') { this.nz(o, t, 0.06, 'bandpass', 800, 400, 2, 1); this.tone(o, t, 0.06, 'sine', 180, 90, 0.8); }
    else if (kind === 'remove') { this.nz(o, t, 0.09, 'bandpass', 500, 1300, 2, 0.8); }
    else if (kind === 'levelup') [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone(o, t + i * 0.09, 0.4, 'triangle', f, f, 0.6); this.tone(o, t + i * 0.09, 0.4, 'sine', f * 2, f * 2, 0.2); });
    else if (kind === 'star') { this.tone(o, t, 0.5, 'triangle', 1047, 1047, 0.7); this.tone(o, t, 0.5, 'sine', 1568, 1568, 0.4); this.nz(o, t, 0.3, 'highpass', 6000, 9000, 1, 0.25); }
    else if (kind === 'win') [392, 523, 659, 784, 1047].forEach((f, i) => { this.tone(o, t + i * 0.13, 0.7, 'sawtooth', f, f, 0.22); this.tone(o, t + i * 0.13, 0.7, 'triangle', f * 1.5, f * 1.5, 0.3); });
    else if (kind === 'lose') [392, 349, 311, 233].forEach((f, i) => { this.tone(o, t + i * 0.28, 0.9, 'sawtooth', f, f * 0.97, 0.22); this.tone(o, t + i * 0.28, 0.9, 'sine', f / 2, f / 2, 0.5); });
    else if (kind === 'radio') { this.nz(o, t, 0.05, 'bandpass', 2400, 2400, 5, 0.7); this.tone(o, t + 0.04, 0.05, 'square', 1200, 1200, 0.15); }
    else if (kind === 'horn') { for (const f of [110, 165, 220]) { this.tone(o, t, 1.6, 'sawtooth', f, f * 1.01, 0.5, 0.25); } }
    else if (kind === 'alarm') { for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.3, 0.22, 'square', 880, 660, 0.3, 0.02); }
    else if (kind === 'beep') this.tone(o, t, 0.06, 'square', 1900, 1900, 0.3);
  }

  // ------------------------------------------------------------ ambience
  startAmbience() {
    const c = this.ctx;
    const mk = (buf, type, freq, q) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.amb); s.start(); return { g, f }; };
    this.wind = mk(this.noise, 'bandpass', 420, 0.6); this.rainLoop = mk(this.noise, 'highpass', 2200, 0.4); this.rumble = mk(this.brown, 'lowpass', 160, 0.5);
    this.ambT = 0;
  }
  setAmbience(mode) { this.ambMode = mode; }
  updateAmbience(dt) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, m = this.ambMode;
    this.ambT += dt;
    const gust = 0.5 + 0.5 * Math.sin(this.ambT * 0.31) * Math.sin(this.ambT * 0.13 + 1);
    this.wind.g.gain.setTargetAtTime((m === 'storm' ? 0.5 : m === 'wind' ? 0.34 : m ? 0.12 : 0) * (0.5 + gust * 0.7), t, 0.4);
    this.wind.f.frequency.setTargetAtTime(320 + gust * 420, t, 0.5);
    this.rainLoop.g.gain.setTargetAtTime(m === 'storm' ? 0.2 : 0, t, 0.5);
    this.rumble.g.gain.setTargetAtTime(m ? 0.25 : 0, t, 0.5);
    if (m === 'day' && Math.random() < dt * 0.5) { const o = this.out({ g: rand(0.08, 0.25), pan: rand(-0.9, 0.9), lp: 20000 }, 1, 0.5); const f = rand(2400, 4400), n = Math.floor(rand(2, 6)); for (let i = 0; i < n; i++) this.tone(o, t + i * rand(0.07, 0.13), 0.07, 'sine', f * rand(0.9, 1.1), f * rand(1.05, 1.3), 0.5, 0.01); }
    if (m === 'night' && Math.random() < dt * 1.6) { const o = this.out({ g: rand(0.04, 0.12), pan: rand(-0.9, 0.9), lp: 20000 }, 1, 0.3); for (let i = 0; i < 4; i++) this.tone(o, t + i * 0.055, 0.035, 'sine', 4300, 4300, 0.5, 0.005); }
  }

  // ------------------------------------------------------------ adaptive music
  setMusic(mode) { if (this.musicMode !== mode) { this.musicMode = mode; this.beat = 0; if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1; } }
  updateMusic(dt) {
    if (!this.ok() || this.musicMode === 'off') return;
    const c = this.ctx, mode = this.musicMode;
    const bpm = mode === 'combat' ? 112 : mode === 'menu' ? 72 : mode === 'build' ? 84 : 66, sp = 60 / bpm / 2;   // 8th notes
    const prog = mode === 'build' ? [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [5, 9, 12], [2, 5, 9], [7, 11, 14]]
      : [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2], [0, 3, 7], [-4, 0, 3], [3, 7, 10], [-5, -1, 2]];
    const root = mode === 'build' ? 196 : 146.83;
    while (this.nextBeat < c.currentTime + 0.25) {
      const t = this.nextBeat, b = this.beat, bar = Math.floor(b / 16) % prog.length, ch = prog[bar], st = b % 16;
      const fr = (semi) => root * Math.pow(2, semi / 12);
      const I = mode === 'combat' ? 0.5 + this.intensity * 0.5 : 1;
      if (st === 0) {         // pad
        for (const n of ch) for (const det of [-4, 5]) {
          const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = fr(n) * (mode === 'combat' ? 0.5 : 1); o.detune.value = det;
          f.type = 'lowpass'; f.frequency.value = mode === 'combat' ? 520 : 760; f.Q.value = 0.6;
          const dur = sp * 16; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
          o.connect(f); f.connect(g); g.connect(this.music); g.connect(this.rev); o.start(t); o.stop(t + dur * 1.1);
        }
        this.tone(this.music, t, sp * 14, 'sine', fr(ch[0]) / 4, fr(ch[0]) / 4, 0.16, 0.2);
      }
      if (mode === 'menu' || mode === 'build' || mode === 'calm') {
        const pat = mode === 'build' ? [0, 1, 2, 1, 0, 2, 1, 2] : [0, -1, 2, -1, 1, -1, 2, -1];
        const k = pat[(st >> 1) % 8];
        if (st % 2 === 0 && k >= 0 && (mode !== 'calm' || st % 4 === 0)) {
          const f = fr(ch[k] + 12 + (Math.random() < 0.2 ? 12 : 0));
          const g = c.createGain(); g.gain.value = mode === 'calm' ? 0.05 : 0.085; g.connect(this.music); g.connect(this.rev);
          this.tone(g, t, 0.7, 'triangle', f, f, 1, 0.004); this.tone(g, t, 0.3, 'sine', f * 2, f * 2, 0.3, 0.004);
        }
      }
      if (mode === 'combat') {
        const g = c.createGain(); g.gain.value = 0.5 * I; g.connect(this.music);
        if (st % 8 === 0 || st === 6 || (st === 11 && this.intensity > 0.4) || (st === 14 && this.intensity > 0.6)) { this.tone(g, t, 0.28, 'sine', 95, 38, 1, 0.003); this.nz(g, t, 0.07, 'lowpass', 600, 150, 1, 0.5); }
        if (st % 4 === 2) this.nz(g, t, 0.05, 'highpass', 6000, 6000, 1, 0.1 + this.intensity * 0.12);
        if (st % 2 === 0) { const f = fr(ch[0]) / 2; const o = c.createOscillator(), og = c.createGain(), ff = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = st % 8 === 6 ? f * 1.5 : f; ff.type = 'lowpass'; ff.frequency.setValueAtTime(900 + this.intensity * 900, t); ff.frequency.exponentialRampToValueAtTime(200, t + sp * 0.9); og.gain.setValueAtTime(0.11 * I, t); og.gain.exponentialRampToValueAtTime(0.001, t + sp * 0.95); o.connect(ff); ff.connect(og); og.connect(this.music); o.start(t); o.stop(t + sp); }
        if (this.intensity > 0.5 && st % 4 === 0) { const f = fr(ch[(st >> 2) % 3] + 12); const gg = c.createGain(); gg.gain.value = 0.045; gg.connect(this.music); gg.connect(this.rev); this.tone(gg, t, 0.35, 'square', f, f, 1, 0.005); }
      }
      this.nextBeat += sp; this.beat++;
    }
  }
  update(dt) { this.updateAmbience(dt); this.updateMusic(dt); }
}
