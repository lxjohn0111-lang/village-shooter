// Meta-game: profile, saving, economy, XP, rival villages, quests, achievements, mission rewards.
import { G, clamp, rand, randi, rng, hashStr } from './util.js';
import { SDK } from './sdk.js';
import { BP, starterVillage, genVillage, rivalIdentity, CLAN_COLORS } from './blueprints.js';
import { WEAPONS, upgradeCost } from './weapons.js';
import { STORY, BOND_PERK } from './story.js';
import { footprint } from './blueprints.js';

const SAVE_KEY = 'emberhold_save_v1';
const DAY = 86400000;

export const DAILY = [{ gold: 400 }, { wood: 700, stone: 700 }, { iron: 250, gold: 300 }, { gold: 900 }, { wood: 1500, stone: 1500 }, { ember: 5 }, { gold: 3000, ember: 8 }];
export const QUEST_POOL = [
  { key: 'kills', text: 'Eliminate {n} enemies', n: [20, 35, 50] }, { key: 'headshots', text: 'Land {n} headshots', n: [8, 14, 20] },
  { key: 'bricks', text: 'Destroy {n} bricks', n: [400, 900, 1600] }, { key: 'raidsWon', text: 'Win {n} raids', n: [1, 2, 3] },
  { key: 'bars', text: 'Loot {n} gold bars', n: [10, 20, 30] }, { key: 'waves', text: 'Repel {n} defence waves', n: [3, 5, 8] },
  { key: 'razed', text: 'Raze {n} enemy buildings', n: [5, 10, 16] }, { key: 'built', text: 'Place {n} buildings or bricks in your village', n: [5, 15, 40] },
  { key: 'missions', text: 'Complete {n} missions of any kind', n: [2, 3, 5] },
];
export const ACHIEVEMENTS = [
  { id: 'k1', stat: 'kills', n: 100, name: 'Blooded', ember: 3 }, { id: 'k2', stat: 'kills', n: 500, name: 'Veteran', ember: 8 }, { id: 'k3', stat: 'kills', n: 2500, name: 'One-Ranger Army', ember: 25 },
  { id: 'h1', stat: 'headshots', n: 50, name: 'Sharpshooter', ember: 4 }, { id: 'h2', stat: 'headshots', n: 400, name: 'Deadeye', ember: 15 },
  { id: 'b1', stat: 'bricks', n: 5000, name: 'Demolition Apprentice', ember: 3 }, { id: 'b2', stat: 'bricks', n: 50000, name: 'Wrecking Crew', ember: 10 }, { id: 'b3', stat: 'bricks', n: 300000, name: 'Down to the Last Brick', ember: 30 },
  { id: 'r1', stat: 'raidsWon', n: 5, name: 'Raider', ember: 4 }, { id: 'r2', stat: 'raidsWon', n: 30, name: 'Scourge', ember: 12 }, { id: 'r3', stat: 'raidsWon', n: 120, name: 'Terror of the Valleys', ember: 30 },
  { id: 'w1', stat: 'wavesBest', n: 5, name: 'Stand Fast', ember: 4 }, { id: 'w2', stat: 'wavesBest', n: 10, name: 'Unbroken', ember: 10 }, { id: 'w3', stat: 'wavesBest', n: 20, name: 'The Wall', ember: 25 },
  { id: 's1', stat: 'storyDone', n: 5, name: 'Halfway to the Citadel', ember: 6 }, { id: 's2', stat: 'storyDone', n: 10, name: 'Emberwarden', ember: 20 }, { id: 's3', stat: 'storyStars', n: 30, name: 'Flawless Campaign', ember: 30 },
  { id: 't1', stat: 'trophyPeak', n: 200, name: 'Known in the Valleys', ember: 5 }, { id: 't2', stat: 'trophyPeak', n: 1000, name: 'Legend', ember: 25 },
  { id: 'z1', stat: 'razed', n: 60, name: 'Urban Renewal', ember: 5 }, { id: 'c1', stat: 'cores', n: 10, name: 'Heartbreaker', ember: 8 }, { id: 'v1', stat: 'built', n: 200, name: 'Master Mason', ember: 8 },
];
export const LEAGUES = [[0, 'Unranked'], [50, 'Timber III'], [120, 'Timber II'], [200, 'Timber I'], [300, 'Stone III'], [420, 'Stone II'], [560, 'Stone I'], [720, 'Iron III'], [900, 'Iron II'], [1100, 'Iron I'], [1350, 'Ember II'], [1650, 'Ember I'], [2000, 'Emberwarden']];

