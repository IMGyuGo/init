#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-${GITHUB_BASE_REF:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

changed_files() {
  cd "$ROOT"
  if [[ -n "$BASE_REF" ]]; then
    local remote_base="origin/$BASE_REF"
    if ! git rev-parse --verify "$remote_base" >/dev/null 2>&1; then
      git fetch origin "$BASE_REF" --depth=1 >/dev/null
    fi
    git diff --name-only "$remote_base...HEAD"
    return
  fi

  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  }
}

changed_files | node "$SCRIPT_DIR/ownership-map-check.js" --mode auto
