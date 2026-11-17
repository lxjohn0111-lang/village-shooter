// Multiplayer matches.
//  Town Siege (4v4): a big symmetric town, one Ember Shrine per team. Shatter theirs, or win on kills.
//  Build & Battle (1v1): each commander gets 60 seconds and a build budget to fortify their half,
//  then both sides fight with two bots each until a shrine falls.
// Every machine owns its own player; the host (lowest player id) also owns the bots and decides the result.
// Whoever fires decides whether they hit; everyone simulates every shot so walls crumble the same way everywhere.
import * as THREE from 'three';
import { G, CELL, HALF, GX, GZ, clamp, rand, pick, terrainH, rng, TAU, fmtTime } from './util.js';
import { F_CORE, F_FREE, M } from './materials.js';
import { buildVillage, stamp, genTown, genDuel, duelBotPlan, mirrorRec, TEAM_COLORS, bpCost, footprint, DUEL_SPLIT } from './blueprints.js';
import { clanLook, ETYPES } from './actors.js';
import { Net, MODES } from './net.js';
import { freeSpot } from './modes.js';
import { profileCtx } from './build.js';

const PRIMARY_TYPE = { rifle: 'guard', smg: 'scout', shotgun: 'guard', sniper: 'sentry', lmg: 'heavy', launcher: 'elite', rocket: 'elite' };
const BOT_TYPES = ['guard', 'scout', 'guard', 'heavy', 'elite'];
const TYPE_IDS = Object.keys(ETYPES);
export const TEAM_NAMES = ['BLUE', 'RED'];
const TEAM_CSS = ['#4aa8ff', '#ff5a47'];
const DUEL_BUDGET = 3000;
const DUEL_ALLOWED = ['wall', 'palisade', 'gate', 'sandbags', 'spikes', 'tower', 'bastion', 'turret', 'mine', 'powder', 'bunker', 'stonehouse', 'crates', 'hay'];
const DUEL_LIMITS = { tower: 3, bastion: 1, turret: 3, mine: 8, bunker: 1, gate: 2, stonehouse: 2, powder: 4 };
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
const points = (c) => Math.round((c.wood || 0) + (c.stone || 0) + (c.iron || 0) * 2 + (c.gold || 0) * 0.5);

export class PvPMission {
  constructor(match) {
    this.kind = 'pvp'; this.mode = 'pvp'; this.pmode = match.mode; this.match = match;
    const info = MODES[match.mode], r = rng(match.seed);
    this.cfg = { title: info.name.toUpperCase(), sub: info.size + (match.offline ? ' · vs bots' : ''), env: match.mode === 'duel' ? 'noon' : r.pick(['golden', 'noon', 'overcast', 'dusk', 'golden']) };
    this.state = 'intro'; this.time = 0; this.timers = []; this.objs = []; this.bonus = []; this.buildings = []; this.endHold = 0;
    this.stats = { kills: 0, headshots: 0, bricks: 0, razed: 0, loot: 0, explosiveKills: 0, shots: 0, xp: 0, deaths: 0 };
    this.me = match.me; this.myTeam = (match.players.find((p) => p.id === match.me) || { team: 0 }).team;
    this.ents = new Map(); this.score = [0, 0]; this.killLimit = match.mode === 'duel' ? 30 : 40;
    this.phase = match.mode === 'duel' ? 'build' : 'fight'; this.phaseLeft = match.mode === 'duel' ? 60 : 0; this.fightTime = 0; this.fightLimit = match.mode === 'duel' ? 300 : 480;
    this.respawnT = -1; this.sendT = 0; this.botT = 0; this.clkT = 0; this.cores = []; this.pend = [];
    this.builds = [{ b: [], f: [] }, { b: [], f: [] }]; this.buildPts = DUEL_BUDGET; this.botBidNext = [700, 1100]; this.planI = 0; this.planT = 4;
  }
  local(t) { return t === this.myTeam ? 0 : 1; }
  global(lt) { return lt === 0 ? this.myTeam : 1 - this.myTeam; }
  host() { return Net.isHost(); }
  look(t) { return clanLook(TEAM_COLORS[t]); }
  spawnPoint(t, i = 0) { const s = t === 0 ? 1 : -1, x = ((i % 4) - 1.5) * 2.6 + rand(-0.5, 0.5); return freeSpot(x, 0, s * (33.5 + Math.floor(i / 4) * 1.6)); }

