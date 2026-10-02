#!/usr/bin/env bash
set -euo pipefail
/usr/bin/time -p bash -c 'echo "capture init"'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
/usr/bin/time -p bash -c "echo \"script dir $SCRIPT_DIR\""
if [ -z "${CAPTURE_URL:-}" ] || [ -z "${CAPTURE_DIR:-}" ]; then
  /usr/bin/time -p bash -c 'echo "Set CAPTURE_URL and CAPTURE_DIR." >&2'
  exit 1
fi
/usr/bin/time -p bash -c "echo \"URL=$CAPTURE_URL DIR=$CAPTURE_DIR\""
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p bash -c "ls -la \"$CAPTURE_DIR\" || true"
RUNNER_TMP="${RUNNER_TEMP:-/tmp}"
/usr/bin/time -p mkdir -p "$RUNNER_TMP"
CAPTURE_JS="$RUNNER_TMP/q3m-capture-$$.mjs"
/usr/bin/time -p bash -c "echo \"writing helper $CAPTURE_JS\""
cat > "$CAPTURE_JS" <<'NODEJS'
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const home = process.env.HOME || '/home/runner';
const runtime = join(home, '.local/share/omgithub-playwright');
const req = createRequire(join(runtime, 'wk.mjs'));
let chromium;
try { chromium = req('playwright').chromium; } catch(e){ console.error('playwright load failed: '+e.message); process.exit(1); }
const cfgPath = join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json');
let config = { browser: { launchOptions: { headless: true } } };
try { config = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch {}
if (process.platform === 'linux') {
  try { process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim(); } catch {}
}
const url = process.env.CAPTURE_URL, output = process.env.CAPTURE_DIR;
if (!url || !output) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1); }
mkdirSync(output, { recursive: true });
const transient = (err) => { console.error('TRANSIENT: ' + (err && err.message)); process.exit(75); };
let browser;
try {
  browser = await chromium.launch({ ...(config.browser?.launchOptions || {}), timeout: 30000 }).catch(transient);
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page;
    try { page = await browser.newPage({ viewport: { width, height } }); }
    catch (e) { transient(e); }
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => console.error('pageerror: ' + e.message));
    let response;
    try { response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }); }
    catch (e) { console.error(e); process.exit(75); }
    if (!response) { console.error('no response loading preview'); process.exit(75); }
    const status = response.status();
    console.log(`Capture ${name}: HTTP ${status}`);
    if (!response.ok()) {
      if (!response || [408,429,500,502,503,504].includes(status)) { console.error(`HTTP ${status} transient`); process.exit(75); }
      console.error(`HTTP ${status} defect`); process.exit(1);
    }
    try {
      await page.locator(process.env.CAPTURE_READY_SELECTOR || 'body').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => document.fonts ? document.fonts.status === 'loaded' : true, null, { timeout: 15000 }).catch(()=>{});
    } catch (e) { console.error(e); process.exit(75); }
    // auto-start: click PLAY if present (exactly one)
    try {
      const btn = page.locator('#playBtn');
      if (await btn.count() > 0 && await btn.first().isVisible()) {
        await btn.first().click({ timeout: 3000 });
        console.log(`Capture ${name}: auto-start clicked #playBtn`);
      } else {
        console.log(`Capture ${name}: auto-start not-found`);
      }
    } catch (e) { console.log(`Capture ${name}: auto-start skip ${e.message}`); }
    try { await page.waitForTimeout(1800); } catch (e) { transient(e); }
    // verify rendered content: canvas non-blank
    const rendered = await page.evaluate(() => {
      const c = document.querySelector('canvas#game');
      if (!c) return { ok: false, reason: 'no-canvas' };
      const r = c.getBoundingClientRect();
      return { ok: r.width > 50 && r.height > 50, w: r.width, h: r.height };
    }).catch((e) => ({ ok: false, reason: 'eval-fail' }));
    console.log(`Capture ${name}: rendered ${JSON.stringify(rendered)}`);
    if (!rendered.ok) { console.error('rendering defect: canvas missing/small'); process.exit(1); }
    try {
      await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 });
      console.log(`Capture ${name}: wrote final-${name}.png`);
    } catch (e) {
      if (e.name === 'TimeoutError' || !browser.isConnected()) transient(e);
      console.error(e); process.exit(1);
    }
    await page.close().catch(transient);
  }
} catch (e) {
  console.error(e);
  if (process.exitCode && process.exitCode !== 0) throw e;
  process.exit(e.exitCode || 1);
} finally {
  try { await browser?.close(); } catch (e) { console.error(e); process.exitCode ||= 75; }
}
NODEJS
/usr/bin/time -p bash -c "ls -la \"$CAPTURE_JS\""
/usr/bin/time -p node "$CAPTURE_JS"
STATUS=$?
/usr/bin/time -p bash -c "echo \"capture exit $STATUS\"; ls -la \"$CAPTURE_DIR\""
/usr/bin/time -p rm -f "$CAPTURE_JS"
exit $STATUS
