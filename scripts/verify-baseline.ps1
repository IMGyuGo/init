param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failed = $false

function Test-RequiredPath {
  param([string]$RelativePath)
  $path = Join-Path $root $RelativePath
  if (Test-Path -LiteralPath $path) {
    Write-Host "[ok] $RelativePath"
  } else {
    Write-Host "[fail] missing baseline path $RelativePath"
    $script:failed = $true
  }
}

function Test-FileContains {
  param([string]$RelativePath, [string[]]$Needles)
  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "[fail] missing baseline file $RelativePath"
    $script:failed = $true
    return
  }
  $text = Get-Content -Encoding UTF8 -LiteralPath $path -Raw
  foreach ($needle in $Needles) {
    if ($text -notmatch [regex]::Escape($needle)) {
      Write-Host "[fail] $RelativePath does not mention baseline marker '$needle'"
      $script:failed = $true
    }
  }
}

$requiredPaths = @(
  "docs/04_implementation/one-time-alignment/agent-a.md",
  "docs/04_implementation/one-time-alignment/agent-b.md",
  "docs/04_implementation/one-time-alignment/agent-c.md",
  "docs/04_implementation/one-time-alignment/agent-d.md",
  "docs/04_implementation/one-time-alignment/agent-e.md",
  "docs/04_implementation/one-time-alignment/agent-pm.md",
  "backend/api/src/modules/auth",
  "backend/api/src/modules/company-recruiting",
  "backend/api/src/modules/company-interview",
  "backend/api/src/modules/company-profile",
  "backend/api/src/modules/candidate",
  "backend/api/src/modules/interview",
  "backend/api/src/modules/report",
  "backend/api/src/modules/ai",
  "backend/common/src/enums",
  "backend/common/src/dto",
  "backend/common/src/errors",
  "frontend/src/features/auth",
  "frontend/src/features/company-recruiting",
  "frontend/src/features/company-interview-criteria",
  "frontend/src/features/company-profile",
  "frontend/src/features/candidate-application-interview",
  "frontend/src/features/ai-report"
)

foreach ($path in $requiredPaths) {
  Test-RequiredPath $path
}

Test-FileContains "docs/02_architecture/data-model.md" @(
  "Implementation Naming Baseline",
  '| `question_bank` | `Question` | C |',
  '| `ai_process_logs` | `AiProcessLog` | E |'
)

Test-FileContains "docs/01_product/feature-spec.md" @(
  "Implementation Baseline Impact",
  "frontend/src/features/company-recruiting",
  "backend/api/src/modules/interview"
)

Test-FileContains "docs/02_architecture/erd.md" @(
  "Implementation Naming Baseline",
  "Prisma model",
  "Question",
  "AiProcessLog"
)

Test-FileContains "docs/03_contracts/enums.md" @(
  "Implementation Enum Baseline",
  "Enum Source of Truth",
  "Status Transition Baseline",
  '| `ai_process_status` | `AiProcessStatus` |',
  '| `application_status` | B/D |',
  "EvaluationCriteria",
  "QuestionBank",
  "AIGuardrailLog"
)

Test-FileContains "docs/03_contracts/api-spec.md" @(
  "Response Envelope Baseline",
  "Pagination Filter Sort Baseline",
  "Implementation Baseline",
  "data.items",
  "totalItems",
  "backend/api/src/modules/company-recruiting",
  "backend/api/src/modules/ai"
)

Test-FileContains "docs/03_contracts/api-index.md" @(
  "API Module Baseline",
  "backend/api/src/modules/company-recruiting",
  "backend/api/src/modules/company-interview",
  "backend/api/src/modules/report"
)

Test-FileContains "docs/01_product/screen-flow.md" @(
  "Frontend Feature Baseline",
  "frontend/src/features/company-recruiting",
  "frontend/src/features/candidate-application-interview"
)

Test-FileContains "docs/04_implementation/module-boundaries.md" @(
  "Baseline Boundary Rules",
  "DTO Naming and Location Baseline",
  "Shared Table Field Owners",
  "Permission Matrix Baseline",
  "CurrentUser.companyId",
  '| `applications` | `report_status` | E | B/D |'
)

Test-FileContains "docs/04_implementation/team-split-5dev-1pm.md" @(
  "One-Time Alignment Workflow",
  "Baseline Change Protocol",
  "one-time-alignment/agent-a.md",
  "one-time-alignment/agent-pm.md"
)

Test-FileContains "docs/04_implementation/test-strategy.md" @(
  "verify-baseline.ps1",
  "schema.prisma",
  "Prisma model/enum baseline"
)

foreach ($agent in @("agent-a", "agent-b", "agent-c", "agent-d", "agent-e", "agent-pm")) {
  Test-FileContains "docs/04_implementation/one-time-alignment/$agent.md" @(
    "Package Version Baseline",
    "Response Envelope Baseline",
    "Pagination Filter Sort Baseline",
    "Status Transition Baseline",
    "DTO Naming and Location Baseline",
    "Permission Matrix Baseline",
    "Verification Promotion Gates"
  )
}

$schemaPath = Join-Path $root "backend/api/prisma/schema.prisma"
if (Test-Path -LiteralPath $schemaPath) {
  $schema = Get-Content -Encoding UTF8 -LiteralPath $schemaPath -Raw
  foreach ($model in @(
    "User", "Company", "CandidateProfile", "CandidateEducation", "CandidateCareer",
    "CandidateActivity", "CandidateCredential", "FileAsset", "Posting",
    "CriterionTag", "EvaluationCriterion", "Question", "Application",
    "ApplicationDocument", "ConsentRecord", "InterviewSession", "InterviewAnswer",
    "FollowUpQuestion", "EvaluationReport", "ReportScore", "ReportEvidence",
    "ManualEvaluation", "Notification", "AiProcessLog", "AiGuardrailLog", "Embedding"
  )) {
    if ($schema -notmatch "(?m)^model\s+$model\s*\{") {
      Write-Host "[fail] schema.prisma missing baseline model $model"
      $failed = $true
    }
  }

  foreach ($enum in @(
    "UserType", "AuthProvider", "UserStatus", "PostingStatus",
    "ApplicationStatus", "DocumentStatus", "InterviewStatus", "ReportStatus",
    "ScreeningDecision", "InterviewType", "ReportType", "DocumentType",
    "ConsentType", "QuestionType", "NotificationChannel", "AiProcessType",
    "AiProcessStatus", "GuardrailResult", "EmbeddingSourceType",
    "CandidateEducationLevel", "CandidateDegreeType", "CandidateEducationStatus",
    "CandidateActivityType", "CandidateCredentialType"
  )) {
    if ($schema -notmatch "(?m)^enum\s+$enum\s*\{") {
      Write-Host "[fail] schema.prisma missing baseline enum $enum"
      $failed = $true
    }
  }

  foreach ($forbidden in @("QuestionBank", "EvaluationCriteria", "AIProcessLog", "AIGuardrailLog")) {
    if ($schema -cmatch "(?m)^(model|enum)\s+$forbidden\s*\{") {
      Write-Host "[fail] schema.prisma contains forbidden baseline name $forbidden"
      $failed = $true
    }
  }
} else {
  Write-Host "[skip] backend/api/prisma/schema.prisma not found; schema naming baseline will be enforced once schema exists"
}

if ($failed) {
  throw "verify-baseline failed"
}

Write-Host "[ok] verify-baseline passed"
