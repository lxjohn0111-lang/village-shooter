// Keyboard / mouse state with per-frame edge detection and pointer-lock handling.
import { G } from './util.js';

export const Input = {
  keys: {}, pressed: {}, released: {}, mdx: 0, mdy: 0, wheel: 0, buttons: [false, false, false], bPressed: [false, false, false], bReleased: [false, false, false],
  locked: false, wantLock: false, virtual: false, noLock: false, skipMove: 0, ax: 0, ay: 0, touch: false, lockPending: false, lockFails: 0,
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'F1', 'F3'].includes(e.code) || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyW', 'KeyZ'].includes(e.code))) e.preventDefault();
      if (e.code === 'Escape' && this.virtual) this.release();
      if (G.onKey) G.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; this.released[e.code] = true; });
    window.addEventListener('blur', () => { this.keys = {}; this.buttons = [false, false, false]; this.ax = this.ay = 0; if (this.virtual && !this.touch) this.release(); });
    canvas.addEventListener('mousedown', (e) => {
      if (G.audio) G.audio.resume();
      if (this.wantLock && !this.locked) { this.lock(); return; }
      // steering with the free cursor (lock was refused or never had a click to go with): this click can capture the mouse for real
      if (this.virtual && !this.touch && !this.noLock && this.wantLock && !this.lockPending) { this.requestReal(); return; }
      if (e.button < 3) { this.buttons[e.button] = true; this.bPressed[e.button] = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button < 3) { this.buttons[e.button] = false; this.bReleased[e.button] = true; } });
    // some browsers report one huge bogus delta right after the pointer is captured: drop the first move and any absurd jump
    window.addEventListener('mousemove', (e) => { if (!this.locked || this.touch) return; if (this.skipMove > 0) { this.skipMove--; return; } const mx = e.movementX || 0, my = e.movementY || 0; if (Math.abs(mx) > 400 || Math.abs(my) > 400) return; this.mdx += mx; this.mdy += my; });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.lockPending = false;
      if (document.pointerLockElement === canvas) {
        this.lockFails = 0; this.skipMove = 1; this.locked = true;
        if (this.virtual) { this.virtual = false; this.canvas.style.cursor = ''; return; }   // free-cursor steering upgraded to a real lock
        if (G.onPointerLock) G.onPointerLock(); return;
      }
      if (this.virtual) return;
      this.locked = false; this.buttons = [false, false, false]; if (G.onPointerUnlock) G.onPointerUnlock();
    });
    document.addEventListener('pointerlockerror', () => this.fallback(true));
  },
  lock() {
    if (this.locked && !this.virtual) return;
    if (this.noLock) { this.setVirtual(true); return; }
    // browsers only grant pointer lock right after a click or key press; the opening scene starts on its own,
    // so steer with the free cursor until the player clicks into the game
    const ua = navigator.userActivation;
    if (ua && !ua.isActive) { this.setVirtual(true); return; }
    this.requestReal();
  },
  requestReal() {
    if (document.pointerLockElement === this.canvas) return;
    this.lockPending = true;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => this.fallback(true)); } catch (e) { this.fallback(true); }
  },
  // refused (no gesture, Esc pressed a moment ago, or a frame that forbids it): keep playing with the free cursor and try
  // again on the next click; only a frame that keeps refusing clicks is given up on
  fallback(counts) {
    if (!this.lockPending && counts) return;          // the promise and the error event report the same failure
    this.lockPending = false;
    if (document.pointerLockElement === this.canvas) return;
    if (counts && ++this.lockFails >= 3) this.noLock = true;
    if (this.wantLock) this.setVirtual(true);
  },
  setVirtual(on) {
    if (this.virtual === on) return;
    this.virtual = on; this.locked = on; this.canvas.style.cursor = on && !this.touch ? 'none' : '';
    if (!on) { this.ax = this.ay = 0; for (const k in this.keys) this.keys[k] = false; }
    if (on) { if (G.onPointerLock) G.onPointerLock(); }
    else { this.buttons = [false, false, false]; if (G.onPointerUnlock) G.onPointerUnlock(); }
  },
  // drop the mouse but keep wanting it back on the next click
  release() { if (this.virtual) this.setVirtual(false); else if (document.pointerLockElement) document.exitPointerLock(); },
  unlock() { this.wantLock = false; this.release(); },
  endFrame() {
    this.pressed = {}; this.released = {}; this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.bPressed[0] = this.bPressed[1] = this.bPressed[2] = false; this.bReleased[0] = this.bReleased[1] = this.bReleased[2] = false;
  },
};
