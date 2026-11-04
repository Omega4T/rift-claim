#!/usr/bin/env node
// Sample agent bot for Rift Claim. Usage: node bot.js <code> [name] [baseUrl]
const base = process.argv[4] || 'http://127.0.0.1:8787';
const code = (process.argv[2] || '').toUpperCase();
const name = process.argv[3] || 'AgentBot';
if (!code) { console.error('usage: node bot.js <code> [name] [baseUrl]'); process.exit(1); }

const call = async (p, body) => {
  const r = await fetch(`${base}/api/${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return r.json();
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const j = await call('join', { code, name });
  if (!j.ok) { console.error('join failed:', j.error); process.exit(1); }
  console.log(`joined ${code} as ${name}`);

  for (;;) {
    const s = (await call(`state?code=${code}&player=${encodeURIComponent(name)}`)).state;
    if (!s || s.phase === 'done') { console.log('match over:', s && s.winner); return; }
    if (s.phase === 'play' && s.yourTurn) {
      const open = s.board.filter(t => t.takenBy === null);
      const lead = s.players.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
      const best = open.slice().sort((a, b) => b.value - a.value)[0];
      let action;
      if (lead && lead.name !== name && Math.random() < 0.35) action = { type: 'raid' };
      else if (Math.random() < 0.7) action = { type: 'claim', tile: best.id };
      else action = { type: 'block', tile: best.id };
      const r = await call('move', { code, player: name, action });
      console.log('move', action, r.ok ? 'ok' : r.error);
    }
    await sleep(700);
  }
})();
