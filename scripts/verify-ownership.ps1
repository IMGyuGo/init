param(
  [ValidateSet("A", "B", "C", "D", "E", "PM")]
  [string]$Role = "A"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ownershipMapPath = Join-Path $root "docs\04_implementation\ownership-map.json"

function Read-OwnershipMap {
  if (-not (Test-Path -LiteralPath $ownershipMapPath)) {
    throw "ownership map not found: $ownershipMapPath"
  }
  return Get-Content -Encoding UTF8 -LiteralPath $ownershipMapPath -Raw | ConvertFrom-Json
}

function Test-AnyPattern {
  param(
    [string]$File,
    [string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    if ($File -match $pattern) {
      return $true
    }
  }
  return $false
}

Push-Location $root
try {
  $changed = @()
  $changed += git diff --name-only
  $changed += git diff --cached --name-only
  $changed += git ls-files --others --exclude-standard
  $changed = $changed |
    Where-Object { $_ -and $_.Trim() -ne "" } |
    Where-Object {
      $normalized = $_ -replace "\\", "/"
      $normalized -notmatch "(^|/)node_modules/" -and
      $normalized -notmatch "(^|/)(\.next|dist|build|coverage)/"
    } |
    Sort-Object -Unique
} finally {
  Pop-Location
}

if (-not $changed -or $changed.Count -eq 0) {
  Write-Host "[ok] no changed files for ownership check"
  exit 0
}

$ownershipMap = Read-OwnershipMap
$allowed = @($ownershipMap.common) + @($ownershipMap.baselineSkeleton) + @($ownershipMap.roles.$Role)

foreach ($shared in @($ownershipMap.shared)) {
  if (@($shared.roles) -contains $Role) {
    $allowed += @($shared.patterns)
  }
}

$blocked = @()
foreach ($file in $changed) {
  $normalized = $file -replace "\\", "/"
  if (-not (Test-AnyPattern $normalized $allowed)) {
    $blocked += $normalized
  }
}

if ($blocked.Count -gt 0) {
  Write-Host "[fail] files outside role $Role ownership:"
  $blocked | ForEach-Object { Write-Host "  $_" }
  Write-Host "[hint] If these paths are valid for this role, add narrow patterns to docs/04_implementation/ownership-map.json and request the affected owner review."
  throw "verify-ownership failed"
}

Write-Host "[ok] verify-ownership passed for role $Role"
