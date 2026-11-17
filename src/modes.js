// Mission engine shared by raids, village defence and story missions.
import * as THREE from 'three';
import { G, CELL, HALF, clamp, rand, randi, pick, terrainH, rng, TAU } from './util.js';
import { M, F_LOOT, F_CORE } from './materials.js';
import { buildVillage } from './blueprints.js';
import { LOOKS, clanLook, ETYPES } from './actors.js';
import { CAST } from './story.js';

const COUNTABLE = new Set(['hall', 'house', 'cabin', 'stonehouse', 'tudor', 'mill', 'quarry', 'forge', 'market', 'vault', 'barracks', 'tower', 'bastion', 'turret', 'gate', 'bunker', 'ashen', 'depot', 'tent', 'well', 'cage']);
const _v = new THREE.Vector3();

export function freeSpot(x, y, z) {
  const w = G.world;
  for (const r of [0, 0.5, 1, 1.5, 2.2, 3, 4]) for (let k = 0; k < (r ? 8 : 1); k++) {
    const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const gy = w.groundAt(px, pz, y + 0.6);
    if (gy <= y + 0.6 && w.boxFree(px - 0.3, gy + 0.1, pz - 0.3, px + 0.3, gy + 1.7, pz + 0.3)) return { x: px, y: gy, z: pz };
  }
  return { x, y, z };
}

export class Mission {
  constructor(cfg) {
    this.cfg = cfg; this.kind = cfg.kind; this.mode = cfg.mode || 'assault';
    this.state = 'intro'; this.time = 0; this.rt = null; this.timers = [];
    this.stats = { kills: 0, headshots: 0, bricks: 0, razed: 0, loot: 0, explosiveKills: 0, shots: 0, rescued: 0, xp: 0, alliesLost: 0 };
    this.coreAlive = 0; this.coreTotal = 0; this.coreDestroyed = false; this.corePieces = [];
    this.wave = 0; this.waveState = 'wait'; this.waveT = 4; this.spawnQueue = []; this.wavesCleared = 0;
    this.stage = 0; this.stages = cfg.stages || []; this.objs = []; this.bonus = cfg.bonus || [];
    this.dialogQ = []; this.dialogT = 0; this.fired = new Set(); this.revived = false; this.alarm = false; this.streak = 0; this.streakT = 0;
    this.timeLimit = cfg.timeLimit || 0; this.endHold = 0; this.boss = null; this.musicT = 0; this.heat = 0;
    this.spawn = cfg.spawn || { x: 0, z: 47, yaw: 0 };
    this.named = new Map(); this.civs = []; this.warnings = []; this.evFired = new Set(); this.evEvery = []; this.huntT = 0;
  }

