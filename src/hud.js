// In-combat HUD (DOM overlay): crosshair, ammo, health, objectives, radar, markers, feed, subtitles.
import * as THREE from 'three';
import { G, clamp, fmtTime } from './util.js';
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
  constructor() {
    this.el = $('hud'); this.x = $('xhair'); this.hit = $('hitm'); this.objs = $('objs'); this.feedEl = $('feed'); this.bannerEl = $('banner'); this.toastEl = $('toast');
    this.sub = $('subtitle'); this.radar = $('radar').getContext('2d'); this.markers = $('markers'); this.dmgdir = $('dmgdir'); this.dmgnums = $('dmgnums');
    this.hitT = 0; this.toastT = 0; this.toastKey = ''; this.bannerT = 0; this.subT = 0; this.streakT = 0; this.dirs = []; this.slow = 0; this.cache = {}; this.markerEls = []; this.warnT = 0; this.promptText = '';
  }
  show(on) { this.el.classList.toggle('hidden', !on); if (on) { this.feedEl.innerHTML = ''; this.dmgnums.innerHTML = ''; this.cache = {}; this.bannerEl.classList.remove('on'); this.sub.classList.remove('on'); this.toastEl.style.opacity = 0; $('streak').style.opacity = 0; for (const d of this.dirs) d.el.remove(); this.dirs = []; } }
  set(id, key, html) { if (this.cache[key] !== html) { this.cache[key] = html; (typeof id === 'string' ? $(id) : id).innerHTML = html; } }

  toast(text, dur = 1.5, key = '') { if (G.build && G.build.active) { const e = $('b-toast'); e.textContent = text; e.style.opacity = 1; this.bToastT = dur; return; } this.toastEl.textContent = text; this.toastEl.style.opacity = 1; this.toastT = dur; this.toastKey = key; }
  feed(text, color = '#fff') { const d = document.createElement('div'); d.textContent = text; d.style.color = color; this.feedEl.prepend(d); setTimeout(() => { d.style.opacity = 0; }, 3600); setTimeout(() => d.remove(), 4200); while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove(); }
  banner(text, color = '#fff', sub = '') { const b = this.bannerEl; b.querySelector('.bt').textContent = text; b.querySelector('.bt').style.color = color; b.querySelector('.bs').textContent = sub; b.classList.add('on'); this.bannerT = 2.6; }
  streak(n) { const e = $('streak'); e.textContent = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'RAMPAGE', 'UNSTOPPABLE'][Math.min(5, n)] || 'UNSTOPPABLE'; e.style.opacity = 1; this.streakT = 1.8; }
  subtitle(who, text, dur) { this.sub.querySelector('.who').textContent = who; this.sub.querySelector('.txt').textContent = text; this.sub.classList.add('on'); this.subT = dur; }
  hitmarker(head, kill) { this.hit.className = kill ? 'kill' : head ? 'head' : ''; this.hit.style.opacity = 1; this.hitT = kill ? 0.3 : 0.16; if (G.audio && !kill) G.audio.ui('hit'); }
  damageNumber(a, amount) { if (this.dmgnums.children.length > 14) return; _v.set(a.pos.x, a.pos.y + a.height + 0.1, a.pos.z).project(G.r3.camera); if (_v.z > 1) return; const i = document.createElement('i'); i.textContent = Math.round(amount); if (amount > 90) i.className = 'h'; i.style.left = ((_v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30) + 'px'; i.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px'; this.dmgnums.appendChild(i); setTimeout(() => i.remove(), 700); }
  damageFrom(from, player) { if (!from) return; const el = document.createElement('i'); this.dmgdir.appendChild(el); this.dirs.push({ el, x: from.x, z: from.z, t: 1.4 }); if (this.dirs.length > 5) { this.dirs.shift().el.remove(); } }
  sniperWarn(a, f) { this.warnT = 0.2; const w = $('warn'); w.textContent = '◆ MARKSMAN AIMING ◆'; w.style.opacity = 0.4 + f * 0.6; }
  prompt(html) { const p = $('prompt'); if (html !== this.promptText) { this.promptText = html; p.innerHTML = html; p.style.display = html ? 'block' : 'none'; } }

  update(dt) {
    const p = G.player, w = G.weapons, m = G.mode, cam = G.r3.camera;
    if (!m) return;
    // timers
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hit.style.opacity = 0; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.sub.classList.remove('on'); }
    if (this.streakT > 0) { this.streakT -= dt; if (this.streakT <= 0) $('streak').style.opacity = 0; }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) $('warn').style.opacity = 0; }
    // crosshair
    const d = w.def, scoped = d.scope && w.adsT > 0.9;
    $('scope').style.display = scoped ? 'block' : 'none';
    const hideX = p.dead || scoped || (w.adsT > 0.6 && !d.melee && d.kind !== 'shotgun') || p.sprinting;
    this.x.style.opacity = hideX ? 0 : 1;
    if (!hideX) { const fovPx = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360)); this.x.style.setProperty('--g', (d.melee ? 4 : clamp(w.spread * fovPx + 3, 4, 90)).toFixed(1) + 'px'); }
    for (let i = this.dirs.length - 1; i >= 0; i--) { const q = this.dirs[i]; q.t -= dt; if (q.t <= 0) { q.el.remove(); this.dirs.splice(i, 1); continue; } const a = Math.atan2(q.x - p.pos.x, q.z - p.pos.z) - (p.yaw + Math.PI); q.el.style.transform = 'rotate(' + (-a) + 'rad)'; q.el.style.opacity = Math.min(1, q.t); }
    // vitals & ammo (cheap string caching)
    const hp = Math.ceil(p.hp);
    this.set($('vitals').firstElementChild, 'hp', hp + '<small>HEALTH</small>');
    const hb = $('vitals').querySelector('.hpbar i'); hb.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%'; hb.style.background = p.hp < 35 ? '#ff4a3a' : '#fff';
    const a = w.ammo();
    this.set($('ammo').querySelector('.wname'), 'wn', d.name.toUpperCase() + ((w.levels[w.id] || 1) > 1 ? '  MK ' + ['', 'I', 'II', 'III', 'IV', 'V'][w.levels[w.id]] : ''));
    const magEl = $('ammo').querySelector('.mag');
    this.set(magEl, 'mag', d.melee ? '—' : String(a.mag)); magEl.classList.toggle('low', !d.melee && a.mag <= w.stats.mag * 0.25);
    this.set($('ammo').querySelector('.res'), 'res', d.melee ? '' : (w.reloadT >= 0 ? 'RELOADING' : '/ ' + (a.reserve > 9000 ? '∞' : a.reserve)));
    this.set($('ammo').querySelector('.slots'), 'sl' + w.cur + w.slots.join(), w.slots.map((id, i) => `<span>${i === w.cur ? '<b>' : ''}${i + 1} ${WEAPONS[id].cls.toUpperCase()}${i === w.cur ? '</b>' : ''}</span>`).join(''));
    this.set($('ammo').querySelector('.nades'), 'nd', 'G  FRAG ×' + w.grenades);
    this.slow -= dt; if (this.slow > 0) { this.drawMarkers(m, cam); return; } this.slow = 0.12;
    // objectives
    let h = '<div class="t">' + (m.kind === 'raid' ? 'RAID — ' + (m.cfg.rival ? m.cfg.rival.name.toUpperCase() : '') : m.kind === 'defend' ? 'VILLAGE DEFENCE' : (m.cfg.title || '').toUpperCase()) + '</div>';
    for (const o of m.objs) h += `<div class="o${o.done ? ' done' : ''}">${o.text}${o.prog ? ' <b>' + o.prog + '</b>' : ''}</div>`;
    if (m.kind === 'story') for (const b of m.bonus) { const done = m.evalBonus(b), pr = m.bonusProg(b); h += `<div class="o bn${done && b.type !== 'time' && b.type !== 'nodamage' && b.type !== 'coreHealth' ? ' done' : ''}">${b.text}${pr ? ' <b>' + pr + '</b>' : ''}</div>`; }
    if (m.kind === 'raid') h += `<div class="o bn">Gold bars looted <b>${m.stats.loot}/${m.lootTotal}</b></div>`;
    if (m.mode !== 'defend' && m.kind !== 'menu') { const left = G.actors.countAlive(1); h += `<div class="o bn">Hostiles <b>${left}</b></div>`; }
    this.set(this.objs, 'objs', h);
    // top centre
    let t = '';
    if (m.kind === 'raid') t = fmtTime(m.timeLimit - m.time); else if (m.kind === 'story' && m.mode !== 'defend') t = fmtTime(m.time); else if (m.mode === 'defend') t = m.waveState === 'active' ? 'WAVE ' + m.wave : '';
    this.set('timer', 'timer', t);
    if (m.kind === 'raid') { const s = m.raidStars(); this.set('stars', 'stars', `<span class="s">${'★'.repeat(s)}<i>${'★'.repeat(3 - s)}</i></span><br>${Math.round(m.pct() * 100)}% DESTROYED`); } else this.set('stars', 'stars', m.mode === 'defend' && m.waveState === 'active' ? G.actors.countAlive(1) + m.spawnQueue.length + ' HOSTILES' : '');
    const cb = $('corebar'); if (m.mode === 'defend') { cb.style.display = 'block'; cb.querySelector('i').style.width = clamp((m.coreHealth() - 0.4) / 0.6, 0, 1) * 100 + '%'; } else cb.style.display = 'none';
    // end-raid prompt
    if (m.kind === 'raid' && m.state === 'play') this.prompt(m.endHold > 0 ? 'ENDING RAID… ' + Math.round(m.endHold / 1.2 * 100) + '%' : (m.raidStars() > 0 || m.time > 20 ? 'Hold <b>F</b> to end the raid and keep your loot' : ''));
    else if (m.kind === 'defend' && m.state === 'play' && m.waveState === 'wait' && m.wavesCleared > 0) this.prompt(m.endHold > 0 ? 'RETIRING… ' + Math.round(m.endHold / 1.2 * 100) + '%' : 'Hold <b>F</b> to end the defence and bank your rewards');
    else this.prompt('');
    this.drawRadar(p, m); this.drawMarkers(m, cam);
  }

  drawRadar(p, m) {
    const c = this.radar, S = 150, R = 68, range = 48;
    c.clearRect(0, 0, S, S); c.save(); c.translate(S / 2, S / 2);
    c.fillStyle = 'rgba(8,10,12,.55)'; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.fill(); c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(0, 0, R / 2, 0, 6.3); c.stroke();
    const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    const plot = (x, z, col, r, clampEdge) => { const dx = x - p.pos.x, dz = z - p.pos.z; let rx = dx * cs - dz * sn, ry = dx * sn + dz * cs; let d = Math.hypot(rx, ry) / range; if (d > 1) { if (!clampEdge) return; rx /= d; ry /= d; d = 1; } c.fillStyle = col; c.beginPath(); c.arc(rx / range * R, ry / range * R, r, 0, 6.3); c.fill(); };
    // village footprint hint
    for (const b of m.buildings || []) if (!b.dead) plot(b.info.cx, b.info.cz, 'rgba(255,255,255,.13)', clamp(b.info.radius / range * R * 0.7, 1.5, 9), false);
    for (const mk of m.markers()) plot(mk.x, mk.z, mk.col, 3.2, true);
    for (const a of G.actors.list) { if (a.dead) continue; if (a.team === 0) plot(a.pos.x, a.pos.z, a.T.civilian ? '#9fe8ff' : '#4aa8ff', 2.4, false); else if (a.alerted || a.seenT < 4 || Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 14) plot(a.pos.x, a.pos.z, a.T.boss ? '#ff00aa' : '#ff3a2a', a.T.boss ? 4 : 2.6, false); }
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
    c.restore();
  }

  drawMarkers(m, cam) {
    const list = m.state === 'play' || m.state === 'winning' ? m.markers() : [], els = this.markerEls;
    while (els.length < list.length) { const i = document.createElement('i'); this.markers.appendChild(i); els.push(i); }
    const W = innerWidth, H = innerHeight, p = G.player.pos;
    for (let k = 0; k < els.length; k++) {
      const e = els[k], mk = list[k]; if (!mk) { e.style.display = 'none'; continue; }
      _v.set(mk.x, mk.y, mk.z).project(cam);
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H; const behind = _v.z > 1;
      if (behind) { x = W - x; y = H - 40; }
      const off = behind || x < 30 || x > W - 30 || y < 40 || y > H - 40;
      x = clamp(x, 30, W - 30); y = clamp(y, 40, H - 40);
      e.style.display = 'block'; e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.color = mk.col; e.className = off ? 'off' : '';
      const txt = mk.label + '<small>' + Math.round(Math.hypot(mk.x - p.x, mk.z - p.z)) + ' m</small>'; if (e._t !== txt) { e._t = txt; e.innerHTML = txt; }
    }
  }
  tickBuild(dt) { if (this.bToastT > 0) { this.bToastT -= dt; if (this.bToastT <= 0) $('b-toast').style.opacity = 0; } }
}
