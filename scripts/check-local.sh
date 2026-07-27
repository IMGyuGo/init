#!/usr/bin/env bash
set -euo pipefail

ROLE="A"
SKIP_OWNERSHIP=0
BUILD_DOCKER=0
REQUIRE_ENV_VALUES=0
SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Role|--role)
      ROLE="${2:-}"
      shift 2
      ;;
    -SkipOwnership|--skip-ownership)
      SKIP_OWNERSHIP=1
      shift
      ;;
    -BuildDocker|--build-docker)
      BUILD_DOCKER=1
      shift
      ;;
    -RequireEnvValues|--require-env-values)
      REQUIRE_ENV_VALUES=1
      shift
      ;;
    -SmokeBaseUrl|--smoke-base-url)
      SMOKE_BASE_URL="${2:-}"
      shift 2
      ;;
    *)
      echo "[fail] unknown argument: $1"
      exit 1
      ;;
  esac
done

case "$ROLE" in
  A|B|C|D|E|PM) ;;
  *)
    echo "[fail] invalid role: $ROLE"
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

step() {
  echo ""
  echo "== $1 =="
}

require_path() {
  local relative="$1"
  if [[ -e "$ROOT/$relative" ]]; then
    echo "[ok] $relative"
  else
    echo "[fail] missing $relative"
    return 1
  fi
}

file_contains() {
  local relative="$1"
  shift
  local file="$ROOT/$relative"
  if [[ ! -f "$file" ]]; then
    echo "[fail] missing $relative"
    return 1
  fi

  local needle
  for needle in "$@"; do
    if ! grep -Fq "$needle" "$file"; then
      echo "[fail] $relative does not mention '$needle'"
      return 1
    fi
  done
}

verify_docs() {
  step "verify-docs"

  local required_paths=(
    "AGENTS.md"
    "docs/05_agents/AGENTS.md"
    "docs/04_implementation/team-split-5dev-1pm.md"
    "docs/04_implementation/test-strategy.md"
    "docs/03_contracts/api-index.md"
    "docs/03_contracts/api-spec.md"
    "docs/03_contracts/enums.md"
    "docs/03_contracts/error-codes.md"
    "docs/02_architecture/data-model.md"
    "docs/02_architecture/erd.md"
    "docs/02_architecture/erdcloud/init_erd_v0.5_refined_erdcloud.sql"
    "frontend/src/app"
    "frontend/src/api"
    "frontend/src/features"
    "backend/api/src"
    "backend/api/prisma"
    "backend/worker/src"
    "backend/common/src"
    "infra/aws"
    "infra/docker"
    "infra/db/migrations"
    "infra/local"
  )

  local failed=0
  local path
  for path in "${required_paths[@]}"; do
    require_path "$path" || failed=1
  done

  file_contains "AGENTS.md" \
    "React + Next.js + TypeScript" \
    "NestJS + TypeScript" \
    "Prisma" \
    "pgvector" \
    "AWS ECR + AWS ECS + AWS CloudFront + Amazon S3" || failed=1

  file_contains "docs/04_implementation/team-split-5dev-1pm.md" \
    "React + Next.js + TypeScript" \
    "NestJS + TypeScript" \
    "OpenAI Agents SDK" \
    "MediaPipe" || failed=1

  local erd="$ROOT/docs/02_architecture/erdcloud/init_erd_v0.5_refined_erdcloud.sql"
  if [[ -f "$erd" ]]; then
    local table
    for table in users companies file_assets postings applications interview_sessions ai_process_logs evaluation_reports; do
      if ! grep -Eq "CREATE TABLE[[:space:]]+$table[[:space:]]*\\(" "$erd"; then
        echo "[fail] ERDCloud SQL missing table $table"
        failed=1
      fi
    done
  fi

  if [[ -f "$ROOT/docs/03_contracts/api-index.md" && -f "$ROOT/docs/03_contracts/api-spec.md" ]]; then
    local id
    while IFS= read -r id; do
      if ! grep -Fq "$id" "$ROOT/docs/03_contracts/api-spec.md"; then
        echo "[fail] API ID $id exists in api-index.md but not api-spec.md"
        failed=1
      fi
    done < <(grep -Eo 'API-[A-Z]+-[0-9]+' "$ROOT/docs/03_contracts/api-index.md" | sort -u)
  fi

  if [[ "$failed" -ne 0 ]]; then
    echo "[fail] verify-docs failed"
    return 1
  fi

  echo "[ok] verify-docs passed"
}

