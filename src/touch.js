// Touch controls for phones and tablets: a floating move stick on the left, drag-to-look on the right,
// and a thumb-reachable button cluster. Build mode gets its own set (place / remove / rotate / fly).
import { G } from './util.js';
import { Input } from './input.js';

// deviceType: CrazyGames' own detection ("desktop" | "tablet" | "mobile") when the SDK is live — preferred over guessing
export function isTouchDevice(deviceType) {
  const q = new URLSearchParams(location.search);
  if (q.has('touch')) return q.get('touch') !== '0';
  if (deviceType) return deviceType !== 'desktop';
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.matchMedia && matchMedia('(pointer: coarse)').matches;
}

const LOOK = 2.4;            // touch pixels -> mouse-pixel equivalents

export class Touch {
  constructor() {
    this.el = document.createElement('div'); this.el.id = 'touch'; this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="t-stick"><i></i></div>
      <button class="t-btn t-pause" data-k="pause" aria-label="Pause">II</button>
      <div class="t-play">
        <button class="t-btn t-fire" data-k="fire" aria-label="Fire"><b>FIRE</b></button>
        <button class="t-btn t-fire2" data-k="fire" aria-label="Fire"></button>
        <button class="t-btn t-aim" data-k="aim">AIM</button>
        <button class="t-btn t-jump" data-k="jump">JUMP</button>
        <button class="t-btn t-crouch" data-k="crouch">DUCK</button>
        <button class="t-btn t-reload" data-k="reload">R</button>
        <button class="t-btn t-nade" data-k="nade">G</button>
        <button class="t-btn t-melee" data-k="melee">V</button>
        <button class="t-btn t-swap" data-k="swap">⇄</button>
        <button class="t-btn t-score" data-k="score">TAB</button>
      </div>
      <div class="t-build">
        <button class="t-btn t-place" data-k="place">PLACE</button>
        <button class="t-btn t-remove" data-k="remove">DEL</button>
        <button class="t-btn t-rot" data-k="rotate">⟳</button>
        <button class="t-btn t-up" data-k="up">▲</button>
        <button class="t-btn t-down" data-k="down">▼</button>
        <button class="t-btn t-undo" data-k="undo">↶</button>
      </div>`;
    document.body.appendChild(this.el);
    this.stick = this.el.querySelector('.t-stick'); this.knob = this.stick.firstElementChild;
    this.ptrs = new Map(); this.aimOn = false; this.crouchOn = false; this.mode = '';
    const opt = { passive: false };
    this.el.addEventListener('pointerdown', (e) => this.down(e), opt);
    window.addEventListener('pointermove', (e) => this.move(e), opt);
    window.addEventListener('pointerup', (e) => this.up(e), opt);
    window.addEventListener('pointercancel', (e) => this.up(e), opt);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  show(mode) {          // '' | 'play' | 'build'
    if (mode === this.mode) return; this.mode = mode;
    this.el.classList.toggle('hidden', !mode); this.el.dataset.mode = mode;
    if (!mode) this.reset();
  }
  reset() {
    for (const p of this.ptrs.values()) if (p.k) this.key(p.k, false);
    this.ptrs.clear(); Input.ax = Input.ay = 0; this.stick.style.display = 'none';
    Input.buttons[0] = false; if (this.aimOn) { this.aimOn = false; Input.buttons[2] = false; }
    if (this.crouchOn) { this.crouchOn = false; Input.keys.KeyC = false; }
  }
  press(code, on) { if (on) { if (!Input.keys[code]) Input.pressed[code] = true; Input.keys[code] = true; } else { Input.keys[code] = false; Input.released[code] = true; } }
  key(k, on, btn) {
    if (btn) btn.classList.toggle('on', on);
    switch (k) {
      case 'fire': case 'place': Input.buttons[0] = on; if (on) Input.bPressed[0] = true; break;
      case 'remove': if (on) this.press('KeyX', true); else this.press('KeyX', false); break;
      case 'aim': if (on) { this.aimOn = !this.aimOn; Input.buttons[2] = this.aimOn; } break;
      case 'crouch': if (on) { this.crouchOn = !this.crouchOn; this.press('KeyC', this.crouchOn); if (this.crouchOn) Input.pressed.KeyC = true; } break;
      case 'jump': case 'up': this.press('Space', on); break;
      case 'down': this.press('ControlLeft', on); break;
      case 'reload': case 'rotate': this.press('KeyR', on); break;
      case 'nade': this.press('KeyG', on); break;
      case 'melee': this.press('KeyV', on); break;
      case 'undo': this.press('KeyZ', on); break;
      case 'swap': if (on) Input.wheel += 1; break;
      case 'score': this.press('Tab', on); break;
      case 'pause': if (on) { if (G.audio) G.audio.ui('click'); Input.unlock(); } break;
    }
    if (btn && (k === 'aim' || k === 'crouch')) btn.classList.toggle('on', k === 'aim' ? this.aimOn : this.crouchOn);
  }
  down(e) {
    if (G.audio) G.audio.resume();
    e.preventDefault();
    const btn = e.target.closest && e.target.closest('.t-btn'), W = innerWidth;
    const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, k: null, look: false, stick: false };
    if (btn) { p.k = btn.dataset.k; p.btn = btn; p.look = p.k === 'fire' || p.k === 'place'; this.key(p.k, true, btn); }
    else if (e.clientX < W * 0.42 && !this.stickId) {                  // floating move stick
      p.stick = true; this.stickId = e.pointerId; this.stick.style.display = 'block';
      this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px'; this.knob.style.transform = 'translate(-50%,-50%)';
    } else p.look = true;
    this.ptrs.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (p.stick) {
      const R = 52; let ox = e.clientX - p.sx, oy = e.clientY - p.sy; const l = Math.hypot(ox, oy);
      if (l > R * 1.6) { p.sx += ox * (1 - R * 1.6 / l); p.sy += oy * (1 - R * 1.6 / l); this.stick.style.left = p.sx + 'px'; this.stick.style.top = p.sy + 'px'; ox = e.clientX - p.sx; oy = e.clientY - p.sy; }
      const k = Math.min(1, Math.hypot(ox, oy) / R), a = Math.atan2(oy, ox);
      Input.ax = Math.cos(a) * k; Input.ay = Math.sin(a) * k;
      this.knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * k * R}px), calc(-50% + ${Math.sin(a) * k * R}px))`;
    } else if (p.look) { Input.mdx += dx * LOOK; Input.mdy += dy * LOOK; }
  }
  up(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId);
    if (p.stick) { this.stickId = null; Input.ax = Input.ay = 0; this.stick.style.display = 'none'; }
    if (p.k && p.k !== 'aim' && p.k !== 'crouch') {
      // keep fire held while another finger still rests on a fire button
      if ((p.k === 'fire' || p.k === 'place') && [...this.ptrs.values()].some((q) => q.k === p.k)) return;
      this.key(p.k, false, p.btn);
    }
  }
  update() {
    const want = Input.touch && Input.locked && !G.busy ? (G.state === 'play' ? 'play' : G.state === 'build' ? 'build' : '') : '';
    this.show(want);
    if (want === 'play' && G.weapons) this.el.querySelector('.t-aim').classList.toggle('dis', !!G.weapons.def.melee);
  }
}

// a portrait phone can't fit the HUD: ask for landscape
export function orientationGuard() {
  const el = document.createElement('div'); el.id = 'rotate'; el.innerHTML = '<div><b>⟲</b>Turn your phone sideways</div>'; document.body.appendChild(el);
  const f = () => el.classList.toggle('on', Input.touch && innerHeight > innerWidth * 1.1);
  window.addEventListener('resize', f); f();
}
