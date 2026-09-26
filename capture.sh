#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the exact CAPTURE_URL.
# Output goes to CAPTURE_DIR (outside source). Leaves the app running.
# Exit 75 = temporary navigation/browser infra failure; exit 1 = script/rendering defect.
set -euo pipefail
time -p cd "$(dirname "$0")"
if [ -z "${CAPTURE_URL:-}" ] || [ -z "${CAPTURE_DIR:-}" ]; then
  echo "Set CAPTURE_URL and CAPTURE_DIR." >&2
  exit 1
fi
/usr/bin/time -p bash -c 'echo "CAPTURE_URL=$CAPTURE_URL"'
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p ls -la "$CAPTURE_DIR" || true
RUNNER="$(/usr/bin/time -p mktemp /tmp/strike-capture-XXXXXX.mjs)"
/usr/bin/time -p cat > "$RUNNER" <<'NODEJS'
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const url = process.env.CAPTURE_URL, out = process.env.CAPTURE_DIR;
if (!url || !out) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1); }
const runtime = join(process.env.HOME || '/home/runner', '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');
let launchOpts = { channel: 'chromium', headless: false, args: ['--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] };
try {
  const cfg = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'));
  if (cfg?.browser?.launchOptions) launchOpts = cfg.browser.launchOptions;
} catch {}
if (process.platform === 'linux') {
  try { process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim(); } catch {}
}
const isTransientStatus = s => !s || [408, 429, 500, 502, 503, 504].includes(s);
let browser;
try {
  browser = await chromium.launch({ ...launchOpts, timeout: 30000 }).catch(e => { throw Object.assign(e, { exitCode: 75 }); });
  for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page;
    try {
      page = await browser.newPage({ viewport: { width: w, height: h } }).catch(e => { throw Object.assign(e, { exitCode: 75 }); });
      page.setDefaultTimeout(30000);
      page.on('pageerror', e => console.error('pageerror:', e?.message));
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(e => { throw Object.assign(e, { exitCode: 75 }); });
      const status = resp?.status();
      if (!resp || !resp.ok()) {
        throw Object.assign(new Error(`HTTP ${status} loading preview`), { exitCode: isTransientStatus(status) ? 75 : 1 });
      }
      await page.locator('body').waitFor({ state: 'visible', timeout: 30000 }).catch(e => { throw Object.assign(e, { exitCode: 75 }); });
      await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
      // Wait for the game canvas + boot flag (rendering defect if never appears).
      try {
        await page.waitForSelector('canvas#game', { state: 'visible', timeout: 20000 });
      } catch (e) { throw Object.assign(new Error('canvas#game not visible'), { exitCode: 1 }); }
      try {
        await page.waitForFunction(() => !!window.__STRIKE__, null, { timeout: 20000 });
      } catch (e) { throw Object.assign(new Error('game boot flag missing'), { exitCode: 1 }); }
      await page.waitForTimeout(3500);
      const shot = join(out, `final-${name}.png`);
      await page.screenshot({ path: shot, timeout: 30000 }).catch(e => {
        if (e?.name === 'TimeoutError' || !browser.isConnected()) throw Object.assign(e, { exitCode: 75 });
        throw e;
      });
      const st = statSync(shot);
      if (!st.isFile() || st.size < 15000) throw Object.assign(new Error(`${name} screenshot too small (${st.size}b), render failed`), { exitCode: 1 });
      console.log(`captured ${name}: ${st.size} bytes -> ${shot}`);
      await page.close();
    } catch (e) {
      try { await page?.close(); } catch {}
      throw e;
    }
  }
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = e?.exitCode || 1;
} finally {
  try { await browser?.close(); } catch (e) { console.error(e?.message); process.exitCode ||= 75; }
}
NODEJS
/usr/bin/time -p node --version
/usr/bin/time -p node "$RUNNER"
RC=$?
/usr/bin/time -p rm -f "$RUNNER"
/usr/bin/time -p ls -lh "$CAPTURE_DIR"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p bash -c 'du -b "$CAPTURE_DIR"/final-*.png'
exit "$RC"