  start() {
    const cfg = this.cfg, w = G.world;
    G.actors.clear(); G.fx.clear(); G.combat.clear(); G.terrain.resetTrees(); w.quiet = true; w.clear();
    const rt = this.rt = buildVillage(w, cfg.village, { tint: cfg.tint !== undefined ? cfg.tint : (cfg.legion ? 0x6a1410 : 0x2a5fa8), militia: false });
    G.terrain.updateSplat(w, rt.paths);
    G.r3.lampSources = rt.lamps.slice();
    if (G.r3.envName !== cfg.env) G.r3.setEnv(cfg.env || 'noon');
    G.nav.rebuild(w); w.navDirty = false;
    this.coreTotal = this.coreAlive = rt.coreTotal;
    for (let i = 0; i < w.phwm; i++) if (w.palive[i] && (w.pflag[i] & F_CORE)) this.corePieces.push(i);
    this.coreMax = 0; for (const id of this.corePieces) this.coreMax += w.pmax[id]; this.coreMax = this.coreMax || 1;
    this.buildings = rt.buildings.filter((b) => COUNTABLE.has(b.type)).map((b) => ({ info: b, total: w.bTotal[b.bid], dead: false }));
    this.bById = new Map(); for (const b of this.buildings) this.bById.set(b.info.bid, b);
    this.lootTotal = rt.lootTotal;
    const lvl = cfg.level || 1;
    G.diffAcc = clamp(0.72 + lvl * 0.022, 0.7, 1.25); G.diffDmg = 1;
    const hpMul = 1 + lvl * 0.03, dmgMul = 0.75 + lvl * 0.03;
    const look = cfg.legion ? LOOKS.legion : (cfg.rival ? clanLook(cfg.rival.color) : LOOKS.legion);
    this.enemyLook = look; this.hpMul = hpMul; this.dmgMul = dmgMul;
    if (this.kind !== 'menu') {
      const defend = this.mode === 'defend';
      let allies = 0; const allyCap = cfg.allies === undefined ? 99 : cfg.allies;
      let foes = 0; const foeCap = 26;
      const order = rt.spawns.slice().sort((a, b) => (a.kind === 'turret' || a.kind === 'sentry' ? -1 : 0) - (b.kind === 'turret' || b.kind === 'sentry' ? -1 : 0));
      for (const s of order) {
        if (s.kind === 'mine') { G.actors.addMine(s.x, terrainH(s.x, s.z), s.z, defend ? 0 : 1); continue; }
        if (s.kind === 'hostage') { if (!defend) { const a = G.actors.spawn('hostage', 0, s.x, s.y, s.z, { look: LOOKS.civilian }); a.cageBid = s.bid; a.goal = { x: this.spawn.x, z: this.spawn.z + 6 }; } continue; }
        const type = s.kind === 'guard' ? 'guard' : s.kind;
        if (!ETYPES[type]) continue;
        const p = s.kind === 'turret' ? { x: s.x, y: s.y, z: s.z } : freeSpot(s.x, s.y, s.z);
        if (defend) { if (allies >= allyCap && s.kind !== 'turret') continue; allies++; G.actors.spawn(type, 0, p.x, p.y, p.z, { look: LOOKS.ally, role: 'guard', hold: s.hold || type === 'sentry', yaw: Math.atan2(p.x, p.z), hpMul: 1.3 }).bid = s.bid; }
        else { if (foes >= foeCap && s.kind !== 'turret' && s.kind !== 'sentry') continue; foes++; const st = ETYPES[type].static; G.actors.spawn(type, 1, p.x, p.y, p.z, { look, hold: !!s.hold, hpMul, dmgMul, yaw: st ? Math.atan2(p.x, p.z) : rand(6.28) }).bid = s.bid; }
      }
      if (!defend) {
        const r = rng((cfg.village.seed || 1) + 77);
        for (const [type, n] of (cfg.extra || [])) for (let i = 0; i < n && foes < foeCap + 6; i++) {
          for (let k = 0; k < 30; k++) { const x = r.range(-24, 24), z = r.range(-24, 20); if (G.nav.isBlocked(x, z) || Math.hypot(x - this.spawn.x, z - this.spawn.z) < 14) continue; const p = freeSpot(x, 0, z); G.actors.spawn(type, 1, p.x, p.y, p.z, { look, hpMul, dmgMul, yaw: r() * 6.28 }); foes++; break; }
        }
        if (cfg.boss && rt.core) { const p = freeSpot(rt.core.x, 0, rt.core.z + 9); this.boss = G.actors.spawn('boss', 1, p.x, p.y, p.z, { look: LOOKS.legion, hpMul: 1, dmgMul: 1.1, yaw: 0 }); }
      } else if (cfg.kind === 'story' && cfg.allies !== undefined && allyCap > allies) {
        for (let i = allies; i < allyCap; i++) { const p = freeSpot(rand(-8, 8), 0, rand(8, 16)); G.actors.spawn('guard', 0, p.x, p.y, p.z, { look: LOOKS.ally, hpMul: 1.4, yaw: Math.PI }); }
      }
    } else {
      for (let i = 0; i < 4; i++) { const p = freeSpot(rand(-14, 14), 0, rand(8, 22)); G.actors.spawn('guard', 0, p.x, p.y, p.z, { look: LOOKS.ally, yaw: rand(6.28) }); }
    }
    if (this.cfg.exit && this.kind === 'story') this.faceExit();
    if (this.kind !== 'menu') this.spawnCast();
    const pl = G.player; pl.reset(this.spawn.x, this.spawn.z, this.spawn.yaw); pl.stats.dmgTaken = 0;
    if (G.profile && G.profile.bonds && (G.profile.bonds.ilka || 0) >= 3) { pl.maxHp = 120; pl.hp = 120; } else pl.maxHp = 100;
    if (this.kind !== 'menu') G.weapons.setLoadout(cfg.primary || G.profile.primary, G.profile.weapons, { grenades: 3 });
    this.setStage(0);
    w.quiet = false; this.state = this.kind === 'menu' ? 'menu' : 'play';
    this.say('start');
    if (G.audio) { G.audio.setAmbience(G.r3.env.amb); }
  }

