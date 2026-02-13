#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Keep Me Honest (Electron) — Dev Build ==="

# 1. Install deps if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# 2. Generate tray icons if missing
if [ ! -f assets/trayTemplate.png ]; then
  echo "Generating tray icons..."
  node scripts/create-icons.js
fi

# 3. Compile TypeScript
echo "Compiling TypeScript..."
npx tsc

echo "Build complete! Run with: npx electron ."
