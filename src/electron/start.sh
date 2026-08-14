#!/usr/bin/env bash

# Make sure pwd is the directory of the script
cd "$(dirname "$0")"

echo "Assuming Node.js and pnpm are already installed. If you haven't installed them already, do so now"
echo "Installing Electron Wrapper's dependencies..."
pnpm install --prod --frozen-lockfile --no-ignore-scripts --reporter=silent

echo "Starting Electron Wrapper..."
pnpm run start -- "$@"
