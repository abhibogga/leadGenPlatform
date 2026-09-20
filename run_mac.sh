#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/local-env.sh"

cd "$PROJECT_ROOT"
prepare_env
prepare_python "$PROJECT_ROOT/.venv" "$PROJECT_ROOT/requirements.txt"
# Explicit arguments override the Windows runner's default workbook selection.
if [[ $# -eq 0 ]]; then
  if [[ -f contacts_filled.xlsx ]]; then
    set -- --contacts contacts_filled.xlsx
  elif [[ -f contacts.xlsx ]]; then
    set -- --contacts contacts.xlsx
  fi
fi
exec .venv/bin/python reverse_boolean.py "$@"