export function defaultProfile() {
  return {
    v: 1, level: 1, xp: 0, trophies: 0, res: { gold: 1000, wood: 900, stone: 900, iron: 120, ember: 5 },
    village: starterVillage(), color: 1, weapons: { rifle: 1, pistol: 1, sledge: 1 }, primary: 'rifle',
    story: {}, stats: {}, quests: { day: 0, list: [] }, ach: {}, daily: { last: 0, streak: 0 },
    lastTick: Date.now(), lastSeen: Date.now(), rivals: [], rivalSeed: (Math.random() * 1e9) | 0, supplyAt: 0, log: [], seenPrologue: false, hints: {}, bonds: { marek: 0, wren: 0, tobias: 0, ilka: 0 }, days: {}, pvp: { played: 0, won: 0 }, name: '',
    settings: { quality: -1, sens: 1, fov: 72, master: 0.8, music: 0.55, sfx: 1, invertY: false, showFps: false },
  };
}

export class Game {
  constructor() { this.p = null; this.dirty = false; this.saveT = 0; this.tickT = 0; this.pendingLevelUps = []; }

  load() {
    let p = null;
    let raw = SDK.getItem(SAVE_KEY);
    // first launch with the Data module: carry over a save an earlier build kept in localStorage
    if (!raw && SDK.storage() === 'data') { const old = SDK.legacyItem(SAVE_KEY); if (old) { raw = old; this.migrated = true; } }
    try { if (raw) p = JSON.parse(raw); } catch (e) { p = null; }
    const d = defaultProfile();
    if (!p || p.v !== 1 || !p.village || !p.village.b) { p = d; this.fresh = true; this.migrated = false; }   // keep an unreadable old save untouched
    else { for (const k in d) if (p[k] === undefined) p[k] = d[k]; for (const k in d.res) if (typeof p.res[k] !== 'number' || !isFinite(p.res[k])) p.res[k] = d.res[k]; for (const k in d.settings) if (p.settings[k] === undefined) p.settings[k] = d.settings[k]; p.village.b = p.village.b.filter((b) => BP[b.t]); if (!p.village.f) p.village.f = []; }
    this.p = G.profile = p; G.settings = p.settings;
    if (!p.rivals.length) this.rollRivals();
    this.rollQuests();
    if (this.migrated) this.flush();          // move the old local save into the Data module right away
    return p;
  }
  save(now) { this.dirty = true; if (now) this.flush(); }
  // the Data module debounces writes itself (1–30 s), so writing the whole profile every few seconds is cheap
  flush() {
    if (!this.p) return; this.p.lastSeen = Date.now();
    let json = JSON.stringify(this.p);
    if (json.length > 900000) { this.p.log = []; json = JSON.stringify(this.p); console.warn('[save] profile is ' + Math.round(json.length / 1024) + ' KB, close to the 1 MB Data module limit'); }
    if (SDK.setItem(SAVE_KEY, json)) { this.dirty = false; if (this.migrated) { SDK.dropLegacy(SAVE_KEY); this.migrated = false; } }
  }
  reset() { this.p = G.profile = defaultProfile(); G.settings = this.p.settings; this.rollRivals(); this.rollQuests(); this.flush(); }
  stat(k) { return this.p.stats[k] || 0; }