verify_ownership() {
  step "verify-ownership"

  if [[ "$SKIP_OWNERSHIP" -eq 1 ]]; then
    echo "[skip] SkipOwnership enabled"
    return 0
  fi

  (
    cd "$ROOT"
    {
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } | node "$SCRIPT_DIR/ownership-map-check.js" --mode role --role "$ROLE"
  )
}

verify_prisma() {
  step "verify-prisma"

  local schema="$ROOT/backend/api/prisma/schema.prisma"
  local api_dir="$ROOT/backend/api"
  if [[ ! -f "$schema" ]]; then
    echo "[skip] backend/api/prisma/schema.prisma not found"
    return 0
  fi

  if [[ ! -f "$api_dir/package.json" ]]; then
    echo "[fail] schema.prisma exists but backend/api/package.json is missing"
    return 1
  fi

  if [[ ! -f "$api_dir/package-lock.json" ]]; then
    echo "[fail] schema.prisma exists but backend/api/package-lock.json is missing"
    return 1
  fi

  if [[ -z "${DATABASE_URL:-}" && -f "$ROOT/.env.example" ]]; then
    local database_url
    database_url="$(grep -E '^DATABASE_URL=' "$ROOT/.env.example" | head -n 1 | sed 's/^DATABASE_URL=//')"
    if [[ -n "$database_url" ]]; then
      export DATABASE_URL="$database_url"
    fi
  fi

  (
    cd "$api_dir"
    if [[ ! -x "node_modules/.bin/prisma" ]]; then
      command -v npm >/dev/null 2>&1 || { echo "[fail] npm is not available. Node.js 20.x and npm >=10 are required."; exit 1; }
      npm ci --ignore-scripts || exit 1
    fi
    if [[ ! -x "node_modules/.bin/prisma" ]]; then
      echo "[fail] Local Prisma CLI is not available after npm ci."
      exit 1
    fi

    ./node_modules/.bin/prisma validate || exit 1
    ./node_modules/.bin/prisma generate || exit 1
  )

  echo "[ok] verify-prisma passed"
}

verify_dev_auth_seed() {
  step "verify-dev-auth-seed"

  local contract="$ROOT/docs/03_contracts/dev-auth-contract.md"
  local seed="$ROOT/backend/api/prisma/seed.ts"
  local package_json="$ROOT/backend/api/package.json"

  [[ -f "$contract" ]] || { echo "[fail] docs/03_contracts/dev-auth-contract.md is missing"; return 1; }
  [[ -f "$seed" ]] || { echo "[fail] backend/api/prisma/seed.ts is missing"; return 1; }

  local needle
  for needle in CurrentUser X-Dev-User-Id DEV_COMPANY_USER DEV_CANDIDATE_USER COMMON_UNAUTHORIZED COMMON_FORBIDDEN; do
    grep -Fq "$needle" "$contract" || { echo "[fail] dev auth contract does not mention $needle"; return 1; }
  done

  for needle in 'userId: 1' 'userType: "COMPANY"' 'companyId: 1' 'userId: 2' 'userType: "CANDIDATE"' 'candidateId: 1' 'upsert'; do
    grep -Fq "$needle" "$seed" || { echo "[fail] seed.ts does not contain required dev seed marker: $needle"; return 1; }
  done

  if [[ -f "$package_json" ]]; then
    grep -Fq '"dev:init"' "$package_json" || { echo "[fail] backend/api/package.json exists but scripts.dev:init is missing"; return 1; }
    grep -Eq '"seed"[[:space:]]*:[[:space:]]*"tsx prisma/seed.ts"' "$package_json" || { echo "[fail] backend/api/package.json exists but prisma.seed is missing"; return 1; }
  else
    echo "[skip] backend/api/package.json not found; seed script contract will be enforced once package.json exists"
  fi

  echo "[ok] verify-dev-auth-seed passed"
}

