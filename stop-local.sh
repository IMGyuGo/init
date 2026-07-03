#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONLY="${1:-All}"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT/.env.example"

normalize_target() {
  case "${1,,}" in
    all|"") echo "All" ;;
    i|infra|docker|db) echo "Infra" ;;
    a|api|back|backend|be) echo "Api" ;;
    f|front|frontend|fe|web) echo "Frontend" ;;
    w|worker|ai) echo "Worker" ;;
    h|help|-h|--help) echo "Usage: bash stop-local.sh [All|Infra|Api|Frontend|Worker]"; exit 0 ;;
    *) echo "Unknown target: $1" >&2; exit 1 ;;
  esac
}

stop_pid_file() {
  local name="$1"
  local pid_file="$ROOT/.local/pids/${name}.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "[local] Stopping $name pid $pid."
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

stop_port() {
  local port="$1"
  local name="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "[local] $name is not listening on port $port."
    return
  fi
  echo "$pids" | xargs kill >/dev/null 2>&1 || true
  echo "[local] Stopped $name on port $port."
}

ONLY="$(normalize_target "$ONLY")"

if [[ "$ONLY" == "All" || "$ONLY" == "Frontend" ]]; then
  stop_pid_file frontend
  stop_port 3000 Frontend
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Api" ]]; then
  stop_pid_file api
  stop_port 3001 API
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Worker" ]]; then
  stop_pid_file worker
  pkill -f "backend/worker.*(npm|tsx|node)" >/dev/null 2>&1 || true
  echo "[local] Worker stop requested."
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Infra" ]]; then
  echo "[local] Stopping Docker infra: PostgreSQL, Redis, Mailpit, LocalStack"
  docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/docker-compose.yml" down
fi

echo "[local] Requested services have been stopped."
