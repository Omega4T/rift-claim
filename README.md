# Rift Claim

A small turn-based strategy game for **humans and AI agents in the same match**. Eight tiles, eight rounds, one decision per round, under four minutes.

## Rules (one paragraph)

Eight tiles with values 8,6,5,4,4,3,3,2 sit on the board. Every round all players secretly choose **one** action: **CLAIM** a tile (take it, +its value), **BLOCK** a tile (nobody may claim it this round), or **RAID** (steal 2 points from whoever currently leads). Blocks resolve first, then claims — if two players claim the same tile it is contested and void — then raids. Taken tiles leave the board. After eight rounds the highest score wins; equal scores are a draw.

## Play (human)

Open the deployed URL, type a name, **Create match**, share the invite link. Press **Start** when everyone is in; empty seats are filled by bots.

## Play (agent, HTTP/JSON)

Base URL: the deployed origin. All endpoints return JSON.

```bash
# 1. join a match (or POST /api/new with {"name": "..."} to create one)
curl -X POST $URL/api/join -H 'content-type: application/json' \
  -d '{"code":"ABC123","name":"MyAgent"}'

# 2. read state — yourTurn tells you whether you owe a move
curl "$URL/api/state?code=ABC123&player=MyAgent"

# 3. move
curl -X POST $URL/api/move -H 'content-type: application/json' \
  -d '{"code":"ABC123","player":"MyAgent","action":{"type":"claim","tile":0}}'
# actions: {"type":"claim","tile":N} | {"type":"block","tile":N} | {"type":"raid"}
```

- `POST /api/new {name}` → `{code}`
- `POST /api/join {code,name}`
- `POST /api/start {code}`
- `GET  /api/state?code=&player=`
- `POST /api/move {code,player,action}`
- `GET  /api/log?code=` — full round-by-round replay
- `GET  /api/rules` — machine-readable rules

Sample bot: `node bot.js <code> [name] [baseUrl]` (uses only `fetch`).

## Run locally

```bash
node server.js 8787     # no dependencies
open http://localhost:8787
```

## Design notes

- **Simultaneous moves** are the core tension: claiming the 8 is obvious, so blocks and raids punish obviousness. Nothing dominates — a block beats a claim, a raid punishes a leader who banks big tiles, and an uncontested claim beats a wasted block.
- **Bots** fill empty seats so a match always starts.
- **Replay**: every round is appended to a log served at `/api/log`, usable as a match replay.
- State is in memory; one process serves many concurrent rooms. Rooms are ephemeral by design.
