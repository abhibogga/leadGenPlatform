#!/usr/bin/env bash
# Shared by the macOS/Linux launchers. Source this file; do not run it directly.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

# Homebrew versioned formulae are not necessarily on a new Terminal's PATH.
for brew_root in /opt/homebrew /usr/local; do
  if ! command -v node >/dev/null 2>&1 && [[ -d "$brew_root/opt/node@24/bin" ]]; then
    export PATH="$brew_root/opt/node@24/bin:$PATH"
  fi
  if [[ -d "$brew_root/opt/python@3.12/bin" ]]; then
    export PATH="$PATH:$brew_root/opt/python@3.12/bin"
  fi
done

prepare_python() {
  local directory="$1"
  local requirements="$2"
  local candidate
  local python_command="${PYTHON:-}"
  if [[ -z "$python_command" ]]; then
    for candidate in python3.12 python3 python; do
      if command -v "$candidate" >/dev/null 2>&1 &&
        "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
        python_command="$candidate"
        break
      fi
    done
  fi
  [[ -n "$python_command" ]] || fail 'Python 3.11+ is required. On macOS: brew install python@3.12'
  "$python_command" -c 'import sys; sys.exit(sys.version_info < (3, 11))' ||
    fail 'PYTHON must point to a Python 3.11+ executable.'

  if [[ -e "$directory" && ! -x "$directory/bin/python" ]]; then
    fail "$directory is not a usable Mac/Linux virtual environment. Move it aside and rerun; Windows virtual environments cannot be reused."
  fi
  if [[ ! -d "$directory" ]]; then
    "$python_command" -m venv "$directory"
  fi
  "$directory/bin/python" -c 'import sys; sys.exit(sys.version_info < (3, 11))' ||
    fail "Move the outdated virtual environment $directory aside and rerun."
  "$directory/bin/python" -m pip install -r "$requirements"
}

prepare_env() {
  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    (umask 077; cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env")
    printf 'Created %s/.env. Add OPENAI_API_KEY there before running research.\n' "$PROJECT_ROOT"
  fi
}