  // ------------------------------------------------------------------ setup
  start() {
    const w = G.world, mt = this.match;
    G.actors.clear(); G.fx.clear(); G.combat.clear(); G.terrain.resetTrees(); w.quiet = true; w.clear();
    const map = this.pmode === 'duel' ? genDuel(mt.seed) : genTown(mt.seed);
    const rt = this.rt = buildVillage(w, map, { tint: 0x8a8a8a }); G.terrain.updateSplat(w, rt.paths);
    G.r3.lampSources = rt.lamps.slice(); G.r3.setEnv(this.cfg.env); G.nav.rebuild(w); w.navDirty = false;
    this.buildInfos = new Map(); for (const b of rt.buildings) this.buildInfos.set(b.bid, b);
    for (const b of rt.buildings) if (b.type === 'shrine') {
      const team = b.rec.team, pieces = []; for (let i = 0; i < w.phwm; i++) if (w.palive[i] && w.pbid[i] === b.bid && (w.pflag[i] & F_CORE)) pieces.push(i);
      let max = 0; for (const id of pieces) max += w.pmax[id];
      this.cores[team] = { bid: b.bid, pieces, max: max || 1, pos: b.corePos, cx: b.cx, cz: b.cz };
    }
    this.buildings = rt.buildings.filter((b) => b.type !== 'shrine' && b.type !== 'lamp').map((b) => ({ info: b, total: w.bTotal[b.bid], dead: false }));
    w.quiet = false; G.diffDmg = 1; G.diffAcc = 1.05; G.noTarget = false;
    // the people in this match
    for (const p of mt.players) this.ents.set(p.id, { id: p.id, name: p.name, team: p.team, human: true, kills: 0, deaths: 0, actor: null });
    let bi = 0; for (const b of mt.bots) this.ents.set(b.id, { id: b.id, name: b.name, team: b.team, human: false, cmd: !!b.cmd, kills: 0, deaths: 0, actor: null, type: BOT_TYPES[bi++ % BOT_TYPES.length], role: (bi % 2) ? 'raider' : 'guard' });
    this.meEnt = this.ents.get(this.me);
    this.wireNet();
    const pl = G.player, sp = this.spawnPoint(this.myTeam, 0);
    pl.reset(sp.x, sp.z, this.myTeam === 0 ? 0 : Math.PI); pl.stats.dmgTaken = 0; pl.maxHp = 100; pl.hp = 100;
    G.weapons.setLoadout(G.profile.primary, G.profile.weapons, { grenades: 2 });
    if (this.phase === 'fight') this.beginFight(); else this.beginBuild();
    this.state = 'play';
    if (G.audio) { G.audio.setAmbience(G.r3.env.amb); G.audio.setMusic(this.phase === 'build' ? 'build' : 'combat'); }
  }

  spawnBots() {
    if (!this.host()) return;
    let i = 1; for (const e of this.ents.values()) if (!e.human && !e.actor) this.spawnEnt(e, this.spawnPoint(e.team, i++));
  }
  spawnEnt(e, p) {
    const lt = this.local(e.team), enemyCore = this.cores[1 - e.team], ownCore = this.cores[e.team];
    const type = e.human ? (PRIMARY_TYPE[e.primary] || 'guard') : e.type;
    const opts = { look: this.look(e.team), yaw: e.team === 0 ? Math.PI : 0, hpMul: e.human ? 1 : 1.1, dmgMul: 1.15 };
    if (!e.human) { if (e.role === 'raider' && enemyCore) { opts.role = 'raider'; opts.goal = { x: enemyCore.cx, z: enemyCore.cz }; } else if (ownCore) { opts.role = 'guard'; } }
    const a = G.actors.spawn(type, lt, p.x, p.y, p.z, opts);
    if (!e.human && opts.role === 'guard' && ownCore) a.post.set(ownCore.cx + rand(-6, 6), 0, ownCore.cz + (e.team === 0 ? -9 : 9));
    a.netId = e.id; a.netName = e.name; a.puppet = e.human || !this.host(); a.alerted = !a.puppet;
    if (a.puppet) a.net = { x: p.x, y: p.y, z: p.z, yaw: a.yaw, pitch: 0, mv: 0, mx: 0, mz: 0, c: 0, rl: 0 };
    e.actor = a; return a;
  }

