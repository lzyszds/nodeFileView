#!/usr/bin/env bash
# filePreview 一键启动（对齐 kkFileView 的 -e 注入方式）
#
# 用法：
#   chmod +x docker/run.sh
#   BASIC_AUTH_PASS='强密码' ./docker/run.sh
#   HOST_PORT=6002 BASIC_AUTH_PASS='强密码' ./docker/run.sh   # 宿主机改端口（容器内仍 6001）
#
# Apple Silicon 建议直接拉 GitHub Actions 打好的 amd64 镜像：
#   IMAGE=ghcr.io/<owner>/filePreview:1.0.0 ./docker/run.sh
#
# 本地没有镜像时：若 IMAGE 是 ghcr.io/... 则 docker pull --platform linux/amd64；
# 否则在本机 docker build（arm64 机上构建 amd64 很慢，不推荐）。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-registry.qqlink.live/qqlink_fileview:latest}"
NAME="${NAME:-filePreview}"
CONTAINER_PORT="${CONTAINER_PORT:-6001}"
HOST_PORT="${HOST_PORT:-6001}"

# —— 按需修改 ——
BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"
BASIC_AUTH_PASS="${BASIC_AUTH_PASS:-A6T+%iOG_n{y*RXo}"
BASE_URL="${BASE_URL:-https://preview.qqlink.info}"
TRUST_HOST="${TRUST_HOST:-*.my-imcloud.com,*qqlink.*}"
NOT_TRUST_HOST="${NOT_TRUST_HOST:-localhost,127.0.0.1,0.0.0.0,169.254.*,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*}"

mkdir -p "$ROOT/data"

ensure_image() {
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    return 0
  fi
  if [[ "$IMAGE" == ghcr.io/* ]]; then
    echo "Pulling $IMAGE (linux/amd64) ..."
    docker pull --platform linux/amd64 "$IMAGE"
    return 0
  fi
  echo "Building image $IMAGE locally (prefer CI amd64 image on Apple Silicon) ..."
  docker build --platform linux/amd64 -t "$IMAGE" -f "$ROOT/docker/Dockerfile" "$ROOT"
}

ensure_image

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Removing existing container $NAME ..."
  docker rm -f "$NAME" >/dev/null
fi

docker run -d --name "$NAME" --restart=always \
  --platform linux/amd64 \
  -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
  -e "PORT=${CONTAINER_PORT}" \
  -v "$ROOT/data:/app/data" \
  -e BASIC_AUTH_ENABLED=true \
  -e BASIC_AUTH_USER="$BASIC_AUTH_USER" \
  -e BASIC_AUTH_PASS="$BASIC_AUTH_PASS" \
  -e BASE_URL="$BASE_URL" \
  -e "TRUST_HOST=$TRUST_HOST" \
  -e "NOT_TRUST_HOST=$NOT_TRUST_HOST" \
  -e BLOCK_PRIVATE_IP=true \
  -e TRUST_PROXY=true \
  -e RATE_LIMIT_MAX="${RATE_LIMIT_MAX:-300}" \
  -e RATE_LIMIT_UPLOAD_MAX="${RATE_LIMIT_UPLOAD_MAX:-30}" \
  -e RATE_LIMIT_PREVIEW_EXEMPT="${RATE_LIMIT_PREVIEW_EXEMPT:-true}" \
  -e RATE_LIMIT_REMOTE_MAX="${RATE_LIMIT_REMOTE_MAX:-120}" \
  -e RATE_LIMIT_LOGIN_MAX="${RATE_LIMIT_LOGIN_MAX:-10}" \
  -e CONVERT_MAX_CONCURRENT="${CONVERT_MAX_CONCURRENT:-2}" \
  -e REMOTE_DOWNLOAD_TIMEOUT_MS="${REMOTE_DOWNLOAD_TIMEOUT_MS:-120000}" \
  -e HOT_REMOTE_CACHE_MS="${HOT_REMOTE_CACHE_MS:-60000}" \
  -e CLUSTER_WORKERS="${CLUSTER_WORKERS:-2}" \
  -e COMPRESS_ENABLED="${COMPRESS_ENABLED:-true}" \
  -e LOG_REQUESTS="${LOG_REQUESTS:-false}" \
  -e CACHE_TTL_DAYS="${CACHE_TTL_DAYS:-7}" \
  -e REMOTE_CACHE_TTL_DAYS="${REMOTE_CACHE_TTL_DAYS:-7}" \
  -e TEMP_TTL_HOURS="${TEMP_TTL_HOURS:-24}" \
  -e CACHE_CLEANUP_INTERVAL_MS="${CACHE_CLEANUP_INTERVAL_MS:-3600000}" \
  -e CACHE_MAX_MB="${CACHE_MAX_MB:-0}" \
  "$IMAGE"

echo
echo "Started: http://127.0.0.1:${HOST_PORT}"
echo "Login:   $BASIC_AUTH_USER / (your BASIC_AUTH_PASS)"
echo "Image:   $IMAGE (platform linux/amd64)"
echo "Logs:    docker logs -f $NAME"
