# Aruna Talent Streaming

Scalable live streaming platform with Docker — RTMP ingest, HLS playback, horizontally scalable control plane.

## Architecture

```
OBS ──RTMP──▶ [ingest-1 | ingest-2] ──HLS──▶ nginx (edge cache) ──▶ viewers (hls.js)
                    │                              ▲
                    └── webhooks ──▶ [api × N] ◀────┘ Next.js BFF
                                         │
                                    [realtime × N] ◀── WebSocket heartbeats
                                         │
                                    Redis + PostgreSQL
```

| Service | Role | Scales on |
|---------|------|-----------|
| **api** | Stream CRUD, ingest assignment, lifecycle | RPS / CPU |
| **realtime** | Viewer counts via WebSocket | Connections |
| **ingest-1/2** | MediaMTX RTMP → HLS | Active streams |
| **nginx** | API LB, HLS CDN simulation | Edge cache |
| **web** | Next.js + Clerk auth | Static/SSR |
| **redis** | Viewer counts, ingest load, pub/sub | — |
| **postgres** | Stream metadata | — |

## Quick start

### 1. Configure Clerk

Copy env files and add your [Clerk](https://clerk.com) keys:

```bash
cp .env.example .env
cp web/.env.example web/.env
# Edit both with CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

### 2. Start the stack

```bash
docker compose up --build -d
```

Open **http://localhost:8080**

### 3. Go live

1. Sign in (Clerk — username shown in header)
2. **Go Live** → create a stream
3. In OBS: Custom service → paste RTMP URL + stream key
4. Start streaming → open the watch link

RTMP ports: `19351` (ingest-1), `19352` (ingest-2)

## Scale locally

Demonstrate horizontal scaling by adding stateless replicas:

```bash
# Scale API + realtime
./scripts/scale.sh api=3 realtime=2

# Or directly
docker compose up -d --scale api=3 --scale realtime=2
```

View the **Scale** dashboard at http://localhost:8080/ops for live metrics, ingest load distribution, and scaling instructions.

### What scales

- **More concurrent streams** → add ingest nodes (edit `INGEST_NODES`, nginx upstreams, compose services)
- **More API traffic** → `--scale api=N` (nginx least_conn)
- **More WebSocket viewers** → `--scale realtime=N` (Redis pub/sub syncs counts)
- **More playback viewers** → nginx HLS cache simulates CDN (95%+ offload in production)

## Local development (without Docker)

Terminal 1 — infrastructure:

```bash
docker compose up postgres redis ingest-1 -d
```

Terminal 2 — API:

```bash
cd api && npm install && npm run dev
```

Terminal 3 — Realtime:

```bash
cd realtime && npm install && npm run dev
```

Terminal 4 — Web:

```bash
cd web && npm install && npm run dev
```

Set `web/.env` with Clerk keys and `API_INTERNAL_URL=http://localhost:3001`.

## API

| Endpoint | Description |
|----------|-------------|
| `POST /v1/streams` | Create stream `{ username, title }` |
| `GET /v1/streams?live=true` | List live streams |
| `GET /v1/streams/:id` | Stream details + playback URL |
| `GET /v1/platform/metrics` | Platform metrics for ops UI |
| `GET /health/ready` | Health check |

## Project layout

```
api/           Control plane (Fastify + Postgres + Redis)
realtime/      WebSocket gateway for viewer counts
web/           Next.js frontend (Clerk auth, HLS player)
infra/         nginx, MediaMTX, postgres configs
scripts/       scale.sh helper
docker-compose.yml
```

## Auth

Clerk handles sign-in. The username (Clerk username, first name, or email prefix) is passed to the API when creating streams — no passwords stored in our backend.
