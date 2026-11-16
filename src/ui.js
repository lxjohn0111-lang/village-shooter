// Menus, modals and the build-mode HUD.
import { G, fmt, fmtTime, clamp } from './util.js';
import { SDK } from './sdk.js';
import { STORY, PROLOGUE } from './story.js';
import { WEAPONS, PRIMARIES, weaponStats, upgradeCost } from './weapons.js';
import { BP, bpCost, encodeVillage, decodeVillage, CLAN_COLORS } from './blueprints.js';
import { DAILY, ACHIEVEMENTS, LEAGUES } from './game.js';
import { CATS, BRICKS, brickCost } from './build.js';
import { MATS } from './materials.js';
import { Input } from './input.js';

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
    let h = `<div class="tb lvl"><div class="row"><span>${SDK.username() || 'RANGER'} · LV ${p.level}</span><span><i class="ic trophy"></i> ${p.trophies} <small>${g.league()}</small></span></div><div class="xpb"><i style="width:${clamp(p.xp / g.xpNeed() * 100, 0, 100)}%"></i></div></div>`;
    for (const k of RES) h += `<div class="tb" title="${k}"><i class="ic ${k}"></i>${fmt(p.res[k])}${k !== 'ember' && p.res[k] >= cap ? '<small>MAX</small>' : ''}</div>`;
    $('topbar').innerHTML = h;
    if (G.build && G.build.active) $('b-top').innerHTML = RES.map((k) => `<div class="tb"><i class="ic ${k}"></i>${fmt(p.res[k])}</div>`).join('') + `<div class="tb">HALL LV ${g.hallLevel()}</div><div class="tb">BRICKS ${(p.village.f || []).length}/${G.build.freeLimit()}</div>`;
  }
  renderNav() {
    const g = G.game, next = STORY.findIndex((s, i) => !G.profile.story[s.id] && g.storyUnlocked(i));
    const quests = G.profile.quests.list.some((q) => !q.claimed && q.prog >= q.goal) || g.achReady().length > 0 || g.dailyReady();
    const items = [
      ['play', next >= 0 ? 'Continue Campaign' : 'Quick Raid', next >= 0 ? STORY[next].title : 'Attack the nearest rival', 'play'],
      ['story', 'Campaign', '10 missions against the Ashen Legion'], ['raid', 'Raid', 'Loot and level rival villages'], ['defend', 'Defend', 'Hold your village against endless waves'],
      ['build', 'Build Village', 'Lay it out brick by brick'], ['armory', 'Armory', 'Weapons and upgrades'], ['quests', 'Quests', 'Daily orders and achievements', quests ? 'dot' : ''], ['settings', 'Settings', 'Graphics, audio, controls'],
    ];
    $('nav').innerHTML = items.map((i) => `<button class="nb ${i[3] === 'play' ? 'play' : ''} ${this.tab === i[0] ? 'on' : ''}" data-a="tab" data-v="${i[0]}">${i[1]}<small>${i[2]}</small>${i[3] === 'dot' ? '<span class="dot"></span>' : ''}</button>`).join('');
    $('sidefoot').innerHTML = `Defence rating <b>${g.defenceRating()}</b> · Production <b>${fmt(g.prod().gold)}</b> gold/h`;
  }
  a_tab(v) {
    if (v === 'play') { const next = STORY.findIndex((s, i) => !G.profile.story[s.id] && G.game.storyUnlocked(i)); if (next >= 0) { this.tab = 'story'; this.sel.story = next; this.renderNav(); this.renderPanel(); } else G.startRaid(G.profile.rivals[2] || G.profile.rivals[0]); return; }
    if (v === 'build') { G.enterBuild(); return; }
    this.tab = this.tab === v ? 'home' : v; this.renderNav(); this.renderPanel();
  }
  renderPanel() {
    const fn = this['p_' + this.tab]; const h = fn ? fn.call(this) : '';
    this.panel.classList.toggle('empty', !h); this.panel.innerHTML = h || '';
  }

  // ------------------------------------------------------------------ panels
  p_home() {
    const g = G.game, p = G.profile; let h = '';
    if (g.dailyReady()) h += `<div class="card"><div class="g"><h3>Daily Tribute</h3><p>Day ${(p.daily.last === Math.floor(Date.now() / 864e5) - 1 ? p.daily.streak : 0) % 7 + 1} of 7 — come back every day for bigger rewards.</p></div><button class="btn pri sm" data-a="daily">Claim</button></div>`;
    if (g.supplyReady()) h += `<div class="card"><div class="g"><h3>Supply Caravan</h3><p>A trader is waiting at the gate with crates of materials.</p></div><button class="btn ${SDK.canReward() ? 'ad' : 'pri'} sm" data-a="supply">${SDK.canReward() ? 'Watch & Collect' : 'Collect'}</button></div>`;
    else h += `<div class="card"><div class="g"><h3>Supply Caravan</h3><p>Next caravan arrives in ${fmtTime((p.supplyAt - Date.now()) / 1000 / 60)} (h:mm).</p></div></div>`;
    if (p.log.length) { h += '<div class="sec">While you were away</div>'; for (const r of p.log.slice(0, 4)) h += `<div class="card"><div class="g"><h3 style="color:${r.held ? 'var(--good)' : 'var(--bad)'}">${r.held ? 'Raid repelled' : 'Village raided'} — ${r.name}</h3><p>Chief ${r.chief} · ${r.held ? 'Your defences held.' : 'Lost ' + RES.filter((k) => r.lost[k]).map((k) => fmt(r.lost[k]) + ' ' + k).join(', ') + '.'} ${r.trophies > 0 ? '+' : ''}${r.trophies} trophies</p></div>${r.held ? '' : `<button class="btn sm" data-a="revenge" data-v="${p.log.indexOf(r)}">Revenge</button>`}</div>`; }
    if (!h) return '';
    return `<div class="ph"><div><h2>Hollowmere</h2><p>${g.league()} · Ember Hall level ${g.hallLevel()}</p></div></div><div class="pb">${h}</div>`;
  }
  p_story() {
    const g = G.game, p = G.profile; if (this.sel.story === undefined) { const n = STORY.findIndex((s, i) => !p.story[s.id] && g.storyUnlocked(i)); this.sel.story = n >= 0 ? n : 0; }
    const si = this.sel.story, s = STORY[si];
    let list = ''; STORY.forEach((m, i) => { const un = g.storyUnlocked(i); list += `<div class="card ${un ? 'click' : 'lock'} ${i === si ? 'sel' : ''}" data-a="${un ? 'selstory' : ''}" data-v="${i}"><div class="num">${i + 1}</div><div class="g"><h3>${m.title}</h3><p>${un ? m.sub : 'Locked — complete the previous chapter'}</p></div>${stars(p.story[m.id] || 0)}</div>`; });
    const done = p.story[s.id] || 0;
    const detail = `<div class="sec">${s.sub}</div><h2>${s.title}</h2><p class="brief">${s.brief}</p>
      <div class="sec">Objectives</div>${s.stages.map((st) => st.map((o) => `<p>▸ ${o.text}</p>`).join('')).join('')}
      <div class="sec">Bonus stars</div>${s.bonus.map((b) => `<p>★ ${b.text}</p>`).join('')}
      <div class="sec">Reward${done ? ' (replay: 30%)' : ''}</div><div class="rw" style="justify-content:flex-start">${rewardHtml(s.reward)}</div>${s.grant ? `<p class="brief">Unlocks: <b>${WEAPONS[s.grant].name}</b></p>` : ''}`;
    return `<div class="ph"><div><h2>Campaign</h2><p>The war against Warlord Varro</p></div><span class="tag o">${Object.values(p.story).reduce((a, b) => a + b, 0)} / 30 ★</span></div>
      <div class="pb"><div class="grid2"><div>${list}</div><div>${detail}</div></div></div>
      <div class="pf"><span class="tag">${s.kind === 'defend' ? 'Defence' : 'Assault'}</span><span class="tag">${s.env}</span><button class="btn pri" data-a="deploy" data-v="${si}">Deploy</button></div>`;
  }
  a_selstory(v) { this.sel.story = +v; this.renderPanel(); }
  a_deploy(v) { G.startStory(+v); }
  p_raid() {
    const p = G.profile, g = G.game; let h = '';
    p.rivals.forEach((r, i) => { const diff = r.level - g.power(); h += `<div class="card"><span class="chip" style="background:${hex(r.color)}"></span><div class="g"><h3>${r.name} <span class="tag ${diff > 1.5 ? 'o' : ''}">${diff > 1.5 ? 'Hard' : diff < -1 ? 'Easy' : 'Even'} · LV ${r.level}</span></h3><p>Chief ${r.chief} · <i class="ic trophy"></i> ${r.trophies}</p><p>${costHtml(r.loot, false)}</p></div><button class="btn pri sm" data-a="raid" data-v="${i}">Attack</button></div>`; });
    return `<div class="ph"><div><h2>Raid</h2><p>Break in, shatter their Ember Heart, take everything that isn't nailed down. ★ 50% razed · ★ Heart shattered · ★ 80% razed</p></div></div>
      <div class="pb">${h}<div class="row" style="margin:4px 0 14px"><button class="btn sm" data-a="reroll">Scout new rivals ${costHtml({ gold: 80 })}</button><span style="font-size:11px;color:var(--dim)">Rival clans are generated to match your level. To fight a village a real player built, use a share code below.</span></div>
      <div class="sec">Raid a friend</div><p class="brief">Every village has a share code. Paste a friend's code to raid the village they actually built (no trophies at stake).</p>
      <div class="row"><input type="text" id="code-in" placeholder="Paste a village code…" maxlength="60000"><button class="btn sm" data-a="raidcode">Raid</button></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="copycode">Copy my village code</button><span id="code-msg" style="font-size:11px;color:var(--dim)"></span></div></div>`;
  }
  a_raid(v) { G.startRaid(G.profile.rivals[+v]); }
  a_reroll() { if (G.game.spend({ gold: 80 })) { G.game.rollRivals(); this.renderPanel(); } else G.audio.ui('deny'); }
  a_revenge(v) { const r = G.profile.log[+v]; if (r) G.startRaid({ seed: r.seed, level: r.level, name: r.name, chief: r.chief, color: CLAN_COLORS[r.seed % CLAN_COLORS.length], trophies: 0, loot: { gold: 400 + r.level * 300, wood: 300 + r.level * 180, stone: 300 + r.level * 180, iron: 50 + r.level * 60 } }); }
  a_raidcode() { const v = decodeVillage($('code-in').value || ''); if (!v) { $('code-msg').textContent = 'That code is not a valid village.'; G.audio.ui('deny'); return; } const hall = v.b.find((b) => b.t === 'hall'); const lvl = clamp(Math.round(v.b.length / 6 + (hall ? hall.l : 1) * 2), 1, 20); G.startRaid({ seed: 1, level: lvl, name: "Friend's Village", chief: 'a friend', color: 0x8a8a8a, trophies: 0, loot: { gold: 300 + lvl * 200, wood: 200 + lvl * 120, stone: 200 + lvl * 120, iron: 40 + lvl * 40 } }, v); }
  a_copycode() { const code = encodeVillage(G.profile.village); const done = (ok) => { $('code-msg').textContent = ok ? 'Copied! Send it to a friend.' : 'Select and copy the code above.'; }; $('code-in').value = code; try { navigator.clipboard.writeText(code).then(() => done(true), () => { $('code-in').select(); done(false); }); } catch (e) { $('code-in').select(); done(false); } }
  p_defend() {
    const g = G.game;
    return `<div class="ph"><div><h2>Defend</h2><p>Endless waves assault the village you built.</p></div></div><div class="pb">
      <p class="brief">Raiders, Breakers and Sappers come for your Ember Heart. Your guards, towers, turrets and mines all fight — and every wall you laid in Build mode is real cover. Your village is repaired for free afterwards.</p>
      <div class="kv"><div><b>${g.stat('wavesBest')}</b>Best wave</div><div><b>${g.defenceRating()}</b>Defence rating</div><div><b>${g.count('tower') + g.count('bastion')}</b>Towers</div><div><b>${g.count('turret')}</b>Turrets</div></div>
      <div class="sec">Rewards</div><p class="brief">Gold, materials and trophies for every wave survived. Ember every fifth wave. Hold <b>F</b> between waves to retire and bank it all — if the Heart shatters you keep only what you earned.</p></div>
      <div class="pf"><button class="btn" data-a="tab" data-v="build">Edit defences</button><button class="btn pri" data-a="defend">Start defence</button></div>`;
  }
  a_defend() { G.startDefend(); }
  p_armory() {
    const p = G.profile, g = G.game; if (!this.sel.wep) this.sel.wep = p.primary; const ids = [...PRIMARIES, 'pistol', 'sledge'];
    let list = ''; for (const id of ids) { const w = WEAPONS[id], own = g.owns(id); list += `<div class="card click ${this.sel.wep === id ? 'sel' : ''} ${!own && p.level < w.unlock ? 'lock' : ''}" data-a="selwep" data-v="${id}"><div class="g"><h3>${w.name}</h3><p>${w.cls}${own ? ' · MK ' + p.weapons[id] : p.level < w.unlock ? ' · Unlocks at level ' + w.unlock : ''}</p></div>${p.primary === id ? '<span class="tag o">Equipped</span>' : own ? '' : '<span class="tag">' + (p.level < w.unlock ? 'Locked' : fmt(w.cost) + ' gold') + '</span>'}</div>`; }
    const id = this.sel.wep, w = WEAPONS[id], own = g.owns(id), lvl = p.weapons[id] || 1, st = weaponStats(id, lvl), nx = weaponStats(id, Math.min(5, lvl + 1));
    const bar = (label, v, v2, max, txt) => `<div class="statrow"><span>${label}</span><div class="bar"><i class="up" style="width:${clamp(v2 / max * 100, 0, 100)}%"></i><i style="width:${clamp(v / max * 100, 0, 100)}%"></i></div><b>${txt}</b></div>`;
    const dps = (s) => s.dmg * (w.pellets || 1);
    let d = `<div class="sec">${w.cls}</div><h2>${w.name}</h2><p class="brief">${w.desc}</p>
      ${bar('Damage', dps(st), dps(nx), 440, Math.round(dps(st)))}${bar('Fire rate', w.rpm, w.rpm, 950, w.rpm)}${w.melee ? '' : bar('Magazine', st.mag, nx.mag, 100, st.mag)}
      ${bar('Demolition', st.brick * (w.melee ? 1 : st.dmg / 25) * (w.radius ? 6 : 1), nx.brick * (w.melee ? 1 : nx.dmg / 25) * (w.radius ? 6 : 1), w.melee ? 300 : 40, w.radius ? 'BLAST' : w.melee ? 'MAX' : (st.brick * st.dmg / 25).toFixed(1))}${w.melee ? '' : bar('Control', 1 / (w.recoil[0] * st.recoil + 0.004), 1 / (w.recoil[0] * nx.recoil + 0.004), 120, Math.round(100 - w.recoil[0] * st.recoil * 900))}`;
    let foot = '';
    if (!own) foot = p.level < w.unlock ? `<span class="tag">Reach level ${w.unlock}</span>` : `${costHtml({ gold: w.cost })}<button class="btn pri" data-a="buywep" data-v="${id}">Buy</button>`;
    else { if (lvl < 5) { const c = upgradeCost(id, lvl); foot += `${costHtml(c)}<button class="btn" data-a="upwep" data-v="${id}">Upgrade to MK ${lvl + 1}</button>`; } else foot += '<span class="tag o">Fully upgraded</span>'; if (PRIMARIES.includes(id) && p.primary !== id) foot += `<button class="btn pri" data-a="equip" data-v="${id}">Equip</button>`; }
    return `<div class="ph"><div><h2>Armory</h2><p>Your sidearm and sledge always come with you. Choose one primary.</p></div></div><div class="pb"><div class="grid2"><div>${list}</div><div>${d}</div></div></div><div class="pf">${foot}</div>`;
  }
  a_selwep(v) { this.sel.wep = v; this.renderPanel(); }
  a_buywep(v) { if (G.game.buyWeapon(v)) { G.audio.ui('levelup'); G.game.equip(v); } else G.audio.ui('deny'); this.renderPanel(); }
  a_upwep(v) { if (G.game.upgradeWeapon(v)) G.audio.ui('star'); else G.audio.ui('deny'); this.renderPanel(); }
  a_equip(v) { G.game.equip(v); this.renderPanel(); }
  p_quests() {
    const p = G.profile, g = G.game; let h = '<div class="sec">Daily tribute</div><div class="daily">';
    const day = Math.floor(Date.now() / 864e5), streak = p.daily.last === day ? p.daily.streak : (p.daily.last === day - 1 ? p.daily.streak : 0), cur = (p.daily.last === day ? streak - 1 : streak) % 7;
    DAILY.forEach((rw, i) => { h += `<div class="${i < cur || (i === cur && p.daily.last === day) ? 'got' : i === cur ? 'now' : ''}">DAY ${i + 1}<b>${RES.filter((k) => rw[k]).map((k) => fmt(rw[k]) + ' ' + k).join('<br>')}</b></div>`; });
    h += `</div>${g.dailyReady() ? '<div class="row" style="margin-top:8px"><button class="btn pri sm" data-a="daily">Claim today\'s tribute</button></div>' : ''}<div class="sec">Daily orders</div>`;
    p.quests.list.forEach((q, i) => { h += `<div class="card"><div class="g"><h3>${q.text}</h3><div class="bar" style="margin:6px 0 4px"><i style="width:${q.prog / q.goal * 100}%"></i></div><p>${Math.min(q.prog, q.goal)} / ${q.goal} · ${costHtml({ gold: q.reward.gold, ember: q.reward.ember }, false)} +${q.reward.xp} XP</p></div>${q.claimed ? '<span class="tag">Claimed</span>' : q.prog >= q.goal ? `<button class="btn pri sm" data-a="quest" data-v="${i}">Claim</button>` : ''}</div>`; });
    h += '<div class="sec">Achievements</div>';
    const list = ACHIEVEMENTS.slice().sort((a, b) => (p.ach[a.id] ? 1 : 0) - (p.ach[b.id] ? 1 : 0));
    for (const a of list) { const v = g.stat(a.stat), ok = v >= a.n; h += `<div class="card ${p.ach[a.id] ? 'lock' : ''}"><div class="g"><h3>${a.name}</h3><p>${a.stat.replace(/([A-Z])/g, ' $1').toLowerCase()} ${fmt(Math.min(v, a.n))} / ${fmt(a.n)} · ${costHtml({ ember: a.ember }, false)}</p></div>${p.ach[a.id] ? '<span class="tag">Done</span>' : ok ? `<button class="btn pri sm" data-a="ach" data-v="${a.id}">Claim</button>` : ''}</div>`; }
    return `<div class="ph"><div><h2>Quests</h2><p>New orders every day.</p></div></div><div class="pb">${h}</div>`;
  }
  a_quest(v) { if (G.game.claimQuest(+v)) G.audio.ui('coin'); this.afterReward(); }
  a_ach(v) { if (G.game.claimAch(v)) G.audio.ui('star'); this.afterReward(); }
  a_daily() { const rw = G.game.claimDaily(); if (rw) { G.audio.ui('coin'); this.popup('Daily Tribute', `<div class="rw">${rewardHtml(rw)}</div><p class="brief" style="text-align:center">Streak: ${G.profile.daily.streak} day${G.profile.daily.streak > 1 ? 's' : ''}</p>`); } this.afterReward(); }
  async a_supply() { if (!G.game.supplyReady()) return; if (SDK.canReward()) { const ok = await SDK.rewarded(); if (!ok) { this.popup('Caravan delayed', '<p class="brief">The video could not be shown. Try again in a moment.</p>'); return; } } const rw = G.game.claimSupply(); G.audio.ui('coin'); this.popup('Supply Caravan', `<div class="rw">${rewardHtml(rw)}</div>`); this.afterReward(); }
  afterReward() { this.refreshTop(); this.renderNav(); this.renderPanel(); this.levelUps(); }
  p_settings() {
    const s = G.settings, q = G.r3.quality;
    const sl = (k, label, min, max, step, pct) => `<div class="sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-set="${k}"><b>${pct ? Math.round(s[k] * 100) + '%' : s[k] + '°'}</b></div>`;
    return `<div class="ph"><div><h2>Settings</h2></div></div><div class="pb">
      <div class="sec">Graphics</div><div class="sl"><span>Quality</span><div class="seg">${['Low', 'Medium', 'High', 'Ultra'].map((n, i) => `<button class="${q === i ? 'on' : ''}" data-a="quality" data-v="${i}">${n}</button>`).join('')}</div><b></b></div>
      ${sl('fov', 'Field of view', 55, 95, 1, false)}
      <div class="sl"><span>Show FPS</span><div class="seg"><button class="${s.showFps ? 'on' : ''}" data-a="toggle" data-v="showFps">${s.showFps ? 'On' : 'Off'}</button></div><b></b></div>
      <div class="sec">Audio</div>${sl('master', 'Master volume', 0, 1, 0.01, true)}${sl('music', 'Music', 0, 1, 0.01, true)}${sl('sfx', 'Effects', 0, 1, 0.01, true)}
      <div class="sec">Controls</div>${sl('sens', 'Mouse sensitivity', 0.2, 3, 0.01, true)}
      <div class="sl"><span>Invert Y</span><div class="seg"><button class="${s.invertY ? 'on' : ''}" data-a="toggle" data-v="invertY">${s.invertY ? 'On' : 'Off'}</button></div><b></b></div>
      <p class="brief"><b>WASD</b> move · <b>Shift</b> sprint (scoped: hold breath) · <b>C / Ctrl</b> crouch (while sprinting: slide) · <b>Space</b> jump / mantle · <b>Q / E</b> lean · <b>LMB</b> fire · <b>RMB</b> aim · <b>R</b> reload · <b>1 2 3 / wheel</b> weapons · <b>G</b> grenade (hold to cook) · <b>V</b> melee strike · <b>F</b> end raid · <b>Esc</b> pause</p>
      <div class="sec">Clan colour</div><div class="row">${CLAN_COLORS.map((c, i) => `<button class="chip" style="background:${hex(c)};width:26px;height:26px;${G.profile.color === i ? 'outline:2px solid #fff' : ''}" data-a="color" data-v="${i}"></button>`).join('')}</div>
      <div class="sec">Save</div><div class="row"><button class="btn sm" data-a="resetask">Reset all progress</button></div></div>`;
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
    const gained = RES.some((k) => rep.gained[k] > 0); if (!gained && !rep.raids.length) return false;
    let h = ''; if (gained) h += `<div class="sec">Produced while you were away (${rep.hours.toFixed(1)} h)</div><div class="rw">${rewardHtml(rep.gained)}</div>`;
    for (const r of rep.raids) h += `<div class="card"><div class="g"><h3 style="color:${r.held ? 'var(--good)' : 'var(--bad)'}">${r.held ? 'Raid repelled' : 'Your village was raided'}</h3><p>${r.name} (Chief ${r.chief}) attacked. ${r.held ? 'Your defences held.' : 'They carried off ' + RES.filter((k) => r.lost[k]).map((k) => fmt(r.lost[k]) + ' ' + k).join(', ') + '. Build stronger walls — or take revenge.'} ${r.trophies > 0 ? '+' : ''}${r.trophies} trophies</p></div></div>`;
    this.popup('Welcome back, Ranger', h); return true;
  }
  prologue(done) {
    let i = 0; const show = () => { if (i >= PROLOGUE.length) { this.modal.onclick = null; this.closeModal(); done(); return; } this.openModal(`<div class="prol">${PROLOGUE[i]}<small>CLICK TO CONTINUE</small></div>`, 'prologue'); i++; };
    this.modal.onclick = () => { if (this.modalKind === 'prologue') { G.audio.resume(); G.audio.ui('click'); show(); } }; show();
  }
  showPause(keep) {
    const m = G.mode, s = G.settings, build = G.build.active;
    const sl = (k, label, min, max, step, pct) => `<div class="sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-set="${k}"><b>${pct ? Math.round(s[k] * 100) + '%' : s[k] + '°'}</b></div>`;
    this.openModal(`<div class="mbox"><div class="ph"><h2>${build ? 'Builder' : 'Paused'}</h2><p>${build ? 'Hollowmere' : m && m.cfg.title ? m.cfg.title : ''}</p></div><div class="pb">
      ${sl('sens', 'Mouse sensitivity', 0.2, 3, 0.01, true)}${sl('fov', 'Field of view', 55, 95, 1, false)}${sl('master', 'Master volume', 0, 1, 0.01, true)}${sl('music', 'Music', 0, 1, 0.01, true)}
      <div class="sl"><span>Quality</span><div class="seg">${['Low', 'Med', 'High', 'Ultra'].map((n, i) => `<button class="${G.r3.quality === i ? 'on' : ''}" data-a="pquality" data-v="${i}">${n}</button>`).join('')}</div><b></b></div>
      <div class="sl"><span>Invert Y</span><div class="seg"><button class="${s.invertY ? 'on' : ''}" data-a="toggle" data-v="invertY">${s.invertY ? 'On' : 'Off'}</button></div><b></b></div></div>
      <div class="pf">${build ? '<button class="btn" data-a="testdef">Test defences</button><button class="btn" data-a="quit">Save &amp; exit</button>' : `<button class="btn" data-a="quit">${m && m.kind === 'raid' ? 'End raid' : m && m.kind === 'defend' ? 'End defence' : 'Abandon mission'}</button><button class="btn" data-a="restart">Restart</button>`}<button class="btn pri" data-a="resume">Resume</button></div></div>`, 'pause');
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
    const rw = res.reward, s = res.stats, title = res.kind === 'raid' ? (res.win ? 'VICTORY' : 'RAID FAILED') : res.kind === 'defend' ? (res.waves > 0 ? 'VILLAGE HELD' : 'OVERRUN') : (res.win ? 'MISSION COMPLETE' : 'MISSION FAILED');
    const sub = res.kind === 'raid' ? `${m.cfg.rival.name} — ${Math.round(res.pct * 100)}% destroyed${res.core ? ' · Heart shattered' : ''}` : res.kind === 'defend' ? `${res.waves} wave${res.waves === 1 ? '' : 's'} repelled` : m.cfg.title;
    let h = `<div class="big ${res.win ? 'win' : 'lose'}">${title}</div><p style="text-align:center;color:var(--dim);letter-spacing:.14em;margin-top:6px;text-transform:uppercase;font-size:12px">${sub}</p>`;
    h += `<div class="bigstars">${[0, 1, 2].map((i) => i < res.stars ? '<span>★</span>' : '<i>★</i>').join('')}</div>`;
    if (res.bonus && res.bonus.length) h += res.bonus.map((b) => `<p style="text-align:center" class="${b.done ? 'chk' : 'unchk'}">${b.done ? '★' : '☆'} ${b.text}</p>`).join('');
    h += `<div class="kv"><div><b>${s.kills}</b>Kills</div><div><b>${s.headshots}</b>Headshots</div><div><b>${fmt(s.bricks)}</b>Bricks broken</div><div><b>${res.accuracy}%</b>Accuracy</div><div><b>${s.razed}</b>Buildings razed</div><div><b>${s.loot}</b>Gold bars</div><div><b>${fmtTime(res.time)}</b>Time</div><div><b>${fmt(rw.xp)}</b>XP</div></div>`;
    h += `<div class="sec" style="text-align:center">Spoils</div><div class="rw" id="res-rw">${rewardHtml({ gold: rw.gold, wood: rw.wood, stone: rw.stone, iron: rw.iron, ember: rw.ember, trophies: rw.trophies }) || '<span style="color:var(--dim)">Nothing this time.</span>'}</div>`;
    if (res.granted) h += `<p class="brief" style="text-align:center">New weapon: <b>${res.granted}</b></p>`;
    if (res.unlockText) h += `<p class="brief" style="text-align:center;color:var(--em2)">${res.unlockText}</p>`;
    const b = res.before, a = res.after;
    h += `<div style="margin:10px 40px 0"><div class="row" style="justify-content:space-between;font-family:var(--hf);font-size:12px;letter-spacing:.1em"><span>LEVEL ${a.level}</span><span>${fmt(a.xp)} / ${fmt(a.need)} XP</span></div><div class="bar" style="height:7px"><i id="res-xp" style="width:${a.level > b.level ? 0 : b.xp / b.need * 100}%;transition:width 1.2s .4s"></i></div></div>`;
    const canDouble = SDK.canReward() && (rw.gold + rw.wood + rw.stone + rw.iron) > 0;
    const next = res.kind === 'story' && res.win ? STORY.findIndex((x) => x.id === m.cfg.storyDef.id) + 1 : -1;
    this.resCtx = { m, res };
    this.openModal(`<div class="mbox wide"><div class="pb" style="padding:26px 30px 14px">${h}</div><div class="pf" style="justify-content:center">${canDouble ? '<button class="btn ad" id="res-dbl" data-a="double">Double the spoils</button>' : ''}<button class="btn" data-a="again">${res.kind === 'story' ? 'Replay' : res.kind === 'raid' ? 'Menu' : 'Defend again'}</button>${next > 0 && next < STORY.length ? `<button class="btn pri" data-a="nextstory" data-v="${next}">Next chapter</button>` : '<button class="btn pri" data-a="tomenu">Continue</button>'}</div></div>`, 'results');
    setTimeout(() => { const e = $('res-xp'); if (e) e.style.width = (a.xp / a.need * 100) + '%'; }, 60);
    Input.unlock();
  }
  async a_double() { const c = this.resCtx; if (!c || c.res.doubled) return; const ok = await SDK.rewarded(); if (!ok) return; G.game.doubleReward(c.res); G.audio.ui('coin'); const rw = c.res.reward; $('res-rw').innerHTML = rewardHtml({ gold: rw.gold * 2, wood: rw.wood * 2, stone: rw.stone * 2, iron: rw.iron * 2, ember: rw.ember, trophies: rw.trophies }); const b = $('res-dbl'); if (b) b.remove(); }
  a_tomenu() { this.closeModal(); G.toMenu(true); }
  a_again() { const c = this.resCtx; this.closeModal(); if (c.res.kind === 'raid') G.toMenu(true, 'raid'); else G.afterAd(() => G.restartMission()); }
  a_nextstory(v) { this.closeModal(); this.sel.story = +v; G.toMenu(true, 'story'); }

  // ------------------------------------------------------------------ build HUD
  showBuild(on) { $('buildhud').classList.toggle('hidden', !on); if (on) { this.refreshTop(); this.buildRefresh(); $('b-help').innerHTML = '<b>WASD</b>Move &nbsp; <b>Space / C</b>Up / down<br><b>LMB</b>Place (hold to paint bricks)<br><b>RMB / X</b>Remove &nbsp; <b>R</b>Rotate<br><b>Wheel</b>Next item &nbsp; <b>1-5</b>Category<br><b>MMB</b>Pick brick &nbsp; <b>Z</b>Undo<br><b>F</b>Walk / fly &nbsp; <b>Shift</b>Fast<br><b>Tab</b>Free cursor &nbsp; <b>Esc</b>Menu'; } }
  buildRefresh() {
    const b = G.build, g = G.game, lvl = g.hallLevel();
    let cats = CATS.map((c, i) => `<button class="${i === b.cat ? 'on' : ''}" data-a="bcat" data-v="${i}">${i + 1} ${c.name}</button>`).join('');
    const hc = lvl < 5 ? bpCost('hall', lvl + 1) : null;
    cats += `<span class="sp"></span>${hc ? `<button data-a="bhall" title="Upgrade the Ember Hall">Upgrade Hall → LV ${lvl + 1} ${costHtml(hc)}</button>` : '<button class="off">Hall max level</button>'}<button data-a="bundo">Undo</button><button data-a="btest">Test defences</button><button data-a="bexit" style="background:var(--em);color:#160b02">Save &amp; Exit</button>`;
    $('b-cats').innerHTML = cats;
    const items = b.items();
    $('b-items').innerHTML = items.map((it, i) => {
      if (it.brick) { const m = MATS[it.brick.mat]; return `<div class="bi ${i === b.sel ? 'on' : ''}" data-a="bitem" data-v="${i}"><div class="sw" style="background:${hex(m.color)}"></div><div class="n">${it.name}</div><div class="c">${costHtml(brickCost(it.brick))}</div></div>`; }
      const have = g.count(it.bp.key), lim = it.bp.max[lvl - 1];
      return `<div class="bi ${i === b.sel ? 'on' : ''} ${have >= lim ? 'max' : ''}" data-a="bitem" data-v="${i}"><div class="n">${it.name}</div><div class="c">${have} / ${lim}</div><div class="c">${costHtml(bpCost(it.bp.key, 1))}</div></div>`;
    }).join('');
    const sel = $('b-items').querySelector('.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.buildInfo();
  }
  buildInfo() {
    const b = G.build, it = b.item(); if (!it) return; let h;
    if (it.brick) { const m = MATS[it.brick.mat]; h = `<h3>${it.name}</h3><p>${m.name}. Size ${it.brick.s.map((v) => v * 25).join(' × ')} cm · ${Math.round(m.hp)} durability. Hold the mouse button to lay a course quickly.</p>${costHtml(brickCost(it.brick))}`; }
    else { const lvl = G.game.hallLevel(); h = `<h3>${it.name}</h3><p>${it.bp.desc || ''}</p>${costHtml(bpCost(it.bp.key, 1))}<p style="margin-top:6px">Built ${G.game.count(it.bp.key)} / ${it.bp.max[lvl - 1]}${lvl < 5 && it.bp.max[lvl] > it.bp.max[lvl - 1] ? ' (next hall level: ' + it.bp.max[lvl] + ')' : ''}</p>`; }
    h += `<div class="why" id="b-why"></div>`;
    $('b-info').innerHTML = h; this.lastWhy = null;
  }
  buildTick() { const b = G.build, why = Input.locked ? (b.valid ? '' : b.reason) : 'Click the view to grab the camera'; if (why !== this.lastWhy) { this.lastWhy = why; const e = $('b-why'); if (e) e.textContent = why; } }
  a_bcat(v) { G.build.cat = +v; G.build.sel = 0; G.build.ghostKey = ''; this.buildRefresh(); }
  a_bitem(v) { G.build.sel = +v; G.build.ghostKey = ''; this.buildRefresh(); Input.wantLock = true; Input.lock(); }
  a_bhall() { if (G.build.upgradeHall()) { this.refreshTop(); this.buildRefresh(); } else if (G.hud) G.hud.toast('Not enough resources', 1.5); }
  a_bundo() { G.build.undoLast(); this.refreshTop(); this.buildRefresh(); }
  a_btest() { G.exitBuild(true); G.startDefend(); }
  a_bexit() { G.exitBuild(); }
}