  // ------------------------------------------------------------------ Build & Battle: the build minute
  bounds(t) { const C = GX >> 1; return t === 0 ? [8, C + DUEL_SPLIT, GX - 8, GZ - 8] : [8, 8, GX - 8, C - DUEL_SPLIT]; }
  beginBuild() {
    const me = this.myTeam, self = this, cz = me === 0 ? 1 : -1;
    const ctx = {
      match: true, infos: this.buildInfos, nextBid: () => 300 + me * 200,
      village: () => this.builds[me], color: () => TEAM_COLORS[me], afford: (c) => points(c) <= this.buildPts, spend: (c) => { const p = points(c); if (p > this.buildPts) return false; this.buildPts -= p; return true; }, refund: (c) => { this.buildPts += points(c); },
      count: (t) => this.builds[me].b.filter((b) => b.t === t).length, limit: (bp) => DUEL_LIMITS[bp.key] || 12, hall: () => 3, save: () => {}, track: () => {},
      bounds: this.bounds(me), freeLimit: () => 500, cats: ['defence', 'bricks'], allow: (k) => DUEL_ALLOWED.includes(k),
      camStart: [0, 13, cz * 40, me === 0 ? 0 : Math.PI, -0.5], camBounds: me === 0 ? [-48, 2, 48, 48] : [-48, -48, 48, -2],
      onPlace: (o) => { const bid = o.b ? [...this.buildInfos.keys()].pop() : 0; Net.send('place', { team: me, b: o.b, f: o.f, bid }); },
    };
    this.buildCtx = ctx; G.build.enter(ctx); if (G.ui) G.ui.showBuild(true);
    if (G.hud) G.hud.banner('BUILD YOUR DEFENCES', '#ffd24a', '60 seconds · ' + DUEL_BUDGET + ' points');
    void self;
  }
  // AI commander: lays out its plan one piece at a time during the minute
  botBuild(dt) {
    for (const e of this.ents.values()) {
      if (!e.cmd || e.human) continue;
      if (!e.plan) { e.plan = duelBotPlan(this.match.seed + e.team * 31); e.planI = 0; e.planT = 2; e.budget = DUEL_BUDGET; }
      e.planT -= dt; if (e.planT > 0 || e.planI >= e.plan.length) continue; e.planT = 52 / e.plan.length;
      let rec = Object.assign({}, e.plan[e.planI++].b); if (e.team === 1) rec = mirrorRec(rec); rec.x = Math.round(rec.x / 2) * 2; rec.z = Math.round(rec.z / 2) * 2;
      const fp = footprint(rec.t, rec.r), clash = [...this.buildInfos.values()].some((i) => { const f = footprint(i.rec.t, i.rec.r); return rec.x < i.rec.x + f[0] && rec.x + fp[0] > i.rec.x && rec.z < i.rec.z + f[1] && rec.z + fp[1] > i.rec.z; });
      if (clash) continue;
      const cost = points(bpCost(rec.t, 1)); if (cost > e.budget) continue; e.budget -= cost;
      const bid = this.botBidNext[e.team]++; this.applyPlace(e.team, rec, null, bid); Net.send('place', { team: e.team, b: rec, bid });
    }
  }
  applyPlace(team, rec, f, bid) {
    const w = G.world;
    if (rec) { const r = Object.assign({}, rec, { c: TEAM_COLORS[team] }); const info = stamp(w, r, bid, { tint: TEAM_COLORS[team] }); if (info) { this.buildInfos.set(info.bid, info); this.builds[team].b.push(r); G.fx.dust(info.cx, 0.3, info.cz, 4, info.radius); } }
    if (f) { w.addPiece(f[0], f[1], f[2], f[3], f[4], f[5], f[6], 1, F_FREE | (f[7] || 0)); this.builds[team].f.push(f); }
  }
  endBuild() {
    if (this.phase !== 'build') return;
    this.phase = 'fight'; if (G.build.active) G.build.exit(); if (G.ui) G.ui.showBuild(false);
    if (G.audio) { G.audio.ui('horn'); G.audio.setMusic('combat'); }
    // defences built during the minute come alive: turrets, tower marksmen, mines
    let n = 0;
    for (const info of this.buildInfos.values()) {
      const team = info.rec.team !== undefined ? info.rec.team : (this.builds[0].b.includes(info.rec) ? 0 : this.builds[1].b.includes(info.rec) ? 1 : -1); if (team < 0) continue;
      for (const s of info.spawns) {
        if (s.kind === 'mine') { G.actors.addMine(s.x, terrainH(s.x, s.z), s.z, this.local(team)); continue; }
        if (!this.host() || !(s.kind === 'turret' || s.kind === 'sentry')) continue;
        const id = 'T' + info.bid + '_' + (n++), e = { id, name: s.kind === 'turret' ? 'Turret' : 'Marksman', team, human: false, kills: 0, deaths: 0, type: s.kind, role: 'guard', fixed: true };
        this.ents.set(id, e); const a = this.spawnEnt(e, s.kind === 'turret' ? { x: s.x, y: s.y, z: s.z } : freeSpot(s.x, s.y, s.z)); a.hold = true;
      }
    }
    this.beginFight();
  }
  beginFight() {
    this.spawnBots(); const pl = G.player, sp = this.spawnPoint(this.myTeam, 0);
    pl.reset(sp.x, sp.z, this.myTeam === 0 ? 0 : Math.PI); pl.maxHp = 100; pl.hp = 100;
    if (G.weapons) G.weapons.holder.visible = true;
    if (G.hud) G.hud.banner(this.pmode === 'duel' ? 'FIGHT!' : 'TOWN SIEGE', TEAM_CSS[this.myTeam], 'Shatter the ' + TEAM_NAMES[1 - this.myTeam].toLowerCase() + ' shrine · first to ' + this.killLimit + ' kills');
  }

