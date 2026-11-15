// Keyboard / mouse state with per-frame edge detection and pointer-lock handling.
import { G } from './util.js';

export const Input = {
  keys: {}, pressed: {}, released: {}, mdx: 0, mdy: 0, wheel: 0, buttons: [false, false, false], bPressed: [false, false, false], bReleased: [false, false, false],
  locked: false, wantLock: false,
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'F1', 'F3'].includes(e.code) || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyW', 'KeyZ'].includes(e.code))) e.preventDefault();
      if (G.onKey) G.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; this.released[e.code] = true; });
    window.addEventListener('blur', () => { this.keys = {}; this.buttons = [false, false, false]; });
    canvas.addEventListener('mousedown', (e) => {
      if (G.audio) G.audio.resume();
      if (this.wantLock && !this.locked) { this.lock(); return; }
      if (e.button < 3) { this.buttons[e.button] = true; this.bPressed[e.button] = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button < 3) { this.buttons[e.button] = false; this.bReleased[e.button] = true; } });
    window.addEventListener('mousemove', (e) => { if (this.locked) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.buttons = [false, false, false]; if (G.onPointerUnlock) G.onPointerUnlock(); }
      else if (G.onPointerLock) G.onPointerLock();
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  },
  lock() {
    if (this.locked) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  },
  unlock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); },
  endFrame() {
    this.pressed = {}; this.released = {}; this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.bPressed[0] = this.bPressed[1] = this.bPressed[2] = false; this.bReleased[0] = this.bReleased[1] = this.bReleased[2] = false;
  },
};
