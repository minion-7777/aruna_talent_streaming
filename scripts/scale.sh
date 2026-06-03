#!/usr/bin/env bash
# Scale Aruna services locally to demonstrate horizontal scaling.
# Usage: ./scripts/scale.sh [api=N] [realtime=N] [ingest=N]
#
# Examples:
#   ./scripts/scale.sh api=3 realtime=2
#   ./scripts/scale.sh api=2 realtime=2 ingest=3

set -euo pipefail

API_REPLICAS=1
REALTIME_REPLICAS=1

for arg in "$@"; do
  case "$arg" in
    api=*) API_REPLICAS="${arg#api=}" ;;
    realtime=*) REALTIME_REPLICAS="${arg#realtime=}" ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo "Scaling: api=${API_REPLICAS}, realtime=${REALTIME_REPLICAS}"
echo "Ingest pool: ingest-1, ingest-2 (add ingest-3 in compose + nginx for more)"

docker compose up -d --scale "api=${API_REPLICAS}" --scale "realtime=${REALTIME_REPLICAS}"

echo ""
echo "Platform ready at http://localhost:8080"
echo "Ops dashboard: http://localhost:8080/ops"
echo ""
docker compose ps
