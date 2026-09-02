#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/docker/.env}"
COMPOSE_FILE="${ROOT}/docker/docker-compose.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Run: cp docker/.env.example docker/.env"
  exit 1
fi

echo "==> Pull latest image and start (compose)"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d "$@"

echo "==> Running:"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
