#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "${ROOT}/scripts/docker-build.sh"
bash "${ROOT}/scripts/docker-push.sh"
