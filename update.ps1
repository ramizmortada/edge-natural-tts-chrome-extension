# ReadFlow 1-Click Updater
$ErrorActionPreference = 'Stop'

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "            ReadFlow - 1-Click Updater" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$dir = $PSScriptRoot
$manifestPath = Join-Path $dir 'manifest.json'

if (-not (Test-Path $manifestPath)) {
    Write-Host "[ERROR] manifest.json not found in this directory!" -ForegroundColor Red
    Write-Host "Please run update.bat from inside your ReadFlow folder." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    $localManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $localVersion = $localManifest.version
} catch {
    Write-Host "[ERROR] Could not read local manifest.json" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Current local version: v$localVersion" -ForegroundColor White
Write-Host "Checking GitHub for updates..." -ForegroundColor DarkGray

try {
    $repo = "ramizmortada/readflow"
    $apiUrl = "https://api.github.com/repos/$repo/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'ReadFlow-Updater' }
} catch {
    Write-Host "[ERROR] Failed to reach GitHub Releases API: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$remoteTag = $release.tag_name
$remoteVersion = $remoteTag.TrimStart('v')
Write-Host "Latest GitHub version: v$remoteVersion" -ForegroundColor White

function Test-IsNewer($remote, $current) {
    try {
        $vR = [System.Version]$remote
        $vC = [System.Version]$current
        return ($vR -gt $vC)
    } catch {
        return ($remote -ne $current)
    }
}

$isNewer = Test-IsNewer $remoteVersion $localVersion

if (-not $isNewer) {
    Write-Host "ReadFlow is already up to date!" -ForegroundColor Green
    Write-Host ""
    $choice = Read-Host "Do you want to re-download and force reinstall anyway? (y/N)"
    if ($choice -notmatch '^[Yy]') {
        Write-Host "No changes made." -ForegroundColor Gray
        exit 0
    }
} else {
    Write-Host "A new update (v$remoteVersion) is available!" -ForegroundColor Green
    Write-Host ""
}

$asset = $release.assets | Where-Object { $_.name -eq 'readflow.zip' } | Select-Object -First 1
if (-not $asset) {
    Write-Host "[ERROR] readflow.zip asset not found in latest GitHub release!" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$downloadUrl = $asset.browser_download_url
$tempZip = Join-Path ([System.IO.Path]::GetTempPath()) ("readflow_update_" + [System.Guid]::NewGuid().ToString('N') + ".zip")

try {
    Write-Host "Downloading readflow.zip..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing

    Write-Host "Extracting update files..." -ForegroundColor Cyan
    Expand-Archive -Path $tempZip -DestinationPath $dir -Force
} catch {
    Write-Host "[ERROR] Failed to download or extract update: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
} finally {
    if (Test-Path $tempZip) {
        Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    }
}

# Re-register native host registry paths in case the folder was moved or updated
$hostBat = Join-Path $dir 'native-host\tts-host.bat'
$hostManifest = Join-Path $dir 'native-host\com.edgetts.host.json'

if ((Test-Path $hostBat) -and (Test-Path $hostManifest)) {
    try {
        Write-Host "Refreshing native host configuration..." -ForegroundColor DarkGray
        $manifestObj = @{
            name = 'com.edgetts.host'
            description = 'ReadFlow Edge TTS Host'
            path = $hostBat
            type = 'stdio'
            allowed_origins = @('chrome-extension://doamgjjamfoodahblejajjaolbklnbfo/')
        }
        $manifestObj | ConvertTo-Json -Depth 5 | Set-Content -Path $hostManifest
        New-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.edgetts.host' -Force | Out-Null
        Set-ItemProperty -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.edgetts.host' -Name '(Default)' -Value $hostManifest
        New-Item -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edgetts.host' -Force | Out-Null
        Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edgetts.host' -Name '(Default)' -Value $hostManifest
    } catch {
        Write-Host "[WARNING] Could not refresh native host registry key: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "    ReadFlow successfully updated to v$remoteVersion!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""
Write-Host "FINAL STEP IN YOUR BROWSER:" -ForegroundColor Yellow
Write-Host "  1. Open chrome://extensions/ (or edge://extensions/)" -ForegroundColor White
Write-Host "  2. Click the circular Reload icon on the ReadFlow card." -ForegroundColor White
Write-Host ""
Write-Host "Your library, bookmarks, and settings have been preserved." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to finish"
