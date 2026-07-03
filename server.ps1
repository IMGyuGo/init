function Invoke-FinalWeaponServer {
  param(
    [Parameter(Position = 0)]
    [string] $Action = 'ui',

    [Parameter(Position = 1)]
    [string] $Target = 'all',

    [switch] $SkipDocker,
    [switch] $UseExampleEnv
  )

  $root = $PSScriptRoot

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
    $apiDir = Join-Path $root 'backend/api'
    Push-Location $apiDir
    try {
      npm run prisma:generate
      npm run db:migrate
      npm run db:seed
    } finally {
      Pop-Location
    }
  }

  switch -Regex ($Action.ToLowerInvariant()) {
    '^(ui|menu|tui|server)$' {
      node (Join-Path $root 'scripts/local-dev-menu.mjs')
      return
    }
    '^(help|h|-h|--help)$' {
      Write-Host @'
Usage:
  server                 # open keyboard menu
  server up              # start all
  server frontend        # start frontend
  server api             # start API
  server worker          # start worker
  server infra           # start Docker infra
  server down            # stop all
  server down api        # stop API
  server prisma          # prisma generate + migrate + seed

Short targets:
  all, a/api, f/frontend, w/worker, i/infra, p/prisma
'@
      return
    }
    '^(p|prisma)$' {
      Invoke-PrismaInit
      return
    }
    '^(up|start|on|s)$' {
      $only = Normalize-Target -Value $Target
      if ($only -eq 'Prisma') {
        Invoke-PrismaInit
        return
      }

      $startArgs = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'start-local.ps1'), '-Only', $only)
      if ($SkipDocker) { $startArgs += '-SkipDocker' }
      if ($UseExampleEnv) { $startArgs += '-UseExampleEnv' }
      powershell @startArgs
      return
    }
    '^(down|stop|off|x)$' {
      $only = Normalize-Target -Value $Target
      if ($only -eq 'Prisma') {
        Write-Host '[local] Prisma is a one-shot command and has no process to stop.'
        return
      }

      powershell -ExecutionPolicy Bypass -File (Join-Path $root 'stop-local.ps1') -Only $only
      return
    }
    default {
      $only = Normalize-Target -Value $Action
      if ($only -eq 'Prisma') {
        Invoke-PrismaInit
        return
      }

      powershell -ExecutionPolicy Bypass -File (Join-Path $root 'start-local.ps1') -Only $only
    }
  }
}

Set-Alias server Invoke-FinalWeaponServer

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-FinalWeaponServer @args
}
