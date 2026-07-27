#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FAILED=0

require_path() {
  local relative="$1"
  if [[ -e "$ROOT/$relative" ]]; then
    echo "[ok] $relative"
  else
    echo "[fail] missing baseline path $relative"
    FAILED=1
  fi
}

file_contains() {
  local relative="$1"
  shift
  local file="$ROOT/$relative"
  if [[ ! -f "$file" ]]; then
    echo "[fail] missing baseline file $relative"
    FAILED=1
    return
  fi

  local needle
  for needle in "$@"; do
    if ! grep -Fq "$needle" "$file"; then
      echo "[fail] $relative does not mention baseline marker '$needle'"
      FAILED=1
    fi
  done
}

for path in \
  docs/04_implementation/one-time-alignment/agent-a.md \
  docs/04_implementation/one-time-alignment/agent-b.md \
  docs/04_implementation/one-time-alignment/agent-c.md \
  docs/04_implementation/one-time-alignment/agent-d.md \
  docs/04_implementation/one-time-alignment/agent-e.md \
  docs/04_implementation/one-time-alignment/agent-pm.md \
  backend/api/src/modules/auth \
  backend/api/src/modules/company-recruiting \
  backend/api/src/modules/company-interview \
  backend/api/src/modules/company-profile \
  backend/api/src/modules/candidate \
  backend/api/src/modules/interview \
  backend/api/src/modules/report \
  backend/api/src/modules/ai \
  backend/common/src/enums \
  backend/common/src/dto \
  backend/common/src/errors \
  frontend/src/features/auth \
  frontend/src/features/company-recruiting \
  frontend/src/features/company-interview-criteria \
  frontend/src/features/company-profile \
  frontend/src/features/candidate-application-interview \
  frontend/src/features/ai-report; do
  require_path "$path"
done

file_contains docs/02_architecture/data-model.md \
  "Implementation Naming Baseline" \
  '| `question_bank` | `Question` | C |' \
  '| `ai_process_logs` | `AiProcessLog` | E |'

file_contains docs/01_product/feature-spec.md \
  "Implementation Baseline Impact" \
  "frontend/src/features/company-recruiting" \
  "backend/api/src/modules/interview"

file_contains docs/02_architecture/erd.md \
  "Implementation Naming Baseline" \
  "Prisma model \`Question" \
  "AiProcessLog"

file_contains docs/03_contracts/enums.md \
  "Implementation Enum Baseline" \
  "Enum Source of Truth" \
  "Status Transition Baseline" \
  '| `ai_process_status` | `AiProcessStatus` |' \
  '| `application_status` | B/D |' \
  "EvaluationCriteria" \
  "QuestionBank" \
  "AIGuardrailLog"

file_contains docs/03_contracts/api-spec.md \
  "Response Envelope Baseline" \
  "Pagination Filter Sort Baseline" \
  "Implementation Baseline" \
  "data.items" \
  "totalItems" \
  "backend/api/src/modules/company-recruiting" \
  "backend/api/src/modules/ai"

file_contains docs/03_contracts/api-index.md \
  "API Module Baseline" \
  "backend/api/src/modules/company-recruiting" \
  "backend/api/src/modules/company-interview" \
  "backend/api/src/modules/report"

file_contains docs/01_product/screen-flow.md \
  "Frontend Feature Baseline" \
  "frontend/src/features/company-recruiting" \
  "frontend/src/features/candidate-application-interview"

file_contains docs/04_implementation/module-boundaries.md \
  "Baseline Boundary Rules" \
  "DTO Naming and Location Baseline" \
  "Shared Table Field Owners" \
  "Permission Matrix Baseline" \
  "CurrentUser.companyId" \
  '| `applications` | `report_status` | E | B/D |'

file_contains docs/04_implementation/team-split-5dev-1pm.md \
  "One-Time Alignment Workflow" \
  "Baseline Change Protocol" \
  "one-time-alignment/agent-a.md" \
  "one-time-alignment/agent-pm.md"

file_contains docs/04_implementation/test-strategy.md \
  "verify-baseline.ps1" \
  "schema.prisma" \
  "Prisma model/enum baseline"

for agent in agent-a agent-b agent-c agent-d agent-e agent-pm; do
  file_contains "docs/04_implementation/one-time-alignment/$agent.md" \
    "Package Version Baseline" \
    "Response Envelope Baseline" \
    "Pagination Filter Sort Baseline" \
    "Status Transition Baseline" \
    "DTO Naming and Location Baseline" \
    "Permission Matrix Baseline" \
    "Verification Promotion Gates"
done

SCHEMA="$ROOT/backend/api/prisma/schema.prisma"
if [[ -f "$SCHEMA" ]]; then
  for model in \
    User Company CandidateProfile CandidateEducation CandidateCareer CandidateActivity \
    CandidateCredential FileAsset Posting CriterionTag EvaluationCriterion Question \
    Application ApplicationDocument ConsentRecord InterviewSession InterviewAnswer FollowUpQuestion \
    EvaluationReport ReportScore ReportEvidence ManualEvaluation Notification AiProcessLog \
    AiGuardrailLog Embedding; do
    if ! grep -Eq "^model[[:space:]]+$model[[:space:]]*\\{" "$SCHEMA"; then
      echo "[fail] schema.prisma missing baseline model $model"
      FAILED=1
    fi
  done

  for enum in \
    UserType AuthProvider UserStatus PostingStatus ApplicationStatus DocumentStatus InterviewStatus \
    ReportStatus ScreeningDecision InterviewType ReportType DocumentType ConsentType QuestionType \
    NotificationChannel AiProcessType AiProcessStatus GuardrailResult EmbeddingSourceType \
    CandidateEducationLevel CandidateDegreeType CandidateEducationStatus CandidateActivityType \
    CandidateCredentialType; do
    if ! grep -Eq "^enum[[:space:]]+$enum[[:space:]]*\\{" "$SCHEMA"; then
      echo "[fail] schema.prisma missing baseline enum $enum"
      FAILED=1
    fi
  done

  for forbidden in QuestionBank EvaluationCriteria AIProcessLog AIGuardrailLog; do
    if grep -Eq "^(model|enum)[[:space:]]+$forbidden[[:space:]]*\\{" "$SCHEMA"; then
      echo "[fail] schema.prisma contains forbidden baseline name $forbidden"
      FAILED=1
    fi
  done
else
  echo "[skip] backend/api/prisma/schema.prisma not found; schema naming baseline will be enforced once schema exists"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "[fail] verify-baseline failed"
  exit 1
fi

echo "[ok] verify-baseline passed"
