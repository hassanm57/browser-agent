#!/bin/bash

# Stop immediately if any command fails
set -e

echo "============================================================"
echo "    Browser Agent - Ubuntu Automated Setup Script"
echo "============================================================"
echo ""

# Locate project root directory (one level up from scripts folder)
SCRIPTS_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT_DIRECTORY="$(cd "$SCRIPTS_DIRECTORY/.." && pwd)"
cd "$PROJECT_ROOT_DIRECTORY"

echo "Project root: $PROJECT_ROOT_DIRECTORY"
echo ""

# Step 1: Check if Python 3 is installed
echo "[Step 1/6] Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 could not be found."
    if command -v apt &> /dev/null; then
        echo "Install Python 3 by running: sudo apt update && sudo apt install -y python3 python3-pip python3-venv"
    elif command -v dnf &> /dev/null; then
        echo "Install Python 3 by running: sudo dnf install -y python3 python3-pip"
    elif command -v pacman &> /dev/null; then
        echo "Install Python 3 by running: sudo pacman -S python python-pip python-virtualenv"
    else
        echo "Please install Python 3.10+ using your system package manager."
    fi
    exit 1
fi

PYTHON_VERSION_STRING=$(python3 --version)
echo "Found $PYTHON_VERSION_STRING"

# Check if python3-venv package is installed (needed on Ubuntu/Debian for virtual environments)
if ! python3 -m venv --help &> /dev/null; then
    echo "ERROR: python3-venv is missing."
    if command -v apt &> /dev/null; then
        echo "Please install virtual environment support: sudo apt update && sudo apt install -y python3-venv"
    elif command -v dnf &> /dev/null; then
        echo "Please install virtual environment support: sudo dnf install -y python3-virtualenv"
    elif command -v pacman &> /dev/null; then
        echo "Please install virtual environment support: sudo pacman -S python-virtualenv"
    fi
    exit 1
fi

# Step 2: Check if Node.js and npm are installed
echo ""
echo "[Step 2/6] Checking Node.js and npm installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js could not be found."
    echo "Please install Node.js (version 18 or 20+) by running:"
    echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "    sudo apt install -y nodejs"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm could not be found."
    echo "Please install npm by running: sudo apt install -y npm"
    exit 1
fi

NODE_VERSION_STRING=$(node --version)
NPM_VERSION_STRING=$(npm --version)
echo "Found Node.js $NODE_VERSION_STRING and npm $NPM_VERSION_STRING"

# Step 3: Check for Google Chrome or Chromium
echo ""
echo "[Step 3/6] Checking for Google Chrome or Chromium..."
if command -v google-chrome &> /dev/null; then
    echo "Found Google Chrome: $(google-chrome --version)"
elif command -v chromium-browser &> /dev/null; then
    echo "Found Chromium: $(chromium-browser --version)"
elif command -v chromium &> /dev/null; then
    echo "Found Chromium: $(chromium --version)"
else
    echo "Notice: Google Chrome was not detected in your PATH."
    echo "For full scraping capabilities (USE_REAL_CHROME=true), install Chrome:"
    echo "    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
    echo "    sudo apt install -y ./google-chrome-stable_current_amd64.deb"
    echo "    rm ./google-chrome-stable_current_amd64.deb"
fi

# Step 4: Setup Environment Configuration file (.env)
echo ""
echo "[Step 4/6] Setting up environment variables..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "Creating .env file from .env.example..."
        cp .env.example .env
        echo "Created .env with default settings."
    else
        echo "Creating default .env file..."
        cat << 'ENV_EOF' > .env
VLLM_BASE_URL=http://10.13.12.121:8000/v1
VLLM_API_KEY=EMPTY
LLM_MODEL=qwen3-14b
HEADLESS=false
USE_REAL_CHROME=true
ANONYMIZED_TELEMETRY=false
ENV_EOF
    fi
else
    echo ".env file already exists. Skipping."
fi

# Step 5: Setup Python Virtual Environment and Install Dependencies
echo ""
echo "[Step 5/6] Setting up Python virtual environment (.venv)..."
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment at .venv..."
    python3 -m venv .venv
else
    echo "Existing .venv directory found."
fi

echo "Upgrading pip, setuptools, and wheel..."
.venv/bin/python -m pip install --upgrade pip setuptools wheel

echo "Installing Python dependencies from requirements.txt..."
.venv/bin/python -m pip install -r requirements.txt

echo "Initializing SQLite database..."
.venv/bin/python -c "from app.backend.database import initialize_database; initialize_database(); print('Database initialized successfully.')"

# Step 6: Install Frontend Dependencies
echo ""
echo "[Step 6/6] Installing frontend dependencies..."
cd "$PROJECT_ROOT_DIRECTORY/app/frontend"
npm install
cd "$PROJECT_ROOT_DIRECTORY"

# Make run scripts executable
if [ -f "$SCRIPTS_DIRECTORY/run_ubuntu.sh" ]; then
    chmod +x "$SCRIPTS_DIRECTORY/run_ubuntu.sh"
fi
if [ -f "$PROJECT_ROOT_DIRECTORY/run.sh" ]; then
    chmod +x "$PROJECT_ROOT_DIRECTORY/run.sh"
fi

echo ""
echo "============================================================"
echo "    Setup Completed Successfully!"
echo "============================================================"
echo ""
echo "To start both backend and frontend together, run:"
echo "    ./scripts/run_ubuntu.sh"
echo ""
echo "Or start them manually in two terminals:"
echo "    Terminal 1 (Backend):  .venv/bin/uvicorn app.backend.main:app --host 0.0.0.0 --port 8000 --reload"
echo "    Terminal 2 (Frontend): cd app/frontend && npm run dev"
echo ""
