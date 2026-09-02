#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-registry.qqlink.live}"
IMAGE="${IMAGE:-$REGISTRY/qqlink_fileview}"

# 仅当显式提供 REGISTRY_USER + REGISTRY_PASS 时才登录；匿名仓库（如 registry.qqlink.live）直接 push
if [[ -n "${REGISTRY_USER:-}" && -n "${REGISTRY_PASS:-}" ]]; then
  echo "==> Login ${REGISTRY}"
  echo "${REGISTRY_PASS}" | docker login "${REGISTRY}" -u "${REGISTRY_USER}" --password-stdin
fi

echo "==> Push ${IMAGE}:latest"
docker push "${IMAGE}:latest"

echo "==> Done: ${IMAGE}:latest"
