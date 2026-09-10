@echo off
setlocal

:: Move to project root directory (one level up from scripts folder)
cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"

:: Ensure virtual environment exists
if not exist ".venv\Scripts\python.exe" (
    echo ERROR: Virtual environment (.venv) not found at %PROJECT_ROOT%\.venv
    echo Please run setup.bat (or scripts\setup_windows.bat) first to set up the project.
    pause
    exit /b 1
)

echo ============================================================
echo     Starting Browser Agent (Backend + Frontend)
echo ============================================================
echo Working directory: %PROJECT_ROOT%
echo.

:: Launch FastAPI backend in a separate terminal window
echo [1/2] Starting FastAPI Backend on http://localhost:8000...
start "Browser Agent - FastAPI Backend" /d "%PROJECT_ROOT%" cmd /k ".venv\Scripts\python.exe -m uvicorn app.backend.main:app --host 0.0.0.0 --port 8000 --reload"

:: Give backend a second to start
timeout /t 2 /nobreak >nul

:: Launch Vite frontend in a separate terminal window
echo [2/2] Starting Vite Frontend on http://localhost:5173...
start "Browser Agent - Vite Frontend" /d "%PROJECT_ROOT%\app\frontend" cmd /k "npm run dev"

echo.
echo ============================================================
echo     Services are launching in separate windows:
echo     - Backend:  http://localhost:8000
echo     - Frontend: http://localhost:5173
echo     - API Docs: http://localhost:8000/docs
echo ============================================================
echo You can close those windows when you want to stop the servers.
echo.
pause
