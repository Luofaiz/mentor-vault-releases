$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sourcePackageJson = Join-Path $root 'package.json'
$electronRuntimeDir = Join-Path $root 'node_modules\electron\dist'
$webBuildDir = Join-Path $root 'dist'
$envFile = Join-Path $root '.env'
$outputRoot = Join-Path $root 'release'
$buildStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$portableDir = Join-Path $outputRoot "MentorVaultPortable-$buildStamp"
$appResourcesDir = Join-Path $portableDir 'resources\app'
$appElectronDir = Join-Path $appResourcesDir 'electron'
$portableExe = Join-Path $portableDir 'MentorVault.exe'
$zipPath = Join-Path $outputRoot "MentorVaultPortable-$buildStamp.zip"

if (!(Test-Path $sourcePackageJson)) {
  throw "package.json not found: $sourcePackageJson"
}

if (!(Test-Path $electronRuntimeDir)) {
  throw "Electron runtime not found: $electronRuntimeDir"
}

if (!(Test-Path $webBuildDir)) {
  throw "Web build output not found: $webBuildDir. Run npm run build first."
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $appElectronDir -Force | Out-Null

Copy-Item -Path (Join-Path $electronRuntimeDir '*') -Destination $portableDir -Recurse -Force

$defaultExe = Join-Path $portableDir 'electron.exe'
if (!(Test-Path $defaultExe)) {
  throw "electron.exe not found after copy: $defaultExe"
}

Copy-Item -Path $defaultExe -Destination $portableExe -Force

Copy-Item -Path $webBuildDir -Destination $appResourcesDir -Recurse -Force
Copy-Item -Path (Join-Path $root 'electron\main.mjs') -Destination $appElectronDir -Force
Copy-Item -Path (Join-Path $root 'electron\preload.cjs') -Destination $appElectronDir -Force

$sourcePackage = Get-Content $sourcePackageJson -Raw | ConvertFrom-Json
$updateManifestUrl = $env:UPDATE_MANIFEST_URL
if (!$updateManifestUrl -and (Test-Path $envFile)) {
  $updateLine = Get-Content $envFile | Where-Object { $_ -match '^\s*UPDATE_MANIFEST_URL\s*=' } | Select-Object -First 1
  if ($updateLine) {
    $updateManifestUrl = ($updateLine -replace '^\s*UPDATE_MANIFEST_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  }
}

$runtimePackage = [ordered]@{
  name = 'mentor-vault-portable'
  productName = 'Mentor Vault'
  version = $sourcePackage.version
  type = 'module'
  main = 'electron/main.mjs'
}
if ($updateManifestUrl) {
  $runtimePackage.updateManifestUrl = $updateManifestUrl
}

$runtimePackage | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $appResourcesDir 'package.json') -Encoding UTF8

Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $zipPath

Write-Host "Portable desktop build created:"
Write-Host "  EXE: $portableExe"
Write-Host "  ZIP: $zipPath"
