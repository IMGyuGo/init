param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failed = $false

$expected = @{
  "frontend" = @{
    dependencies = @{
      "next" = "16.2.9"
      "react" = "19.2.7"
      "react-dom" = "19.2.7"
    }
    devDependencies = @{
      "@types/node" = "20.19.43"
      "@types/react" = "19.2.17"
      "@types/react-dom" = "19.2.3"
      "eslint" = "9.39.4"
      "eslint-config-next" = "16.2.9"
      "typescript" = "5.9.3"
    }
  }
  "backend/api" = @{
    dependencies = @{
      "@aws-sdk/client-s3" = "3.1075.0"
      "@aws-sdk/client-sqs" = "3.1075.0"
      "@nestjs/common" = "11.1.27"
      "@nestjs/config" = "4.0.4"
      "@nestjs/core" = "11.1.27"
      "@nestjs/jwt" = "11.0.2"
      "@nestjs/platform-express" = "11.1.27"
      "@prisma/client" = "6.19.3"
      "class-transformer" = "0.5.1"
      "class-validator" = "0.15.1"
      "reflect-metadata" = "0.2.2"
      "rxjs" = "7.8.2"
    }
    devDependencies = @{
      "@types/node" = "20.19.43"
      "prisma" = "6.19.3"
      "tsx" = "4.22.4"
      "typescript" = "5.9.3"
    }
  }
  "backend/worker" = @{
    dependencies = @{
      "@aws-sdk/client-s3" = "3.1075.0"
      "@aws-sdk/client-sqs" = "3.1075.0"
      "@mediapipe/tasks-vision" = "0.10.35"
      "openai" = "6.45.0"
    }
    devDependencies = @{
      "@types/node" = "20.19.43"
      "tsx" = "4.22.4"
      "typescript" = "5.9.3"
    }
  }
  "backend/common" = @{
    dependencies = @{
      "class-transformer" = "0.5.1"
      "class-validator" = "0.15.1"
    }
    devDependencies = @{
      "@types/node" = "20.19.43"
      "typescript" = "5.9.3"
    }
  }
}

foreach ($relative in $expected.Keys) {
  $packagePath = Join-Path $root "$relative/package.json"
  $lockPath = Join-Path $root "$relative/package-lock.json"
  if (-not (Test-Path -LiteralPath $packagePath)) {
    Write-Host "[fail] missing $relative/package.json"
    $failed = $true
    continue
  }
  if (-not (Test-Path -LiteralPath $lockPath)) {
    Write-Host "[fail] missing $relative/package-lock.json"
    $failed = $true
  }

  $packageJson = Get-Content -Encoding UTF8 -LiteralPath $packagePath -Raw | ConvertFrom-Json
  foreach ($section in @("dependencies", "devDependencies")) {
    foreach ($name in $expected[$relative][$section].Keys) {
      $actual = $packageJson.$section.$name
      $want = $expected[$relative][$section][$name]
      if ($actual -ne $want) {
        Write-Host "[fail] $relative/package.json $section.$name expected $want but found $actual"
        $failed = $true
      }
    }
  }
  Write-Host "[ok] package baseline: $relative"
}

$versionNeedles = @(
  "20.x",
  ">=10",
  "16.2.9",
  "19.2.7",
  "20.19.43",
  "19.2.17",
  "19.2.3",
  "9.39.4",
  "5.9.3",
  "11.1.27",
  "4.0.4",
  "11.0.2",
  "6.19.3",
  "0.5.1",
  "0.15.1",
  "0.2.2",
  "7.8.2",
  "4.22.4",
  "3.1075.0",
  "0.10.35",
  "6.45.0"
) | Sort-Object -Unique

$baselineDocs = @(
  "docs/04_implementation/team-split-5dev-1pm.md",
  "docs/04_implementation/one-time-alignment/agent-a.md",
  "docs/04_implementation/one-time-alignment/agent-b.md",
  "docs/04_implementation/one-time-alignment/agent-c.md",
  "docs/04_implementation/one-time-alignment/agent-d.md",
  "docs/04_implementation/one-time-alignment/agent-e.md",
  "docs/04_implementation/one-time-alignment/agent-pm.md"
)

foreach ($relative in $baselineDocs) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "[fail] missing package baseline doc $relative"
    $failed = $true
    continue
  }
  $text = Get-Content -Encoding UTF8 -LiteralPath $path -Raw
  foreach ($needle in $versionNeedles) {
    if ($text -notmatch [regex]::Escape($needle)) {
      Write-Host "[fail] $relative does not mention package baseline version $needle"
      $failed = $true
    }
  }
  Write-Host "[ok] package baseline doc: $relative"
}

if ($failed) {
  throw "verify-package-baseline failed"
}

Write-Host "[ok] verify-package-baseline passed"
