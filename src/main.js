// Emberhold: Village Wars — boot, main loop and state machine.
import * as THREE from 'three';
import { G, clamp, rng, hashStr, terrainH } from './util.js';
import { SDK } from './sdk.js';
import { makeNoiseTexture } from './textures.js';
import { Renderer3D } from './render.js';
import { World } from './world.js';
import { Terrain } from './terrain.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { WeaponSys } from './weapons.js';
import { Actors } from './actors.js';
import { Nav } from './nav.js';
import { Mission } from './modes.js';
import { BuildMode, profileCtx } from './build.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { STORY } from './story.js';
import { genVillage } from './blueprints.js';
import { PvPMission } from './pvp.js';
import { Net } from './net.js';
import { Touch, isTouchDevice, orientationGuard } from './touch.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const Q = new URLSearchParams(location.search);
const progress = (f, text) => { $('ld-fill').style.width = Math.round(f * 100) + '%'; if (text) $('ld-text').textContent = text; };
const fade = async (on) => { $('fade').classList.toggle('on', on); await wait(on ? 380 : 60); };

G.state = 'boot'; G.timeScale = 1; G.autoplay = Q.has('auto'); G.godMode = Q.has('god'); G.devFreeRewards = true;
window.G = G;

async function boot() {
  progress(0.05, 'Contacting the valley…');
  G.audio = new AudioSys();
  await SDK.init();
  SDK.loadingStart();
  progress(0.15, 'Opening the ledgers…');
  G.game = new Game(); G.game.load();
  await wait(20);
  progress(0.3, 'Firing the kilns…');
  G.noiseTex = makeNoiseTexture();
  const canvas = $('c');
  G.r3 = new Renderer3D(canvas);
  const touch = isTouchDevice();
  let q = G.settings.quality; if (q < 0) { q = touch ? ((navigator.deviceMemory || 4) >= 6 ? 1 : 0) : 2; G.autoQuality = true; }
  if (Q.has('q')) { q = +Q.get('q'); G.autoQuality = false; }
  G.r3.quality = q; G.r3.buildComposer(); G.r3.resize();
  await wait(20);
  progress(0.45, 'Quarrying stone…');
  G.world = new World(G.r3.scene);
  G.nav = new Nav(); G.combat = new Combat();
  await wait(20);
  progress(0.6, 'Planting the forest…');
  G.terrain = new Terrain(G.r3.scene);
  await wait(20);
  progress(0.75, 'Loading magazines…');
  G.fx = new FX(G.r3.scene); G.fx.setEnv(G.r3.env);
  G.onEnvChange = (e) => { G.fx.setEnv(e); if (G.audio) G.audio.setAmbience(e.amb); };
  G.player = new Player(); G.weapons = new WeaponSys(G.r3.camera); G.actors = new Actors();
  G.build = new BuildMode(); G.hud = new HUD(); G.ui = new UI();
  Input.init(canvas);
  if (touch) { Input.touch = true; Input.noLock = true; document.body.classList.add('touch'); G.touch = new Touch(); orientationGuard(); }
  G.onPieceGone = (...a) => { if (G.mode && G.state === 'play') G.mode.onPieceGone(...a); };
  G.onCollapse = (...a) => { if (G.mode && G.state === 'play') G.mode.onCollapse(...a); };
  G.onPointerUnlock = onUnlock; G.onKey = onKey; G.onMissionEnd = onMissionEnd;
  G.onAdOpened = () => { G.adPause = true; }; G.onAdClosed = () => { G.adPause = false; };
  applySettings();
  window.addEventListener('resize', () => G.r3.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { G.game.flush(); if (G.audio.ctx && G.audio.ctx.state === 'running') G.audio.ctx.suspend(); if (G.state === 'play' && Input.locked) Input.unlock(); } else if (G.audio.ctx) G.audio.ctx.resume(); });
  window.addEventListener('pagehide', () => G.game.flush());
  progress(0.88, 'Raising Hollowmere…');
  await wait(20);
  loadMenuScene();
  G.r3.update(0.016); G.r3.render();     // compile shaders behind the loading screen
  progress(1, 'Ready');
  await wait(150);
  SDK.loadingStop();
  $('loading').classList.add('out'); setTimeout(() => $('loading').classList.add('hidden'), 700);
  requestAnimationFrame(frame);
  window.READY = true;
  const test = Q.get('test');
  if (test) { runTest(test); return; }
  const report = G.game.offline();
  if (!G.profile.story.s1 && !G.profile.seenPrologue) {
    // first launch: no title screen, no text — drop straight into the night Hollowmere burns
    G.profile.seenPrologue = true; G.game.save(true);
    startStory(0);
  } else {
    G.ui.showMenu(true, 'home');
    if (!G.ui.offlineReport(report)) G.ui.levelUps();
  }
}

