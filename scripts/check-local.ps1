param(
  [ValidateSet("A", "B", "C", "D", "E", "PM")]
  [string]$Role = "A",
  [switch]$SkipOwnership,
  [switch]$BuildDocker,
  [switch]$RequireEnvValues,
  [string]$SmokeBaseUrl
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-Step {
  param([string]$Name, [scriptblock]$Block)
  Write-Host ""
  Write-Host "== $Name =="
  $global:LASTEXITCODE = 0
  & $Block
  if (-not $?) {
    exit 1
  }
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Invoke-Step "verify-docs" { & (Join-Path $PSScriptRoot "verify-docs.ps1") }

if ($SkipOwnership) {
  Write-Host ""
  Write-Host "== verify-ownership =="
  Write-Host "[skip] SkipOwnership enabled"
} else {
  Invoke-Step "verify-ownership" { & (Join-Path $PSScriptRoot "verify-ownership.ps1") -Role $Role }
}

Invoke-Step "verify-prisma" { & (Join-Path $PSScriptRoot "verify-prisma.ps1") }
Invoke-Step "verify-baseline" { & (Join-Path $PSScriptRoot "verify-baseline.ps1") }
Invoke-Step "verify-package-baseline" { & (Join-Path $PSScriptRoot "verify-package-baseline.ps1") }
Invoke-Step "verify-dev-auth-seed" { & (Join-Path $PSScriptRoot "verify-dev-auth-seed.ps1") }
Invoke-Step "verify-docker" { & (Join-Path $PSScriptRoot "verify-docker.ps1") -Build:$BuildDocker }
Invoke-Step "verify-env" { & (Join-Path $PSScriptRoot "verify-env.ps1") -RequireValues:$RequireEnvValues }
Invoke-Step "verify-ai-golden" { & (Join-Path $PSScriptRoot "verify-ai-golden.ps1") }
Invoke-Step "smoke-local" { & (Join-Path $PSScriptRoot "smoke-local.ps1") -BaseUrl $SmokeBaseUrl }

Write-Host ""
Write-Host "[ok] local harness passed"
