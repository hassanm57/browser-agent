#!/bin/bash

# Universal Setup Script - Auto-detects macOS vs Linux
PROJECT_ROOT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT_DIRECTORY"

OS_SYSTEM_NAME="$(uname -s)"

if [ "$OS_SYSTEM_NAME" = "Darwin" ]; then
    echo "Detected macOS environment. Running macOS setup..."
    exec "$PROJECT_ROOT_DIRECTORY/scripts/setup_mac.sh"
elif [ "$OS_SYSTEM_NAME" = "Linux" ]; then
    echo "Detected Linux environment. Running Linux setup..."
    exec "$PROJECT_ROOT_DIRECTORY/scripts/setup_ubuntu.sh"
else
    echo "Detected OS: $OS_SYSTEM_NAME"
    echo "Defaulting to Unix setup..."
    exec "$PROJECT_ROOT_DIRECTORY/scripts/setup_ubuntu.sh"
fi