function runTest(t) {
  const [k, v] = t.split(':');
  const [, , sd] = t.split(':');
  if (k === 'story') startStory(+v || 0); else if (k === 'mp') startMultiplayer(v || 'siege'); else if (k === 'defend') startDefend(); else if (k === 'build') enterBuild(); else G.ui.showMenu(true, k === 'menu' ? (v || 'home') : 'home');
}

// ---------------------------------------------------------------------- settings
function applySettings() {
  const s = G.settings, a = G.audio; a.vol.master = s.master; a.vol.music = s.music; a.vol.sfx = s.sfx; a.applyVolume();
  $('fps').classList.toggle('hidden', !s.showFps);
}
function setQuality(q) { G.autoQuality = false; G.r3.setQuality(q); G.terrain.buildGrass(q); }
G.applySettings = applySettings; G.setQuality = setQuality;

// ---------------------------------------------------------------------- scenes
function loadMenuScene() {
  G.mode = new Mission({ kind: 'menu', env: 'golden', village: G.profile.village, tint: G.game.color() });
  G.mode.start(); G.state = 'menu'; G.menuT = G.menuT || 0;
  G.weapons.holder.visible = false; G.r3.fx.low = 0; G.r3.fx.damage = 0; G.r3.fx.bars = 0;
  if (G.audio) { G.audio.setMusic('menu'); G.audio.setAmbience('day'); }
}
G.reloadMenuScene = () => { if (G.state === 'menu') loadMenuScene(); };

