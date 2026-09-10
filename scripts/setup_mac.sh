#!/bin/bash

# Stop immediately if any command fails
set -e

echo "============================================================"
echo "    Browser Agent - macOS Automated Setup Script"
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
    echo "Please install Python 3.11 or 3.12 using Homebrew:"
    echo "    brew install python@3.12"
    exit 1
fi

PYTHON_VERSION_STRING=$(python3 --version)
echo "Found $PYTHON_VERSION_STRING"

# Step 2: Check if Node.js and npm are installed
echo ""
echo "[Step 2/6] Checking Node.js and npm installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js could not be found."
    echo "Please install Node.js using Homebrew:"
    echo "    brew install node"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm could not be found."
    echo "Please install npm using Homebrew: brew install node"
    exit 1
fi

NODE_VERSION_STRING=$(node --version)
NPM_VERSION_STRING=$(npm --version)
echo "Found Node.js $NODE_VERSION_STRING and npm $NPM_VERSION_STRING"

# Step 3: Check for Google Chrome
echo ""
echo "[Step 3/6] Checking for Google Chrome..."
if [ -d "/Applications/Google Chrome.app" ]; then
    echo "Found Google Chrome installed in /Applications."
elif [ -d "$HOME/Applications/Google Chrome.app" ]; then
    echo "Found Google Chrome installed in user Applications."
else
    echo "Notice: Google Chrome was not detected in /Applications."
    echo "For full scraping capabilities (USE_REAL_CHROME=true), install Chrome from:"
    echo "    https://www.google.com/chrome/"
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

echo "Upgrading pip..."
.venv/bin/python -m pip install --upgrade pip

echo "Installing Python dependencies from requirements.txt..."
.venv/bin/pip install -r requirements.txt

echo "Initializing SQLite database..."
.venv/bin/python -c "from app.backend.database import initialize_database; initialize_database(); print('Database initialized successfully.')"

# Step 6: Install Frontend Dependencies
echo ""
echo "[Step 6/6] Installing frontend dependencies..."
cd "$PROJECT_ROOT_DIRECTORY/app/frontend"
npm install
cd "$PROJECT_ROOT_DIRECTORY"

# Make scripts executable
chmod +x "$SCRIPTS_DIRECTORY/setup_mac.sh"

echo ""
echo "============================================================"
echo "    macOS Setup Completed Successfully!"
echo "============================================================"
echo ""
echo "To start both backend and frontend together, run:"
echo "    ./scripts/run_mac.sh"
echo "    or: ./run.sh"
echo ""
