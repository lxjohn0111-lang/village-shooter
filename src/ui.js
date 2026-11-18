// Menus, modals and the build-mode HUD.
import { G, fmt, fmtTime, clamp } from './util.js';
import { SDK } from './sdk.js';
import { STORY, CAST, BOND_PERK } from './story.js';
import { WEAPONS, PRIMARIES, weaponStats, upgradeCost } from './weapons.js';
import { BP, bpCost, CLAN_COLORS } from './blueprints.js';
import { DAILY, ACHIEVEMENTS } from './game.js';
import { CATS, BRICKS, brickCost } from './build.js';
import { MATS } from './materials.js';
import { Input } from './input.js';
import { Net, MODES } from './net.js';
import { TEAM_NAMES } from './pvp.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const RES = ['gold', 'wood', 'stone', 'iron', 'ember'];
function costHtml(cost, check = true) { let h = '<span class="cost">'; for (const k of RES) if (cost[k]) h += `<span class="${check && (G.profile.res[k] || 0) < cost[k] ? 'no' : ''}"><i class="ic ${k}"></i>${fmt(cost[k])}</span>`; return h + '</span>'; }
function rewardHtml(rw) { let h = ''; for (const k of RES) if (rw[k]) h += `<div class="tb"><i class="ic ${k}"></i>+${fmt(rw[k])}</div>`; if (rw.xp) h += `<div class="tb">+${fmt(rw.xp)} XP</div>`; if (rw.trophies) h += `<div class="tb"><i class="ic trophy"></i>${rw.trophies > 0 ? '+' : ''}${rw.trophies}</div>`; return h; }
const stars = (n, max = 3) => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(max - n)}</i></span>`;

export class UI {
  constructor() { this.tab = 'home'; this.sel = {}; this.modalStack = null; this.menu = $('menu'); this.panel = $('panel'); this.modal = $('modal'); document.addEventListener('click', (e) => this.onClick(e)); document.addEventListener('input', (e) => this.onInput(e)); document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.btn,.nb,.card.click,.bi'); if (b && b !== this.lastHover) { this.lastHover = b; if (G.audio) G.audio.ui('hover'); } }); }

  onClick(e) {
    const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
    if (G.audio) { G.audio.resume(); G.audio.ui(t.dataset.a === 'close' || t.dataset.a === 'back' ? 'back' : 'click'); }
    const a = t.dataset.a, v = t.dataset.v; const fn = this['a_' + a]; if (fn) fn.call(this, v, t);
  }
  onInput(e) {
    const t = e.target; if (!t.dataset || !t.dataset.set) return; const s = G.settings, k = t.dataset.set; s[k] = parseFloat(t.value);
    const lab = t.parentElement.querySelector('b'); if (lab) lab.textContent = k === 'fov' ? s[k] + '°' : Math.round(s[k] * 100) + '%';
    G.applySettings(); G.game.save();
  }

  // ------------------------------------------------------------------ top bar & nav
  showMenu(on, tab) { this.menu.classList.toggle('hidden', !on); if (on) { if (tab) this.tab = tab; this.refreshTop(); this.renderNav(); this.renderPanel(); } }
  refreshTop() {
    if (!G.profile) return; const p = G.profile, g = G.game, cap = g.cap();
    let h = `<div class="tb lvl"><div class="row"><span>LV ${p.level}</span><span><i class="ic trophy"></i> ${p.trophies}</span></div><div class="xpb"><i style="width:${clamp(p.xp / g.xpNeed() * 100, 0, 100)}%"></i></div></div>`;
    for (const k of RES) h += `<div class="tb" title="${k}"><i class="ic ${k}"></i>${fmt(p.res[k])}${k !== 'ember' && p.res[k] >= cap ? '<small>MAX</small>' : ''}</div>`;
    $('topbar').innerHTML = h;
    if (G.build && G.build.active) $('b-top').innerHTML = G.build.ctx.match ? '' : RES.slice(0, 4).map((k) => `<div class="tb"><i class="ic ${k}"></i>${fmt(p.res[k])}</div>`).join('') + `<div class="tb">HALL ${g.hallLevel()}</div>`;
  }
  renderNav() {
    const g = G.game, next = STORY.findIndex((s, i) => !G.profile.story[s.id] && g.storyUnlocked(i));
    const quests = G.profile.quests.list.some((q) => !q.claimed && q.prog >= q.goal) || g.achReady().length > 0 || g.dailyReady();
    const items = [
      ['play', next >= 0 ? 'Play' : 'Quick match', next >= 0 ? STORY[next].sub + ' · ' + STORY[next].title : 'Town Siege 4v4', 'play'],
      ['story', 'Campaign'], ['mp', 'Multiplayer'], ['defend', 'Defend'], ['build', 'Build'], ['armory', 'Armory'], ['quests', 'Quests', '', quests ? 'dot' : ''], ['settings', 'Settings'],
    ];
    $('nav').innerHTML = items.map((i) => `<button class="nb ${i[3] === 'play' ? 'play' : ''} ${this.tab === i[0] ? 'on' : ''}" data-a="tab" data-v="${i[0]}">${i[1]}${i[2] ? `<small>${i[2]}</small>` : ''}${i[3] === 'dot' ? '<span class="dot"></span>' : ''}</button>`).join('');
    $('sidefoot').innerHTML = '';
  }
  a_tab(v) {
    if (v === 'play') { const next = STORY.findIndex((s, i) => !G.profile.story[s.id] && G.game.storyUnlocked(i)); if (next >= 0) G.startStory(next); else G.startMultiplayer('siege'); return; }
    if (v === 'build') { G.enterBuild(); return; }
    this.tab = this.tab === v ? 'home' : v; this.renderNav(); this.renderPanel();
  }
  renderPanel() {
    const fn = this['p_' + this.tab]; const h = fn ? fn.call(this) : '';
    this.panel.classList.toggle('empty', !h); this.panel.innerHTML = h || '';
  }
  // ------------------------------------------------------------------ panels
  p_home() {
    const g = G.game, p = G.profile, b = p.bonds || {}; let h = '';
    if (g.dailyReady()) h += `<div class="card"><div class="g"><h3>Daily tribute</h3></div><button class="btn pri sm" data-a="daily">Claim</button></div>`;
    if (g.supplyReady()) h += `<div class="card"><div class="g"><h3>Supply caravan</h3></div><button class="btn ${SDK.canReward() ? 'ad' : 'pri'} sm" data-a="supply">Collect</button></div>`;
    h += '<div class="sec">Hearth</div><div class="hearth">' + Object.keys(CAST).map((k) => { const c = CAST[k], n = b[k] || 0, on = n >= BOND_PERK; return `<div class="pal ${on ? 'on' : ''}" title="${c.perk}"><div class="por" style="background:${c.color}">${c.name[0]}</div><b>${c.name}</b><span>${'♥'.repeat(Math.min(n, 5))}<i>${'♥'.repeat(Math.max(0, 5 - n))}</i></span>${on ? `<small>${c.perk}</small>` : ''}</div>`; }).join('') + '</div>';
    return `<div class="pb">${h}</div>`;
  }
  p_story() {
    const g = G.game, p = G.profile; if (this.sel.story === undefined) { const n = STORY.findIndex((s, i) => !p.story[s.id] && g.storyUnlocked(i)); this.sel.story = n >= 0 ? n : 0; }
    const si = this.sel.story, s = STORY[si];
    let list = ''; STORY.forEach((m, i) => { const un = g.storyUnlocked(i); list += `<div class="card ${un ? 'click' : 'lock'} ${i === si ? 'sel' : ''}" data-a="${un ? 'selstory' : ''}" data-v="${i}"><div class="num">${i + 1}</div><div class="g"><h3>${m.title}</h3>${stars(p.story[m.id] || 0)}</div></div>`; });
    const detail = `<div class="sec">${s.sub}</div><h2>${s.title}</h2><p class="brief">${s.short}</p><div class="rw" style="justify-content:flex-start">${rewardHtml(s.reward)}</div>`;
    return `<div class="ph"><h2>Campaign</h2><span class="tag o">${Object.values(p.story).reduce((a, b) => a + b, 0)} / 30 ★</span></div>
      <div class="pb"><div class="grid2 story"><div class="slist">${list}</div><div>${detail}</div></div></div>
      <div class="pf"><button class="btn pri" data-a="deploy" data-v="${si}">Play</button></div>`;
  }
  a_selstory(v) { this.sel.story = +v; this.renderPanel(); }
  a_deploy(v) { G.startStory(+v); }
  p_mp() {
    const p = G.profile, rec = p.pvp || { played: 0, won: 0 };
    const card = (k, line) => { const M_ = MODES[k]; return `<div class="card mp"><div class="g"><h3>${M_.name} <span class="tag o">${M_.size}</span></h3><p>${line}</p></div><button class="btn pri" data-a="mp" data-v="${k}">Play</button></div>`; };
    return `<div class="ph"><h2>Multiplayer</h2><span class="tag">${rec.won} W · ${rec.played - rec.won} L</span></div><div class="pb">
      <div class="mpgrid">${card('siege', 'Big town, two shrines. Shatter theirs.')}
      ${card('duel', '60 s to build, then fight. 2 bots each.')}</div>
      <p class="note">Empty slots fill with bots after 20 s.</p></div>`;
  }
  a_mp(v) { G.startMultiplayer(v); }
  p_defend() {
    const g = G.game;
    return `<div class="ph"><h2>Defend</h2><span class="tag">Best wave ${g.stat('wavesBest')}</span></div><div class="pb"><p class="brief">Endless waves attack the village you built.</p></div>
      <div class="pf"><button class="btn" data-a="tab" data-v="build">Edit defences</button><button class="btn pri" data-a="defend">Start</button></div>`;
  }
  a_defend() { G.startDefend(); }
  p_armory() {
    const p = G.profile, g = G.game; if (!this.sel.wep) this.sel.wep = p.primary; const ids = [...PRIMARIES, 'pistol', 'sledge'];
    let list = ''; for (const id of ids) { const w = WEAPONS[id], own = g.owns(id); list += `<div class="card click ${this.sel.wep === id ? 'sel' : ''} ${p.primary === id ? 'eq' : ''} ${!own && p.level < w.unlock ? 'lock' : ''}" data-a="selwep" data-v="${id}"><div class="g"><h3>${w.name}</h3><p>${w.cls}${own ? ' · MK ' + p.weapons[id] : p.level < w.unlock ? ' · Unlocks at level ' + w.unlock : ''}</p></div>${p.primary === id ? '<span class="tag o">Equipped</span>' : own ? '' : '<span class="tag">' + (p.level < w.unlock ? 'Locked' : fmt(w.cost) + ' gold') + '</span>'}</div>`; }
    const id = this.sel.wep, w = WEAPONS[id], own = g.owns(id), lvl = p.weapons[id] || 1, st = weaponStats(id, lvl), nx = weaponStats(id, Math.min(5, lvl + 1));
    const bar = (label, v, v2, max, txt) => `<div class="statrow"><span>${label}</span><div class="bar"><i class="up" style="width:${clamp(v2 / max * 100, 0, 100)}%"></i><i style="width:${clamp(v / max * 100, 0, 100)}%"></i></div><b>${txt}</b></div>`;
    const dps = (s) => s.dmg * (w.pellets || 1);
    let d = `<div class="sec">${w.cls}</div><h2>${w.name}</h2><p class="brief">${w.desc}</p>
      ${bar('Damage', dps(st), dps(nx), 440, Math.round(dps(st)))}${bar('Fire rate', w.rpm, w.rpm, 950, w.rpm)}${w.melee ? '' : bar('Magazine', st.mag, nx.mag, 100, st.mag)}
      ${bar('Demolition', st.brick * (w.melee ? 1 : st.dmg / 25) * (w.radius ? 6 : 1), nx.brick * (w.melee ? 1 : nx.dmg / 25) * (w.radius ? 6 : 1), w.melee ? 300 : 40, w.radius ? 'BLAST' : w.melee ? 'MAX' : (st.brick * st.dmg / 25).toFixed(1))}${w.melee ? '' : bar('Control', 1 / (w.recoil[0] * st.recoil + 0.004), 1 / (w.recoil[0] * nx.recoil + 0.004), 120, Math.round(100 - w.recoil[0] * st.recoil * 900))}`;
    let foot = '';
    if (!own) foot = p.level < w.unlock ? `<span class="tag">Reach level ${w.unlock}</span>` : `${costHtml({ gold: w.cost })}<button class="btn pri" data-a="buywep" data-v="${id}">Buy</button>`;
    else { if (lvl < 5) { const c = upgradeCost(id, lvl); foot += `${costHtml(c)}<button class="btn" data-a="upwep" data-v="${id}">Upgrade to MK ${lvl + 1}</button>`; } else foot += '<span class="tag o">Fully upgraded</span>'; if (PRIMARIES.includes(id) && p.primary !== id) foot += `<button class="btn pri" data-a="equip" data-v="${id}">Equip</button>`; }
    return `<div class="ph"><h2>Armory</h2></div><div class="pb"><div class="grid2"><div class="wlist">${list}</div><div>${d}</div></div></div><div class="pf">${foot}</div>`;
  }
  a_selwep(v) { this.sel.wep = v; this.renderPanel(); }
  a_buywep(v) { if (G.game.buyWeapon(v)) { G.audio.ui('levelup'); G.game.equip(v); } else G.audio.ui('deny'); this.renderPanel(); }
  a_upwep(v) { if (G.game.upgradeWeapon(v)) G.audio.ui('star'); else G.audio.ui('deny'); this.renderPanel(); }
  a_equip(v) { G.game.equip(v); this.renderPanel(); }
  p_quests() {
    const p = G.profile, g = G.game; let h = '<div class="daily">';
    const day = Math.floor(Date.now() / 864e5), streak = p.daily.last === day ? p.daily.streak : (p.daily.last === day - 1 ? p.daily.streak : 0), cur = (p.daily.last === day ? streak - 1 : streak) % 7;
    DAILY.forEach((rw, i) => { h += `<div class="${i < cur || (i === cur && p.daily.last === day) ? 'got' : i === cur ? 'now' : ''}">${i + 1}<b>${RES.filter((k) => rw[k]).map((k) => `<i class="ic ${k}"></i>${fmt(rw[k])}`).join(' ')}</b></div>`; });
    h += `</div>${g.dailyReady() ? '<div class="row" style="margin-top:8px"><button class="btn pri sm" data-a="daily">Claim</button></div>' : ''}<div class="qcols"><div><div class="sec">Today</div>`;
    p.quests.list.forEach((q, i) => { h += `<div class="card"><div class="g"><h3>${q.text}</h3><div class="bar" style="margin-top:6px"><i style="width:${q.prog / q.goal * 100}%"></i></div></div>${q.claimed ? '<span class="tag">Done</span>' : q.prog >= q.goal ? `<button class="btn pri sm" data-a="quest" data-v="${i}">Claim</button>` : `<span class="tag">${Math.min(q.prog, q.goal)}/${q.goal}</span>`}</div>`; });
    const open = ACHIEVEMENTS.filter((a) => !p.ach[a.id]).sort((a, b) => (g.stat(b.stat) >= b.n) - (g.stat(a.stat) >= a.n) || g.stat(b.stat) / b.n - g.stat(a.stat) / a.n).slice(0, 4);
    h += '</div><div><div class="sec">Achievements</div>';
    for (const a of open) { const v = g.stat(a.stat), ok = v >= a.n; h += `<div class="card"><div class="g"><h3>${a.name}</h3><div class="bar" style="margin-top:6px"><i style="width:${Math.min(1, v / a.n) * 100}%"></i></div></div>${ok ? `<button class="btn pri sm" data-a="ach" data-v="${a.id}">Claim</button>` : `<span class="tag">${fmt(Math.min(v, a.n))}/${fmt(a.n)}</span>`}</div>`; }
    h += '</div></div>';
    return `<div class="ph"><h2>Quests</h2></div><div class="pb">${h}</div>`;
  }
  a_quest(v) { if (G.game.claimQuest(+v)) G.audio.ui('coin'); this.afterReward(); }
  a_ach(v) { if (G.game.claimAch(v)) G.audio.ui('star'); this.afterReward(); }
  a_daily() { const rw = G.game.claimDaily(); if (rw) { G.audio.ui('coin'); this.popup('Daily Tribute', `<div class="rw">${rewardHtml(rw)}</div><p class="brief" style="text-align:center">Streak: ${G.profile.daily.streak} day${G.profile.daily.streak > 1 ? 's' : ''}</p>`); } this.afterReward(); }
  async a_supply() { if (!G.game.supplyReady()) return; if (SDK.canReward()) { const ok = await SDK.rewarded(); if (!ok) { this.popup('Caravan delayed', '<p class="brief">The video could not be shown. Try again in a moment.</p>'); return; } } const rw = G.game.claimSupply(); G.audio.ui('coin'); this.popup('Supply Caravan', `<div class="rw">${rewardHtml(rw)}</div>`); this.afterReward(); }
  afterReward() { this.refreshTop(); this.renderNav(); this.renderPanel(); this.levelUps(); }
  p_settings() {
    const s = G.settings, q = G.r3.quality;
    const sl = (k, label, min, max, step, pct) => `<div class="sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-set="${k}"><b>${pct ? Math.round(s[k] * 100) + '%' : s[k] + '°'}</b></div>`;
    const sens = Input.touch ? 'Look sensitivity' : 'Mouse sensitivity';
    return `<div class="ph"><div><h2>Settings</h2></div></div><div class="pb"><div class="scols"><div>
      <div class="sec">Graphics</div><div class="sl"><span>Quality</span><div class="seg">${['Low', 'Med', 'High', 'Ultra'].map((n, i) => `<button class="${q === i ? 'on' : ''}" data-a="quality" data-v="${i}">${n}</button>`).join('')}</div><b></b></div>
      ${sl('fov', 'Field of view', 55, 95, 1, false)}
      <div class="sl"><span>Show FPS</span><div class="seg"><button class="${s.showFps ? 'on' : ''}" data-a="toggle" data-v="showFps">${s.showFps ? 'On' : 'Off'}</button></div><b></b></div>
      <div class="sec">Controls</div>${sl('sens', sens, 0.2, 3, 0.01, true)}
      <div class="sl"><span>Invert Y</span><div class="seg"><button class="${s.invertY ? 'on' : ''}" data-a="toggle" data-v="invertY">${s.invertY ? 'On' : 'Off'}</button></div><b></b></div>
      </div><div>
      <div class="sec">Audio</div>${sl('master', 'Master volume', 0, 1, 0.01, true)}${sl('music', 'Music', 0, 1, 0.01, true)}${sl('sfx', 'Effects', 0, 1, 0.01, true)}
      ${Input.touch ? '' : `<p class="brief keys"><b>WASD</b> move · <b>Shift</b> sprint (scoped: hold breath) · <b>C / Ctrl</b> crouch (while sprinting: slide) · <b>Space</b> jump / mantle · <b>Q / E</b> lean · <b>LMB</b> fire · <b>RMB</b> aim · <b>R</b> reload · <b>1 2 3 / wheel</b> weapons · <b>G</b> grenade (hold to cook) · <b>V</b> melee strike · <b>F</b> end raid · <b>Esc</b> pause</p>`}
      <div class="sec">Clan colour</div><div class="row">${CLAN_COLORS.map((c, i) => `<button class="chip" style="background:${hex(c)};width:26px;height:26px;${G.profile.color === i ? 'outline:2px solid #fff' : ''}" data-a="color" data-v="${i}"></button>`).join('')}</div>
      <div class="sec">Save</div><div class="row"><button class="btn sm" data-a="resetask">Reset all progress</button></div></div></div></div>`;
  }
  a_quality(v) { G.settings.quality = +v; G.setQuality(+v); G.game.save(); this.renderPanel(); }
  a_toggle(v) { G.settings[v] = !G.settings[v]; G.applySettings(); G.game.save(); if (this.modalKind === 'pause') this.showPause(true); else this.renderPanel(); }
  a_color(v) { G.profile.color = +v; G.game.save(); G.reloadMenuScene(); this.renderPanel(); }
  a_resetask() { this.popup('Reset progress?', '<p class="brief">This wipes your village, weapons and campaign. It cannot be undone.</p>', [['Cancel', 'close', ''], ['Erase everything', 'reset', 'pri']]); }
  a_reset() { G.game.reset(); this.closeModal(); G.reloadMenuScene(); this.showMenu(true, 'home'); }

  // ------------------------------------------------------------------ modals
  openModal(html, kind = '') { this.modal.innerHTML = html; this.modal.classList.remove('hidden'); this.modalKind = kind; }
  closeModal() { this.modal.classList.add('hidden'); this.modal.innerHTML = ''; this.modalKind = ''; if (this.afterModal) { const f = this.afterModal; this.afterModal = null; f(); } }
  a_close() { this.closeModal(); }
  popup(title, body, buttons = [['OK', 'close', 'pri']]) { this.openModal(`<div class="mbox"><div class="ph"><h2>${title}</h2></div><div class="pb">${body}</div><div class="pf">${buttons.map((b) => `<button class="btn ${b[2]}" data-a="${b[1]}" data-v="${b[3] || ''}">${b[0]}</button>`).join('')}</div></div>`, 'popup'); }
  levelUps() { const l = G.game.pendingLevelUps.shift(); if (!l) return; G.audio.ui('levelup'); this.afterModal = () => this.levelUps(); this.popup('Level ' + l.level, `<div class="big win">RANK UP</div><div class="rw">${rewardHtml(l.reward)}</div>${l.unlocked.length ? `<p class="brief" style="text-align:center">Now available in the Armory: <b>${l.unlocked.join(', ')}</b></p>` : ''}`); this.refreshTop(); }
  offlineReport(rep) {
    if (!RES.some((k) => rep.gained[k] > 0)) return false;
    this.popup('Welcome back', `<div class="rw">${rewardHtml(rep.gained)}</div>`); return true;
  }
  // matchmaking: fills up for 20 seconds, then bots take the empty slots
  showQueue(mode) {
    const M_ = MODES[mode];
    this.openModal(`<div class="mbox queue"><div class="pb"><div class="qmode">${M_.name} <small>${M_.size}</small></div><div class="qslots" id="q-slots"></div><p id="q-text">Connecting…</p></div>
      <div class="pf" style="justify-content:center"><button class="btn" data-a="qcancel">Cancel</button><button class="btn pri" data-a="qnow">Start with bots</button></div></div>`, 'queue');
  }
  queueStatus(st) {
    const s = $('q-slots'), t = $('q-text'); if (!s) return;
    s.innerHTML = Array.from({ length: st.need }, (_, i) => `<i class="${i < st.humans ? 'on' : ''}"></i>`).join('');
    t.textContent = st.online ? `${st.humans}/${st.need} players · bots join in ${st.left}s` : `No server reachable · starting with bots in ${st.left}s`;
  }
  a_qcancel() { G.cancelMultiplayer(); }
  a_qnow() { Net.startNow(); }
  showPause(keep) {
    const m = G.mode, s = G.settings, build = G.build.active;
    const sl = (k, label, min, max, step, pct) => `<div class="sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-set="${k}"><b>${pct ? Math.round(s[k] * 100) + '%' : s[k] + '°'}</b></div>`;
    this.openModal(`<div class="mbox"><div class="ph"><h2>${build ? 'Builder' : 'Paused'}</h2><p>${build ? 'Hollowmere' : m && m.cfg.title ? m.cfg.title : ''}</p></div><div class="pb pgrid">
      ${sl('sens', Input.touch ? 'Look sensitivity' : 'Mouse sensitivity', 0.2, 3, 0.01, true)}${sl('fov', 'Field of view', 55, 95, 1, false)}${sl('master', 'Master volume', 0, 1, 0.01, true)}${sl('music', 'Music', 0, 1, 0.01, true)}
      <div class="sl"><span>Quality</span><div class="seg">${['Low', 'Med', 'High', 'Ultra'].map((n, i) => `<button class="${G.r3.quality === i ? 'on' : ''}" data-a="pquality" data-v="${i}">${n}</button>`).join('')}</div><b></b></div>
      <div class="sl"><span>Invert Y</span><div class="seg"><button class="${s.invertY ? 'on' : ''}" data-a="toggle" data-v="invertY">${s.invertY ? 'On' : 'Off'}</button></div><b></b></div></div>
      <div class="pf">${build ? (G.build.ctx && G.build.ctx.match ? '<button class="btn" data-a="quit">Leave match</button>' : '<button class="btn" data-a="testdef">Test defences</button><button class="btn" data-a="quit">Save &amp; exit</button>') : m && m.kind === 'pvp' ? '<button class="btn" data-a="quit">Leave match</button>' : `<button class="btn" data-a="quit">${m && m.kind === 'defend' ? 'End defence' : 'Abandon mission'}</button><button class="btn" data-a="restart">Restart</button>`}<button class="btn pri" data-a="resume">Resume</button></div></div>`, 'pause');
    void keep;
  }
  a_pquality(v) { G.settings.quality = +v; G.setQuality(+v); G.game.save(); this.showPause(true); }
  a_resume() { this.closeModal(); G.resume(); }
  a_restart() { this.closeModal(); G.restartMission(); }
  a_quit() { this.closeModal(); G.quitMission(); }
  a_testdef() { this.closeModal(); G.exitBuild(true); G.startDefend(); }
  showDeath(canRevive) {
    const ad = SDK.canReward();
    this.openModal(`<div class="mbox"><div class="pb" style="padding:30px 40px"><div class="big lose">YOU ARE DOWN</div><p class="brief" style="text-align:center;margin-top:12px">${canRevive ? 'A field medic can get you back on your feet — once.' : 'No second wind left.'}</p></div>
      <div class="pf" style="justify-content:center">${canRevive ? `<button class="btn ${ad ? 'ad' : 'pri'}" data-a="revive">${ad ? 'Watch to revive' : 'Revive'}</button>` : ''}<button class="btn" data-a="giveup">${G.mode && G.mode.kind === 'story' ? 'Fail mission' : 'End battle'}</button></div></div>`, 'death');
    Input.unlock();
  }
  async a_revive() { if (SDK.canReward()) { const ok = await SDK.rewarded(); if (!ok) { this.showDeath(false); return; } } this.closeModal(); G.mode.revive(); G.resume(); }
  a_giveup() { this.closeModal(); const m = G.mode; m.state = 'play'; m.end(m.kind === 'raid' ? m.raidStars() > 0 : m.kind === 'defend' ? m.wavesCleared > 0 : false, 'death'); }

  showResults(m, res) {
    const rw = res.reward, s = res.stats, pvp = res.kind === 'pvp';
    const title = pvp ? (res.win ? 'VICTORY' : 'DEFEAT') : res.kind === 'defend' ? (res.waves > 0 ? 'VILLAGE HELD' : 'OVERRUN') : (res.win ? 'MISSION COMPLETE' : 'MISSION FAILED');
    const sub = pvp ? `${TEAM_NAMES[m.myTeam]} ${res.score[0]} : ${res.score[1]} ${TEAM_NAMES[1 - m.myTeam]}` : res.kind === 'defend' ? `${res.waves} wave${res.waves === 1 ? '' : 's'} repelled` : m.cfg.title;
    let h = `<div class="big ${res.win ? 'win' : 'lose'}">${title}</div><p class="rsub">${sub}</p>`;
    if (pvp) h += `<div class="sboard" style="--n:${Math.max(1, res.rows.filter((r) => r.team === 0).length, res.rows.filter((r) => r.team === 1).length)}">${res.rows.map((r) => `<div class="${r.me ? 'me' : ''}" style="border-left-color:${r.team === 0 ? '#4aa8ff' : '#ff5a47'}"><span>${r.name}${r.human ? '' : ' <small>bot</small>'}</span><b>${r.k}</b><b>${r.d}</b></div>`).join('')}</div>`;
    else h += `<div class="bigstars">${[0, 1, 2].map((i) => i < res.stars ? '<span>★</span>' : '<i>★</i>').join('')}</div>`;
    h += `<div class="kv"><div><b>${s.kills}</b>Kills</div><div><b>${s.headshots}</b>Headshots</div><div><b>${fmt(s.bricks)}</b>Bricks</div><div><b>${fmtTime(res.time)}</b>Time</div></div>`;
    h += `<div class="rw" id="res-rw">${rewardHtml({ gold: rw.gold, wood: rw.wood, stone: rw.stone, iron: rw.iron, ember: rw.ember, trophies: rw.trophies })}</div>`;
    if (res.granted) h += `<p class="rsub" style="color:var(--em2)">New weapon: ${res.granted}</p>`;
    const b = res.before, a = res.after;
    h += `<div style="margin:6px 30px 0"><div class="row" style="justify-content:space-between;font-family:var(--hf);font-size:12px;letter-spacing:.1em"><span>LV ${a.level}</span><span>${fmt(a.xp)} / ${fmt(a.need)}</span></div><div class="bar" style="height:6px"><i id="res-xp" style="width:${a.level > b.level ? 0 : b.xp / b.need * 100}%;transition:width 1.2s .4s"></i></div></div>`;
    const canDouble = SDK.canReward() && (rw.gold + rw.wood + rw.stone + rw.iron) > 0;
    this.resCtx = { m, res };
    let btns = canDouble ? '<button class="btn ad" id="res-dbl" data-a="double">×2 spoils</button>' : '';
    if (pvp) btns += `<button class="btn" data-a="tomenu">Menu</button><button class="btn pri" data-a="mpagain" data-v="${res.mode}">Play again</button>`;
    else if (res.kind === 'story' && res.win && res.dayInfo) btns += '<button class="btn pri" data-a="evening">Continue</button>';
    else if (res.kind === 'story' && res.win) { const next = STORY.findIndex((x) => x.id === m.cfg.storyDef.id) + 1; btns += `<button class="btn" data-a="again">Replay</button>${next < STORY.length ? `<button class="btn pri" data-a="nextstory" data-v="${next}">Next</button>` : '<button class="btn pri" data-a="tomenu">Continue</button>'}`; }
    else btns += `<button class="btn" data-a="tomenu">Menu</button><button class="btn pri" data-a="again">${res.kind === 'defend' ? 'Defend again' : 'Retry'}</button>`;
    this.openModal(`<div class="mbox wide"><div class="pb" style="padding:22px 26px 10px">${h}</div><div class="pf" style="justify-content:center">${btns}</div></div>`, 'results');
    setTimeout(() => { const e = $('res-xp'); if (e) e.style.width = (a.xp / a.need * 100) + '%'; }, 60);
    Input.unlock();
  }
  async a_double() { const c = this.resCtx; if (!c || c.res.doubled) return; const ok = await SDK.rewarded(); if (!ok) return; G.game.doubleReward(c.res); G.audio.ui('coin'); const rw = c.res.reward; $('res-rw').innerHTML = rewardHtml({ gold: rw.gold * 2, wood: rw.wood * 2, stone: rw.stone * 2, iron: rw.iron * 2, ember: rw.ember, trophies: rw.trophies }); const b = $('res-dbl'); if (b) b.remove(); }
  a_tomenu() { this.closeModal(); G.toMenu(true); }
  a_again() { this.closeModal(); G.afterAd(() => G.restartMission()); }
  a_nextstory(v) { this.closeModal(); G.afterAd(() => G.startStory(+v)); }
  a_mpagain(v) { this.closeModal(); G.toMenu(true, 'mp', () => G.startMultiplayer(v)); }
  // the evening after a chapter: the village grows and one of the survivors talks to you
  a_evening() {
    const c = this.resCtx, info = c.res.dayInfo, d = info.day, who = CAST[d.who];
    const idx = STORY.findIndex((x) => x.id === c.m.cfg.storyDef.id);
    this.evening = { info, idx };
    this.openModal(`<div class="mbox eve"><div class="pb">
      <div class="day">DAY ${d.n}</div>
      ${info.rec ? `<div class="grow"><i>+</i>${d.growText}</div>` : ''}${info.hall ? '<div class="grow"><i>↑</i>The Ember Hall grew</div>' : ''}
      <div class="talk"><div class="por" style="background:${who.color}">${who.name[0]}</div><div><b>${who.name.toUpperCase()}</b><p>“${d.line}”</p></div></div>
      </div><div class="pf choices">${d.choices.map((ch, i) => `<button class="btn" data-a="choose" data-v="${i}">${ch.text}</button>`).join('')}</div></div>`, 'evening');
  }
  a_choose(v) {
    const e = this.evening, d = e.info.day, ch = d.choices[+v];
    if (ch.bond) G.game.bond(d.who, ch.bond); if (ch.also) G.game.bond(ch.also, 1); if (ch.reward) G.game.addRes(ch.reward);
    G.audio.ui('coin'); this.closeModal();
    if (e.info.rec) G.menuFocus = { x: (e.info.rec.x + 8) * 0.25 - 32, z: (e.info.rec.z + 8) * 0.25 - 32, t: 7 };
    this.sel.story = Math.min(STORY.length - 1, e.idx + 1);
    G.toMenu(true, 'home');
  }

  // ------------------------------------------------------------------ build HUD
  showBuild(on) { $('buildhud').classList.toggle('hidden', !on); if (on) { this.refreshTop(); this.buildRefresh(); $('b-help').innerHTML = G.build.ctx && G.build.ctx.match ? '<b>LMB</b>Place &nbsp; <b>RMB</b>Remove<br><b>R</b>Rotate &nbsp; <b>Wheel</b>Next item<br><b>WASD</b>Move &nbsp; <b>Space / C</b>Up / down' : '<b>WASD</b>Move &nbsp; <b>Space / C</b>Up / down<br><b>LMB</b>Place (hold to paint bricks)<br><b>RMB / X</b>Remove &nbsp; <b>R</b>Rotate<br><b>Wheel</b>Next item &nbsp; <b>1-5</b>Category<br><b>MMB</b>Pick brick &nbsp; <b>Z</b>Undo<br><b>F</b>Walk / fly &nbsp; <b>Shift</b>Fast<br><b>Tab</b>Free cursor &nbsp; <b>Esc</b>Menu'; } }
  buildRefresh() {
    const b = G.build, ctx = b.ctx, match = !!(ctx && ctx.match), lvl = ctx.hall();
    const pts = (c) => Math.round((c.wood || 0) + (c.stone || 0) + (c.iron || 0) * 2 + (c.gold || 0) * 0.5);
    const price = (c) => match ? `<span class="cost"><span class="${pts(c) > G.mode.buildPts ? 'no' : ''}">${pts(c)} pts</span></span>` : costHtml(c);
    let cats = b.cats().map((c, i) => `<button class="${i === b.cat ? 'on' : ''}" data-a="bcat" data-v="${i}"><span class="kb">${i + 1}</span>${c.name}</button>`).join('');
    if (!match) { const hc = lvl < 5 ? bpCost('hall', lvl + 1) : null; cats += `<span class="sp"></span>${hc ? `<button data-a="bhall">Hall ${lvl + 1} ${costHtml(hc)}</button>` : ''}<button class="kb" data-a="bundo">Undo</button><button data-a="btest">Test</button><button data-a="bexit" style="background:var(--em);color:#160b02">${Input.touch ? 'Exit' : 'Save &amp; Exit'}</button>`; }
    else cats += '<span class="sp"></span><button class="kb" data-a="bundo">Undo</button>';
    $('b-cats').innerHTML = cats;
    const items = b.items();
    $('b-items').innerHTML = items.map((it, i) => {
      if (it.brick) { const m = MATS[it.brick.mat]; return `<div class="bi ${i === b.sel ? 'on' : ''}" data-a="bitem" data-v="${i}"><div class="sw" style="background:${hex(m.color)}"></div><div class="n">${it.name}</div><div class="c">${price(brickCost(it.brick))}</div></div>`; }
      const have = ctx.count(it.bp.key), lim = ctx.limit(it.bp);
      return `<div class="bi ${i === b.sel ? 'on' : ''} ${have >= lim ? 'max' : ''}" data-a="bitem" data-v="${i}"><div class="n">${it.name}</div><div class="c">${have} / ${lim}</div><div class="c">${price(bpCost(it.bp.key, 1))}</div></div>`;
    }).join('');
    const sel = $('b-items').querySelector('.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.buildInfo();
  }
  buildInfo() {
    const b = G.build, it = b.item(); if (!it) return; let h;
    if (it.brick) h = `<h3>${it.name}</h3><p>${it.brick.s.map((v) => v * 25).join(' × ')} cm</p>`;
    else h = `<h3>${it.name}</h3><p>${it.bp.desc || ''}</p>`;
    h += `<div class="why" id="b-why"></div>`;
    $('b-info').innerHTML = h; this.lastWhy = null;
  }
  buildTick() { const b = G.build, why = Input.locked || Input.touch ? (b.valid ? '' : b.reason) : 'Click the view to grab the camera'; if (why !== this.lastWhy) { this.lastWhy = why; const e = $('b-why'); if (e) e.textContent = why; } }
  a_bcat(v) { G.build.cat = +v; G.build.sel = 0; G.build.ghostKey = ''; this.buildRefresh(); }
  a_bitem(v) { G.build.sel = +v; G.build.ghostKey = ''; this.buildRefresh(); Input.wantLock = true; Input.lock(); }
  a_bhall() { if (G.build.upgradeHall()) { this.refreshTop(); this.buildRefresh(); } else if (G.hud) G.hud.toast('Not enough resources', 1.5); }
  a_bundo() { G.build.undoLast(); this.refreshTop(); this.buildRefresh(); }
  a_btest() { G.exitBuild(true); G.startDefend(); }
  a_bexit() { G.exitBuild(); }
}
