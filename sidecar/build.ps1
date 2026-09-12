# TetherMesh — LiteLLM Sidecar Build Script (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File sidecar/build.ps1
#
# Prerequisites: Python 3.11+ must be on PATH
# Output: src-tauri/binaries/litellm-proxy-x86_64-pc-windows-msvc/

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$VenvDir = Join-Path $ScriptDir ".venv"
$TauriTarget = "x86_64-pc-windows-msvc"
$OutputDir = [System.IO.Path]::Combine($ProjectRoot, "src-tauri", "binaries", "litellm-proxy-$TauriTarget")

Write-Host ""
Write-Host "=== TetherMesh LiteLLM Sidecar Builder ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create Python virtual environment
if (-not (Test-Path $VenvDir)) {
    Write-Host "[1/5] Creating Python virtual environment in $VenvDir..." -ForegroundColor Yellow
    python -m venv $VenvDir
} else {
    Write-Host "[1/5] Virtual environment already exists." -ForegroundColor Green
}

# Python executable in venv
$VenvPython = [System.IO.Path]::Combine($VenvDir, "Scripts", "python.exe")
$VenvPip = [System.IO.Path]::Combine($VenvDir, "Scripts", "pip.exe")
$VenvPyInstaller = [System.IO.Path]::Combine($VenvDir, "Scripts", "pyinstaller.exe")

# Step 2: Install dependencies (with strict TLS certificate verification)
Write-Host "[2/5] Installing pinned dependencies with strict TLS verification..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $ScriptDir "requirements.txt")

# Step 3: Run PyInstaller
Write-Host "[3/5] Building sidecar with PyInstaller (--onedir)..." -ForegroundColor Yellow
Push-Location $ScriptDir
try {
    & $VenvPyInstaller --clean --noconfirm litellm-proxy.spec
} finally {
    Pop-Location
}

# Step 4: Copy to Tauri binaries directory
Write-Host "[4/5] Copying output to Tauri binaries directory..." -ForegroundColor Yellow
$DistDir = [System.IO.Path]::Combine($ScriptDir, "dist", "litellm-proxy")

if (-not (Test-Path $DistDir)) {
    Write-Error "Build failed: dist/litellm-proxy directory not found"
    exit 1
}

# Ensure parent directory exists
$BinariesParent = [System.IO.Path]::Combine($ProjectRoot, "src-tauri", "binaries")
if (-not (Test-Path $BinariesParent)) {
    New-Item -ItemType Directory -Path $BinariesParent -Force | Out-Null
}

# Clean previous output
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}

# Copy entire onedir distribution
Copy-Item -Recurse $DistDir $OutputDir

# Verify the executable exists
$ExePath = [System.IO.Path]::Combine($OutputDir, "litellm-proxy.exe")
if (-not (Test-Path $ExePath)) {
    Write-Error "Build verification failed: litellm-proxy.exe not found in output"
    exit 1
}

# Copy direct externalBin executable and _internal for Tauri packaging
$TauriExe = [System.IO.Path]::Combine($BinariesParent, "litellm-proxy-$TauriTarget.exe")
Copy-Item $ExePath $TauriExe -Force
$DistInternal = [System.IO.Path]::Combine($OutputDir, "_internal")
if (Test-Path $DistInternal) {
    Copy-Item -Recurse $DistInternal (Join-Path $BinariesParent "_internal") -Force
}

# Step 5: Report
$SizeMB = [math]::Round((Get-ChildItem -Recurse $OutputDir | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host ""
Write-Host "[5/5] Build complete!" -ForegroundColor Green
Write-Host "  Output: $OutputDir" -ForegroundColor Gray
Write-Host "  Size:   ${SizeMB} MB" -ForegroundColor Gray
Write-Host "  Binary: $ExePath" -ForegroundColor Gray
Write-Host ""
Write-Host "The sidecar will be bundled into the Tauri app on next 'npm run tauri build'." -ForegroundColor Cyan
