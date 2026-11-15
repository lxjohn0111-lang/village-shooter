// CrazyGames SDK v3 wrapper. Every call is feature-detected so the game also runs standalone
// (local file server, other portals, ad-blockers) with localStorage saves and no ads.
import { G } from './util.js';

export const SDK = {
  sdk: null, ready: false, env: 'disabled', playing: false, loading: false, adOpen: false, user: null,

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

  getItem(k) { try { if (this.ready && this.sdk.data) return this.sdk.data.getItem(k); } catch (e) { /* fall through */ } try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem(k, v) { try { if (this.ready && this.sdk.data) { this.sdk.data.setItem(k, v); return; } } catch (e) { /* fall through */ } try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  username() { return this.user && this.user.username ? this.user.username : null; },
  inviteLink(params) { return this.call((s) => s.game.inviteLink(params)); },
  inviteParam(name) { const v = this.call((s) => s.game.getInviteParam(name)); if (v) return v; try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } },
  banner(id) { this.call((s) => s.banner.requestResponsiveBanner(id)); },
  clearBanners() { this.call((s) => s.banner.clearAllBanners()); },
};