  // start where the way to the exit is most open, looking down it
  faceExit() {
    const ex = this.cfg.exit, s0 = this.spawn, w = G.world; let best = null, bs = -1;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU * 3, r = (i / 40) * 7, x = s0.x + Math.cos(a) * r, z = s0.z + Math.sin(a) * r;
      if (!w.boxFree(x - 0.4, 0.1, z - 0.4, x + 0.4, 1.8, z + 0.4)) continue;
      const dx = ex.x - x, dz = ex.z - z, d = Math.hypot(dx, dz), h = w.raycast(x, 1.6, z, dx / d, 0, dz / d, 40), clear = h.id >= 0 ? h.t : 40;
      if (clear > bs) { bs = clear; best = { x, z, yaw: Math.atan2(-dx, -dz) }; }
    }
    if (best) this.spawn = best;
  }
  // named companions, villagers to escort, burning houses
  spawnCast() {
    const cfg = this.cfg;
    for (const n of (cfg.named || [])) {
      const p = freeSpot(n.x, 0, n.z);
      const a = G.actors.spawn(n.type, 0, p.x, p.y, p.z, { look: LOOKS.ally, hold: !!n.hold, hpMul: 3, yaw: Math.PI, role: n.follow ? 'escort' : 'guard' });
      a.named = n.name; a.castKey = n.key; if (n.follow) a.follow = G.player; this.named.set(n.name, a);
    }
    for (const c of (cfg.civilians || [])) {
      const p = freeSpot(c.x, 0, c.z);
      const a = G.actors.spawn('hostage', 0, p.x, p.y, p.z, { look: LOOKS.civilian, hpMul: 2.2, yaw: Math.PI });
      a.freed = true; a.follow = G.player; if (c.name) a.named = c.name; this.civs.push(a);
    }
    if (cfg.burning) {
      const r = rng(77), list = this.buildings.filter((b) => b.info.type !== 'hall');
      for (let i = 0; i < cfg.burning && list.length; i++) {
        const b = list.splice(Math.floor(r() * list.length), 1)[0], x = b.info.cx + r.range(-1.5, 1.5), z = b.info.cz + r.range(-1.5, 1.5), y = Math.max(0.2, G.world.groundAt(x, z, 8));
        for (let k = 0; k < 3; k++) G.fx.fires.push({ x: x + r.range(-2, 2), y: y + r.range(0, 1), z: z + r.range(-2, 2), t: 1e9, acc: r() });
        G.r3.lampSources.push({ x, y: y + 1.5, z, intensity: 55, color: 0xff6a20 });
      }
    }
  }

  // ---------------------------------------------------------------- objectives
  setStage(i) {
    this.stage = i; const defs = this.stages[i] || [];
    const keep = (this.objs || []).filter((o) => o.keep && !o.done);
    this.objs = defs.map((d) => Object.assign({ done: false, prog: '', left: d.sec || 0 }, d)).concat(keep);
    if (this.kind === 'raid') this.objs = [{ type: 'raidPct', text: 'Raze the village', done: false, prog: '' }, { type: 'core', text: 'Shatter the Ember Heart', done: false, prog: '' }];
    if (this.kind === 'defend') this.objs = [{ type: 'endless', text: 'Hold out as long as you can', done: false, prog: '' }, { type: 'protect', text: 'Keep the Ember Heart intact', done: false, prog: '' }];
    for (const o of this.objs) if (o.type === 'killType') o.total = G.actors.list.filter((a) => a.team === 1 && o.kinds.includes(a.type)).length;
    for (const o of this.objs) if (o.type === 'raze') { const have = this.buildings.filter((b) => o.kinds.includes(b.info.type)).length; if (have < o.n) o.n = Math.max(1, have); }
  }
  razedCount(kinds) { let n = 0; for (const b of this.buildings) if (b.dead && kinds.includes(b.info.type)) n++; return n; }
  pct() { let d = 0; for (const b of this.buildings) if (b.dead) d++; return this.buildings.length ? d / this.buildings.length : 0; }
  // hit points left in the Ember Heart (0..1); it shatters at 40%
  coreHealth() { if (this.coreDestroyed || !this.coreTotal) return 0; const w = G.world; let hp = 0; for (const id of this.corePieces) if (w.palive[id] && (w.pflag[id] & F_CORE)) hp += w.php[id]; return clamp(hp / this.coreMax, 0, 1); }
  evalObj(o) {
    switch (o.type) {
      case 'core': o.done = this.coreDestroyed; o.prog = this.coreDestroyed ? '' : Math.round((1 - clamp((this.coreHealth() - 0.4) / 0.6, 0, 1)) * 100) + '%'; break;
      case 'raidPct': { const p = Math.round(this.pct() * 100); o.prog = p + '%'; o.done = p >= 80; break; }
      case 'raze': { const n = this.razedCount(o.kinds); o.prog = Math.min(n, o.n) + '/' + o.n; o.done = n >= o.n; break; }
      case 'killType': { const left = G.actors.list.filter((a) => !a.dead && a.team === 1 && o.kinds.includes(a.type)).length; o.prog = (o.total - left) + '/' + o.total; o.done = left === 0; break; }
      case 'killall': { const left = G.actors.countAlive(1); o.prog = left + ' left'; o.done = left === 0; break; }
      case 'boss': o.done = !!this.boss && this.boss.dead; o.prog = this.boss && !this.boss.dead ? Math.ceil(this.boss.hp / this.boss.maxHp * 100) + '%' : ''; break;
      case 'loot': o.prog = Math.min(this.stats.loot, o.n) + '/' + o.n; o.done = this.stats.loot >= o.n; break;
      case 'rescue': o.prog = Math.min(this.stats.rescued, o.n) + '/' + o.n; o.done = this.stats.rescued >= o.n; break;
      case 'waves': o.prog = Math.min(this.wavesCleared, o.n) + '/' + o.n; o.done = this.wavesCleared >= o.n; break;
      case 'endless': o.prog = 'Wave ' + Math.max(1, this.wave); break;
      case 'protect': o.prog = Math.round(clamp((this.coreHealth() - 0.4) / 0.6, 0, 1) * 100) + '%'; o.done = false; o.passive = true; break;
      case 'extract': { const ex = this.cfg.exit || this.spawn, d = Math.hypot(G.player.pos.x - ex.x, G.player.pos.z - ex.z); o.prog = Math.round(d) + ' m'; o.done = d < (ex.r || 7); break; }
      case 'escort': { const esc = this.stats.escaped || 0, alive = this.escortees().filter((a) => !a.dead && !a.escaped).length; o.prog = esc + '/' + o.n; o.done = esc >= o.n; if (!o.done && esc + alive < o.n) this.fail('The villagers did not make it'); break; }
      case 'survive': { o.left = Math.max(0, o.left - this.dtObj); o.prog = Math.ceil(o.left) + 's'; o.done = o.left <= 0; break; }
      case 'timer': { o.passive = true; o.left = Math.max(0, o.left - this.dtObj); o.prog = Math.floor(o.left / 60) + ':' + String(Math.floor(o.left % 60)).padStart(2, '0'); if (o.left <= 0) this.fail('Out of time'); break; }
    }
    return o.done;
  }
  evalBonus(b) {
    const s = this.stats;
    switch (b.type) {
      case 'quiet': return !this.alarm; case 'escortAll': return (s.escaped || 0) >= this.civs.length && this.civs.length > 0;
      case 'headshots': return s.headshots >= b.n; case 'time': return this.time <= b.sec; case 'coreHealth': return clamp((this.coreHealth() - 0.4) / 0.6, 0, 1) * 100 >= b.pct;
      case 'kills': return s.kills >= b.n; case 'explosiveKills': return s.explosiveKills >= b.n; case 'nodamage': return G.player.stats.dmgTaken < b.hp;
      case 'loot': return s.loot >= b.n; case 'raze': return this.razedCount(b.kinds) >= b.n;
    }
    return false;
  }
  bonusProg(b) {
    const s = this.stats;
    switch (b.type) { case 'headshots': return s.headshots + '/' + b.n; case 'kills': return s.kills + '/' + b.n; case 'explosiveKills': return s.explosiveKills + '/' + b.n; case 'loot': return s.loot + '/' + b.n; case 'raze': return this.razedCount(b.kinds) + '/' + b.n; }
    return '';
  }
  escortees() { return G.actors.list.filter((a) => a.T.civilian && a.freed && a.follow); }
  markers() {
    const out = [], rt = this.rt, P = G.player.pos;
    for (const w of this.warnings) out.push({ x: w.x, y: w.y + 0.6, z: w.z, label: 'INCOMING', col: '#ff3020' });
    for (const a of G.actors.list) if (!a.dead && !a.escaped && a.team === 0 && (a.named || (a.T.civilian && a.follow)) && Math.hypot(a.pos.x - P.x, a.pos.z - P.z) < 45) out.push({ x: a.pos.x, y: a.pos.y + a.height + 0.35, z: a.pos.z, label: a.named || 'VILLAGER', col: a.named ? '#7ec8ff' : '#bfe6ff', small: true });
    for (const o of this.objs) {
      if (o.done) continue;
      if (o.type === 'core' && rt.core) out.push({ x: rt.core.x, y: rt.core.y + 1, z: rt.core.z, label: 'HEART', col: '#ff8a2a' });
      else if (o.type === 'raze') { for (const b of this.buildings) if (!b.dead && o.kinds.includes(b.info.type)) out.push({ x: b.info.cx, y: 3, z: b.info.cz, label: 'DESTROY', col: '#ff5a3a' }); }
      else if (o.type === 'killType' || o.type === 'boss') { for (const a of G.actors.list) if (!a.dead && a.team === 1 && (o.type === 'boss' ? a.T.boss : o.kinds.includes(a.type))) out.push({ x: a.pos.x, y: a.pos.y + a.height + 0.4, z: a.pos.z, label: a.T.boss ? 'VARRO' : 'TARGET', col: '#ff3a3a' }); }
      else if (o.type === 'rescue') { for (const a of G.actors.list) if (a.T.civilian && !a.freed && !a.dead) out.push({ x: a.pos.x, y: 2.6, z: a.pos.z, label: 'FREE', col: '#5ad0ff' }); }
      else if (o.type === 'loot') { for (const b of this.buildings) if (b.info.type === 'vault' && !b.dead) out.push({ x: b.info.cx, y: 3.2, z: b.info.cz, label: 'VAULT', col: '#ffd24a' }); }
      else if (o.type === 'extract' || o.type === 'escort' || o.type === 'survive' && this.cfg.exit) { const ex = this.cfg.exit || this.spawn; out.push({ x: ex.x, y: terrainH(ex.x, ex.z) + 1.5, z: ex.z, label: o.type === 'survive' ? 'HOLD' : 'EXIT', col: '#6aff7a' }); }
      else if (o.type === 'protect' && rt.core && this.mode === 'defend') out.push({ x: rt.core.x, y: rt.core.y + 1, z: rt.core.z, label: 'DEFEND', col: '#5ad0ff' });
    }
    if (this.kind === 'raid') for (const b of this.buildings) if (b.info.type === 'vault' && !b.dead) out.push({ x: b.info.cx, y: 3.2, z: b.info.cz, label: 'VAULT', col: '#ffd24a' });
    return out;
  }

  // ---------------------------------------------------------------- dialogue
  say(key) {
    for (const ev of (this.cfg.events || [])) {
      if (ev.at === key && !this.evFired.has(ev)) { this.evFired.add(ev); this.runEvent(ev); }
      if (ev.every && ev.from === key && !this.evEvery.some((e) => e.ev === ev)) this.evEvery.push({ ev, t: 0.5 });
      if (ev.every && ev.until === key) this.evEvery = this.evEvery.filter((e) => e.ev !== ev);
    }
    if (this.fired.has(key)) return; this.fired.add(key);
    for (const d of (this.cfg.dialog || [])) if (d.at === key) this.dialogQ.push(d);
  }
  line(who, text) { this.dialogQ.push({ who, text }); }

  // ---------------------------------------------------------------- world events
  onPieceGone(id, mat, bid, flags, x, y, z, how) {
    if (this.state === 'menu') return;
    this.stats.bricks++;
    if (flags & F_LOOT) { this.stats.loot++; this.addXp(8); G.fx.goldBurst(x, y, z); if (G.audio) G.audio.ui('coin'); if (G.hud) G.hud.feed('+1 GOLD BAR', '#ffd24a'); this.say('loot' + this.stats.loot); }
    if (flags & F_CORE) { this.coreAlive--; if (!this.coreDestroyed && this.coreHealth() <= 0.4) this.shatterCore(); }
    if (mat === M.EMBER && !(flags & F_CORE)) { for (const l of G.r3.lampSources) if (!l.dead && Math.abs(l.x - x) < 1.2 && Math.abs(l.z - z) < 1.2 && Math.abs(l.y - y) < 1.5) l.dead = true; }
    const b = this.bById.get(bid);
    if (b && !b.dead && G.world.bAlive[bid] < b.total * 0.55) {
      b.dead = true; this.stats.razed++;
      if (this.mode !== 'defend') { this.addXp(b.info.type === 'hall' ? 300 : 70); if (G.hud) G.hud.feed(b.info.bp.name.toUpperCase() + ' DESTROYED', '#ff9a4a'); }
      else if (G.hud) G.hud.feed(b.info.bp.name.toUpperCase() + ' LOST', '#ff5a5a');
      for (const l of G.r3.lampSources) if (!l.dead && Math.hypot(l.x - b.info.cx, l.z - b.info.cz) < b.info.radius) l.dead = true;
      this.say('raze' + this.razedCount([b.info.type]));
      // cages free their prisoners
      if (b.info.type === 'cage') for (const a of G.actors.list) if (a.T.civilian && a.cageBid === bid && !a.freed) { a.freed = true; if (this.cfg.exit) a.follow = G.player; this.stats.rescued++; this.addXp(150); if (G.hud) G.hud.feed('MASON FREED', '#5ad0ff'); if (G.audio) G.audio.ui('star'); this.say('rescue' + this.stats.rescued); }
    }
    if (how === 'fall') { for (const a of G.actors.list) if (a.T.turret && !a.dead && Math.abs(a.pos.x - x) < 0.8 && Math.abs(a.pos.z - z) < 0.8 && a.pos.y - y < 1.2 && a.pos.y >= y) a.die(null, 'fall'); }
  }
  shatterCore() {
    this.coreDestroyed = true; const c = this.rt.core;
    G.timeScale = 0.25; this.timers.push({ t: 0.5, fn: () => { G.timeScale = 1; } });
    for (let i = 0; i < 4; i++) this.timers.push({ t: 0.05 + i * 0.09, fn: () => G.combat.explosion(c.x + rand(-1, 1), c.y * (i / 4) + 0.4, c.z + rand(-1, 1), 5.5, 500, null, -1) });
    this.timers.push({ t: 0.1, fn: () => { for (const id of this.corePieces) G.world.removePiece(id, 'blast', _v.set(rand(-1, 1), 1, rand(-1, 1)).normalize(), 12); } });
    G.r3.fx.flash = 1.2; for (const l of G.r3.lampSources) if (Math.hypot(l.x - c.x, l.z - c.z) < 4) l.dead = true;
    if (G.hud) G.hud.banner(this.mode === 'defend' ? 'THE EMBER HEART IS LOST' : 'EMBER HEART SHATTERED', this.mode === 'defend' ? '#ff4a3a' : '#ffb04a');
    if (this.mode !== 'defend') { this.addXp(500); if (G.audio) G.audio.ui('star'); }
    else this.timers.push({ t: 2.2, fn: () => this.end(this.kind === 'defend' && this.wavesCleared > 0, 'core') });
  }
  onCollapse(n) { if (n > 60 && G.hud && this.mode !== 'defend' && this.state === 'play') G.hud.feed('STRUCTURAL COLLAPSE', '#d0d0d0'); G.player.shake = Math.min(1.2, G.player.shake + n / 300); }
  onExplosion(x, y, z, r) { G.actors.explosionAt(x, y, z, r); }
  onPlayerShot() { this.stats.shots++; this.heat = 1; }
  onPlayerHitPiece() { }
  onDamageDealt(a, amount) { if (G.hud) G.hud.damageNumber(a, amount); }
  onExplosiveKill() { this.stats.explosiveKills++; }
  onAlert(a) { if (a.team === 1 && !this.alarm && this.mode !== 'defend') { this.alarm = true; this.say('alert'); if (G.audio) G.audio.ui('alarm'); if (G.hud) G.hud.feed('YOU HAVE BEEN SPOTTED', '#ff5a3a'); } }
  onBossHalf(b) { this.say('bosshalf'); for (let i = 0; i < 5; i++) { const p = freeSpot(b.pos.x + rand(-9, 9), 0, b.pos.z + rand(-9, 9)); const a = G.actors.spawn(i < 2 ? 'elite' : 'guard', 1, p.x, p.y, p.z, { look: LOOKS.legion, hpMul: this.hpMul, dmgMul: this.dmgMul }); a.alert(G.player.pos, true); } if (G.audio) G.audio.ui('horn'); }
  onHostageEscaped(a) { this.stats.escaped = (this.stats.escaped || 0) + 1; this.addXp(80); if (G.hud) G.hud.feed((a.named || 'VILLAGER') + ' IS SAFE', '#7ec8ff'); if (G.audio) G.audio.ui('star'); }
  fail(why) { if (this.state !== 'play') return; this.state = 'failing'; if (G.hud) G.hud.banner('MISSION FAILED', '#ff4a3a', why); if (G.audio) G.audio.ui('alarm'); this.timers.push({ t: 2.2, fn: () => { this.state = 'play'; this.end(false, 'fail'); } }); }

  // ---------------------------------------------------------------- scripted set pieces
  runEvent(ev) {
    switch (ev.do) {
      case 'barrage': return this.barrage(ev);
      case 'collapse': return this.collapse(ev);
      case 'reinforce': return this.reinforce(ev);
      case 'timer': { const o = { type: 'timer', text: ev.text, left: ev.sec, done: false, prog: '', keep: true, passive: true }; this.objs.push(o); if (G.hud) G.hud.banner(ev.text.toUpperCase(), '#ff6a3a', ev.sec + ' seconds'); return; }
      case 'env': return G.r3.setEnv(ev.name);
      case 'bark': { const a = this.named.get(ev.name); if (a) G.actors.bark(a, ev.text); return; }
      case 'killAlly': { const a = this.named.get(ev.name); if (!a) return; this.timers.push({ t: ev.after || 0, fn: () => { if (a.dead) return; a.mortal = true; a.die(null, 'bullet', new THREE.Vector3(0, 0, 1), { part: 1, power: 4 }); if (ev.key) this.say(ev.key); } }); return; }
    }
  }
  // shells whistle in, the impact point glows red for a second, then it goes off
  barrage(ev) {
    const p = G.player.pos, n = ev.n || 3, yaw = G.player.yaw;
    for (let i = 0; i < n; i++) {
      this.timers.push({ t: 0.2 + i * rand(0.35, 0.9), fn: () => {
        let x, z;
        for (let k = 0; k < 8; k++) {
          if (ev.near === 'ahead') { const d = rand(7, 17); x = p.x - Math.sin(yaw) * d + rand(-6, 6); z = p.z - Math.cos(yaw) * d + rand(-6, 6); }
          else { const a = rand(TAU), d = rand(4, 12); x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
          if (!G.actors.list.some((a) => a.team === 0 && !a.dead && (a.T.civilian || a.named) && Math.hypot(a.pos.x - x, a.pos.z - z) < 4.5)) break;
        }
        const y = Math.max(terrainH(x, z), G.world.groundAt(x, z, 30)), w = { x, y, z, t: 1.35 };
        this.warnings.push(w); G.fx.warn(x, y, z, 1.35); if (G.audio) G.audio.incoming(x, y, z);
        this.timers.push({ t: 1.35, fn: () => { this.warnings.splice(this.warnings.indexOf(w), 1); G.combat.explosion(x, y + 0.4, z, 4.4, 240, null, 1, true); } });
      } });
    }
  }
  // a building comes down in a rolling chain of blasts
  collapse(ev) {
    const P = G.player.pos, yaw = G.player.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let cands = this.buildings.filter((b) => !b.dead && b.info.type !== 'hall' && (!ev.type || ev.type.includes(b.info.type)));
    const score = (b) => { const dx = b.info.cx - P.x, dz = b.info.cz - P.z, d = Math.hypot(dx, dz); if (d < b.info.radius + 4 || d > 32) return 1e9; return ev.near === 'ahead' ? d - (dx * fx + dz * fz) * 1.5 : d; };
    cands.sort((a, b) => score(a) - score(b));
    for (let k = 0; k < (ev.n || 1) && k < cands.length; k++) {
      const b = cands[k].info; if (score(cands[k]) >= 1e9) break;
      for (let i = 0; i < 4; i++) this.timers.push({ t: k * 0.6 + i * 0.16, fn: () => G.combat.explosion(b.cx + rand(-1.5, 1.5), 0.6 + i * 1.3, b.cz + rand(-1.5, 1.5), Math.max(4, b.radius * 0.75), 900, null, 1, true) });
    }
  }
  edgePoint(side) {
    if (side === 'any') side = pick(['north', 'south', 'east', 'west']);
    const t = rand(-26, 26);
    return side === 'north' ? [t, -41] : side === 'south' ? [t, 41] : side === 'east' ? [41, t] : [-41, t];
  }
  reinforce(ev) {
    let i = 0;
    for (const [type, n] of ev.units) for (let k = 0; k < n; k++) {
      this.timers.push({ t: (i++) * 0.35, fn: () => {
        const [x, z] = this.edgePoint(ev.side || 'any');
        const a = G.actors.spawn(type, 1, x, terrainH(x, z), z, { look: this.enemyLook, role: 'hunter', hpMul: this.hpMul, dmgMul: this.dmgMul, yaw: Math.atan2(-x, -z) });
        a.alerted = true; a.react = 0.4; a.lastSeen.copy(G.player.pos); a.investigate = true; a.investT = 0;
      } });
    }
    if (G.audio) G.audio.ui('horn'); if (G.hud) G.hud.feed('ENEMY REINFORCEMENTS', '#ff7a5a');
  }
  onRaiderAtGoal(a, dt) {
    a.goalT = (a.goalT || 0) - dt; if (a.goalT > 0 || this.coreDestroyed) return; a.goalT = 0.8;
    const alive = this.corePieces.filter((id) => G.world.palive[id] && (G.world.pflag[id] & F_CORE));
    if (!alive.length) return;
    alive.sort((p, q) => G.world.py[q] - G.world.py[p]); const id = alive[0]; G.world.damagePiece(id, a.T.melee ? 80 : a.T.sapper ? 50 : 32, null); a.swing = a.T.melee ? 0 : a.swing;
    G.world.pieceCenter(id, _v); G.fx.sparks(_v.x, _v.y, _v.z, 6, 4); if (G.audio) G.audio.impact('glass', _v.x, _v.y, _v.z);
    if (G.hud) G.hud.toast('THE HEART IS UNDER ATTACK', 1.5, 'core');
  }
  onActorKilled(a, attacker, kind) {
    if (this.state === 'menu') return;
    const byPlayer = attacker === G.player;
    if (a.team === 1) {
      if (byPlayer) {
        this.stats.kills++; const head = kind === 'head'; if (head) this.stats.headshots++;
        this.streak = this.streakT > 0 ? this.streak + 1 : 1; this.streakT = 3.2;
        const xp = Math.round(a.T.xp * (head ? 1.5 : 1));
        this.addXp(xp);
        if (G.hud) { G.hud.feed((head ? 'HEADSHOT  ' : kind === 'explosion' ? 'BLAST KILL  ' : kind === 'melee' ? 'HAMMERED  ' : 'KILL  ') + a.T.name.toUpperCase() + '  +' + xp, head ? '#ffd24a' : '#ffffff'); if (this.streak >= 2) G.hud.streak(this.streak); }
        if (G.audio) G.audio.ui(head ? 'headshot' : 'kill');
        if (G.game) G.game.track(head ? 'headshots' : null, 1), G.game.track('kills', 1);
      } else if (kind === 'debris' || kind === 'fall') { this.addXp(a.T.xp); this.stats.kills++; if (G.hud) G.hud.feed('CRUSHED  ' + a.T.name.toUpperCase() + '  +' + a.T.xp, '#d0d0d0'); if (G.game) G.game.track('kills', 1); }
      if (a.T.boss) { G.timeScale = 0.2; this.timers.push({ t: 0.7, fn: () => { G.timeScale = 1; } }); if (G.hud) G.hud.banner('WARLORD VARRO IS DEAD', '#ffb04a'); }
    } else if (a.team === 0) { if (a.T.civilian) { if (G.hud) G.hud.feed('MASON KILLED', '#ff5a5a'); } else { this.stats.alliesLost++; if (G.hud) G.hud.feed((a.T.turret ? 'TURRET' : 'GUARD') + ' DOWN', '#ff7a6a'); } }
    // last enemy standing in an assault: brief slow-mo
    if (a.team === 1 && this.mode !== 'defend' && byPlayer && G.actors.countAlive(1) === 0) { G.timeScale = 0.3; this.timers.push({ t: 0.45, fn: () => { G.timeScale = 1; } }); }
  }
  addXp(n) { this.stats.xp += n; }

  onPlayerDeath() {
    if (this.state !== 'play') return;
    this.state = 'dead'; G.timeScale = 0.35; this.timers.push({ t: 0.5, fn: () => { G.timeScale = 1; } });
    if (G.ui) this.timers.push({ t: 0.9, fn: () => G.ui.showDeath(!this.revived) });
  }
  revive() { const p = G.player; p.dead = false; p.hp = p.maxHp; p.invuln = 3.5; this.revived = true; this.state = 'play'; G.weapons.refill(0.5); G.r3.fx.damage = 0; }

  // ---------------------------------------------------------------- waves
  waveDef(n) {
    if (this.cfg.waves) return this.cfg.waves[n - 1] || null;
    const out = [], add = (t, c) => { if (c > 0) out.push([t, Math.round(c)]); };
    add('guard', 2 + n * 0.9); add('scout', 1 + n * 0.6); if (n >= 2) add('brute', (n - 1) * 0.45); if (n >= 3) add('sapper', (n - 2) * 0.5); if (n >= 4) add('heavy', (n - 3) * 0.34); if (n >= 6) add('elite', (n - 5) * 0.4);
    return out;
  }
  startWave() {
    this.wave++; const def = this.waveDef(this.wave); if (!def) return;
    const dirs = [rand(6.28)]; if (this.wave > 1) dirs.push(dirs[0] + rand(1.5, 4.5)); if (this.wave > 4) dirs.push(rand(6.28));
    for (const [type, n] of def) for (let i = 0; i < n; i++) this.spawnQueue.push({ type, dir: pick(dirs) });
    this.spawnQueue.sort(() => Math.random() - 0.5);
    this.waveState = 'active'; this.say('wave' + this.wave);
    if (G.hud) G.hud.banner('WAVE ' + this.wave, '#ff9a4a', this.spawnQueue.length + ' hostiles inbound');
    if (G.audio) G.audio.ui('horn');
  }
  updateWaves(dt) {
    if (this.coreDestroyed) return;
    if (this.waveState === 'wait') {
      this.waveT -= dt; if (G.hud && this.waveT < 5.5) G.hud.toast('Next wave in ' + Math.ceil(this.waveT), 0.3, 'wave');
      if (this.waveT <= 0) { if (this.waveDef(this.wave + 1)) this.startWave(); else this.waveState = 'done'; }
    } else if (this.waveState === 'active') {
      const alive = G.actors.countAlive(1);
      this.spT = (this.spT || 0) - dt;
      if (this.spawnQueue.length && alive < 15 && this.spT <= 0) {
        this.spT = 0.35; const q = this.spawnQueue.pop(), a0 = q.dir + rand(-0.35, 0.35), R = rand(40, 43);
        const x = clamp(Math.sin(a0) * R, -43, 43), z = clamp(Math.cos(a0) * R, -43, 43), c = this.rt.core || { x: 0, z: 0 };
        const lv = (this.cfg.level || 1) + (this.cfg.waves ? 0 : this.wave * 0.8);
        const a = G.actors.spawn(q.type, 1, x, terrainH(x, z), z, { look: this.enemyLook, role: 'raider', goal: { x: c.x, z: c.z }, hpMul: 1 + lv * 0.03, dmgMul: 0.7 + lv * 0.025, yaw: Math.atan2(-x, -z) });
        a.alerted = true; a.react = 0.3;
      }
      if (!this.spawnQueue.length && alive === 0) {
        this.wavesCleared = this.wave; this.waveState = 'wait'; this.waveT = 9; this.addXp(120 + this.wave * 60);
        G.weapons.refill(0.6); G.player.heal(40);
        if (G.hud) G.hud.banner('WAVE ' + this.wave + ' REPELLED', '#6aff7a', 'Ammunition resupplied');
        if (G.audio) G.audio.ui('star');
        if (G.game) G.game.track('waves', 1);
      }
    }
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt / Math.max(0.05, G.timeScale || 1); if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    if (this.state === 'menu' || this.state === 'ended') return;
    this.time += dt; this.streakT -= dt; this.heat = Math.max(0, this.heat - dt * 0.25);
    // dialogue pump
    this.dialogT -= dt;
    if (this.dialogT <= 0 && this.dialogQ.length) { const d = this.dialogQ.shift(); this.dialogT = 2.2 + d.text.length * 0.055; if (G.hud) G.hud.subtitle(d.who, d.text, this.dialogT); if (G.audio) G.audio.ui('radio'); }
    for (const d of (this.cfg.dialog || [])) if (typeof d.at === 'number' && this.time >= d.at && !this.fired.has(d)) { this.fired.add(d); this.dialogQ.push(d); }
    if (this.state !== 'play') return;
    for (const ev of (this.cfg.events || [])) {
      if (typeof ev.at === 'number' && this.time >= ev.at && !this.evFired.has(ev)) { this.evFired.add(ev); this.runEvent(ev); }
      if (ev.every && typeof ev.from === 'number' && this.time >= ev.from && !this.evFired.has(ev)) { this.evFired.add(ev); this.evEvery.push({ ev, t: 0.1 }); }
    }
    for (const e of this.evEvery) { e.t -= dt; if (e.t <= 0) { e.t = e.ev.every; this.runEvent(e.ev); } }
    // reinforcements always have a rough idea where you are
    this.huntT -= dt; if (this.huntT <= 0) { this.huntT = 3.5; for (const a of G.actors.list) if (a.role === 'hunter' && !a.dead && !a.los) { a.lastSeen.set(G.player.pos.x + rand(-4, 4), G.player.pos.y, G.player.pos.z + rand(-4, 4)); a.investigate = true; a.investT = 0; a.alerted = true; } }
    this.dtObj = dt;
    if (!this.coreDestroyed && this.coreTotal && this.coreHealth() <= 0.4) this.shatterCore();
    if (this.mode === 'defend') this.updateWaves(dt);
    // objectives
    let all = this.objs.length > 0;
    for (const o of this.objs) { const was = o.done; this.evalObj(o); if (o.done && !was && !o.passive) { if (G.audio) G.audio.ui('star'); if (G.hud) G.hud.feed('OBJECTIVE COMPLETE', '#6aff7a'); } if (!o.done && !o.passive && o.type !== 'endless') all = false; if (o.type === 'endless') all = false; }
    if (this.kind === 'story' && all) {
      if (this.stage + 1 < this.stages.length) { this.setStage(this.stage + 1); this.say('stage' + this.stage); if (G.hud) G.hud.banner('NEW OBJECTIVE', '#ffd24a', this.objs[0] ? this.objs[0].text : ''); }
      else { this.say('win'); this.state = 'winning'; this.timers.push({ t: 2.4, fn: () => this.end(true, 'complete') }); }
    }
    if (this.kind === 'raid') {
      const p = this.pct();
      if (p >= 0.8 && this.coreDestroyed && this.state === 'play') { this.state = 'winning'; if (G.hud) G.hud.banner('TOTAL DESTRUCTION', '#ffd24a'); this.timers.push({ t: 2.5, fn: () => this.end(true, 'stars') }); }
      if (this.timeLimit && this.time >= this.timeLimit) this.end(this.raidStars() > 0, 'time');
    }
    // adaptive music
    this.musicT -= dt;
    if (this.musicT <= 0 && G.audio) {
      this.musicT = 0.5; let hot = 0; for (const a of G.actors.list) if (!a.dead && a.team === 1 && a.alerted) hot++;
      const I = clamp(hot / 6 + this.heat * 0.4, 0, 1); G.audio.intensity += (I - G.audio.intensity) * 0.3;
      G.audio.setMusic(hot > 0 || this.heat > 0.3 || this.mode === 'defend' && this.waveState === 'active' ? 'combat' : 'calm');
    }
    if (G.player.pos.y < -20) G.player.damage(999);
  }
  raidStars() { return (this.pct() >= 0.5 ? 1 : 0) + (this.coreDestroyed ? 1 : 0) + (this.pct() >= 0.8 ? 1 : 0); }

  end(win, reason) {
    if (this.state === 'ended') return; this.state = 'ended'; G.timeScale = 1;
    const s = this.stats, res = { win, reason, kind: this.kind, time: this.time, stats: s, pct: this.pct(), core: this.coreDestroyed, waves: this.wavesCleared, stars: 0, bonus: [], accuracy: G.weapons.shotsFired ? Math.round(G.weapons.shotsHit / G.weapons.shotsFired * 100) : 0, revived: this.revived };
    if (this.kind === 'raid') { res.stars = this.raidStars(); res.win = res.stars > 0; }
    else if (this.kind === 'story') { res.bonus = this.bonus.map((b) => ({ text: b.text, done: win && this.evalBonus(b) })); res.stars = win ? 1 + res.bonus.filter((b) => b.done).length : 0; }
    else if (this.kind === 'defend') { res.win = this.wavesCleared > 0; res.stars = this.wavesCleared >= 10 ? 3 : this.wavesCleared >= 5 ? 2 : this.wavesCleared >= 1 ? 1 : 0; }
    if (G.audio) { G.audio.setMusic('off'); G.audio.ui(res.win ? 'win' : 'lose'); }
    if (G.game) G.game.finishMission(this, res);
  }
}
