#!/usr/bin/env bash
# Scale Aruna API + realtime replicas (same as docker compose --scale).
# Usage: ./scripts/scale.sh api=N realtime=M
#
# Examples:
#   ./scripts/scale.sh api=3 realtime=3
#   ./scripts/scale.sh api=2 realtime=2
#
# Ingest: add ingest-3+ in compose, nginx, and INGEST_NODES (not --scale).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_REPLICAS=""
REALTIME_REPLICAS=""

usage() {
  cat <<'EOF'
Usage: ./scripts/scale.sh api=N realtime=M

  api=N       Number of API containers (required unless REALTIME only via env)
  realtime=M  Number of realtime containers

Examples:
  ./scripts/scale.sh api=3 realtime=3
  ./scripts/scale.sh api=2 realtime=2

Equivalent:
  docker compose up -d --scale api=3 --scale realtime=3

Ingest nodes are separate compose services (ingest-1, ingest-2, …), not --scale.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    api=*) API_REPLICAS="${arg#api=}" ;;
    realtime=*) REALTIME_REPLICAS="${arg#realtime=}" ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

API_REPLICAS="${API_REPLICAS:-${API_SCALE:-}}"
REALTIME_REPLICAS="${REALTIME_REPLICAS:-${REALTIME_SCALE:-}}"

if [[ -z "$API_REPLICAS" || -z "$REALTIME_REPLICAS" ]]; then
  echo "Error: both api=N and realtime=M are required." >&2
  echo "" >&2
  usage >&2
  echo "" >&2
  echo "Current containers:" >&2
  docker compose ps api realtime 2>/dev/null || true
  exit 1
fi

if ! [[ "$API_REPLICAS" =~ ^[0-9]+$ && "$REALTIME_REPLICAS" =~ ^[0-9]+$ ]]; then
  echo "Error: replica counts must be positive integers." >&2
  exit 1
fi

if [[ "$API_REPLICAS" -lt 1 || "$REALTIME_REPLICAS" -lt 1 ]]; then
  echo "Error: replica counts must be at least 1." >&2
  exit 1
fi

echo "Scaling from $(pwd): api=${API_REPLICAS}, realtime=${REALTIME_REPLICAS}"

docker compose up -d \
  --remove-orphans \
  --scale "api=${API_REPLICAS}" \
  --scale "realtime=${REALTIME_REPLICAS}"

echo ""
echo "Waiting for containers to reach running state…"
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  api_up=$(docker compose ps api --status running -q 2>/dev/null | wc -l | tr -d ' ')
  rt_up=$(docker compose ps realtime --status running -q 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$api_up" == "$API_REPLICAS" && "$rt_up" == "$REALTIME_REPLICAS" ]]; then
    break
  fi
  sleep 2
done

echo ""
docker compose ps api realtime

api_running=$(docker compose ps api --status running -q 2>/dev/null | wc -l | tr -d ' ')
rt_running=$(docker compose ps realtime --status running -q 2>/dev/null | wc -l | tr -d ' ')

if [[ "$api_running" != "$API_REPLICAS" || "$rt_running" != "$REALTIME_REPLICAS" ]]; then
  echo "" >&2
  echo "Warning: expected api=${API_REPLICAS} realtime=${REALTIME_REPLICAS}, got api=${api_running} realtime=${rt_running}" >&2
  exit 1
fi

echo ""
echo "Platform ready at http://localhost:8080"
echo "Ops dashboard: http://localhost:8080/ops"
