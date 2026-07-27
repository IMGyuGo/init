#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONLY="${1:-All}"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT/.env.example"

usage() {
  cat <<'EOF'
Usage:
  bash start-local.sh [All|Infra|Api|Frontend|Worker]

Examples:
  bash start-local.sh
  bash start-local.sh Frontend
  bash start-local.sh Api
EOF
}

normalize_target() {
  case "${1,,}" in
    all|"") echo "All" ;;
    i|infra|docker|db) echo "Infra" ;;
    a|api|back|backend|be) echo "Api" ;;
    f|front|frontend|fe|web) echo "Frontend" ;;
    w|worker|ai) echo "Worker" ;;
    h|help|-h|--help) usage; exit 0 ;;
    *) echo "Unknown target: $1" >&2; exit 1 ;;
  esac
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_port() {
  local port="$1"
  local name="$2"
  local timeout="${3:-60}"
  for _ in $(seq 1 "$timeout"); do
    if port_in_use "$port"; then
      echo "[local] $name is ready on port $port."
      return 0
    fi
    sleep 1
  done
  echo "[local] $name did not become ready on port $port within ${timeout}s. Continuing."
}

start_bg() {
  local name="$1"
  local dir="$2"
  shift 2
  mkdir -p "$ROOT/.local/logs" "$ROOT/.local/pids"
  (
    cd "$dir"
    "$@"
  ) >"$ROOT/.local/logs/${name}.log" 2>&1 &
  echo "$!" >"$ROOT/.local/pids/${name}.pid"
  echo "[local] Started $name pid $(cat "$ROOT/.local/pids/${name}.pid")"
}

ensure_localstack_resources() {
  local queue_url="${AI_SQS_QUEUE_URL:-${SQS_QUEUE_URL:-}}"
  local queue_name="${queue_url##*/}"
  [[ -n "$queue_name" && "$queue_name" != "$queue_url" ]] || queue_name="init-ai-jobs"
  local bucket_name="${S3_BUCKET_NAME:-${S3_BUCKET:-init-local-assets}}"

  for _ in $(seq 1 30); do
    if docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/docker-compose.yml" exec -T localstack awslocal --endpoint-url=http://localhost:4566 sqs list-queues >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/docker-compose.yml" exec -T localstack awslocal --endpoint-url=http://localhost:4566 sqs create-queue --queue-name "$queue_name" >/dev/null
  docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/docker-compose.yml" exec -T localstack awslocal --endpoint-url=http://localhost:4566 s3 mb "s3://$bucket_name" >/dev/null 2>&1 || true
}

start_infra() {
  echo "[local] Starting Docker infra: PostgreSQL, Redis, Mailpit, LocalStack"
  docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/docker-compose.yml" up -d
  wait_port 5432 PostgreSQL 60
  ensure_localstack_resources
}

ONLY="$(normalize_target "$ONLY")"
load_env

if [[ "$ONLY" == "All" || "$ONLY" == "Infra" ]]; then
  start_infra
  [[ "$ONLY" == "Infra" ]] && exit 0
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Api" ]]; then
  if port_in_use 3001; then
    echo "[local] API already appears to be running on port 3001. Skipping."
  else
    start_bg api "$ROOT/backend/api" npm run dev
  fi
  [[ "$ONLY" == "All" ]] && wait_port 3001 API 90
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Frontend" ]]; then
  if port_in_use 3000; then
    echo "[local] Frontend already appears to be running on port 3000. Skipping."
  else
    start_bg frontend "$ROOT/frontend" env PORT=3000 NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:3001}" npm run dev -- -p 3000
  fi
fi

if [[ "$ONLY" == "All" || "$ONLY" == "Worker" ]]; then
  export AI_SQS_QUEUE_URL="${AI_SQS_QUEUE_URL:-${SQS_QUEUE_URL:-}}"
  export AI_PROVIDER_API_KEY="${AI_PROVIDER_API_KEY:-${OPENAI_API_KEY:-local-dev-placeholder}}"
  export S3_BUCKET_NAME="${S3_BUCKET_NAME:-${S3_BUCKET:-init-local-assets}}"
  export WORKER_REPOSITORY_MODE="${WORKER_REPOSITORY_MODE:-prisma}"
  start_bg worker "$ROOT/backend/worker" npm run start:dev
fi

echo "[local] Requested services have been started."
echo "[local] Logs: $ROOT/.local/logs"
