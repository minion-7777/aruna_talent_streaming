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

RTMP ports: `19351` (ingest-1), `19352` (ingest-2) — see [Adding an ingest node](#adding-an-ingest-node) for more

## Scale locally

Demonstrate horizontal scaling by adding stateless replicas:

```bash
# Scale API + realtime (both counts required)
./scripts/scale.sh api=3 realtime=3

# Or directly
docker compose up -d --scale api=3 --scale realtime=3
```

View the **Scale** dashboard at http://localhost:8080/ops for live API/realtime replica counts, ingest load, and per-node health.

### What scales

- **More API traffic** → `--scale api=N` (nginx least_conn)
- **More WebSocket viewers** → `--scale realtime=N` (Redis pub/sub syncs counts)
- **More concurrent streams** → add ingest nodes (see below — not `docker compose scale`)
- **More playback viewers** → nginx HLS cache simulates CDN (95%+ offload in production)

### Adding an ingest node

Ingest nodes are **separate MediaMTX services** (`ingest-1`, `ingest-2`, …), not replicas of one service. To add `ingest-3`:

#### 1. Docker Compose — service + RTMP port

Add a service (copy `ingest-2`, change name, hostname, and host port):

```yaml
  ingest-3:
    build: ./infra/mediamtx
    image: aruna-mediamtx:1.11.3
    ports:
      - '19353:1935'    # OBS uses this when the stream is assigned to ingest-3
    volumes:
      - ./infra/mediamtx/mediamtx.yml:/mediamtx.yml:ro
    hostname: ingest-3
    depends_on:
      api:
        condition: service_healthy
```

`hostname` must match the node name used everywhere else (`ingest-3`).

#### 2. API environment — pool + RTMP ports

On the `api` service in `docker-compose.yml` (and `api/.env` for local dev):

```yaml
      INGEST_NODES: ingest-1,ingest-2,ingest-3
      PUBLIC_RTMP_PORTS: '19351,19352,19353'
```

Ports align by index: `19351` → `ingest-1`, `19352` → `ingest-2`, `19353` → `ingest-3`. New streams pick the least-loaded node from `INGEST_NODES`.

#### 3. Nginx — HLS upstream + locations

In `infra/nginx/nginx.conf`:

```nginx
    upstream hls_ingest_3 {
        server ingest-3:8888;
    }
```

Add two `location` blocks (mirror the `ingest-2` pair, replace `ingest-2` / `hls_ingest_2` with `ingest-3` / `hls_ingest_3`):

- `^/hls/ingest-3/live/([^/]+)/index\.m3u8$` — include `mirror /_hls_viewer` for viewer counts
- `^/hls/ingest-3/(.*)$` — segments and other HLS paths

Playback URL pattern: `http://localhost:8080/hls/ingest-3/live/{streamKey}/index.m3u8`

#### 4. Apply

```bash
docker compose up -d --build ingest-3 api nginx
```

Recreate **api** so it loads the new `INGEST_NODES` env.

#### Verify

| Check | Expected |
|-------|----------|
| http://localhost:8080/ops | **Ingest reachable** shows `3 / 3`; `ingest-3` in load + health |
| Studio (new stream) | May show `ingest-3` when it has the lowest load |
| OBS | RTMP URL port **19353** when assigned to `ingest-3` |

**Notes**

- Existing streams keep their original `ingest_node`; only new streams use the expanded pool.
- `docker compose scale ingest-1=2` does **not** add nodes — use named services instead.
- For more nodes, repeat with `ingest-4`, port `19354`, nginx blocks, and extend the env lists.

## Local development (without Docker)

Start infrastructure (Postgres + Redis exposed on localhost):

```bash
docker compose up postgres redis ingest-1 ingest-2 -d
```

Copy env files for host-side services:

```bash
cp api/.env.example api/.env
cp realtime/.env.example realtime/.env
```

Use **`localhost`** in `api/.env` and `realtime/.env` — the hostname `postgres` only resolves inside Docker.

Terminal 2 — API:

```bash
cd api && npm install && npm run dev
```

Terminal 3 — Realtime:

```bash
cd realtime && npm install && npm run dev
```

Ensure Redis is running first: `docker compose up redis -d` (listens on `localhost:6379`).

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
