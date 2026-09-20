#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/local-env.sh"

prepare_env
cd "$PROJECT_ROOT/platform/backend"
prepare_python "$PWD/.venv" "$PWD/requirements.txt"
printf '\nStarting backend: http://127.0.0.1:8000 (docs: /docs). Press Ctrl+C to stop.\n'
exec .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 "$@"
