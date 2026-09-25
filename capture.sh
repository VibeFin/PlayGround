#!/usr/bin/env bash
# Capture the running preview (left running afterwards): desktop + mobile
# screenshots into $CAPTURE_DIR. Exit 75 on temporary navigation/browser
# infrastructure failures, 1 on script or rendering defects.
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p test -n "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
/usr/bin/time -p test -n "${CAPTURE_DIR:?Set CAPTURE_DIR to the screenshot output directory.}"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node --input-type=module <<'NODE_EOF'
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR;
if (!url || !output) { console.error('[capture] CAPTURE_URL and CAPTURE_DIR are required'); process.exit(1); }
mkdirSync(output, { recursive: true });

const t0 = Date.now();
const step = async (name, fn) => {
  const s = Date.now();
  try {
    const out = await fn();
    console.log(`[timing] ${name}: ${Date.now() - s} ms`);
    return out;
  } catch (e) {
    console.log(`[timing] ${name} FAILED: ${Date.now() - s} ms`);
    throw e;
  }
};
const TRANSIENT = (e) => Object.assign(e, { exitCode: 75 });
const DEFECT = (e) => Object.assign(e, { exitCode: 1 });
let exitCode = 0;
let browser;
try {
  browser = await step('browser.launch', () =>
    chromium.launch({
      timeout: 60000,
      args: ['--enable-unsafe-swiftshader', '--mute-audio', '--hide-scrollbars'],
    }).catch((e) => { throw TRANSIENT(e); }),
  );
  for (const view of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844, hasTouch: true, isMobile: true },
  ]) {
    const defects = [];
    const context = await step(`browser.context.${view.name}`, () =>
      browser.newContext({
        viewport: { width: view.width, height: view.height },
        hasTouch: !!view.hasTouch,
        isMobile: !!view.isMobile,
      }).catch((e) => { throw TRANSIENT(e); }),
    );
    const page = await step(`page.open.${view.name}`, () => context.newPage().catch((e) => { throw TRANSIENT(e); }));
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => defects.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') defects.push(`console: ${m.text()}`); });
    try {
      const response = await step(`page.goto.${view.name}`, () =>
        page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch((e) => { throw TRANSIENT(e); }),
      );
      const status = response?.status();
      if (!response?.ok()) {
        throw ([408, 429, 500, 502, 503, 504].includes(status) || !response)
          ? TRANSIENT(new Error(`HTTP ${status} loading preview`))
          : DEFECT(new Error(`HTTP ${status} loading preview`));
      }
      await step(`page.body.${view.name}`, () =>
        page.locator('body').waitFor({ state: 'visible', timeout: 30000 }).catch((e) => { throw TRANSIENT(e); }),
      );
      // The game builds the world, compiles shaders and warms up behind the
      // loader; __ride.ready means finished frames are being presented.
      await step(`page.ready.${view.name}`, () =>
        page.waitForFunction(() => window.__ride?.ready === true, null, { timeout: 240000 }).catch((e) => {
          throw DEFECT(new Error(`game never became ready: ${e.message}`));
        }),
      );
      // Exact URL has no skipintro: dismiss the "tap to ride" loader with a click.
      // Generous timeout: full-tier desktop frames are slow under software GL.
      const waiting = await page.evaluate(() => window.__ride?.waiting === true);
      if (waiting) {
        await step(`page.enter.${view.name}`, async () => {
          await page.mouse.click(Math.floor(view.width / 2), Math.floor(view.height / 2));
          await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 120000 })
            .catch((e) => { throw DEFECT(new Error(`loader never dissolved: ${e.message}`)); });
        });
      }
      await step(`page.settle.${view.name}`, () => page.waitForTimeout(3000));
      const file = join(output, `final-${view.name}.png`);
      await step(`page.screenshot.${view.name}`, () =>
        page.screenshot({ path: file, timeout: 300000 }).catch((e) => {
          throw (e.name === 'TimeoutError' || !browser.isConnected()) ? TRANSIENT(e) : DEFECT(e);
        }),
      );
      const bytes = statSync(file).size;
      console.log(`[capture] ${view.name}: ${file} (${bytes} bytes)`);
      if (bytes < 20000) defects.push(`suspiciously small screenshot (${bytes} bytes)`);
    } catch (e) {
      exitCode = e.exitCode || 1;
      console.error(`[capture] ${view.name} failed: ${e.message}`);
    } finally {
      await context.close().catch(() => {});
    }
    for (const d of defects) console.error(`[capture] ${view.name} defect: ${d}`);
    if (defects.length) exitCode = exitCode || 1;
  }
} catch (e) {
  console.error(`[capture] fatal: ${e.message}`);
  exitCode = e.exitCode || 1;
} finally {
  await browser?.close().catch((e) => { console.error(`[capture] browser close: ${e.message}`); exitCode ||= 75; });
}
console.log(`[timing] capture.total: ${Date.now() - t0} ms`);
process.exit(exitCode);
NODE_EOF
