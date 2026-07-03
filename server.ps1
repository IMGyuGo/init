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
  $envFile = Join-Path $root '.env'
  $exampleEnvFile = Join-Path $root '.env.example'

  function Import-LocalEnv {
    $path = if ($UseExampleEnv -or -not (Test-Path -LiteralPath $envFile)) { $exampleEnvFile } else { $envFile }
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Environment file not found: $path"
    }

    $lines = Get-Content -Encoding UTF8 -LiteralPath $path
    foreach ($line in $lines) {
      $trimmed = $line.Trim()
      if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
        continue
      }

      $name, $value = $trimmed -split '=', 2
      $name = $name.Trim()
      $value = $value.Trim().Trim('"').Trim("'")
      if ($name) {
        Set-Item -Path "Env:$name" -Value $value
      }
    }
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
    param([string] $PrismaAction = 'menu')

    $apiDir = Join-Path $root 'backend/api'
    Push-Location $apiDir
    try {
      Import-LocalEnv
      switch -Regex ($PrismaAction.ToLowerInvariant()) {
        '^(g|generate|client)$' {
          npm run prisma:generate
        }
        '^(m|migrate|migration)$' {
          npm run db:migrate
        }
        '^(s|seed)$' {
          npm run db:seed
        }
        default {
          Write-Host 'Usage: server prisma generate|migrate|seed'
        }
      }
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
  server prisma          # show prisma command help
  server prisma generate # generate Prisma Client
  server prisma migrate  # run Prisma migrate dev
  server prisma seed     # run Prisma seed

Short targets:
  all, a/api, f/frontend, w/worker, i/infra, p/prisma
'@
      return
    }
    '^(p|prisma)$' {
      Invoke-PrismaInit -PrismaAction $Target
      return
    }
    '^(up|start|on|s)$' {
      $only = Normalize-Target -Value $Target
      if ($only -eq 'Prisma') {
        Invoke-PrismaInit -PrismaAction 'menu'
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
        Invoke-PrismaInit -PrismaAction $Target
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
