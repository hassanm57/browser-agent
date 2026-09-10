#!/bin/bash

# Universal Run Script - Auto-detects macOS vs Linux
PROJECT_ROOT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT_DIRECTORY"

OS_SYSTEM_NAME="$(uname -s)"

if [ "$OS_SYSTEM_NAME" = "Darwin" ]; then
    exec "$PROJECT_ROOT_DIRECTORY/scripts/run_mac.sh"
elif [ "$OS_SYSTEM_NAME" = "Linux" ]; then
    exec "$PROJECT_ROOT_DIRECTORY/scripts/run_ubuntu.sh"
else
    exec "$PROJECT_ROOT_DIRECTORY/scripts/run_ubuntu.sh"
fi