  // ------------------------------------------------------------------ networking
  wireNet() {
    Net.handlers = {};
    Net.on('s', (m) => {      // another human's state
      const e = this.ents.get(m.from); if (!e) return; e.primary = m.w || e.primary;
      if (m.d) return;
      if (!e.actor || e.actor.dead) this.spawnEnt(e, { x: m.p[0], y: m.p[1], z: m.p[2] });
      Object.assign(e.actor.net, { x: m.p[0], y: m.p[1], z: m.p[2], yaw: m.y + Math.PI, pitch: -m.pi, mv: m.mv, mx: m.mx, mz: m.mz, c: m.c, rl: m.rl });
    });
    Net.on('bs', (m) => {     // bot snapshot from the host
      if (this.host()) return;
      for (const b of m.b) {
        let e = this.ents.get(b[0]);
        if (!e) { e = { id: b[0], name: b[12] || 'Bot', team: b[11], human: false, kills: 0, deaths: 0, type: TYPE_IDS[b[10]] }; this.ents.set(b[0], e); }
        e.type = TYPE_IDS[b[10]] || e.type;
        if (!e.actor || e.actor.dead) { if (b[13]) continue; this.spawnEnt(e, { x: b[1], y: b[2], z: b[3] }); }
        Object.assign(e.actor.net, { x: b[1], y: b[2], z: b[3], yaw: b[4], pitch: b[5], mv: b[6], mx: b[7], mz: b[8], c: b[9] & 1, rl: b[9] & 2 });
      }
    });
    Net.on('f', (m) => this.remoteFire(m));
    Net.on('pj', (m) => this.remoteProjectile(m));
    Net.on('h', (m) => this.remoteHit(m));
    Net.on('k', (m) => this.onKilled(m, true));
    Net.on('place', (m) => { if (this.phase === 'build' || true) this.applyPlace(m.team, m.b || null, m.f || null, m.bid || (900 + Math.floor(Math.random() * 99))); });
    Net.on('mine', (m) => { for (const mn of G.actors.mines) if (!mn.dead && Math.hypot(mn.x - m.x, mn.z - m.z) < 0.4) { mn.dead = true; G.actors.detonate(mn); } });
    Net.on('clk', (m) => { if (this.host()) return; this.time = m.tm; this.score = m.sc; if (m.ph === 'fight' && this.phase === 'build') this.endBuild(); else if (this.phase === 'build') this.phaseLeft = m.pl; });
    Net.on('end', (m) => this.finish(m.w));
    Net.on('left', (m) => { const e = this.ents.get(m.id); if (!e) return; if (e.actor && !e.actor.dead) { e.actor.remove(); G.actors.list.splice(G.actors.list.indexOf(e.actor), 1); } this.ents.delete(m.id); if (G.hud) G.hud.feed(e.name + ' LEFT', '#aaa'); });
    Net.on('host', (m) => { if (m.id !== this.me) return; for (const e of this.ents.values()) if (!e.human && e.actor && !e.actor.dead) { e.actor.puppet = false; e.actor.alerted = true; } if (G.hud) G.hud.feed('YOU ARE NOW HOSTING THE BOTS', '#aaa'); });
    Net.on('disconnect', () => { if (this.state === 'play' && G.hud) G.hud.banner('CONNECTION LOST', '#ff5a47', 'Playing on against bots'); Net.offline = true; Net.host = this.me; for (const e of this.ents.values()) if (e.actor && !e.actor.dead && !e.human) e.actor.puppet = false; });
  }
  entOf(id) { return id === this.me ? this.meEnt : this.ents.get(id); }
  idOf(a) { return a === G.player ? this.me : a && a.netId ? a.netId : null; }

