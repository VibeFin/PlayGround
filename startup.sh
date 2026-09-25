#!/usr/bin/env bash
# Once-per-worker prerequisites for Summer Cycle (the controller runs this
# before start.sh; start.sh stays self-sufficient if it is skipped).
set -euo pipefail
cd "$(dirname "$0")"

# pnpm via corepack (repo is pnpm-only; default-start.mjs's npm path is broken here).
/usr/bin/time -p corepack enable
/usr/bin/time -p corepack prepare pnpm@10.18.3 --activate
/usr/bin/time -p pnpm --version
/usr/bin/time -p node --version

# Playwright chromium for capture.sh (repo devDependency); install only if the
# executable Playwright would use is missing.
/usr/bin/time -p node --input-type=module -e "
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const exe = chromium.executablePath();
if (!existsSync(exe)) { console.log('[startup] installing chromium: ' + exe); process.exit(2); }
console.log('[startup] chromium present: ' + exe);
"
if [[ $? == 2 ]]; then
  /usr/bin/time -p pnpm exec playwright install chromium
fi
