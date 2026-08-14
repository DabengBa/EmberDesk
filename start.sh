#!/usr/bin/env bash

# Make sure pwd is the directory of the script
cd "$(dirname "$0")"

if ! command -v pnpm &> /dev/null; then
    echo -e "\033[0;31mpnpm 12.0.0-rc.5 could not be found in PATH.\033[0m"
    exit 1
fi

echo "Installing Node Modules..."
export NODE_ENV=production
pnpm install --prod --frozen-lockfile --ignore-scripts

echo "Entering EmberDesk..."
node "server.js" "$@"
