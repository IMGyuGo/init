param([switch]$RequireValues)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$examples = @(".env.example", "backend/api/.env.example", "backend/worker/.env.example", "frontend/.env.example")
$existing = @()
foreach ($relative in $examples) {
  $path = Join-Path $root $relative
  if (Test-Path -LiteralPath $path) {
    $existing += $path
  }
}

if ($existing.Count -eq 0) {
  Write-Host "[skip] no env example files found"
  exit 0
}

$required = @(
  "DATABASE_URL", "REDIS_URL", "AWS_REGION", "S3_BUCKET", "SQS_QUEUE_URL", "OPENAI_API_KEY", "JWT_SECRET",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_REQUIRE_TLS", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  "SMTP_CONNECTION_TIMEOUT_MS", "SMTP_GREETING_TIMEOUT_MS", "SMTP_SOCKET_TIMEOUT_MS", "SMTP_SMOKE_TO"
)
$combined = ""
foreach ($file in $existing) {
  $combined += "`n" + (Get-Content -Encoding UTF8 -LiteralPath $file -Raw)
}

foreach ($name in $required) {
  if ($combined -notmatch "(?m)^$name=") {
    throw "env example files do not define $name"
  }
  if ($RequireValues -and -not [Environment]::GetEnvironmentVariable($name)) {
    throw "environment variable $name is required but empty"
  }
}

$deployWorkflowPath = Join-Path $root ".github/workflows/deploy.yml"
$frontendDockerfilePath = Join-Path $root "infra/docker/frontend.Dockerfile"
$awsLocalsPath = Join-Path $root "infra/aws/locals.tf"

$deployWorkflow = Get-Content -Encoding UTF8 -LiteralPath $deployWorkflowPath -Raw
$frontendDockerfile = Get-Content -Encoding UTF8 -LiteralPath $frontendDockerfilePath -Raw
$awsLocals = Get-Content -Encoding UTF8 -LiteralPath $awsLocalsPath -Raw

$frontendBuildVariables = @(
  "NEXT_PUBLIC_AI_INTERVIEWER_SESSION_MODE",
  "NEXT_PUBLIC_AI_INTERVIEWER_REALTIME_ENABLED",
  "NEXT_PUBLIC_AI_INTERVIEWER_AVATAR_STREAM_ENABLED",
  "NEXT_PUBLIC_OPENAI_REALTIME_STT_RELAY_ENABLED",
  "NEXT_PUBLIC_NCS_QUESTION_POLICY_ENABLED"
)

foreach ($name in $frontendBuildVariables) {
  $githubVariableReference = '${{ vars.' + $name + ' }}'
  if (-not $deployWorkflow.Contains($githubVariableReference)) {
    throw ".github/workflows/deploy.yml does not read GitHub Environment variable $name"
  }
  if ($deployWorkflow -notmatch "--build-arg\s+$name=") {
    throw ".github/workflows/deploy.yml does not pass frontend build argument $name"
  }
  if ($frontendDockerfile -notmatch "(?m)^ARG\s+$name(?:=|\s*$)") {
    throw "infra/docker/frontend.Dockerfile does not define build argument $name"
  }
  if ($frontendDockerfile -notmatch "(?m)^ENV\s+$name=\`$$name\s*$") {
    throw "infra/docker/frontend.Dockerfile does not expose builder environment $name"
  }
}

$deployWorkflowContractFragments = @(
  'const deployWorkflowChanged = includesAny([".github/workflows/deploy.yml"]);',
  'SMTP_DEPLOY_SMOKE_ENABLED: ${{ vars.SMTP_DEPLOY_SMOKE_ENABLED }}',
  "if: needs.detect.outputs.api == 'true' && env.SMTP_DEPLOY_SMOKE_ENABLED == 'true'",
  "::warning::This merged PR changes Terraform files and application deploy inputs together.",
  "const temporarilyAllowedPlaceholderKeys = {",
  "const blockedPlaceholder = placeholder.filter",
  "Provider-backed features remain unavailable."
)
foreach ($fragment in $deployWorkflowContractFragments) {
  if (-not $deployWorkflow.Contains($fragment)) {
    throw ".github/workflows/deploy.yml is missing deploy recovery contract: $fragment"
  }
}