  // ------------------------------------------------------------ economy
  hallLevel() { const h = this.p.village.b.find((b) => b.t === 'hall'); return h ? h.l || 1 : 1; }
  count(type) { let n = 0; for (const b of this.p.village.b) if (b.t === type) n++; return n; }
  cap() { return 4000 + this.hallLevel() * 3000 + this.count('vault') * 4000; }
  prod() { const out = { gold: 0, wood: 0, stone: 0, iron: 0 }, k = 1 + (this.hallLevel() - 1) * 0.15; for (const b of this.p.village.b) { const pr = BP[b.t].prod; if (pr) for (const r in pr) out[r] += pr[r] * k; } out.gold += 60; return out; }
  buildCost(cost) { if (!this.perk('tobias')) return cost; const o = {}; for (const k in cost) o[k] = Math.ceil(cost[k] * 0.9); return o; }
  canAfford(cost) { for (const k in cost) if ((this.p.res[k] || 0) < cost[k]) return false; return true; }
  spend(cost) { if (!this.canAfford(cost)) return false; for (const k in cost) this.p.res[k] -= cost[k]; this.save(); if (G.ui) G.ui.refreshTop(); return true; }
  addRes(obj, capped = false) { const cap = this.cap(); for (const k in obj) { if (!obj[k] || this.p.res[k] === undefined) continue; let v = this.p.res[k] + obj[k]; if (capped && k !== 'ember') v = Math.max(this.p.res[k], Math.min(cap, v)); this.p.res[k] = Math.max(0, Math.round(v)); } this.save(); if (G.ui) G.ui.refreshTop(); }
  tick(dt) {
    this.saveT += dt; if (this.dirty && this.saveT > 4) { this.saveT = 0; this.flush(); }
    this.tickT += dt;
    if (this.tickT > 15) { const h = this.tickT / 3600; this.tickT = 0; const pr = this.prod(), add = {}; for (const k in pr) add[k] = pr[k] * h; this.acc = this.acc || {}; for (const k in add) { this.acc[k] = (this.acc[k] || 0) + add[k]; if (this.acc[k] >= 1) { const n = Math.floor(this.acc[k]); this.acc[k] -= n; this.addRes({ [k]: n }, true); } } this.p.lastTick = Date.now(); }
  }
  defenceRating() {
    const W = { tower: 12, bastion: 26, turret: 20, barracks: 30, wall: 1.5, palisade: 0.8, gate: 6, mine: 4, bunker: 36, sandbags: 1, spikes: 1.2, vault: 2 }; let d = this.hallLevel() * 10;
    for (const b of this.p.village.b) d += W[b.t] || 0; d += Math.min(40, (this.p.village.f || []).length * 0.02);
    return Math.round(d);
  }
  // returns a report of what happened while the player was away
  offline() {
    const p = this.p, now = Date.now(), hrs = clamp((now - (p.lastTick || now)) / 3600000, 0, 10), out = { hours: hrs, gained: {}, raids: [] };
    if (hrs > 0.03) { const pr = this.prod(), before = Object.assign({}, p.res); const add = {}; for (const k in pr) add[k] = Math.round(pr[k] * hrs); this.addRes(add, true); for (const k in add) out.gained[k] = p.res[k] - before[k]; }
    p.lastTick = now; p.lastSeen = now; this.save(true);
    return out;
  }

