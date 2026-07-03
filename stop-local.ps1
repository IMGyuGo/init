param(
  [ValidateSet('All', 'Infra', 'Api', 'Frontend', 'Worker')]
  [string] $Only = 'All',

  [switch] $Help
)

$ErrorActionPreference = 'Stop'

function Show-Help {
  Write-Host @'
Usage:
  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1 -Only Frontend
  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1 -Only Api
  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1 -Only Worker
  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1 -Only Infra

Options:
  -Only All       Stop frontend, API, worker, and Docker infra. Default.
  -Only Infra     Stop only PostgreSQL, Redis, Mailpit, and LocalStack.
  -Only Api       Stop only the NestJS API server on port 3001.
  -Only Frontend  Stop only the Next.js frontend server on port 3000.
  -Only Worker    Stop only the AI worker process.
  -Help           Show this help.
'@
}

if ($Help) {
  Show-Help
  exit 0
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $Root '.env'
if (-not (Test-Path -LiteralPath $EnvFile)) {
  $EnvFile = Join-Path $Root '.env.example'
}

function Stop-PortOwner {
  param(
    [int] $Port,
    [string] $Name
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  if (-not $connections) {
    Write-Host "[local] $Name is not listening on port $Port."
    return
  }

  foreach ($processId in $connections) {
    Write-Host "[local] Stopping $Name process $processId on port $Port."
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-WorkerProcess {
  $workerPathPattern = [regex]::Escape((Join-Path $Root 'backend\worker'))
  $processes = Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      ($_.CommandLine -match $workerPathPattern -or $_.CommandLine -match 'backend[\\/]worker') -and
      ($_.CommandLine -match 'npm|tsx|node')
    }

  if (-not $processes) {
    Write-Host '[local] Worker process was not found.'
    return
  }

  foreach ($process in $processes) {
    Write-Host "[local] Stopping Worker process $($process.ProcessId)."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-Infra {
  Write-Host '[local] Stopping Docker infra: PostgreSQL, Redis, Mailpit, LocalStack'
  docker compose --env-file $EnvFile -f (Join-Path $Root 'infra/local/docker-compose.yml') down
}

if ($Only -eq 'All' -or $Only -eq 'Frontend') {
  Stop-PortOwner -Port 3000 -Name 'Frontend'
}

if ($Only -eq 'All' -or $Only -eq 'Api') {
  Stop-PortOwner -Port 3001 -Name 'API'
}

if ($Only -eq 'All' -or $Only -eq 'Worker') {
  Stop-WorkerProcess
}

if ($Only -eq 'All' -or $Only -eq 'Infra') {
  Stop-Infra
}

Write-Host '[local] Requested services have been stopped.'
