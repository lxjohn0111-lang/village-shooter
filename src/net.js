// Multiplayer transport. Connects to the Emberhold matchmaking server over WebSocket when one is configured;
// with no server (or no connection) every match is played offline against bots.
// Server address, first match wins: ?server=wss://… in the page URL, localStorage "emberhold_server",
// window.EMBER_SERVER, or DEFAULT_SERVER below.
const DEFAULT_SERVER = '';
const WAIT = 20;                        // seconds before bots fill the empty slots

const BOT_NAMES = ['Rook', 'Kestrel', 'Flint', 'Mortar', 'Juniper', 'Badger', 'Slate', 'Hex', 'Quill', 'Tinder', 'Cinder', 'Pike', 'Gravel', 'Marrow', 'Wolfe', 'Bishop'];
export const MODES = {
  siege: { name: 'Town Siege', size: '4v4', humans: 8, perTeam: 4 },
  duel: { name: 'Build & Battle', size: '1v1', humans: 2, perTeam: 3 },
};

function serverUrl() {
  try { const q = new URLSearchParams(location.search).get('server'); if (q) return q; } catch (e) { /* ignore */ }
  try { const s = localStorage.getItem('emberhold_server'); if (s) return s; } catch (e) { /* ignore */ }
  return window.EMBER_SERVER || DEFAULT_SERVER;
}

export const Net = {
  ws: null, me: 'me', online: false, rx: {}, room: null, host: 'me', handlers: {}, offline: true,
  url: '',
  connect() {
    this.url = serverUrl();
    if (this.ws && this.ws.readyState === 1) return Promise.resolve(true);
    if (!this.url || typeof WebSocket === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false; const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
      let ws; try { ws = new WebSocket(this.url); } catch (e) { fin(false); return; }
      const to = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } fin(false); }, 3500);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') { this.ws = ws; this.me = m.id; this.online = true; clearTimeout(to); fin(true); return; }
        this.dispatch(m);
      };
      ws.onclose = () => { clearTimeout(to); if (this.ws === ws) { this.ws = null; this.online = false; if (this.room && this.handlers.disconnect) this.handlers.disconnect(); } fin(false); };
      ws.onerror = () => {};
    });
  },
  dispatch(m) {
    this.rx[m.t] = (this.rx[m.t] || 0) + 1;
    if (m.t === 'queue') { if (this.onQueue) this.onQueue(m); return; }
    if (m.t === 'match') { if (this.onMatch) this.onMatch(m); return; }
    if (m.t === 'host') this.host = m.id;
    const h = this.handlers[m.t]; if (h) h(m);
  },
  // find a match. onStatus({humans, need, left, online}) is called while waiting. Resolves with the match description.
  async find(mode, name, onStatus) {
    const cfg = MODES[mode];
    this.cancelled = false; this.pendingMode = mode; this.pendingName = name;
    const online = await this.connect();
    if (this.cancelled) return null;
    if (online) {
      return new Promise((resolve) => {
        this.resolveFind = resolve;
        this.onQueue = (m) => onStatus({ humans: m.n, need: m.need, left: m.left, online: true });
        this.onMatch = (m) => { this.onQueue = this.onMatch = null; this.resolveFind = null; this.room = m.room; this.host = m.host; this.offline = false; resolve(Object.assign(m, { me: this.me })); };
        onStatus({ humans: 1, need: cfg.humans, left: WAIT, online: true });
        this.ws.send(JSON.stringify({ t: 'queue', mode, name }));
      });
    }
    // no server: a short search, then bots
    return new Promise((resolve) => {
      let left = 3; onStatus({ humans: 1, need: cfg.humans, left, online: false });
      this.offTimer = setInterval(() => {
        left--; onStatus({ humans: 1, need: cfg.humans, left: Math.max(0, left), online: false });
        if (left <= 0) { clearInterval(this.offTimer); this.offTimer = null; resolve(this.offlineMatch(mode, name)); }
      }, 1000);
      this.resolveFind = resolve;
    });
  },
  offlineMatch(mode, name) {
    const cfg = MODES[mode], seed = (Math.random() * 1e9) | 0, bots = [], count = [1, 0]; let b = 1;
    for (let t = 0; t < 2; t++) while (count[t] < cfg.perTeam) { bots.push({ id: 'b' + b, name: BOT_NAMES[(seed + b * 7) % BOT_NAMES.length], team: t, cmd: mode === 'duel' && count[t] === 0 }); b++; count[t]++; }
    this.offline = true; this.room = null; this.me = 'me'; this.host = 'me';
    return { mode, seed, players: [{ id: 'me', name, team: 0 }], bots, host: 'me', me: 'me', offline: true };
  },
  startNow() { if (this.ws && this.online) this.ws.send(JSON.stringify({ t: 'start-now' })); else if (this.resolveFind && this.offTimer) { clearInterval(this.offTimer); this.offTimer = null; const r = this.resolveFind; this.resolveFind = null; r(this.offlineMatch(this.pendingMode, this.pendingName)); } },
  cancel() {
    this.cancelled = true; if (this.offTimer) { clearInterval(this.offTimer); this.offTimer = null; }
    if (this.ws && this.online) this.ws.send(JSON.stringify({ t: 'cancel' }));
    this.onQueue = this.onMatch = null; if (this.resolveFind) { const r = this.resolveFind; this.resolveFind = null; r(null); }
  },
  send(t, data, to) {
    if (this.offline || !this.ws || this.ws.readyState !== 1) return;
    const m = data ? Object.assign({}, data, { t }) : { t }; if (to !== undefined) m.to = to;      // the message type always wins over a payload field called t
    this.ws.send(JSON.stringify(m));
  },
  on(t, fn) { this.handlers[t] = fn; },
  leave() { if (!this.offline && this.ws && this.online) this.ws.send(JSON.stringify({ t: 'leave' })); this.room = null; this.handlers = {}; this.offline = true; },
  isHost() { return this.offline || this.host === this.me; },
};