async function startMission(cfg, mission) {
  if (G.busy) return; G.busy = true;
  if (G.audio) G.audio.resume();
  await fade(true);
  G.ui.showMenu(false); G.ui.showBuild(false); G.ui.closeModal();
  if (G.build.active) G.build.exit();
  G.lastCfg = mission ? null : cfg;
  G.mode = mission || new Mission(cfg); G.mode.start();
  G.state = 'play'; G.timeScale = 1; G.r3.fx.damage = 0; G.r3.fx.flash = 0;
  G.hud.show(true); G.weapons.holder.visible = true;
  G.player.applyCamera(G.r3.camera, G.settings.fov);
  Input.wantLock = true; Input.lock();
  SDK.gameplayStart();
  if (!mission) G.hud.banner(cfg.title || '', '#ffffff', cfg.sub || '');
  if (cfg.storyDef && cfg.storyDef.id === 's1' && !G.profile.story.s1) G.hud.hint(Input.touch ? 'Left side: move  ·  Right side: look  ·  FIRE to shoot' : 'WASD move  ·  Mouse aim  ·  Click to fire  ·  Right-click to aim', 9);
  await fade(false);
  G.busy = false; G.startGrace = 0.8;
}
// multiplayer: matchmaking (20 s, then bots fill) then the match itself
async function startMultiplayer(mode) {
  if (G.busy || G.mpSearching) return; G.mpSearching = true;
  if (G.audio) G.audio.resume();
  G.ui.showQueue(mode);
  const name = (SDK.username() || G.profile.name || 'Ranger').slice(0, 16);
  const match = await Net.find(mode, name, (st) => G.ui.queueStatus(st));
  G.mpSearching = false;
  if (!match) { G.ui.closeModal(); return; }
  G.ui.closeModal(); if (G.audio) G.audio.ui('horn');
  startMission({ title: '', kind: 'pvp' }, new PvPMission(match));
}
function cancelMultiplayer() { Net.cancel(); G.mpSearching = false; G.ui.closeModal(); }
function startDefend() {
  const r = rng((Date.now() / 1000) | 0);
  startMission({ kind: 'defend', mode: 'defend', env: r.pick(['golden', 'dusk', 'overcast', 'night', 'storm', 'noon']), village: G.profile.village, level: Math.round(G.game.power()), tint: G.game.color(), spawn: { x: 0, z: 13, yaw: Math.PI }, title: 'DEFEND HOLLOWMERE', sub: 'Endless assault' });
}
function startStory(i) {
  const d = STORY[i]; if (!d) return;
  startMission({ kind: 'story', mode: d.kind === 'defend' ? 'defend' : 'assault', env: d.env, village: d.usePlayerVillage ? G.profile.village : d.village(), level: d.level, legion: d.legion !== false && d.kind !== 'defend' ? !!d.legion : false, boss: d.boss, extra: d.extra, stages: d.stages, bonus: d.bonus, dialog: d.dialog,
    waves: d.waves, allies: d.usePlayerVillage ? undefined : d.allies, spawn: d.spawn, primary: d.primary || G.profile.primary, title: d.title.toUpperCase(), sub: d.sub, storyDef: d, tint: d.kind === 'defend' ? G.game.color() : (d.legion ? 0x6a1410 : 0x8a8a8a), named: d.named, civilians: d.civilians, exit: d.exit, burning: d.burning, events: d.events });
}
async function enterBuild() {
  if (G.busy) return; G.busy = true; if (G.audio) G.audio.resume();
  await fade(true);
  G.ui.showMenu(false); G.hud.show(false); G.mode = null;
  G.build.enter(profileCtx()); G.state = 'build'; G.ui.showBuild(true);
  Input.wantLock = true; Input.lock(); SDK.gameplayStart();
  await fade(false); G.busy = false;
  if (!G.profile.hints.build) { G.profile.hints.build = 1; G.game.save(); G.hud.toast('Pick an item below, aim, and click to build', 4); }
}
function exitBuild(silent) { if (!G.build.active) return; G.build.exit(); G.ui.showBuild(false); Input.unlock(); SDK.gameplayStop(); if (!silent) toMenu(false, 'home'); }
function afterAd(fn) { SDK.gameplayStop(); SDK.midgame().then(fn); }
async function toMenu(ad, tab, then) {
  if (G.busy) return; G.busy = true;
  Input.unlock(); SDK.gameplayStop();
  await fade(true);
  if (ad) await SDK.midgame();
  G.hud.show(false); G.ui.showBuild(false);
  loadMenuScene();
  G.ui.showMenu(true, tab || 'home');
  await fade(false); G.busy = false;
  G.ui.levelUps(); if (then) then();
}
function resume() { Input.wantLock = true; Input.lock(); if (G.state === 'play') SDK.gameplayStart(); }
function restartMission() { if (G.lastCfg) startMission(G.lastCfg); else toMenu(false, 'mp'); }
function quitMission() {
  const m = G.mode;
  if (m && m.kind === 'pvp') { m.quit(); if (G.build.active) { G.build.exit(); G.ui.showBuild(false); } toMenu(false, 'mp'); return; }
  if (G.state === 'build') { exitBuild(); return; }
  if (!m) return;
  if (m.kind === 'story' || m.state === 'ended') toMenu(false, 'story');
  else m.end(m.kind === 'raid' ? m.raidStars() > 0 : m.wavesCleared > 0, 'quit');
}
function onMissionEnd(m, res) { SDK.gameplayStop(); G.hud.prompt(''); setTimeout(() => { G.ui.showResults(m, res); }, 500); }
Object.assign(G, { startMultiplayer, cancelMultiplayer, startDefend, startStory, enterBuild, exitBuild, toMenu, resume, restartMission, quitMission, afterAd });

function onUnlock() {
  if (G.state === 'play' && G.mode && G.mode.state === 'play' && !G.busy && G.ui.modalKind !== 'death' && G.ui.modalKind !== 'results') { if (G.mode.kind !== 'pvp') SDK.gameplayStop(); G.ui.showPause(); }
  else if (G.state === 'build' && Input.touch && !G.busy) G.ui.showPause();
}
function onKey(code, e) {
  if (G.state === 'build') {
    if (code === 'Tab') { if (Input.locked) Input.release(); else { Input.wantLock = true; Input.lock(); } }
    if (code === 'Escape' && !Input.locked) { if (G.ui.modalKind === 'pause') G.ui.closeModal(); else G.ui.showPause(); }
  } else if (G.state === 'play' && code === 'KeyP' && Input.locked) Input.release();
}

