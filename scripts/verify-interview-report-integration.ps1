param(
  [ValidateRange(1024, 65535)]
  [int]$PostgresHostPort = 55433,
  [ValidateRange(1024, 65535)]
  [int]$LocalStackHostPort = 54567,
  [switch]$KeepInfrastructure
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\verify-interview-report-integration.ps1
# Creates an isolated PostgreSQL/LocalStack project, applies migrations without the
# network-dependent product seed, and verifies DEMO_PRESET plus STANDARD report evaluation.

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiDir = Join-Path $root "backend/api"
$workerDir = Join-Path $root "backend/worker"
$composeFile = Join-Path $root "infra/local/docker-compose.yml"
$projectName = "init-interview-report-" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
$databaseName = "init_ncs_readiness"
$postgresUser = "init"
$postgresPassword = "init"
$prisma = Join-Path $apiDir "node_modules/.bin/prisma.cmd"
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is required for the isolated interview report integration test"
}
if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "local Docker Compose file not found: $composeFile"
}
if (-not (Test-Path -LiteralPath $prisma)) {
  throw "local Prisma CLI not found. Run npm ci in backend/api first."
}
if (-not $npm) {
  throw "npm.cmd was not found"
}

$databaseUrl = "postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${PostgresHostPort}/${databaseName}?schema=public"
$managedEnvironment = @{
  POSTGRES_HOST_PORT = [string]$PostgresHostPort
  POSTGRES_DB = $databaseName
  POSTGRES_USER = $postgresUser
  POSTGRES_PASSWORD = $postgresPassword
  LOCALSTACK_HOST_PORT = [string]$LocalStackHostPort
  DATABASE_URL = $databaseUrl
  NCS_SMOKE_DATABASE_URL = $databaseUrl
  AWS_REGION = "ap-northeast-2"
  AWS_ACCESS_KEY_ID = "test"
  AWS_SECRET_ACCESS_KEY = "test"
  AWS_ENDPOINT_URL = "http://127.0.0.1:${LocalStackHostPort}"
  S3_BUCKET = "init-local-assets"
  S3_BUCKET_NAME = "init-local-assets"
}
$previousEnvironment = @{}

function Invoke-Compose {
  param([string[]]$ComposeArguments)

  & docker compose --project-name $projectName --file $composeFile @ComposeArguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed: $($ComposeArguments -join ' ')"
  }
}

function Wait-ForPostgres {
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    & docker compose --project-name $projectName --file $composeFile exec -T postgres `
      pg_isready --username $postgresUser --dbname $databaseName *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "isolated PostgreSQL did not become ready within 60 seconds"
}

foreach ($name in $managedEnvironment.Keys) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  [Environment]::SetEnvironmentVariable($name, $managedEnvironment[$name], "Process")
}

try {
  Write-Host "[interview-report] starting isolated project '$projectName'"
  Write-Host "[interview-report] PostgreSQL: 127.0.0.1:$PostgresHostPort/$databaseName"
  Invoke-Compose -ComposeArguments @("up", "-d", "postgres", "localstack")
  Wait-ForPostgres
  Invoke-Compose -ComposeArguments @("run", "--rm", "-e", "SERVICES=sqs,s3", "localstack-init")

  Push-Location $apiDir
  try {
    & $prisma validate
    if ($LASTEXITCODE -ne 0) { throw "prisma validate failed" }
    & $prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }
  } finally {
    Pop-Location
  }

  Push-Location $workerDir
  try {
    & $npm run smoke:ncs:pipeline -- --provider=mock --scenario=all
    if ($LASTEXITCODE -ne 0) { throw "interview report integration smoke failed" }
  } finally {
    Pop-Location
  }

  Write-Host "[ok] DEMO_PRESET and STANDARD interview report evaluation passed"
} finally {
  if (-not $KeepInfrastructure) {
    Write-Host "[interview-report] removing isolated project '$projectName'"
    & docker compose --project-name $projectName --file $composeFile down --volumes --remove-orphans
  } else {
    Write-Host "[interview-report] keeping isolated project '$projectName' for inspection"
  }

  foreach ($name in $managedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
}
