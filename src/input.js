// Keyboard / mouse state with per-frame edge detection and pointer-lock handling.
import { G } from './util.js';

export const Input = {
  keys: {}, pressed: {}, released: {}, mdx: 0, mdy: 0, wheel: 0, buttons: [false, false, false], bPressed: [false, false, false], bReleased: [false, false, false],
  locked: false, wantLock: false, virtual: false, noLock: false, skipMove: 0,
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
    window.addEventListener('blur', () => { this.keys = {}; this.buttons = [false, false, false]; if (this.virtual) this.release(); });
    canvas.addEventListener('mousedown', (e) => {
      if (G.audio) G.audio.resume();
      if (this.wantLock && !this.locked) { this.lock(); return; }
      if (e.button < 3) { this.buttons[e.button] = true; this.bPressed[e.button] = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button < 3) { this.buttons[e.button] = false; this.bReleased[e.button] = true; } });
    // some browsers report one huge bogus delta right after the pointer is captured: drop the first move and any absurd jump
    window.addEventListener('mousemove', (e) => { if (!this.locked) return; if (this.skipMove > 0) { this.skipMove--; return; } const mx = e.movementX || 0, my = e.movementY || 0; if (Math.abs(mx) > 400 || Math.abs(my) > 400) return; this.mdx += mx; this.mdy += my; });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas; if (this.locked) this.skipMove = 1;
      if (!this.locked) { this.buttons = [false, false, false]; if (G.onPointerUnlock) G.onPointerUnlock(); }
      else if (G.onPointerLock) G.onPointerLock();
    });
    document.addEventListener('pointerlockerror', () => this.fallback());
  },
  lock() {
    if (this.locked) return;
    if (this.noLock) { this.setVirtual(true); return; }
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => this.fallback()); } catch (e) { this.fallback(); }
  },
  // when the page's frame refuses pointer lock, steer with plain mouse movement over the canvas instead
  fallback() { if (this.locked && !this.virtual) return; this.noLock = true; this.setVirtual(true); },
  setVirtual(on) {
    if (this.virtual === on) return;
    this.virtual = on; this.locked = on; this.canvas.style.cursor = on ? 'none' : '';
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
