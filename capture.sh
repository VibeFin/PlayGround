#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
/usr/bin/time -p test -n "${CAPTURE_URL:-}" || { echo 'Set CAPTURE_URL.' >&2; exit 1; }
/usr/bin/time -p test -n "${CAPTURE_DIR:-}" || { echo 'Set CAPTURE_DIR.' >&2; exit 1; }
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p /usr/bin/printf 'capturing URL=%s into %s\n' "$CAPTURE_URL" "$CAPTURE_DIR"
/usr/bin/time -p node <<'NODE'
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR;
if (!url || !output) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1); }
mkdirSync(output, { recursive: true });

const runtime = join(process.env.HOME || '/home/runner', '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');
let config;
try {
  config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'));
} catch (error) {
  console.error('Missing Playwright runtime config:', error.message);
  process.exit(1);
}
if (process.platform === 'linux') {
  try {
    process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim();
  } catch (error) {
    console.error('Missing Xvfb display:', error.message);
    process.exit(75);
  }
}

const transient = (error) => { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { exitCode: 75 }); };
let browser;
try {
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient);
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }).catch(transient);
    try {
      page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => console.error(`pageerror (${name}):`, error?.message || error));
      const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
      if (!response?.ok()) {
        const status = response?.status();
        const isTransient = !response || [408, 429, 500, 502, 503, 504].includes(status);
        throw Object.assign(new Error(`HTTP ${status ?? 'no-response'} loading preview`), { exitCode: isTransient ? 75 : 1 });
      }
      try {
        await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
      } catch (error) {
        throw Object.assign(new Error(`Rendered content not visible (${name}): ${error.message}`), { exitCode: 1 });
      }
      try {
        await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 });
      } catch { /* fonts are best-effort */ }
      await page.waitForTimeout(1000);
      const shotPath = join(output, `final-${name}.png`);
      await page.screenshot({ path: shotPath, timeout: 30000 }).catch((error) => {
        if (error?.name === 'TimeoutError' || !browser.isConnected()) transient(error);
        throw error;
      });
      const size = statSync(shotPath).size;
      console.log(`Capture ${name}: wrote ${shotPath} (${size} bytes)`);
      if (size < 1024) throw Object.assign(new Error(`Screenshot too small (${name}): ${size} bytes`), { exitCode: 1 });
    } finally {
      await page.close().catch(() => {});
    }
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
} finally {
  await browser?.close().catch((error) => { console.error(error?.message || error); process.exitCode ||= 75; });
}
NODE
/usr/bin/time -p ls -l "$CAPTURE_DIR"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