  onPlayerFire(o, dirs, d, st) {
    Net.send('f', { s: this.me, o: [r2(o.x), r2(o.y), r2(o.z)], d: dirs.map((v) => [r2(v.x * 1000) / 1000, r2(v.y * 1000) / 1000, r2(v.z * 1000) / 1000]), k: d.kind, dm: st.dmg, br: st.brick, rg: d.range, sp: d.vel });
  }
  onActorFire(a, o, d) {
    if (!a.netId || a.puppet) return;
    Net.send('f', { s: a.netId, o: [r2(o.x), r2(o.y), r2(o.z)], d: [[r2(d.x * 1000) / 1000, r2(d.y * 1000) / 1000, r2(d.z * 1000) / 1000]], k: a.T.snd, dm: a.T.dmg * a.dmgMul, br: 0.4, rg: a.T.range * 1.5, sp: a.T.vel });
  }
  onProjectile(p) {
    const id = this.idOf(p.owner); if (!id) return;
    Net.send('pj', { s: id, ty: p.type, o: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], v: [r2(p.vel.x), r2(p.vel.y), r2(p.vel.z)], dm: p.dmg, r: p.radius, l: p.life });
  }
  remoteFire(m) {
    const e = this.entOf(m.s), a = e && e.actor, team = e ? this.local(e.team) : 1; _v.set(m.o[0], m.o[1], m.o[2]);
    if (a && !a.dead) { a.lastFired = G.r3.time; a.gunKick = 1; }
    for (const dd of m.d) G.combat.fireBullet({ origin: _v, dir: _d.set(dd[0], dd[1], dd[2]), dmg: m.dm, brick: m.br, range: m.rg, shooter: a || null, team, speed: m.sp, foreign: true, tracer: true, color: team === 0 ? [0.6, 0.85, 1] : [1, 0.5, 0.25] });
    G.fx.muzzleFlash(m.o[0] + m.d[0][0] * 0.4, m.o[1] + m.d[0][1] * 0.4, m.o[2] + m.d[0][2] * 0.4, 1);
    if (G.audio) G.audio.shot(m.k, m.o[0], m.o[1], m.o[2]);
  }
  remoteProjectile(m) {
    const e = this.entOf(m.s), a = e && e.actor;
    const p = G.weapons.spawnProjectile(m.ty, new THREE.Vector3(m.o[0], m.o[1], m.o[2]), new THREE.Vector3(1, 0, 0), { dmg: m.dm, radius: m.r }, a || null, e ? this.local(e.team) : 1, m.l);
    p.vel.set(m.v[0], m.v[1], m.v[2]); p.life = m.l; p.foreign = true; p.sent = true;
  }
  // one of my bullets (or one of my bots') hit a body that lives on another machine
  netHit(target, amount, attacker, kind, dir, extra) {
    const by = this.idOf(attacker); if (!by) return;
    const e = this.ents.get(target.netId); if (!e) return;
    const owner = e.human ? e.id : Net.host;
    Net.send('h', { tg: e.id, dm: Math.round(amount * 10) / 10, k: kind, pt: extra ? extra.part : 1, pw: extra ? extra.power : 3, dr: dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : null, by }, owner);
    if (this.match.offline) this.remoteHit({ tg: e.id, dm: amount, k: kind, pt: extra ? extra.part : 1, pw: extra ? extra.power : 3, dr: dir ? [dir.x, dir.y, dir.z] : null, by });
  }
  remoteHit(m) {
    const src = this.entOf(m.by), dir = m.dr ? new THREE.Vector3(m.dr[0], m.dr[1], m.dr[2]) : null;
    if (m.tg === this.me) { const p = G.player; if (p.dead) return; p.lastBy = m.by; p.damage(m.dm, src && src.actor ? src.actor.pos : null, m.k); return; }
    const e = this.ents.get(m.tg); if (!e || !e.actor || e.actor.dead || e.actor.puppet) return;
    e.actor.damage(m.dm, src ? (src === this.meEnt ? G.player : src.actor) : null, m.k, dir, { part: m.pt, power: m.pw });
  }
  // somebody died: the owner of the body announces it, everyone ragdolls it and counts the kill
  onKilled(m, remote) {
    const e = this.entOf(m.who), killer = m.by === 'self' ? null : this.entOf(m.by);
    if (remote && e && e.actor && !e.actor.dead && e.actor.puppet) e.actor.die(killer && killer.actor, m.k, m.dr ? new THREE.Vector3(m.dr[0], m.dr[1], m.dr[2]) : null, { part: m.pt, power: m.pw });
    if (e) e.deaths++;
    if (killer && killer !== e) { killer.kills++; if (this.host()) this.score[killer.team]++; }
    if (killer === this.meEnt && e !== this.meEnt) {
      this.stats.kills++; if (m.k === 'head') this.stats.headshots++; if (m.k === 'explosion') this.stats.explosiveKills++;
      if (G.hud) G.hud.hitmarker(m.k === 'head', true); if (G.audio) G.audio.ui(m.k === 'head' ? 'headshot' : 'kill'); if (G.game) G.game.track('kills', 1);
    }
    if (G.hud && e) G.hud.feed((killer ? killer.name : '☠') + '  ' + (m.k === 'head' ? '◎' : m.k === 'explosion' ? '✹' : '▸') + '  ' + e.name, TEAM_CSS[killer ? killer.team : e.team]);
  }
  onActorKilled(a, attacker, kind) {
    if (a.puppet || !a.netId) return;           // puppets die when their owner says so
    const e = this.ents.get(a.netId); if (!e) return;
    const by = attacker === G.player ? this.me : attacker && attacker.netId ? attacker.netId : null, rag = a.rag;
    const m = { who: e.id, by, k: kind, pt: 1, pw: 3, dr: null }; void rag;
    Net.send('k', m); this.onKilled(m, false);
    if (!e.fixed) this.timers.push({ t: 6, fn: () => { if (this.state === 'play' && this.ents.has(e.id)) this.spawnEnt(e, this.spawnPoint(e.team, 1 + Math.floor(Math.random() * 4))); } });
  }
  onPlayerDeath(kind) {
    if (this.state !== 'play') return;
    const p = G.player, m = { who: this.me, by: p.lastBy === 'self' ? null : p.lastBy || null, k: kind, pt: 1, pw: 3, dr: null };
    Net.send('k', m); this.onKilled(m, false); this.stats.deaths++;
    this.respawnT = 5; if (G.audio) G.audio.ui('lose');
  }
  onMineTriggered(mn) { Net.send('mine', { x: r2(mn.x), z: r2(mn.z) }); }
  onRaiderAtGoal(a, dt) {
    a.goalT = (a.goalT || 0) - dt; if (a.goalT > 0) return; a.goalT = 0.8;
    const team = this.global(a.team), core = this.cores[1 - team]; if (!core) return;
    const w = G.world, alive = core.pieces.filter((id) => w.palive[id]); if (!alive.length) return;
    alive.sort((p, q) => w.py[q] - w.py[p]); w.damagePiece(alive[0], 30, null); a.gunKick = 1;
  }

  // ------------------------------------------------------------------ per frame
  coreHealth(t) { const c = this.cores[t]; if (!c) return 1; const w = G.world; let hp = 0; for (const id of c.pieces) if (w.palive[id]) hp += w.php[id]; return clamp(hp / c.max, 0, 1); }
  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    if (this.state !== 'play') return;
    this.time += dt;
    const host = this.host(), p = G.player;
    if (this.phase === 'build') {
      if (host) { this.phaseLeft -= dt; this.botBuild(dt); if (this.phaseLeft <= 0) this.endBuild(); }
    } else this.fightTime += dt;
    // my state, 15 times a second
    this.sendT -= dt;
    if (this.sendT <= 0 && this.phase === 'fight') {
      this.sendT = 1 / 15;
      Net.send('s', { p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], y: r2(p.yaw), pi: r2(p.pitch), mv: p.moving ? 1 : 0, mx: r2(p.vel.x / (p.speed || 1)), mz: r2(p.vel.z / (p.speed || 1)), c: p.crouch ? 1 : 0, rl: G.weapons.reloadT >= 0 ? 1 : 0, d: p.dead ? 1 : 0, w: G.weapons.slots[0] });
    }
    if (host) {
      this.botT -= dt;
      if (this.botT <= 0) {
        this.botT = 0.1; const list = [];
        for (const e of this.ents.values()) { const a = e.actor; if (e.human || !a || a.puppet) continue; list.push([e.id, r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r2(a.yaw), r2(a.aimPitch), a.moving ? 1 : 0, r2(a.moveX), r2(a.moveZ), (a.crouch > 0.5 ? 1 : 0) | (a.reloadT >= 0 ? 2 : 0), TYPE_IDS.indexOf(a.type), e.team, e.name, a.dead ? 1 : 0]); }
        Net.send('bs', { b: list });
      }
      this.clkT -= dt; if (this.clkT <= 0) { this.clkT = 1; Net.send('clk', { tm: r2(this.time), sc: this.score, ph: this.phase, pl: r2(this.phaseLeft) }); }
      // result
      if (this.phase === 'fight') {
        const h0 = this.coreHealth(0), h1 = this.coreHealth(1);
        let w = -1;
        if (h0 <= 0.4 || h1 <= 0.4) w = h0 <= 0.4 && h1 <= 0.4 ? (h0 > h1 ? 0 : 1) : h0 <= 0.4 ? 1 : 0;
        else if (this.score[0] >= this.killLimit || this.score[1] >= this.killLimit) w = this.score[0] >= this.killLimit ? 0 : 1;
        else if (this.fightTime >= this.fightLimit) w = this.score[0] !== this.score[1] ? (this.score[0] > this.score[1] ? 0 : 1) : (h0 >= h1 ? 0 : 1);
        if (w >= 0) { Net.send('end', { w }); this.finish(w); }
      }
    }
    // respawn
    if (p.dead && this.respawnT > 0) {
      this.respawnT -= dt; if (G.hud) G.hud.toast('RESPAWNING IN ' + Math.ceil(this.respawnT), 0.2, 'respawn');
      if (this.respawnT <= 0) { const sp = this.spawnPoint(this.myTeam, Math.floor(Math.random() * 4)); p.reset(sp.x, sp.z, this.myTeam === 0 ? 0 : Math.PI); G.weapons.refill(1); this.respawnT = -1; }
    }
    if (p.pos.y < -20 && !p.dead) p.damage(999);
    if (G.audio) { G.audio.intensity = 0.7; }
  }

  // ------------------------------------------------------------------ results
  finish(w) {
    if (this.state === 'ended') return; this.state = 'ended'; this.winner = w;
    if (G.build.active) { G.build.exit(); if (G.ui) G.ui.showBuild(false); }
    const win = w === this.myTeam, res = { win, kind: 'pvp', mode: this.pmode, reason: 'end', time: this.time, stats: this.stats, stars: win ? 3 : 0, bonus: [], accuracy: G.weapons.shotsFired ? Math.round(G.weapons.shotsHit / G.weapons.shotsFired * 100) : 0,
      score: [this.score[this.myTeam], this.score[1 - this.myTeam]], hearts: [this.coreHealth(this.myTeam), this.coreHealth(1 - this.myTeam)], rows: this.rows(), pct: 0, core: false, waves: 0 };
    if (G.hud) G.hud.banner(win ? 'VICTORY' : 'DEFEAT', win ? '#ffd24a' : '#ff5a47');
    if (G.audio) { G.audio.setMusic('off'); G.audio.ui(win ? 'win' : 'lose'); }
    Net.leave();
    setTimeout(() => { if (G.game) G.game.finishMission(this, res); }, 1800);
  }
  rows() { return [...this.ents.values()].map((e) => ({ name: e.name + (e.id === this.me ? ' (you)' : ''), team: e.team, k: e.kills, d: e.deaths, human: e.human, me: e.id === this.me })).filter((r) => !/^T\d/.test(r.name) && r.name !== 'Turret' && r.name !== 'Marksman').sort((a, b) => a.team - b.team || b.k - a.k); }

  // ------------------------------------------------------------------ HUD helpers
  markers() {
    const out = [], P = G.player.pos;
    for (let t = 0; t < 2; t++) { const c = this.cores[t]; if (c) out.push({ x: c.cx, y: 4.2, z: c.cz, label: t === this.myTeam ? 'DEFEND' : 'ATTACK', col: TEAM_CSS[t] }); }
    for (const e of this.ents.values()) { const a = e.actor; if (!a || a.dead || e.team !== this.myTeam || e === this.meEnt) continue; if (Math.hypot(a.pos.x - P.x, a.pos.z - P.z) < 50) out.push({ x: a.pos.x, y: a.pos.y + a.height + 0.35, z: a.pos.z, label: e.name, col: TEAM_CSS[e.team], small: true }); }
    return out;
  }
  hudInfo() {
    const me = this.myTeam, them = 1 - me;
    return {
      top: this.phase === 'build' ? 'BUILD ' + Math.max(0, Math.ceil(this.phaseLeft)) + 's · ' + this.buildPts + ' pts' : fmtTime(Math.max(0, this.fightLimit - this.fightTime)),
      score: `<span style="color:${TEAM_CSS[me]}">${TEAM_NAMES[me]} ${this.score[me]}</span>  ·  <span style="color:${TEAM_CSS[them]}">${this.score[them]} ${TEAM_NAMES[them]}</span>`,
      hearts: [this.coreHealth(me), this.coreHealth(them)], colors: [TEAM_CSS[me], TEAM_CSS[them]],
    };
  }
  // the mission interface the rest of the game calls into
  onPieceGone() { this.stats.bricks++; }
  onCollapse(n) { G.player.shake = Math.min(1.2, G.player.shake + n / 300); }
  onExplosion(x, y, z, r) { G.actors.explosionAt(x, y, z, r); }
  onPlayerShot() { this.stats.shots++; }
  onPlayerHitPiece() {}
  onDamageDealt(a, amount) { if (G.hud) G.hud.damageNumber(a, amount); }
  onExplosiveKill() {}
  onAlert() {}
  onHostageEscaped() {}
  say() {}
  addXp(n) { this.stats.xp += n; }
  end() { this.quit(); }
  quit() { Net.leave(); if (this.state !== 'ended') { this.state = 'ended'; } }
}
