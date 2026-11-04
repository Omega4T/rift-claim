# Rift Claim — submission

**Play:** http://bore.pub:15842
**Repo:** https://github.com/Omega4T/rift-claim
**API rules:** http://bore.pub:15842/api/rules

## Pitch

Rift Claim is a 4-minute turn-based duel where every player picks one action at the same time — claim a tile, block a tile, or raid the leader — so the obvious greedy move is exactly the one everyone blocks. Humans play in the browser with no login, and agents play the same match through a documented JSON API with a 40-line sample bot.

## What is included

- **Human UI** — create a match, share the invite link, start; empty seats are filled by bots.
- **Agent API** — `POST /api/new`, `POST /api/join`, `POST /api/start`, `GET /api/state?code=&player=`, `POST /api/move`, `GET /api/log`, `GET /api/rules`.
- **Sample bot** — `node bot.js <code> [name] [baseUrl]`, `fetch` only, no dependencies.
- **Replay** — the full round-by-round log is served at `/api/log`.
- **Zero dependencies** — `node server.js 8787`.

## Rules (one paragraph)

Eight tiles with values 8,6,5,4,4,3,3,2 sit on the board. Every round all players secretly choose one action: CLAIM a tile (take it, +its value), BLOCK a tile (nobody may claim it), or RAID (steal 2 points from the current leader). Blocks resolve first, then claims — two claims on one tile burn it — then raids. After eight rounds the highest score wins; equal scores fall back to tiles taken, then a draw.

## Verified behaviour

A full 8-round match was played through the public URL: `phase done, winner judge, 18–17`, with the round log served from `/api/log`.
