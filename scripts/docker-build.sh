#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY="${REGISTRY:-registry.qqlink.live}"
IMAGE="${IMAGE:-$REGISTRY/qqlink_fileview}"
PLATFORM="${PLATFORM:-linux/amd64}"
BUILDER="${BUILDER:-filePreview-builder}"

build_tags=(-t "${IMAGE}:latest")

host_prebuild() {
  echo "==> Pre-building web/server on host (native arch, avoids Vite OOM under qemu)..."
  (cd "${ROOT}" && pnpm install --frozen-lockfile && pnpm build)
}

build_runtime_image() {
  host_prebuild
  echo "==> Packaging runtime image (${PLATFORM})..."
  DOCKER_BUILDKIT=0 docker build --platform "${PLATFORM}" \
    -f "${ROOT}/docker/Dockerfile.runtime" \
    "${build_tags[@]}" \
    "${ROOT}"
}

try_buildx() {
  if ! docker buildx version >/dev/null 2>&1; then
    return 1
  fi
  if ! docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
    echo "==> Creating buildx builder: ${BUILDER}"
    docker buildx create --name "${BUILDER}" --driver docker-container --use >/dev/null
  else
    docker buildx use "${BUILDER}" >/dev/null
  fi
  export DOCKER_BUILDKIT=1
  docker buildx build --platform "${PLATFORM}" \
    -f "${ROOT}/docker/Dockerfile" \
    "${build_tags[@]}" \
    --load \
    "${ROOT}"
}

echo "==> Building ${PLATFORM} -> ${IMAGE}:latest"

if try_buildx 2>/dev/null; then
  :
else
  echo "==> buildx unavailable or failed; using host prebuild + Dockerfile.runtime" >&2
  build_runtime_image
fi

echo "==> Done: ${IMAGE}:latest"
