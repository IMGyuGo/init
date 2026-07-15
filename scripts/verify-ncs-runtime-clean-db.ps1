param(
  [ValidateRange(1024, 65535)]
  [int]$PostgresHostPort = 55432,
  [ValidateRange(1024, 65535)]
  [int]$LocalStackHostPort = 54566,
  [ValidatePattern("^[a-zA-Z_][a-zA-Z0-9_]*$")]
  [string]$DatabaseName = "init_ncs_runtime",
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiDir = Join-Path $root "backend/api"
$composeFile = Join-Path $root "infra/local/docker-compose.yml"
$projectName = "init-ncs-runtime-clean-db"
$postgresUser = "init"
$postgresPassword = "init"
$localStackBucket = "init-local-assets"
$prisma = Join-Path $apiDir "node_modules/.bin/prisma.cmd"
$temporaryPrismaRoot = $null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is required for the isolated NCS runtime database check"
}
if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "local Docker Compose file not found: $composeFile"
}
if (-not (Test-Path -LiteralPath $prisma)) {
  throw "local Prisma CLI not found. Run npm ci in backend/api first."
}

$managedEnvironment = @{
  POSTGRES_HOST_PORT = [string]$PostgresHostPort
  POSTGRES_DB = $DatabaseName
  POSTGRES_USER = $postgresUser
  POSTGRES_PASSWORD = $postgresPassword
  LOCALSTACK_HOST_PORT = [string]$LocalStackHostPort
  DATABASE_URL = "postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${PostgresHostPort}/${DatabaseName}?schema=public"
  AWS_REGION = "ap-northeast-2"
  AWS_ACCESS_KEY_ID = "test"
  AWS_SECRET_ACCESS_KEY = "test"
  AWS_ENDPOINT_URL = "http://127.0.0.1:${LocalStackHostPort}"
  S3_BUCKET = $localStackBucket
  S3_BUCKET_NAME = $localStackBucket
  PRISMA_SEED_CLIENT_MODULE = ""
  PATH = (Join-Path $apiDir "node_modules/.bin") + [System.IO.Path]::PathSeparator + $env:PATH
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
      pg_isready --username $postgresUser --dbname $DatabaseName *> $null
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
  Write-Host "[ncs-db] starting isolated project '$projectName'"
  Write-Host "[ncs-db] PostgreSQL: 127.0.0.1:$PostgresHostPort/$DatabaseName"
  Invoke-Compose -ComposeArguments @("up", "-d", "postgres", "localstack")
  Wait-ForPostgres
  Invoke-Compose -ComposeArguments @("run", "--rm", "-e", "SERVICES=sqs,s3", "localstack-init")

  Push-Location $apiDir
  try {
    & $prisma validate
    if ($LASTEXITCODE -ne 0) { throw "prisma validate failed" }

    $temporaryPrismaRoot = Join-Path $apiDir (".prisma-clean-db-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $temporaryPrismaRoot | Out-Null
    $temporarySchema = Join-Path $temporaryPrismaRoot "schema.prisma"
    $schemaText = Get-Content -Encoding UTF8 -Raw -LiteralPath (Join-Path $apiDir "prisma/schema.prisma")
    $isolatedGenerator = @"
generator client {
  provider = "prisma-client-js"
  output   = "./generated-client"
}
"@
    $schemaText = [regex]::Replace(
      $schemaText,
      'generator client \{\s*provider\s*=\s*"prisma-client-js"\s*\}',
      $isolatedGenerator,
      1
    )
    [System.IO.File]::WriteAllText($temporarySchema, $schemaText, [System.Text.UTF8Encoding]::new($false))

    & $prisma generate --schema $temporarySchema
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
    [Environment]::SetEnvironmentVariable(
      "PRISMA_SEED_CLIENT_MODULE",
      (Join-Path $temporaryPrismaRoot "generated-client"),
      "Process"
    )

    & $prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }

    & $prisma migrate status
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate status failed" }

    & $prisma db seed
    if ($LASTEXITCODE -ne 0) { throw "prisma db seed failed" }
  } finally {
    Pop-Location
  }

  $requiredSchemaSql = @"
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_sessions'
      AND column_name = 'ncs_scoring_version'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_sessions'
      AND column_name = 'retry_allowed_snapshot'
  )
  AND (
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'question_ncs_bindings',
        'application_question_ncs_bindings',
        'session_question_ncs_bindings',
        'interview_session_ncs_policies'
      )
  ) = 4
  AND (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'follow_up_questions'
      AND column_name IN (
        'source_session_question_id',
        'inserted_session_question_id',
        'reason',
        'skip_reason',
        'question_mode',
        'answer_time_sec',
        'inserted_at',
        'updated_at'
      )
  ) = 8
  AND (
    SELECT count(*) FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'follow_up_questions'
      AND constraint_name IN (
        'ck_follow_up_questions_generation_status',
        'ck_follow_up_questions_state_shape',
        'ck_follow_up_questions_reason',
        'follow_up_questions_source_session_question_id_fkey',
        'follow_up_questions_inserted_session_question_id_fkey'
      )
  ) = 5
  AND (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'answer_fact_check_runs'
      AND column_name IN ('follow_up_answer_id', 'input_composition_version')
  ) = 2
  AND (
    SELECT count(*) FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'answer_fact_check_runs'
      AND constraint_name IN (
        'answer_fact_check_runs_follow_up_answer_id_fkey',
        'ck_answer_fact_check_runs_input_composition'
      )
  ) = 2
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_follow_up_questions_reason'
      AND pg_get_constraintdef(oid) LIKE '%FACT_CLARIFICATION%'
  )
THEN 'READY' ELSE 'MISSING' END;
"@
  $schemaStatus = (& docker compose --project-name $projectName --file $composeFile exec -T postgres `
    psql --username $postgresUser --dbname $DatabaseName --tuples-only --no-align --command $requiredSchemaSql).Trim()
  if ($LASTEXITCODE -ne 0 -or $schemaStatus -ne "READY") {
    throw "required NCS runtime tables or columns are missing"
  }

  Write-Host "[ok] clean NCS runtime migration, seed, and schema verification passed"
} finally {
  if ($temporaryPrismaRoot -and (Test-Path -LiteralPath $temporaryPrismaRoot)) {
    Remove-Item -Recurse -Force -LiteralPath $temporaryPrismaRoot
  }

  if (-not $KeepDatabase) {
    Write-Host "[ncs-db] removing isolated project '$projectName'"
    & docker compose --project-name $projectName --file $composeFile down --volumes --remove-orphans
  } else {
    Write-Host "[ncs-db] keeping isolated project '$projectName' for inspection"
  }

  foreach ($name in $managedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
}
