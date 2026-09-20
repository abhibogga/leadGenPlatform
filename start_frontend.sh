#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/local-env.sh"

command -v node >/dev/null 2>&1 || fail 'Node.js is required. On macOS: brew install node@24'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)' ||
  fail 'Node.js 22+ is required by the pinned pnpm version. On macOS: brew install node@24'
command -v npx >/dev/null 2>&1 || fail 'npx is missing. Reinstall Node.js with npm included.'
cd "$PROJECT_ROOT/platform/frontend"
package_manager="$(node -p 'require("./package.json").packageManager')"
# Use the repository's exact pnpm version without requiring a global install.
npx --yes "$package_manager" install --frozen-lockfile
printf '\nStarting frontend: http://localhost:3000. Press Ctrl+C to stop.\n'
exec npx --yes "$package_manager" dev --port 3000 "$@"
