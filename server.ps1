if (Test-Path Alias:fw) {
  Remove-Item Alias:fw -Force
}

function fw {
  & (Join-Path $PSScriptRoot 'fw.ps1') @args
}

function server {
  if ($args.Count -eq 0) {
    & (Join-Path $PSScriptRoot 'fw.ps1') ui
    return
  }

  & (Join-Path $PSScriptRoot 'fw.ps1') @args
}

function 서버관리 {
  if ($args.Count -eq 0) {
    & (Join-Path $PSScriptRoot 'fw.ps1') ui
    return
  }

  & (Join-Path $PSScriptRoot 'fw.ps1') @args
}

function global:/server {
  if ($args.Count -eq 0) {
    & (Join-Path $PSScriptRoot 'fw.ps1') ui
    return
  }

  & (Join-Path $PSScriptRoot 'fw.ps1') @args
}

function global:/서버관리 {
  if ($args.Count -eq 0) {
    & (Join-Path $PSScriptRoot 'fw.ps1') ui
    return
  }

  & (Join-Path $PSScriptRoot 'fw.ps1') @args
}

Set-Alias fws fw
