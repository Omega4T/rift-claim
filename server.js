// Rift Claim — turn-based multiplayer strategy for humans (browser) and agents (HTTP/JSON).
// Zero dependencies: node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TILES = [8, 6, 5, 4, 4, 3, 3, 2];           // 8 tiles, descending value
const ROUNDS = TILES.length;
const MAX_PLAYERS = 4;
const RAID_STEAL = 2;

const rooms = new Map();                            // code -> room

const newCode = () => {
  let c;
  do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c));
  return c;
};

function createRoom(hostName) {
  const room = {
    code: newCode(),
    players: [],
    round: 0,
    board: TILES.map((v, i) => ({ id: i, value: v, takenBy: null })),
    log: [],
    phase: 'lobby',
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  addPlayer(room, hostName, false);
  return room;
}

function addPlayer(room, name, isBot) {
  if (room.phase !== 'lobby') throw new Error('match already started');
  if (room.players.length >= MAX_PLAYERS) throw new Error('match is full');
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) throw new Error('name required');
  if (room.players.some(p => p.name.toLowerCase() === clean.toLowerCase())) throw new Error('name taken');
  const p = { name: clean, isBot: !!isBot, score: 0, stolen: 0, move: null, ready: false };
  room.players.push(p);
  return p;
}

function startRoom(room) {
  if (room.players.length < 2) throw new Error('need at least 2 players');
  while (room.players.length < 2) addPlayer(room, 'Bot-' + (room.players.length + 1), true);
  room.phase = 'play';
  room.round = 1;
  room.log.push({ t: 'start', round: 1, players: room.players.map(p => p.name) });
}

function openTiles(room) {
  return room.board.filter(t => t.takenBy === null).map(t => t.id);
}

function leader(room) {
  let best = null;
  for (const p of room.players) if (!best || p.score > best.score) best = p;
  return best;
}

function validateMove(room, p, action) {
  if (!action || typeof action !== 'object') throw new Error('action required');
  const type = String(action.type || '').toLowerCase();
  if (!['claim', 'block', 'raid'].includes(type)) throw new Error('type must be claim|block|raid');
  if (type === 'raid') return { type };
  const tile = Number(action.tile);
  if (!Number.isInteger(tile) || !openTiles(room).includes(tile)) throw new Error('tile must be an open tile id');
  return { type, tile };
}

function submitMove(room, name, action) {
  const p = room.players.find(x => x.name === name);
  if (!p) throw new Error('unknown player');
  if (room.phase !== 'play') throw new Error('match is not in play');
  if (p.move) throw new Error('move already submitted this round');
  p.move = validateMove(room, p, action);
  maybeResolve(room);
}

function botMove(room, p) {
  const open = openTiles(room);
  const lead = leader(room);
  const behind = p.score < lead.score;
  const r = Math.random();
  if (behind && r < 0.3) return { type: 'raid' };
  const bestTile = open.slice().sort((a, b) => room.board[b].value - room.board[a].value)[0];
  if (r < 0.62) return { type: 'claim', tile: bestTile };
  if (r < 0.85) return { type: 'block', tile: bestTile };
  return { type: 'claim', tile: open[Math.floor(Math.random() * open.length)] };
}

function maybeResolve(room) {
  room.players.forEach(p => { if (!p.move && p.isBot) p.move = botMove(room, p); });
  if (!room.players.every(p => p.move)) return;
  resolve(room);
}

function resolve(room) {
  const moves = room.players.map(p => ({ p, m: p.move }));
  const blocks = new Set(moves.filter(x => x.m.type === 'block').map(x => x.m.tile));
  const claims = new Map();
  for (const x of moves) if (x.m.type === 'claim') {
    claims.set(x.m.tile, (claims.get(x.m.tile) || []).concat(x.p));
  }

  const events = [];
  // 1. claims
  for (const [tile, claimants] of claims) {
    const t = room.board[tile];
    if (blocks.has(tile)) { events.push({ t: 'blocked', tile, by: moves.filter(x => x.m.type === 'block' && x.m.tile === tile).map(x => x.p.name), claimants: claimants.map(c => c.name) }); continue; }
    if (claimants.length > 1) { events.push({ t: 'contested', tile, players: claimants.map(c => c.name) }); continue; }
    t.takenBy = claimants[0].name;
    claimants[0].score += t.value;
    events.push({ t: 'claim', tile, value: t.value, by: claimants[0].name });
  }
  // 2. raids resolve after claims, against the current leader
  for (const x of moves) if (x.m.type === 'raid') {
    const lead = leader(room);
    if (lead && lead.name !== x.p.name) {
      const amount = Math.min(RAID_STEAL, lead.score);
      lead.score -= amount; x.p.score += amount; x.p.stolen += amount;
      events.push({ t: 'raid', by: x.p.name, target: lead.name, amount });
    } else events.push({ t: 'raid_miss', by: x.p.name });
  }

  room.log.push({ t: 'round', round: room.round, events, scores: room.players.map(p => ({ name: p.name, score: p.score })) });
  room.players.forEach(p => { p.move = null; });

  if (room.round >= ROUNDS || openTiles(room).length === 0) {
    room.phase = 'done';
    const best = room.players.slice().sort((a, b) => b.score - a.score);
    room.winner = best[0].score === best[1]?.score ? null : best[0].name;
    room.log.push({ t: 'end', winner: room.winner, scores: best.map(p => ({ name: p.name, score: p.score })) });
  } else {
    room.round += 1;
  }
}

