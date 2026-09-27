# Bun Barrage one-time setup for Windows.
# 1) Ensures Node.js 24 (official MSI from nodejs.org, SHA-256 verified)
# 2) npm install (project + Even Hub simulator), 3) runs the tests.
# Full log: windows\setup-log.txt
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Start-Transcript -Path (Join-Path $PSScriptRoot 'setup-log.txt') -Force | Out-Null

function Get-NodeMajor {
  try { $v = (& node -v) 2>$null; if ($v -match '^v(\d+)') { return [int]$Matches[1] } } catch {}
  return 0
}

$major = Get-NodeMajor
Write-Host "Node.js currently installed: major version $major"

if ($major -lt 24) {
  Write-Host 'Installing Node.js 24 (LTS) from nodejs.org ...'
  $base = 'https://nodejs.org/dist/latest-v24.x'
  $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match 'node-v24\.[0-9.]+-x64\.msi' } | Select-Object -First 1
  $hash, $file = ($line.Trim() -split '\s+')
  $msi = Join-Path $env:TEMP $file
  Write-Host "Downloading $file"
  Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $msi
  $actual = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $hash.ToLower()) { Write-Host 'CHECKSUM MISMATCH - aborting'; Stop-Transcript; Read-Host 'Press Enter'; exit 1 }
  Write-Host 'Checksum OK. Running installer (approve the Windows admin prompt)...'
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /passive /norestart" -Verb RunAs -Wait -PassThru
  Write-Host "Installer exit code: $($p.ExitCode)"
  $env:Path = "$env:ProgramFiles\nodejs;" + [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $major = Get-NodeMajor
}

Write-Host "node: $(& node -v)   npm: $(& npm.cmd -v)"
if ($major -lt 24) { Write-Host 'SETUP FAILED: Node.js 24 not available'; Stop-Transcript; Read-Host 'Press Enter'; exit 1 }

Write-Host 'Installing project packages and the Even Hub simulator...'
& npm.cmd install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Write-Host 'SETUP FAILED: npm install'; Stop-Transcript; Read-Host 'Press Enter'; exit 1 }

Write-Host "Simulator version: $(& npx.cmd evenhub-simulator --version)"
& npm.cmd test
Write-Host ''
Write-Host 'SETUP OK. Next: double-click windows\2-play-in-simulator.bat'
Stop-Transcript | Out-Null
Read-Host 'Press Enter to close'
