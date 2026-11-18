// CrazyGames SDK v3 wrapper. Every call is feature-detected so the game also runs standalone
// (other portals, ad-blockers, plain file servers) with localStorage saves and no ads.
// Progress: on CrazyGames (and on localhost, where the SDK runs in "local" mode) the save goes ONLY through the
// Data module — cloud-synced for logged-in players, kept by the SDK for guests and carried over when they log in.
import { G } from './util.js';

export const SDK = {
  sdk: null, ready: false, env: 'disabled', playing: false, loading: false, adOpen: false, user: null, dataOff: false, lastError: null,

  async init() {
    try {
      // the <script> tag in index.html loads the SDK; wait briefly for it
      for (let i = 0; i < 40 && !(window.CrazyGames && window.CrazyGames.SDK); i++) await new Promise((r) => setTimeout(r, 50));
      const s = window.CrazyGames && window.CrazyGames.SDK;
      if (!s) return false;
      await Promise.race([s.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 4000))]);
      this.sdk = s; this.env = s.environment || 'crazygames'; this.ready = this.env !== 'disabled';
      if (this.ready) {
        try { if (s.game.settings && s.game.settings.muteAudio && G.audio) G.audio.setMuted(true); } catch (e) { /* ignore */ }
        try { s.game.addSettingsChangeListener((st) => { if (G.audio) G.audio.setMuted(!!st.muteAudio); }); } catch (e) { /* ignore */ }
        try { this.user = await s.user.getUser(); } catch (e) { this.user = null; }
        try { s.user.addAuthListener((u) => { this.user = u; if (G.ui) G.ui.refreshTop(); }); } catch (e) { /* ignore */ }
      }
      return this.ready;
    } catch (e) { console.warn('[sdk] unavailable:', e && e.message); this.ready = false; return false; }
  },
  call(fn) { if (!this.ready) return undefined; try { return fn(this.sdk); } catch (e) { console.warn('[sdk]', e && e.message); return undefined; } },

  loadingStart() { if (!this.loading) { this.loading = true; this.call((s) => s.game.loadingStart()); } },
  loadingStop() { if (this.loading) { this.loading = false; this.call((s) => s.game.loadingStop()); } },
  gameplayStart() { if (!this.playing) { this.playing = true; this.call((s) => s.game.gameplayStart()); } },
  gameplayStop() { if (this.playing) { this.playing = false; this.call((s) => s.game.gameplayStop()); } },
  happytime() { this.call((s) => s.game.happytime()); },

  // returns a promise resolving true if the ad was shown to completion
  ad(type) {
    return new Promise((resolve) => {
      if (!this.ready || !this.sdk.ad) { resolve(type === 'rewarded' ? this.env === 'disabled' && !!G.devFreeRewards : false); return; }
      let done = false;
      const finish = (ok) => { if (done) return; done = true; this.adOpen = false; if (G.audio) G.audio.setAdMuted(false); if (G.onAdClosed) G.onAdClosed(); resolve(ok); };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { this.adOpen = true; if (G.audio) G.audio.setAdMuted(true); if (G.onAdOpened) G.onAdOpened(); },
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch (e) { finish(false); }
    });
  },
  midgame() { return this.ad('midgame'); },
  rewarded() { return this.ad('rewarded'); },
  // rewarded ads can only be offered when the SDK is live
  canReward() { return this.ready && !!this.sdk.ad; },

  // ---- progress storage
  storage() { return this.ready && this.sdk && this.sdk.data && !this.dataOff ? 'data' : 'local'; },
  getItem(k) {
    if (this.storage() === 'data') { try { return this.sdk.data.getItem(k); } catch (e) { if (!this.dataError(e)) return null; } }
    try { return localStorage.getItem(k); } catch (e) { return null; }
  },
  // returns true when the value was handed to storage
  setItem(k, v) {
    if (this.storage() === 'data') { try { this.sdk.data.setItem(k, v); return true; } catch (e) { if (!this.dataError(e)) return false; } }
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  },
  // true = fall back to localStorage. Only a switched-off Data module does that; a full save (1 MB limit) must not
  // silently go elsewhere, because on CrazyGames the Data module is the only place progress is read from.
  dataError(e) {
    const code = (e && (e.code || e.message)) || String(e); this.lastError = code;
    if (/dataModuleDisabled/i.test(code)) { this.dataOff = true; console.warn('[sdk] Data module is disabled for this game — enable "Progress Save: Data Module" in the submission. Using localStorage for now.'); return true; }
    console.error('[sdk] save failed:', code); return false;
  },
  // a save an older build left in this browser's localStorage (read once, to copy it into the Data module)
  legacyItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  dropLegacy(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  // CrazyGames' own device detection ("desktop" | "tablet" | "mobile"); null off-platform
  deviceType() { try { return this.ready ? this.sdk.user.systemInfo.device.type : null; } catch (e) { return null; } },
  username() { return this.user && this.user.username ? this.user.username : null; },
  inviteLink(params) { return this.call((s) => s.game.inviteLink(params)); },
  inviteParam(name) { const v = this.call((s) => s.game.getInviteParam(name)); if (v) return v; try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } },
  banner(id) { this.call((s) => s.banner.requestResponsiveBanner(id)); },
  clearBanners() { this.call((s) => s.banner.clearAllBanners()); },
};