$deployWorkflowFanoutCount = [regex]::Matches(
  $deployWorkflow,
  '(?m)^\s+deployWorkflowChanged \|\|\s*$'
).Count
if ($deployWorkflowFanoutCount -ne 3) {
  throw ".github/workflows/deploy.yml must fan out its own change to frontend, API, and worker"
}

$blockingMixedChangeError = 'echo "::error::This merged PR changes Terraform files and application deploy inputs together.'
if ($deployWorkflow.Contains($blockingMixedChangeError)) {
  throw ".github/workflows/deploy.yml must warn, not fail, when Terraform and application inputs change together"
}

$temporaryPlaceholderKeys = @(
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SMTP_USER",
  "SMTP_PASS",
  "OPENAI_API_KEY",
  "AI_PROVIDER_API_KEY"
)
foreach ($name in $temporaryPlaceholderKeys) {
  if (-not $deployWorkflow.Contains(('"' + $name + '"'))) {
    throw ".github/workflows/deploy.yml temporary placeholder allowlist does not include $name"
  }
}

function Get-TerraformSecretKeys([string]$Service) {
  $marker = "$Service = ["
  $start = $awsLocals.IndexOf($marker, $awsLocals.IndexOf("secret_keys"))
  if ($start -lt 0) {
    throw "infra/aws/locals.tf does not define secret_keys.$Service"
  }
  $end = $awsLocals.IndexOf("]", $start)
  if ($end -lt 0) {
    throw "infra/aws/locals.tf does not close secret_keys.$Service"
  }
  return @([regex]::Matches($awsLocals.Substring($start, $end - $start), '"([^"]+)"') | ForEach-Object {
    $_.Groups[1].Value
  })
}

$requiredApiSecretKeys = @(
  "AI_INTERVIEWER_REALTIME_PROVIDER",
  "OPENAI_REALTIME_MODEL",
  "OPENAI_REALTIME_VOICE",
  "OPENAI_REALTIME_API_BASE_URL",
  "OPENAI_REALTIME_STT_MODEL",
  "OPENAI_REALTIME_STT_DELAY",
  "SMTP_REQUIRE_TLS",
  "SMTP_CONNECTION_TIMEOUT_MS",
  "SMTP_GREETING_TIMEOUT_MS",
  "SMTP_SOCKET_TIMEOUT_MS"
)
$requiredWorkerSecretKeys = @(
  "AI_TEXT_INPUT_USD_PER_1M_TOKENS",
  "AI_TEXT_OUTPUT_USD_PER_1M_TOKENS",
  "AI_STT_USD_PER_MINUTE",
  "WORKER_VISIBILITY_TIMEOUT_SECONDS",
  "WORKER_VISIBILITY_HEARTBEAT_MS"
)

$apiSecretKeys = Get-TerraformSecretKeys "api"
foreach ($name in $requiredApiSecretKeys) {
  if ($name -notin $apiSecretKeys) {
    throw "infra/aws/locals.tf secret_keys.api does not include $name"
  }
}

$workerSecretKeys = Get-TerraformSecretKeys "worker"
foreach ($name in $requiredWorkerSecretKeys) {
  if ($name -notin $workerSecretKeys) {
    throw "infra/aws/locals.tf secret_keys.worker does not include $name"
  }
}

$awsReadme = Join-Path $root "infra/aws/README.md"
if (Test-Path -LiteralPath $awsReadme) {
  $awsReadmeContent = Get-Content -Encoding UTF8 -LiteralPath $awsReadme -Raw
  if ($awsReadmeContent -match '"PAYMENT_DEV_PASS_GRANT_ENABLED"\s*:\s*"false"') {
    throw "infra/aws/README.md sets PAYMENT_DEV_PASS_GRANT_ENABLED to false, but API-PAY-007 should keep demo/QA mock interview pass grants enabled by default"
  }
}

Write-Host "[ok] verify-env passed"
