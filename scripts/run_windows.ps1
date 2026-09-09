# Locate project root directory (one level up from scripts folder)
$ScriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptsDirectory
Set-Location $ProjectRoot

$UvicornPath = Join-Path $ProjectRoot ".venv\Scripts\uvicorn.exe"
if (-not (Test-Path $UvicornPath)) {
    Write-Host "ERROR: Virtual environment (.venv) not found at $ProjectRoot\.venv" -ForegroundColor Red
    Write-Host "Please run .\scripts\setup_windows.ps1 (or scripts\setup_windows.bat) first." -ForegroundColor Red
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Starting Browser Agent (Backend + Frontend)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Working directory: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

Write-Host "[1/2] Launching FastAPI Backend on http://localhost:8000..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$ProjectRoot`" && `"$UvicornPath`" app.backend.main:app --host 0.0.0.0 --port 8000 --reload"

Start-Sleep -Seconds 2

Write-Host "[2/2] Launching Vite Frontend on http://localhost:5173..." -ForegroundColor Yellow
$FrontendDir = Join-Path $ProjectRoot "app\frontend"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$FrontendDir`" && npm run dev"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "    Services are running in separate terminal windows:" -ForegroundColor Green
Write-Host "    - Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "    - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "    - API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Close the terminal windows when you want to stop the servers." -ForegroundColor Gray
