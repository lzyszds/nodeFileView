#!/usr/bin/env bash
# nodeFileView 一键启动（对齐 kkFileView 的 -e 注入方式）
# 用法：
#   chmod +x docker/run.sh
#   ./docker/run.sh
# 或先改下面变量再执行。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-nodefileview}"
NAME="${NAME:-nodefileview}"
HOST_PORT="${HOST_PORT:-8013}"

# —— 按需修改 ——
BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"
BASIC_AUTH_PASS="${BASIC_AUTH_PASS:-change-me-strong-password}"
BASE_URL="${BASE_URL:-https://preview.qqlink.info}"
TRUST_HOST="${TRUST_HOST:-*.my-imcloud.com,*.chat.qqlink.*}"
NOT_TRUST_HOST="${NOT_TRUST_HOST:-localhost,127.0.0.1,0.0.0.0,::1,169.254.*,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*}"

mkdir -p "$ROOT/data"

# 若镜像不存在则先构建
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image $IMAGE ..."
  docker build -t "$IMAGE" -f "$ROOT/docker/Dockerfile" "$ROOT"
fi

# 已有同名容器则先停删
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Removing existing container $NAME ..."
  docker rm -f "$NAME" >/dev/null
fi

docker run -d --name "$NAME" --restart=always \
  --platform linux/amd64 \
  -p "127.0.0.1:${HOST_PORT}:8013" \
  -v "$ROOT/data:/app/data" \
  -e BASIC_AUTH_ENABLED=true \
  -e BASIC_AUTH_USER="$BASIC_AUTH_USER" \
  -e BASIC_AUTH_PASS="$BASIC_AUTH_PASS" \
  -e BASE_URL="$BASE_URL" \
  -e "TRUST_HOST=$TRUST_HOST" \
  -e "NOT_TRUST_HOST=$NOT_TRUST_HOST" \
  -e BLOCK_PRIVATE_IP=true \
  "$IMAGE"

echo
echo "Started: http://127.0.0.1:${HOST_PORT}"
echo "Login:   $BASIC_AUTH_USER / (your BASIC_AUTH_PASS)"
echo "Logs:    docker logs -f $NAME"