// ---------------------------------------------------------------------- main loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, aqT = 0, aqN = 0, aqSum = 0;
function frame(now) {
  requestAnimationFrame(frame);
  G.frames = (G.frames || 0) + 1;
  if (G.freeze) { last = now; return; }
  let real = Math.min(0.1, (now - last) / 1000); last = now;
  if (real <= 0) real = 0.001;
  fpsAcc += real; fpsN++;
  if (fpsAcc > 0.5) { if (G.settings.showFps) $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps · ' + G.world.alive + ' bricks'; fpsAcc = 0; fpsN = 0; }
  try { step(Math.min(0.05, real), real); } catch (err) { if (!G.errLogged) { G.errLogged = true; console.error(err); } }
  if (G.touch) G.touch.update();
  Input.endFrame();
}
if (Q.has('manual')) window.STEP = (n = 1, dt = 0.033) => { for (let i = 0; i < n; i++) { step(dt, dt); Input.endFrame(); } };

function step(rdt, real) {
  const r3 = G.r3, cam = r3.camera, m = G.mode, p = G.player;
  if (G.adPause) { r3.render(); return; }
  G.game.tick(real);
  if (G.state === 'menu') {
    G.menuT += rdt; const a = G.menuT * 0.045 + 0.6, R = 31 + Math.sin(G.menuT * 0.07) * 5;
    const F = G.menuFocus;
    if (F && F.t > 0) { F.t -= rdt; const b = G.menuT * 0.12; cam.position.set(F.x + Math.sin(b) * 13, 7.5, F.z + Math.cos(b) * 13); cam.lookAt(F.x, 2, F.z); }   // show off the building that went up today
    else { cam.position.set(Math.sin(a) * R + 6, 8.5 + Math.sin(G.menuT * 0.05) * 3, Math.cos(a) * R + 2); cam.lookAt(6, 3, 2); }
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    G.actors.update(rdt); G.combat.update(rdt); m.update(rdt); G.world.update(rdt); G.terrain.update(rdt); G.fx.update(rdt, cam);
    r3.focus.set(0, 0, 0); r3.fx.supp = 0; r3.update(rdt); r3.render(); G.audio.update(rdt);
    // one-off automatic quality calibration on first launch
    if (G.autoQuality && !document.hidden) { aqT += real; if (aqT > 1.2) { aqN++; aqSum += real; if (aqN >= 50) { const avg = aqSum / aqN; G.autoQuality = false; const q = avg > 0.05 ? 0 : avg > 0.03 ? 1 : 2; G.settings.quality = q; if (q !== r3.quality) { r3.setQuality(q); G.terrain.buildGrass(q); } G.game.save(); } } }
    return;
  }
  if (G.state === 'build') {
    G.build.update(rdt); G.world.update(rdt); G.terrain.update(rdt); G.fx.update(rdt, cam);
    r3.focus.copy(cam.position); r3.focus.y = 0; r3.update(rdt); r3.render(); G.audio.update(rdt); G.hud.tickBuild(rdt); G.ui.buildTick();
    return;
  }
  if (G.state !== 'play' || !m) { r3.render(); return; }
  const live = Input.locked || G.autoplay;
  const running = live || m.kind === 'pvp' || m.state === 'dead' || m.state === 'ended' || m.state === 'winning' || m.state === 'failing' || G.busy;
  if (G.startGrace > 0) { G.startGrace -= real; }
  else if (!live && m.state === 'play' && !G.busy && G.ui.modal.classList.contains('hidden')) { if (m.kind !== 'pvp') SDK.gameplayStop(); G.ui.showPause(); }
  if (!running) { r3.update(0); r3.render(); G.audio.update(rdt); return; }
  const dt = rdt * G.timeScale;
  const active = live && m.state !== 'ended' && m.state !== 'dead';
  if (m.kind === 'pvp' && m.phase === 'build') {
    G.build.update(rdt); G.actors.update(dt); G.combat.update(dt); m.update(dt); G.world.update(dt); G.terrain.update(dt); G.fx.update(dt, cam);
    r3.focus.copy(cam.position); r3.focus.y = 0; r3.update(dt); G.hud.update(rdt); G.hud.tickBuild(rdt); G.ui.buildTick(); r3.render(); G.audio.update(rdt);
    return;
  }
  p.update(dt, active);
  p.applyCamera(cam, G.settings.fov); cam.updateMatrixWorld();
  G.weapons.update(dt, p, active && !p.dead);
  // hold F: end raid / retire from defence
  if (active && m.state === 'play' && Input.keys.KeyF && (m.kind === 'raid' && (m.raidStars() > 0 || m.time > 20) || m.kind === 'defend' && m.waveState === 'wait' && m.wavesCleared > 0)) { m.endHold += real; if (m.endHold >= 1.2) m.end(true, 'retire'); } else m.endHold = 0;
  G.actors.update(dt); G.combat.update(dt); m.update(dt); G.world.update(dt); G.terrain.update(dt); G.fx.update(dt, cam);
  r3.fx.low = p.dead ? 1 : p.hp < 35 ? 1 - p.hp / 35 : 0;
  r3.focus.copy(p.pos); r3.update(dt);
  G.hud.update(rdt);
  r3.render(); G.audio.update(rdt);
}

boot().catch((e) => { console.error(e); $('ld-text').textContent = 'Failed to start: ' + (e && e.message ? e.message : e); });
