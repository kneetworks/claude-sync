#!/bin/bash
# Double-click to install claude-sync from this folder, or to update it
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/setup.mjs
else
  echo "claude-sync needs Node.js 18 or later. Opening the download page..."
  open "https://nodejs.org/"
fi
echo
read -r -p "Press Enter to close this window. " _
