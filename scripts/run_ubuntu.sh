#!/bin/bash

# Locate project root directory (one level up from scripts folder)
SCRIPTS_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT_DIRECTORY="$(cd "$SCRIPTS_DIRECTORY/.." && pwd)"
cd "$PROJECT_ROOT_DIRECTORY"

# Ensure virtual environment exists
if [ ! -d ".venv" ]; then
    echo "ERROR: Virtual environment (.venv) not found at $PROJECT_ROOT_DIRECTORY/.venv"
    echo "Please run ./scripts/setup_ubuntu.sh first to set up the project."
    exit 1
fi

echo "============================================================"
echo "    Starting Browser Agent (Backend + Frontend)"
echo "============================================================"
echo "Working directory: $PROJECT_ROOT_DIRECTORY"
echo ""

# Function to stop both processes cleanly when user presses Ctrl+C
cleanup_processes() {
    echo ""
    echo "Stopping servers..."
    if [ -n "$BACKEND_PROCESS_ID" ]; then
        kill "$BACKEND_PROCESS_ID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PROCESS_ID" ]; then
        kill "$FRONTEND_PROCESS_ID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "All servers stopped."
    exit 0
}

# Trap termination signals
trap cleanup_processes SIGINT SIGTERM

# Start FastAPI backend in the background
echo "[1/2] Starting FastAPI Backend on http://localhost:8000..."
"$PROJECT_ROOT_DIRECTORY/.venv/bin/uvicorn" app.backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PROCESS_ID=$!

# Give backend a moment to bind to the port
sleep 1

# Start Vite frontend dev server in the background
echo "[2/2] Starting Vite Frontend on http://localhost:5173..."
npm run dev --prefix "$PROJECT_ROOT_DIRECTORY/app/frontend" &
FRONTEND_PROCESS_ID=$!

echo ""
echo "============================================================"
echo "    Services are now running:"
echo "    - Backend:  http://localhost:8000"
echo "    - Frontend: http://localhost:5173"
echo "    - API Docs: http://localhost:8000/docs"
echo "============================================================"
echo "Press [Ctrl+C] to stop all servers."
echo ""

# Wait for background processes to exit
wait
