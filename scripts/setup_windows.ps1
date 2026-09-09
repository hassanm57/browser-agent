$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Browser Agent - Windows PowerShell Setup Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Locate project root directory (one level up from scripts folder)
$ScriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptsDirectory
Set-Location $ProjectRoot

Write-Host "Project root: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

# Step 1: Check Python
Write-Host "[Step 1/6] Checking Python installation..." -ForegroundColor Yellow
$PythonCommand = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCommand = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCommand = "py"
} else {
    Write-Host "ERROR: Python is not found." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from https://www.python.org/downloads/ and check 'Add to PATH'." -ForegroundColor Red
    exit 1
}

& $PythonCommand --version

# Step 2: Check Node.js and npm
Write-Host ""
Write-Host "[Step 2/6] Checking Node.js and npm installation..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not found." -ForegroundColor Red
    Write-Host "Please install Node.js (version 18 or 20+) from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm is not found." -ForegroundColor Red
    exit 1
}

node --version
npm --version

# Step 3: Check Google Chrome
Write-Host ""
Write-Host "[Step 3/6] Checking for Google Chrome..." -ForegroundColor Yellow
$ChromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$ChromeFound = $false
foreach ($Path in $ChromePaths) {
    if (Test-Path $Path) {
        $ChromeFound = $true
        Write-Host "Found Google Chrome at: $Path" -ForegroundColor Green
        break
    }
}
if (-not $ChromeFound) {
    Write-Host "Notice: Google Chrome was not found in default locations." -ForegroundColor DarkYellow
    Write-Host "For real-browser scraping, install Chrome from https://www.google.com/chrome/" -ForegroundColor DarkYellow
}

# Step 4: Environment Variables (.env)
Write-Host ""
Write-Host "[Step 4/6] Setting up environment variables..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "Copying .env.example to .env..." -ForegroundColor Green
        Copy-Item ".env.example" ".env"
    } else {
        Write-Host "Generating default .env file..." -ForegroundColor Green
        @"
VLLM_BASE_URL=http://10.13.12.121:8000/v1
VLLM_API_KEY=EMPTY
LLM_MODEL=qwen3-14b
HEADLESS=false
USE_REAL_CHROME=true
ANONYMIZED_TELEMETRY=false
"@ | Out-File -FilePath ".env" -Encoding utf8
    }
} else {
    Write-Host ".env already exists. Skipping." -ForegroundColor Gray
}

# Step 5: Python Virtual Environment (.venv)
Write-Host ""
Write-Host "[Step 5/6] Setting up Python virtual environment (.venv)..." -ForegroundColor Yellow
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment at .venv..." -ForegroundColor Green
    & $PythonCommand -m venv .venv
} else {
    Write-Host "Existing .venv directory found." -ForegroundColor Gray
}

$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$VenvPip = Join-Path $ProjectRoot ".venv\Scripts\pip.exe"

Write-Host "Upgrading pip..." -ForegroundColor Green
& $VenvPython -m pip install --upgrade pip

Write-Host "Installing requirements from requirements.txt..." -ForegroundColor Green
& $VenvPip install -r requirements.txt

Write-Host "Initializing SQLite database..." -ForegroundColor Green
& $VenvPython -c "from app.backend.database import initialize_database; initialize_database(); print('Database initialized successfully.')"

# Step 6: Frontend Dependencies
Write-Host ""
Write-Host "[Step 6/6] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $ProjectRoot "app\frontend")
npm install
Set-Location $ProjectRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "    Setup Completed Successfully!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start both backend and frontend together, run:" -ForegroundColor Cyan
Write-Host "    .\scripts\run_windows.ps1   (or scripts\run_windows.bat)" -ForegroundColor White
Write-Host ""
