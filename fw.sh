#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-help}"
TARGET="${2:-all}"

usage() {
  cat <<'EOF'
Usage:
  bash fw.sh up              # start all
  bash fw.sh f               # start frontend
  bash fw.sh down            # stop all
  bash fw.sh up f            # start frontend
  bash fw.sh down a          # stop API
  bash fw.sh up i            # start infra
  bash fw.sh up w            # start worker
  bash fw.sh p               # prisma generate + migrate + seed
  bash fw.sh ui              # open keyboard menu

Short targets:
  all, a/api/back/backend, f/front/frontend, w/worker, i/infra/docker, p/prisma
EOF
}

normalize_target() {
  case "${1,,}" in
    all|"") echo "All" ;;
    i|infra|docker|db) echo "Infra" ;;
    a|api|back|backend|be) echo "Api" ;;
    f|front|frontend|fe|web) echo "Frontend" ;;
    w|worker|ai) echo "Worker" ;;
    p|prisma) echo "Prisma" ;;
    *) echo "Unknown target: $1" >&2; exit 1 ;;
  esac
}

prisma_init() {
  (cd "$ROOT/backend/api" && npm run prisma:generate && npm run db:migrate && npm run db:seed)
}

case "${ACTION,,}" in
  help|h|-h|--help)
    usage
    ;;
  ui|menu|tui)
    node "$ROOT/scripts/local-dev-menu.mjs"
    ;;
  p|prisma)
    prisma_init
    ;;
  up|start|on|s)
    target="$(normalize_target "$TARGET")"
    if [[ "$target" == "Prisma" ]]; then
      prisma_init
    else
      bash "$ROOT/start-local.sh" "$target"
    fi
    ;;
  down|stop|off|x)
    target="$(normalize_target "$TARGET")"
    if [[ "$target" == "Prisma" ]]; then
      echo "[local] Prisma is a one-shot command and has no process to stop."
    else
      bash "$ROOT/stop-local.sh" "$target"
    fi
    ;;
  *)
    target="$(normalize_target "$ACTION")"
    if [[ "$target" == "Prisma" ]]; then
      prisma_init
    else
      bash "$ROOT/start-local.sh" "$target"
    fi
    ;;
esac
