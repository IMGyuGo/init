param(
  [string]$CasesDir = "docs/04_implementation/ai-golden",
  [string]$WorkerDir = "backend/worker"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dir = Join-Path $root $CasesDir

if (-not (Test-Path -LiteralPath $dir)) {
  Write-Host "[skip] ai-golden directory not found"
  exit 0
}

$files = Get-ChildItem -LiteralPath $dir -File -Filter "*.json"
if (-not $files -or $files.Count -eq 0) {
  Write-Host "[skip] no ai golden JSON files found"
  exit 0
}

foreach ($file in $files) {
  $json = Get-Content -Encoding UTF8 -LiteralPath $file.FullName -Raw | ConvertFrom-Json
  if ($null -eq $json.input) {
    throw "$($file.Name) missing input"
  }
  if ($null -eq $json.expected) {
    throw "$($file.Name) missing expected"
  }
  if ($null -eq $json.expected.outputShape) {
    throw "$($file.Name) missing expected.outputShape"
  }
  Write-Host "[ok] $($file.Name)"
}

$workerPath = Join-Path $root $WorkerDir
if (Test-Path -LiteralPath (Join-Path $workerPath "package.json")) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw "npm is required to execute worker golden validation"
  }

  Push-Location $workerPath
  try {
    & $npm.Source test
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

Write-Host "[ok] verify-ai-golden passed"
