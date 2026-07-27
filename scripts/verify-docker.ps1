param([switch]$Build)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dockerRoot = Join-Path $root "infra/docker"
$dockerfiles = @()
if (Test-Path -LiteralPath $dockerRoot) {
  $dockerfiles = Get-ChildItem -LiteralPath $dockerRoot -File -Filter "*.Dockerfile"
}

if (-not $dockerfiles -or $dockerfiles.Count -eq 0) {
  Write-Host "[skip] no Dockerfile found"
  exit 0
}

foreach ($file in $dockerfiles) {
  $text = Get-Content -Encoding UTF8 -LiteralPath $file.FullName -Raw
  if ($text -notmatch "(?m)^FROM\s+") {
    throw "$($file.FullName) does not contain FROM"
  }
  Write-Host "[ok] Dockerfile syntax baseline: $($file.FullName)"
}

if ($Build) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker command is not available"
  }
  foreach ($file in $dockerfiles) {
    $tagName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name).ToLowerInvariant() -replace "[^a-z0-9_.-]", "-"
    $tag = "init-local-" + $tagName
    docker build -f $file.FullName -t $tag $root
  }
}

Write-Host "[ok] verify-docker passed"