const publicState = (room, name) => ({
  code: room.code,
  phase: room.phase,
  round: room.round,
  rounds: ROUNDS,
  board: room.board,
  players: room.players.map(p => ({ name: p.name, isBot: p.isBot, score: p.score, moved: !!p.move })),
  yourTurn: room.phase === 'play' && !!name && room.players.some(p => p.name === name && !p.move),
  winner: room.winner || null,
  rules: { tiles: TILES, raidSteal: RAID_STEAL, maxPlayers: MAX_PLAYERS },
});

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
  res.end(body);
};

function body(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e5) reject(new Error('payload too large')); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('invalid JSON')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (p === '/api/new' && req.method === 'POST') {
      const b = await body(req);
      const room = createRoom(b.name || 'host');
      return json(res, 200, { ok: true, code: room.code, state: publicState(room, room.players[0].name) });
    }
    if (p === '/api/join' && req.method === 'POST') {
      const b = await body(req);
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return json(res, 404, { ok: false, error: 'match not found' });
      const pl = addPlayer(room, b.name, false);
      return json(res, 200, { ok: true, code: room.code, state: publicState(room, pl.name) });
    }
    if (p === '/api/start' && req.method === 'POST') {
      const b = await body(req);
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return json(res, 404, { ok: false, error: 'match not found' });
      startRoom(room);
      maybeResolve(room);
      return json(res, 200, { ok: true, state: publicState(room, b.name) });
    }
    if (p === '/api/state') {
      const room = rooms.get(String(u.searchParams.get('code') || '').toUpperCase());
      if (!room) return json(res, 404, { ok: false, error: 'match not found' });
      return json(res, 200, { ok: true, state: publicState(room, u.searchParams.get('player')) });
    }
    if (p === '/api/move' && req.method === 'POST') {
      const b = await body(req);
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return json(res, 404, { ok: false, error: 'match not found' });
      submitMove(room, b.player, b.action);
      return json(res, 200, { ok: true, state: publicState(room, b.player) });
    }
    if (p === '/api/log') {
      const room = rooms.get(String(u.searchParams.get('code') || '').toUpperCase());
      if (!room) return json(res, 404, { ok: false, error: 'match not found' });
      return json(res, 200, { ok: true, log: room.log });
    }
    if (p === '/api/rules') return json(res, 200, {
      ok: true,
      name: 'Rift Claim',
      players: '2-4 (empty seats filled by bots)',
      tiles: TILES,
      rounds: ROUNDS,
      actions: {
        claim: { body: { type: 'claim', tile: 3 }, effect: 'take that open tile, +its value' },
        block: { body: { type: 'block', tile: 3 }, effect: 'no one can claim that tile this round' },
        raid: { body: { type: 'raid' }, effect: `steal ${RAID_STEAL} points from the current leader` },
      },
      resolution: 'blocks first, then claims (two claims on one tile cancel), then raids',
      endpoints: {
        'POST /api/new': { name: 'your name' },
        'POST /api/join': { code: 'ABC123', name: 'your name' },
        'POST /api/start': { code: 'ABC123' },
        'GET /api/state?code=ABC123&player=name': 'game state; yourTurn says if you must move',
        'POST /api/move': { code: 'ABC123', player: 'name', action: { type: 'claim', tile: 0 } },
        'GET /api/log?code=ABC123': 'full round-by-round log / replay',
      },
    });

    // static
    const file = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const full = path.join(__dirname, 'public', file);
    if (!full.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(full)) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(full);
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    json(res, 400, { ok: false, error: e.message });
  }
});

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
server.listen(PORT, () => console.log(`Rift Claim on :${PORT}`));
