param(
  [Parameter(Position = 0)]
  [string] $Action = 'help',

  [Parameter(Position = 1)]
  [string] $Target = 'all',

  [switch] $SkipDocker,
  [switch] $UseExampleEnv
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Help {
  Write-Host @'
Usage:
  .\fw.ps1 up              # start all
  .\fw.ps1 f               # start frontend
  .\fw.ps1 down            # stop all
  .\fw.ps1 up f            # start frontend
  .\fw.ps1 down a          # stop API
  .\fw.ps1 up i            # start infra
  .\fw.ps1 up w            # start worker
  .\fw.ps1 p               # prisma generate + migrate + seed
  .\fw.ps1 ui              # open keyboard menu

Short targets:
  all, a/api/back/backend, f/front/frontend, w/worker, i/infra/docker, p/prisma

Short actions:
  up/start/on, down/stop/off, p/prisma, ui/menu/tui, help
'@
}

function Normalize-Target {
  param([string] $Value)

  switch -Regex ($Value.ToLowerInvariant()) {
    '^(all|\*)$' { return 'All' }
    '^(i|infra|docker|db)$' { return 'Infra' }
    '^(a|api|back|backend|be)$' { return 'Api' }
    '^(f|front|frontend|fe|web)$' { return 'Frontend' }
    '^(w|worker|ai)$' { return 'Worker' }
    '^(p|prisma)$' { return 'Prisma' }
    default { throw "Unknown target: $Value" }
  }
}

function Invoke-PrismaInit {
  $apiDir = Join-Path $Root 'backend/api'
  Push-Location $apiDir
  try {
    npm run prisma:generate
    npm run db:migrate
    npm run db:seed
  } finally {
    Pop-Location
  }
}

$normalizedAction = $Action.ToLowerInvariant()

switch -Regex ($normalizedAction) {
  '^(help|h|-h|--help)$' {
    Show-Help
    exit 0
  }
  '^(ui|menu|tui)$' {
    node (Join-Path $Root 'scripts/local-dev-menu.mjs')
    exit $LASTEXITCODE
  }
  '^(p|prisma)$' {
    Invoke-PrismaInit
    exit 0
  }
  '^(up|start|on|s)$' {
    $only = Normalize-Target -Value $Target
    if ($only -eq 'Prisma') {
      Invoke-PrismaInit
      exit 0
    }

    $startArgs = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'start-local.ps1'), '-Only', $only)
    if ($SkipDocker) { $startArgs += '-SkipDocker' }
    if ($UseExampleEnv) { $startArgs += '-UseExampleEnv' }
    powershell @startArgs
    exit $LASTEXITCODE
  }
  '^(down|stop|off|x)$' {
    $only = Normalize-Target -Value $Target
    if ($only -eq 'Prisma') {
      Write-Host '[local] Prisma is a one-shot command and has no process to stop.'
      exit 0
    }

    powershell -ExecutionPolicy Bypass -File (Join-Path $Root 'stop-local.ps1') -Only $only
    exit $LASTEXITCODE
  }
  default {
    $only = Normalize-Target -Value $Action
    if ($only -eq 'Prisma') {
      Invoke-PrismaInit
      exit 0
    }

    powershell -ExecutionPolicy Bypass -File (Join-Path $Root 'start-local.ps1') -Only $only
    exit $LASTEXITCODE
  }
}
