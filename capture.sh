#!/usr/bin/env bash
# Capture Ashes of Aether preview at CAPTURE_URL into CAPTURE_DIR.
# Produces final-desktop.png (1440x900) and final-mobile.png (390x844).
# Exit 75 = temporary navigation/browser infrastructure failure (retryable).
# Exit 1  = script or rendering defect.
# Never touches the app server; all output goes to CAPTURE_DIR (outside the repo).
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${CAPTURE_URL:-}" ]]; then echo "Set CAPTURE_URL." >&2; exit 1; fi
if [[ -z "${CAPTURE_DIR:-}" ]]; then echo "Set CAPTURE_DIR." >&2; exit 1; fi
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node --version

HELPER="${RUNNER_TEMP:-/tmp}/ashes-capture-helper.mjs"
/usr/bin/time -p tee "$HELPER" > /dev/null <<'NODEJS'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const runtime = join(process.env.HOME || '/root', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') {
  try { process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim() } catch {}
}
const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1) }
mkdirSync(output, { recursive: true })
const transient = (msg) => { throw Object.assign(new Error(msg), { exitCode: 75 }) }
let browser
try {
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })
  } catch (e) { console.error('browser launch failed:', e?.message || e); transient(e?.message || 'browser launch failed') }
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page
    try { page = await browser.newPage({ viewport: { width, height } }) }
    catch (e) { console.error(`newPage ${name} failed:`, e?.message || e); transient(e?.message || 'newPage failed') }
    page.setDefaultTimeout(30000)
    page.on('pageerror', (e) => console.error(`pageerror ${name}:`, e?.message || e))
    let response
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    } catch (e) { console.error(`goto ${name} failed:`, e?.message || e); await page.close().catch(() => {}); transient(e?.message || 'navigation failed') }
    const status = response?.status() ?? 0
    if (!response || !response.ok()) {
      const retryable = !response || [408, 429, 500, 502, 503, 504].includes(status)
      console.error(`HTTP ${status} loading ${url} (${name})`)
      await page.close().catch(() => {})
      process.exit(retryable ? 75 : 1)
    }
    try {
      await page.locator('body').waitFor({ state: 'visible', timeout: 30000 })
    } catch (e) { console.error(`body never visible (${name})`); await page.close().catch(() => {}); transient('body never visible') }
    try { await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }) }
    catch { /* fonts are best-effort */ }
    // App-rendered content: #app must shed its .loading placeholder and show the title UI
    // (fetched from /api/state). A missing render here is a defect, not infra flakiness.
    try {
      await page.waitForFunction(() => {
        const app = document.querySelector('#app')
        if (!app) return false
        if (app.querySelector('.loading')) return false
        const text = (app.innerText || '').toUpperCase()
        return text.includes('ASHES') || text.includes('NEW GAME') || text.includes('CONTINUE') || text.length > 120
      }, null, { timeout: 30000 })
    } catch (e) {
      console.error(`app content never rendered (${name})`)
      await page.close().catch(() => {})
      process.exit(1)
    }
    // Let title embers / layout settle so screenshots are deterministic.
    await page.waitForTimeout(1500)
    try {
      await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 })
    } catch (e) {
      console.error(`screenshot ${name} failed:`, e?.message || e)
      await page.close().catch(() => {})
      if (e?.name === 'TimeoutError' || !browser.isConnected()) transient(e?.message || 'screenshot failed')
      process.exit(1)
    }
    console.log(`captured final-${name}.png`)
    await page.close().catch(() => {})
  }
} catch (e) {
  console.error(e?.message || e)
  process.exitCode = e?.exitCode || 1
} finally {
  await browser?.close().catch((e) => { console.error('browser close failed:', e?.message || e); process.exitCode ||= 75 })
}
NODEJS

/usr/bin/time -p node "$HELPER"
/usr/bin/time -p python3 -c "import os,sys; d=os.environ['CAPTURE_DIR']; [open(os.path.join(d,f),'rb').read(8) for f in ['final-desktop.png','final-mobile.png']]; print('png headers ok')"
/usr/bin/time -p ls -l "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
echo "capture complete: $CAPTURE_DIR"
