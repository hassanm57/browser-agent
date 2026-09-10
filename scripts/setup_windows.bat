@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo     Browser Agent - Windows Automated Setup Script
echo ============================================================
echo.

:: Move to project root directory (one level up from scripts folder)
cd /d "%~dp0.."
echo Project root: %CD%
echo.

:: Step 1: Check Python installation
echo [Step 1/6] Checking Python installation...
set "PYTHON_COMMAND=python"
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set "PYTHON_COMMAND=py -3"
    ) else (
        echo ERROR: Python is not found in your PATH.
        echo Please install Python 3.10+ from https://www.python.org/downloads/
        echo (Make sure to check "Add Python to PATH" during installation)
        pause
        exit /b 1
    )
)

%PYTHON_COMMAND% --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python command failed. Please verify your Python installation.
    pause
    exit /b 1
)

:: Step 2: Check Node.js and npm
echo.
echo [Step 2/6] Checking Node.js and npm installation...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js was not found in your PATH.
    echo Please download and install Node.js (version 18 or 20+) from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm was not found in your PATH.
    echo Please install Node.js and npm from https://nodejs.org/
    pause
    exit /b 1
)

call node --version
call npm --version

:: Step 3: Check Google Chrome
echo.
echo [Step 3/6] Checking for Google Chrome...
set "CHROME_FOUND=0"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_FOUND=1"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_FOUND=1"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_FOUND=1"

if "%CHROME_FOUND%"=="1" (
    echo Found Google Chrome installed.
) else (
    echo Notice: Google Chrome was not detected in standard installation paths.
    echo If you want real-browser scraping (USE_REAL_CHROME=true), install Chrome from https://www.google.com/chrome/
)

:: Step 4: Environment Configuration (.env)
echo.
echo [Step 4/6] Setting up environment variables...
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env file from .env.example...
        copy /y ".env.example" ".env" >nul
        echo Created .env with default settings.
    ) else (
        echo Creating default .env file...
        (
            echo VLLM_BASE_URL=http://10.13.12.121:8000/v1
            echo VLLM_API_KEY=EMPTY
            echo LLM_MODEL=qwen3-14b
            echo HEADLESS=false
            echo USE_REAL_CHROME=true
            echo ANONYMIZED_TELEMETRY=false
        ) > ".env"
    )
) else (
    echo .env file already exists. Skipping.
)

:: Step 5: Python Virtual Environment (.venv)
echo.
echo [Step 5/6] Setting up Python virtual environment (.venv)...
if not exist ".venv" (
    echo Creating virtual environment at .venv...
    %PYTHON_COMMAND% -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create Python virtual environment.
        pause
        exit /b 1
    )
) else (
    echo Existing .venv directory found.
)

echo Upgrading pip, setuptools, and wheel inside virtual environment...
call ".venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel

echo Installing Python dependencies from requirements.txt...
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install Python dependencies.
    pause
    exit /b 1
)

echo Initializing SQLite database...
call ".venv\Scripts\python.exe" -c "from app.backend.database import initialize_database; initialize_database(); print('Database initialized successfully.')"

:: Step 6: Frontend Dependencies
echo.
echo [Step 6/6] Installing frontend dependencies...
cd "app\frontend"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install npm dependencies.
    cd /d "%~dp0.."
    pause
    exit /b 1
)
cd /d "%~dp0.."

echo.
echo ============================================================
echo     Setup Completed Successfully!
echo ============================================================
echo.
echo To start both backend and frontend together, run:
echo     scripts\run_windows.bat
echo.
echo Or start them manually in two terminals:
echo     Terminal 1: .venv\Scripts\uvicorn.exe app.backend.main:app --host 0.0.0.0 --port 8000 --reload
echo     Terminal 2: cd app\frontend && npm run dev
echo.
pause
