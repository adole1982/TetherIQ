Get-Process -Name "litellm-proxy" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$exe = "c:\Projects\TetherIQ\src-tauri\binaries\litellm-proxy-x86_64-pc-windows-msvc\litellm-proxy.exe"
$cfg = "c:\Projects\TetherIQ\sidecar\dev_config.yaml"

$p = Start-Process -FilePath $exe -ArgumentList "--port 4000 --host 127.0.0.1 --config $cfg" -RedirectStandardOutput "c:\Projects\TetherIQ\sidecar\out.log" -RedirectStandardError "c:\Projects\TetherIQ\sidecar\err.log" -PassThru

Write-Host "Started process ID: $($p.Id)"
Start-Sleep -Seconds 5

Write-Host "Has exited: $($p.HasExited)"
if ($p.HasExited) {
    Write-Host "Exit Code: $($p.ExitCode)"
}

if (Test-Path "c:\Projects\TetherIQ\sidecar\out.log") {
    Write-Host "=== OUT.LOG ==="
    Get-Content "c:\Projects\TetherIQ\sidecar\out.log"
}

if (Test-Path "c:\Projects\TetherIQ\sidecar\err.log") {
    Write-Host "=== ERR.LOG ==="
    Get-Content "c:\Projects\TetherIQ\sidecar\err.log"
}
