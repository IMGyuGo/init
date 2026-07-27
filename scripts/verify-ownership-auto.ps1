param(
  [string]$BaseRef = $env:GITHUB_BASE_REF
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

function Get-ChangedFiles {
  Push-Location $root
  try {
    if ($BaseRef) {
      $remoteBase = "origin/$BaseRef"
      $exists = git rev-parse --verify "$remoteBase" 2>$null
      if (-not $exists) {
        git fetch origin $BaseRef --depth=1 | Out-Null
      }
      return git diff --name-only "$remoteBase...HEAD"
    }

    $changed = @()
    $changed += git diff --name-only
    $changed += git diff --cached --name-only
    $changed += git ls-files --others --exclude-standard
    return $changed
  } finally {
    Pop-Location
  }
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

function Set-GitHubOutput {
  param(
    [string]$Name,
    [string]$Value
  )

  if ($env:GITHUB_OUTPUT) {
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding UTF8 -Value "$Name=$Value"
  }
}

$ownershipMap = Read-OwnershipMap
$changed = Get-ChangedFiles |
  Where-Object { $_ -and $_.Trim() -ne "" } |
  ForEach-Object { $_ -replace "\\", "/" } |
  Where-Object {
    $_ -notmatch "(^|/)node_modules/" -and
    $_ -notmatch "(^|/)(\.next|dist|build|coverage)/"
  } |
  Sort-Object -Unique

if (-not $changed -or $changed.Count -eq 0) {
  Write-Host "[ok] no changed files for auto ownership check"
  Set-GitHubOutput "roles_csv" ""
  Set-GitHubOutput "roles_json" "[]"
  exit 0
}

$allowedCommon = @($ownershipMap.common) + @($ownershipMap.baselineSkeleton)
$impacted = New-Object System.Collections.Generic.HashSet[string]
$blocked = @()

foreach ($file in $changed) {
  if (Test-AnyPattern $file $allowedCommon) {
    [void]$impacted.Add("COMMON")
    continue
  }

  $matchedShared = $false
  foreach ($shared in @($ownershipMap.shared)) {
    if (Test-AnyPattern $file @($shared.patterns)) {
      foreach ($role in @($shared.roles)) {
        [void]$impacted.Add($role)
      }
      $matchedShared = $true
    }
  }
  if ($matchedShared) {
    continue
  }

  $matched = $false
  foreach ($role in @("A", "B", "C", "D", "E", "PM")) {
    if (Test-AnyPattern $file @($ownershipMap.roles.$role)) {
      [void]$impacted.Add($role)
      $matched = $true
    }
  }

  if (-not $matched) {
    $blocked += $file
  }
}

if ($blocked.Count -gt 0) {
  Write-Host "[fail] files outside all known ownership:"
  $blocked | ForEach-Object { Write-Host "  $_" }
  Write-Host "[hint] Add narrow role patterns to docs/04_implementation/ownership-map.json. Avoid broad patterns such as frontend/src/** or backend/api/src/**."
  throw "verify-ownership-auto failed"
}

$roles = $impacted | Sort-Object
$harnessRoles = @($roles | Where-Object { $_ -ne "COMMON" })
$rolesCsv = $harnessRoles -join ","
$rolesJson = "[$(($harnessRoles | ForEach-Object { '"' + $_ + '"' }) -join ',')]"

Write-Host "[ok] verify-ownership-auto passed"
Write-Host "impacted roles: $($roles -join ', ')"
Write-Host "harness roles: $rolesCsv"
Set-GitHubOutput "roles_csv" $rolesCsv
Set-GitHubOutput "roles_json" $rolesJson