verify_docker() {
  step "verify-docker"

  local docker_root dockerfiles
  docker_root="$ROOT/infra/docker"
  if [[ ! -d "$docker_root" ]]; then
    echo "[skip] no Dockerfile found"
    return 0
  fi

  dockerfiles="$(find "$docker_root" -maxdepth 1 -type f -name '*.Dockerfile' | sort)"
  if [[ -z "$dockerfiles" ]]; then
    echo "[skip] no Dockerfile found"
    return 0
  fi

  local file
  while IFS= read -r file; do
    grep -Eq '^FROM[[:space:]]+' "$file" || { echo "[fail] $file does not contain FROM"; return 1; }
    echo "[ok] Dockerfile syntax baseline: $file"
    if [[ "$BUILD_DOCKER" -eq 1 ]]; then
      command -v docker >/dev/null 2>&1 || { echo "[fail] docker command is not available"; return 1; }
      local tag_name tag
      tag_name="$(basename "$file" .Dockerfile | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_.-]/-/g')"
      tag="init-local-$tag_name"
      docker build -f "$file" -t "$tag" "$ROOT"
    fi
  done <<< "$dockerfiles"

  echo "[ok] verify-docker passed"
}

verify_env() {
  step "verify-env"

  local examples=(".env.example" "backend/api/.env.example" "backend/worker/.env.example" "frontend/.env.example")
  local existing=()
  local relative
  for relative in "${examples[@]}"; do
    [[ -f "$ROOT/$relative" ]] && existing+=("$ROOT/$relative")
  done

  if [[ "${#existing[@]}" -eq 0 ]]; then
    echo "[skip] no env example files found"
    return 0
  fi

  local required=(DATABASE_URL REDIS_URL AWS_REGION S3_BUCKET SQS_QUEUE_URL OPENAI_API_KEY JWT_SECRET)
  local name
  for name in "${required[@]}"; do
    if ! grep -hEq "^$name=" "${existing[@]}"; then
      echo "[fail] env example files do not define $name"
      return 1
    fi
    if [[ "$REQUIRE_ENV_VALUES" -eq 1 && -z "${!name:-}" ]]; then
      echo "[fail] environment variable $name is required but empty"
      return 1
    fi
  done

  local aws_readme="$ROOT/infra/aws/README.md"
  if [[ -f "$aws_readme" ]] && grep -Eq '"PAYMENT_DEV_PASS_GRANT_ENABLED"[[:space:]]*:[[:space:]]*"false"' "$aws_readme"; then
    echo "[fail] infra/aws/README.md sets PAYMENT_DEV_PASS_GRANT_ENABLED to false, but API-PAY-007 should keep demo/QA mock interview pass grants enabled by default"
    return 1
  fi

  echo "[ok] verify-env passed"
}

verify_ai_golden() {
  step "verify-ai-golden"

  local dir="$ROOT/docs/04_implementation/ai-golden"
  if [[ ! -d "$dir" ]]; then
    echo "[skip] ai-golden directory not found"
    return 0
  fi

  shopt -s nullglob
  local files=("$dir"/*.json)
  shopt -u nullglob
  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "[skip] no ai golden JSON files found"
    return 0
  fi

  command -v node >/dev/null 2>&1 || { echo "[fail] node is required to validate ai golden JSON"; return 1; }
  node - "${files[@]}" <<'NODE'
const fs = require("fs");
const files = process.argv.slice(2);
for (const file of files) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (json.input == null) throw new Error(`${file} missing input`);
  if (json.expected == null) throw new Error(`${file} missing expected`);
  if (json.expected.outputShape == null) throw new Error(`${file} missing expected.outputShape`);
  console.log(`[ok] ${file.split(/[\\/]/).pop()}`);
}
NODE

  echo "[ok] verify-ai-golden passed"
}

smoke_local() {
  step "smoke-local"

  if [[ -z "$SMOKE_BASE_URL" ]]; then
    echo "[skip] SMOKE_BASE_URL is not set"
    return 0
  fi

  local base="${SMOKE_BASE_URL%/}"
  local url="$base/health"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --max-time 10 "$url" >/dev/null
  else
    command -v node >/dev/null 2>&1 || { echo "[fail] curl or node is required for smoke test"; return 1; }
    node - "$url" <<'NODE'
const url = process.argv[2];
fetch(url, { method: "GET" }).then((response) => {
  if (!response.ok) throw new Error(`health check failed: ${response.status}`);
}).catch((error) => {
  console.error(`[fail] ${error.message}`);
  process.exit(1);
});
NODE
  fi

  echo "[ok] smoke-local passed: $url"
}

verify_docs
verify_ownership
verify_prisma
step "verify-baseline"
bash "$SCRIPT_DIR/verify-baseline.sh"
step "verify-package-baseline"
bash "$SCRIPT_DIR/verify-package-baseline.sh"
verify_dev_auth_seed
verify_docker
verify_env
verify_ai_golden
smoke_local

echo ""
echo "[ok] local harness passed"