  // ------------------------------------------------------------ progression
  xpNeed(l = this.p.level) { return 400 + l * 260 + l * l * 18; }
  addXp(n) { const p = this.p; p.xp += Math.round(n); const ups = []; while (p.xp >= this.xpNeed()) { p.xp -= this.xpNeed(); p.level++; ups.push(p.level); const unlocked = Object.values(WEAPONS).filter((w) => w.unlock === p.level).map((w) => w.name); this.pendingLevelUps.push({ level: p.level, unlocked, reward: { gold: 300 + p.level * 120, ember: p.level % 5 === 0 ? 5 : 1 } }); this.addRes({ gold: 300 + p.level * 120, ember: p.level % 5 === 0 ? 5 : 1 }); } this.save(); return ups; }
  league() { let l = LEAGUES[0]; for (const x of LEAGUES) if (this.p.trophies >= x[0]) l = x; return l[1]; }
  power() { return clamp(this.p.level * 0.75 + this.p.trophies / 85, 1, 20); }
  track(key, n = 1) {
    if (!key) return; const p = this.p; p.stats[key] = (p.stats[key] || 0) + n;
    for (const q of p.quests.list) if (q.key === key && !q.claimed) q.prog = Math.min(q.goal, q.prog + n);
    this.dirty = true;
  }
  setMax(key, v) { if ((this.p.stats[key] || 0) < v) { this.p.stats[key] = v; this.dirty = true; } }
  rollQuests(force) {
    const p = this.p, day = Math.floor(Date.now() / DAY);
    if (!force && p.quests.day === day && p.quests.list.length) return;
    const r = rng(day * 7919 + p.rivalSeed), pool = QUEST_POOL.slice(), list = [];
    for (let i = 0; i < 3; i++) { const q = pool.splice(Math.floor(r() * pool.length), 1)[0], tier = Math.min(2, Math.floor(r() * 3)), goal = q.n[tier]; list.push({ key: q.key, text: q.text.replace('{n}', goal), goal, prog: 0, claimed: false, reward: { gold: 350 + tier * 300, ember: 1 + (tier === 2 ? 1 : 0), xp: 250 + tier * 150 } }); }
    p.quests = { day, list }; this.save();
  }
  claimQuest(i) { const q = this.p.quests.list[i]; if (!q || q.claimed || q.prog < q.goal) return null; q.claimed = true; this.addRes({ gold: q.reward.gold, ember: q.reward.ember }); this.addXp(q.reward.xp); return q.reward; }
  achReady() { return ACHIEVEMENTS.filter((a) => !this.p.ach[a.id] && this.stat(a.stat) >= a.n); }
  claimAch(id) { const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a || this.p.ach[id] || this.stat(a.stat) < a.n) return false; this.p.ach[id] = 1; this.addRes({ ember: a.ember }); return true; }
  dailyReady() { const day = Math.floor(Date.now() / DAY); return this.p.daily.last !== day; }
  claimDaily() { const p = this.p, day = Math.floor(Date.now() / DAY); if (p.daily.last === day) return null; p.daily.streak = p.daily.last === day - 1 ? p.daily.streak + 1 : 1; p.daily.last = day; const rw = DAILY[(p.daily.streak - 1) % 7]; this.addRes(rw); this.save(true); return rw; }
  claimSupply() { const p = this.p, rw = { gold: 400 + p.level * 90, wood: 300 + p.level * 60, stone: 300 + p.level * 60, iron: 60 + p.level * 20 }; p.supplyAt = Date.now() + 4 * 3600000; this.addRes(rw); this.save(true); return rw; }
  supplyReady() { return Date.now() >= (this.p.supplyAt || 0); }

  // ------------------------------------------------------------ armory
  owns(id) { return !!this.p.weapons[id]; }
  buyWeapon(id) { const w = WEAPONS[id]; if (this.owns(id) || this.p.level < w.unlock) return false; if (!this.spend({ gold: w.cost })) return false; this.p.weapons[id] = 1; this.save(true); return true; }
  upgradeWeapon(id) { const l = this.p.weapons[id]; if (!l || l >= 5) return false; if (!this.spend(upgradeCost(id, l))) return false; this.p.weapons[id] = l + 1; this.save(true); return true; }
  equip(id) { if (this.owns(id) && id !== 'pistol' && id !== 'sledge') { this.p.primary = id; this.save(); } }

  // ------------------------------------------------------------ rivals
  rollRivals() {
    const p = this.p; p.rivalSeed = (p.rivalSeed * 1103515245 + 12345) >>> 0; const r = rng(p.rivalSeed), pw = this.power(), list = [];
    for (let i = 0; i < 5; i++) {
      const level = clamp(Math.round(pw + [-2, -1, 0, 1, 3][i] + r.range(-0.6, 0.6)), 1, 20), seed = (r() * 1e9) | 0, idn = rivalIdentity(seed);
      list.push({ seed, level, name: idn.name, chief: idn.chief, color: idn.color, trophies: Math.max(0, Math.round(p.trophies + (level - pw) * 40 + r.range(-30, 30))), loot: { gold: Math.round((350 + level * 260) * r.range(0.8, 1.3)), wood: Math.round((250 + level * 170) * r.range(0.7, 1.3)), stone: Math.round((250 + level * 170) * r.range(0.7, 1.3)), iron: Math.round((40 + level * 55) * r.range(0.7, 1.3)) } });
    }
    p.rivals = list; this.save();
  }
  rivalVillage(rv) { return genVillage(rv.seed, rv.level, {}); }
  color() { return CLAN_COLORS[this.p.color % CLAN_COLORS.length]; }

  // ------------------------------------------------------------ mission results
  finishMission(m, res) {
    const p = this.p, s = res.stats, cfg = m.cfg, rw = { gold: 0, wood: 0, stone: 0, iron: 0, ember: 0, xp: s.xp, trophies: 0 };
    this.track('missions', 1); this.track('bricks', m.mode === 'defend' ? 0 : s.bricks); this.track('razed', m.mode === 'defend' ? 0 : s.razed); this.track('bars', s.loot);
    if (res.core && m.mode !== 'defend') this.track('cores', 1);
    if (res.kind === 'raid') {
      const L = cfg.rival.loot, pct = res.pct, barV = m.lootTotal ? L.gold * 0.55 / m.lootTotal : 0;
      rw.gold = Math.round(s.loot * barV + L.gold * (0.3 * pct + (res.core ? 0.25 : 0))); rw.wood = Math.round(L.wood * pct * (res.core ? 1.25 : 1)); rw.stone = Math.round(L.stone * pct * (res.core ? 1.25 : 1)); rw.iron = Math.round(L.iron * pct * (res.core ? 1.25 : 1));
      const diff = clamp(1 + (cfg.rival.level - this.power()) * 0.12, 0.5, 1.8);
      rw.trophies = res.win ? Math.round([0, 9, 18, 30][res.stars] * diff) : -Math.round(8 / diff);
      rw.xp += res.stars * 160; if (res.stars === 3) rw.ember = 1;
      this.track('raids', 1); if (res.win) { this.track('raidsWon', 1); if (!cfg.code) this.rollRivals(); }
      if (cfg.code) { rw.trophies = 0; rw.gold = Math.round(rw.gold * 0.5); }
    } else if (res.kind === 'defend') {
      for (let i = 1; i <= res.waves; i++) { rw.gold += 110 + i * 45; rw.wood += 60 + i * 20; rw.stone += 60 + i * 20; rw.iron += 10 + i * 6; }
      rw.trophies = res.waves * 2; rw.ember = Math.floor(res.waves / 5); this.setMax('wavesBest', res.waves);
    } else if (res.kind === 'story') {
      const def = cfg.storyDef, prev = p.story[def.id] || 0;
      if (res.win) {
        const k = prev ? 0.3 : 1; for (const r in def.reward) if (r !== 'xp') rw[r] = Math.round(def.reward[r] * k); rw.xp += Math.round(def.reward.xp * k) + res.stars * 120;
        if (res.stars > prev) { rw.ember += (res.stars - prev); p.story[def.id] = res.stars; }
        if (!prev) { this.track('storyDone', 1); if (def.grant && !p.weapons[def.grant]) { p.weapons[def.grant] = 1; res.granted = WEAPONS[def.grant].name; } res.unlockText = def.unlockText; }
        let stars = 0; for (const k2 in p.story) stars += p.story[k2]; this.setMax('storyStars', stars);
        res.dayInfo = this.applyDay(def);
      }
    } else if (res.kind === 'pvp') {
      const base = res.mode === 'duel' ? 1 : 1.2; rw.gold = Math.round((res.win ? 900 : 350) * base + s.kills * 40); rw.wood = res.win ? 400 : 150; rw.stone = res.win ? 400 : 150; rw.iron = Math.round(s.kills * 8);
      rw.trophies = res.win ? 14 : -5; rw.xp += (res.win ? 500 : 200) + s.kills * 30; rw.ember = res.win ? 1 : 0; if (!p.pvp) p.pvp = { played: 0, won: 0 }; p.pvp.played++; if (res.win) p.pvp.won++;
    }
    if (!res.win && res.kind !== 'raid' && res.kind !== 'pvp') { rw.xp = Math.round(rw.xp * 0.5); }
    if (this.perk('marek') && rw.gold > 0) rw.gold = Math.round(rw.gold * 1.1);
    p.trophies = Math.max(0, p.trophies + rw.trophies); this.setMax('trophyPeak', p.trophies);
    this.addRes({ gold: rw.gold, wood: rw.wood, stone: rw.stone, iron: rw.iron, ember: rw.ember });
    const before = { level: p.level, xp: p.xp, need: this.xpNeed() };
    this.addXp(rw.xp);
    res.reward = rw; res.before = before; res.after = { level: p.level, xp: p.xp, need: this.xpNeed() };
    this.save(true);
    if (res.win) SDK.happytime();
    if (G.onMissionEnd) G.onMissionEnd(m, res);
  }
  doubleReward(res) { const rw = res.reward; this.addRes({ gold: rw.gold, wood: rw.wood, stone: rw.stone, iron: rw.iron }); res.doubled = true; this.save(true); }
  perk(who) { return ((this.p.bonds || {})[who] || 0) >= BOND_PERK; }
  bond(who, n = 1) { const b = this.p.bonds || (this.p.bonds = {}); b[who] = Math.min(5, (b[who] || 0) + n); this.save(); }
  // a new day: the story adds one building to the village (placed on the first free spot spiralling out from the hall)
  growVillage(type) {
    const v = this.p.village, C = 128, fp0 = footprint(type, 0), rects = [];
    for (const b of v.b) { const fp = footprint(b.t, b.r); rects.push([b.x, b.z, fp[0], fp[1]]); }
    for (const f of (v.f || [])) rects.push([f[1], f[3], f[4], f[6]]);
    for (let ring = 6; ring < 110; ring += 4) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2 + ring * 0.37, r = (k & 1) ? 0 : 1, fp = r ? [fp0[1], fp0[0]] : fp0;
      const x = Math.round((C + Math.cos(a) * ring - fp[0] / 2) / 2) * 2, z = Math.round((C + Math.sin(a) * ring - fp[1] / 2) / 2) * 2;
      if (x < 8 || z < 8 || x + fp[0] > 248 || z + fp[1] > 248) continue;
      if (rects.some((q) => x < q[0] + q[2] + 2 && x + fp[0] + 2 > q[0] && z < q[1] + q[3] + 2 && z + fp[1] + 2 > q[1])) continue;
      const rec = { t: type, x, z, r, l: 1 }; v.b.push(rec); this.save(true); return rec;
    }
    return null;
  }
  // after a chapter is won for the first time: grow the village, maybe upgrade the hall
  applyDay(def) {
    const d = def.day; if (!d || this.p.days[def.id]) return null;
    this.p.days[def.id] = 1; const out = { day: d, rec: d.grow ? this.growVillage(d.grow) : null, hall: false };
    if (d.hall) { const h = this.p.village.b.find((b) => b.t === 'hall'); if (h && (h.l || 1) < 5) { h.l = (h.l || 1) + 1; out.hall = true; } }
    this.save(true); return out;
  }
  storyUnlocked(i) { return i === 0 || !!this.p.story[STORY[i - 1].id]; }
}
