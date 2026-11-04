#!/bin/sh
# Run (or double-click and choose "Run in Terminal") to install claude-sync from this
# folder, or to update it
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/setup.mjs
else
  echo "claude-sync needs Node.js 18 or later: https://nodejs.org/ (or your package manager)"
fi
if [ -t 0 ]; then
  printf "\nPress Enter to close. "
  read -r _
fi
