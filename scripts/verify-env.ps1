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

$required = @("DATABASE_URL", "REDIS_URL", "AWS_REGION", "S3_BUCKET", "SQS_QUEUE_URL", "OPENAI_API_KEY", "JWT_SECRET")
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

$awsReadme = Join-Path $root "infra/aws/README.md"
if (Test-Path -LiteralPath $awsReadme) {
  $awsReadmeContent = Get-Content -Encoding UTF8 -LiteralPath $awsReadme -Raw
  if ($awsReadmeContent -match '"PAYMENT_DEV_PASS_GRANT_ENABLED"\s*:\s*"false"') {
    throw "infra/aws/README.md sets PAYMENT_DEV_PASS_GRANT_ENABLED to false, but API-PAY-007 should keep demo/QA mock interview pass grants enabled by default"
  }
}

Write-Host "[ok] verify-env passed"
