$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "c:\Projects\TetherIQ\src-tauri\binaries\litellm-proxy-x86_64-pc-windows-msvc\litellm-proxy.exe"
$psi.Arguments = "--port 4000 --host 127.0.0.1 --config c:\Projects\TetherIQ\sidecar\dev_config.yaml"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false

$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 5

$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()

Write-Host "=== PROCESS EXIT CODE ==="
Write-Host $p.ExitCode
Write-Host "=== STDOUT ==="
Write-Host $stdout
Write-Host "=== STDERR ==="
Write-Host $stderr

if (!$p.HasExited) {
    Stop-Process -Id $p.Id -Force
}
