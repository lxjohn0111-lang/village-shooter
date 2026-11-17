// Emberhold matchmaking + relay server.
// Players queue for a mode; a match starts as soon as it is full, or 20 seconds after the first player queued
// (whoever is there plays, bots fill the rest). In a match the server only relays messages between the players;
// the lowest-numbered human is the "host" who runs the bots and decides the result.
import { WebSocketServer } from 'ws';
import http from 'node:http';

const PORT = +(process.env.PORT || 8787);
const WAIT_MS = +(process.env.WAIT_MS || 20000);
const MODES = { siege: { humans: 8, perTeam: 4 }, duel: { humans: 2, perTeam: 3 } };
const BOT_NAMES = ['Rook', 'Kestrel', 'Flint', 'Mortar', 'Juniper', 'Badger', 'Slate', 'Hex', 'Quill', 'Tinder', 'Cinder', 'Pike', 'Gravel', 'Marrow', 'Wolfe', 'Bishop'];

let nextId = 1, nextRoom = 1;
const queues = { siege: [], duel: [] }, deadline = { siege: 0, duel: 0 }, rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, queued: { siege: queues.siege.length, duel: queues.duel.length }, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const send = (c, m) => { if (c.readyState === 1) c.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const clean = (s) => String(s || '').replace(/[^\w \-.]/g, '').slice(0, 16) || 'Ranger';

function startMatch(mode) {
  const q = queues[mode], cfg = MODES[mode]; if (!q.length) return;
  const humans = q.splice(0, cfg.humans); deadline[mode] = q.length ? Date.now() + WAIT_MS : 0;
  const room = { id: nextRoom++, mode, members: new Set(humans), host: null, seed: (Math.random() * 1e9) | 0 };
  const players = humans.map((c, i) => ({ id: c.id, name: c.name, team: i % 2 }));
  const count = [0, 0]; for (const p of players) count[p.team]++;
  const bots = []; let b = 1;
  for (let t = 0; t < 2; t++) while (count[t] < cfg.perTeam) { bots.push({ id: 'b' + (b++), name: BOT_NAMES[(room.seed + b * 7) % BOT_NAMES.length], team: t, cmd: mode === 'duel' && count[t] === 0 }); count[t]++; }
  room.host = Math.min(...humans.map((c) => c.id));
  rooms.set(room.id, room);
  for (const c of humans) { c.room = room; c.queued = null; }
  const msg = JSON.stringify({ t: 'match', room: room.id, mode, seed: room.seed, players, bots, host: room.host });
  for (const c of humans) send(c, msg);
}

function leaveQueue(c) { if (!c.queued) return; const q = queues[c.queued]; const i = q.indexOf(c); if (i >= 0) q.splice(i, 1); if (!q.length) deadline[c.queued] = 0; c.queued = null; }
function leaveRoom(c) {
  const room = c.room; if (!room) return; room.members.delete(c); c.room = null;
  if (!room.members.size) { rooms.delete(room.id); return; }
  for (const m of room.members) send(m, { t: 'left', id: c.id });
  if (room.host === c.id) { room.host = Math.min(...[...room.members].map((m) => m.id)); for (const m of room.members) send(m, { t: 'host', id: room.host }); }
}

wss.on('connection', (c) => {
  c.id = nextId++; c.name = 'Ranger'; c.room = null; c.queued = null; c.alive = true;
  send(c, { t: 'welcome', id: c.id });
  c.on('pong', () => { c.alive = true; });
  c.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'queue') { if (c.room || !MODES[m.mode]) return; leaveQueue(c); c.name = clean(m.name); c.queued = m.mode; queues[m.mode].push(c); if (!deadline[m.mode]) deadline[m.mode] = Date.now() + WAIT_MS; if (queues[m.mode].length >= MODES[m.mode].humans) startMatch(m.mode); return; }
    if (m.t === 'cancel') { leaveQueue(c); return; }
    if (m.t === 'start-now') { if (c.queued) startMatch(c.queued); return; }
    if (m.t === 'leave') { leaveRoom(c); return; }
    // anything else is relayed to the rest of the room (or to one member with "to")
    if (!c.room) return;
    m.from = c.id; const out = JSON.stringify(m);
    for (const o of c.room.members) if (o !== c && (m.to === undefined || m.to === o.id)) send(o, out);
  });
  c.on('close', () => { leaveQueue(c); leaveRoom(c); });
});

// queue countdowns and keep-alives
setInterval(() => {
  const now = Date.now();
  for (const mode in queues) {
    const q = queues[mode]; if (!q.length) continue;
    if (now >= deadline[mode]) { startMatch(mode); continue; }
    const st = JSON.stringify({ t: 'queue', mode, n: q.length, need: MODES[mode].humans, left: Math.ceil((deadline[mode] - now) / 1000) });
    for (const c of q) send(c, st);
  }
}, 500);
setInterval(() => { for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; c.ping(); } }, 15000);

server.listen(PORT, () => console.log('Emberhold server on :' + PORT));
