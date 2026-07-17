param(
  [ValidateRange(1024, 65535)]
  [int]$PostgresHostPort = 55440,
  [ValidatePattern("^[a-zA-Z_][a-zA-Z0-9_]*$")]
  [string]$DatabaseName = "init_ncs_demo_preset_upgrade"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiDir = Join-Path $root "backend/api"
$composeFile = Join-Path $root "infra/local/docker-compose.yml"
$foundationMigration = "20260717130000_ncs_active_profile_demo_preset_foundation"
$projectName = "init-ncs-demo-preset-upgrade"
$postgresUser = "init"
$postgresPassword = "init"
$prisma = Join-Path $apiDir "node_modules/.bin/prisma.cmd"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "init-ncs-demo-preset-upgrade-" + [Guid]::NewGuid().ToString("N")
)
$managedEnvironment = @{
  POSTGRES_HOST_PORT = [string]$PostgresHostPort
  POSTGRES_DB = $DatabaseName
  POSTGRES_USER = $postgresUser
  POSTGRES_PASSWORD = $postgresPassword
  DATABASE_URL = "postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${PostgresHostPort}/${DatabaseName}?schema=public"
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

function Invoke-ScalarSql {
  param([string]$Sql)

  $value = (& docker compose --project-name $projectName --file $composeFile exec -T postgres `
    psql --username $postgresUser --dbname $DatabaseName --tuples-only --no-align --command $Sql).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL verification query failed"
  }
  return $value
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is required for the NCS demo preset upgrade check"
}
if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "local Docker Compose file not found: $composeFile"
}
if (-not (Test-Path -LiteralPath $prisma)) {
  throw "local Prisma CLI not found. Run npm ci in backend/api first."
}

foreach ($name in $managedEnvironment.Keys) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  [Environment]::SetEnvironmentVariable($name, $managedEnvironment[$name], "Process")
}

try {
  Write-Host "[ncs-demo-upgrade] starting isolated PostgreSQL"
  Write-Host "[ncs-demo-upgrade] target: 127.0.0.1:$PostgresHostPort/$DatabaseName"
  Invoke-Compose -ComposeArguments @("up", "-d", "postgres")
  Wait-ForPostgres

  $temporaryPrisma = Join-Path $temporaryRoot "prisma"
  $temporaryMigrations = Join-Path $temporaryPrisma "migrations"
  New-Item -ItemType Directory -Force -Path $temporaryMigrations | Out-Null
  Copy-Item -LiteralPath (Join-Path $apiDir "prisma/schema.prisma") `
    -Destination (Join-Path $temporaryPrisma "schema.prisma")
  Copy-Item -LiteralPath (Join-Path $apiDir "prisma/migrations/migration_lock.toml") `
    -Destination (Join-Path $temporaryMigrations "migration_lock.toml")

  Get-ChildItem -LiteralPath (Join-Path $apiDir "prisma/migrations") -Directory |
    Where-Object { $_.Name -ne $foundationMigration } |
    ForEach-Object {
      Copy-Item -Recurse -LiteralPath $_.FullName -Destination $temporaryMigrations
    }

  Write-Host "[ncs-demo-upgrade] applying the 47 pre-foundation migrations"
  & $prisma migrate deploy --schema (Join-Path $temporaryPrisma "schema.prisma")
  if ($LASTEXITCODE -ne 0) {
    throw "pre-foundation prisma migrate deploy failed"
  }

  $preMigrationCount = Invoke-ScalarSql -Sql @"
SELECT count(*)
FROM _prisma_migrations
WHERE finished_at IS NOT NULL;
"@
  if ($preMigrationCount -ne "47") {
    throw "expected 47 pre-foundation migrations, got $preMigrationCount"
  }

  $preFoundationStatus = Invoke-ScalarSql -Sql @"
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'interview_sessions'
    AND column_name = 'session_mode'
) THEN 'READY' ELSE 'ALREADY_APPLIED' END;
"@
  if ($preFoundationStatus -ne "READY") {
    throw "foundation schema was unexpectedly present before the forward migration"
  }

  Write-Host "[ncs-demo-upgrade] applying the foundation forward migration without seed"
  Push-Location $apiDir
  try {
    & $prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
      throw "foundation prisma migrate deploy failed"
    }
    & $prisma migrate status
    if ($LASTEXITCODE -ne 0) {
      throw "prisma migrate status failed after the upgrade"
    }
  } finally {
    Pop-Location
  }

  $upgradeStatus = Invoke-ScalarSql -Sql @"
SELECT CASE WHEN
  (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) = 48
  AND (
    SELECT count(*)
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'InterviewSessionMode'
      AND e.enumlabel IN ('STANDARD', 'DEMO_PRESET')
  ) = 2
  AND (
    SELECT count(*)
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'QuestionUsageScope'
      AND e.enumlabel IN ('STANDARD', 'DEMO_PRESET')
  ) = 2
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_sessions'
      AND column_name = 'session_mode'
      AND is_nullable = 'NO'
      AND column_default LIKE '%STANDARD%'
  )
  AND (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'question_bank',
        'application_interview_question_batches',
        'application_interview_questions',
        'interview_session_questions'
      )
      AND column_name = 'usage_scope'
      AND is_nullable = 'NO'
      AND column_default LIKE '%STANDARD%'
  ) = 4
  AND EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'application_interview_question_batches'
      AND indexdef LIKE '%application_id, usage_scope, policy_version, criteria_version, jd_snapshot_hash, resume_document_hash%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'interview_question_generation_policies'::regclass
      AND pg_get_constraintdef(oid) LIKE '%NCS_ACTIVE_PROFILE_V2%'
  )
  AND (
    SELECT count(*)
    FROM criterion_tags
    WHERE ncs_profile_id IN (
      'JOB_TECHNICAL',
      'COLLABORATION_COMMUNICATION',
      'PROBLEM_SOLVING'
    )
  ) = 3
  AND NOT EXISTS (
    SELECT 1
    FROM criterion_tags
    WHERE ncs_profile_id IN ('DIGITAL', 'COMMUNICATION')
  )
THEN 'READY' ELSE 'MISSING' END;
"@
  if ($upgradeStatus -ne "READY") {
    throw "NCS demo preset upgrade verification failed: $upgradeStatus"
  }

  Write-Host "[ok] 47 migrations -> foundation migration upgrade passed without seed"
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedTemporaryRoot.StartsWith($resolvedSystemTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "refusing to remove upgrade verification path outside the system temp directory"
    }
    Remove-Item -Recurse -Force -LiteralPath $temporaryRoot
  }

  Write-Host "[ncs-demo-upgrade] removing isolated PostgreSQL"
  & docker compose --project-name $projectName --file $composeFile down --volumes --remove-orphans

  foreach ($name in $managedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
}
