#!/usr/bin/env node
/**
 * ui-smoke.mjs - Headless UI behaviour checks for the React port.
 *
 * Covers the interaction list that has to survive the Vue -> React migration (task C1's
 * acceptance criterion AC1.4). Run against a built directory:
 *
 *   node scripts/ui-smoke.mjs [dir]          # default: dist
 *
 * Chromium is expected under `PLAYWRIGHT_BROWSERS_PATH` (default `<repo>/.playwright-browsers`).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(process.cwd(), '.playwright-browsers');
const { chromium } = await import('playwright');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
};

const root = resolve(process.argv[2] ?? 'dist');
const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let filePath = join(root, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) {
        filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath)) {
        response.writeHead(404).end('not found');
        return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    response.end(await readFile(filePath));
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const port = server.address().port;

const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});

const results = [];
const check = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Desktop pass: panels, FPS badge, key highlights, debug toggle. */
{
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForSelector('#renderCanvas', { timeout: 30_000 });
    // The game chunk (three + Rapier + wasm) loads on demand, so wait until the runtime
    // overlay is gone before interacting: otherwise the checks race the engine startup.
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 90_000 });

    check('canvas is rendered', await page.locator('#renderCanvas').count() === 1);
    check('FPS badge is rendered', await page.locator('.fps-counter').count() === 1);
    check('debug button is visible on desktop', await page.locator('.debug-button').isVisible());
    check('panels start hidden', !(await page.locator('.panel.panel-left').isVisible()));

    // F12 toggles the debug panels (with the two-phase display/animation classes).
    await page.keyboard.press('F12');
    await page.waitForTimeout(50);
    const leftVisible = await page.locator('.panel.panel-left.visible').count();
    check('F12 opens the debug panels', leftVisible === 1);

    // The HUD shows the vehicle readouts.
    const speedText = await page.locator('.panel-left .stat-value-large').first().innerText();
    check('speed readout is present', /\d/.test(speedText), speedText.trim());

    // Enter key highlight through the desktop controls. Enter also rebuilds the session, so
    // wait for the new one before sending driving input: keys delivered while the session is
    // being rebuilt belong to the disposed controls (same behaviour as the Vue baseline).
    await page.keyboard.down('Enter');
    await page.waitForTimeout(50);
    check('Enter key highlight reacts', await page.locator('.key-display.enter.active').count() === 1);
    await page.keyboard.up('Enter');
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 90_000 });
    await page.waitForTimeout(1500);

    // Key press drives the car: speed readout must grow after holding W.
    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    const movedSpeed = await page.locator('.panel-left .stat-value-large').first().innerText();
    await page.keyboard.up('w');
    check('holding W increases speed', parseFloat(movedSpeed) > 0, `${speedText.trim()} -> ${movedSpeed.trim()}`);

    // C toggles the cockpit view. The camera rig has no DOM surface, so the frame itself is the
    // observable: the rendered pixels must change when the view switches.
    const beforeToggle = await page.locator('#renderCanvas').screenshot();
    await page.keyboard.press('c');
    await page.waitForTimeout(1200);
    const afterToggle = await page.locator('#renderCanvas').screenshot();
    check('C switches the camera view', !beforeToggle.equals(afterToggle),
        `${beforeToggle.length} -> ${afterToggle.length} bytes`);

    // Enter rebuilds the session. The position readout is not a usable signal here: the demo
    // spawns facing the knockable boxes, so the car can be back near the origin after driving.
    // The session-completion log is the unambiguous observable.
    const resetLogs = [];
    page.on('console', message => {
        if (message.text().includes('Game reset complete')) {
            resetLogs.push(message.text());
        }
    });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 90_000 });
    await page.waitForTimeout(2000);
    check('Enter rebuilds the session', resetLogs.length > 0, `${resetLogs.length} reset(s) completed`);

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    // AC2.5: resetting must not grow the active listener count.
    const countListeners = () => page.evaluate(() => window.__listenerCount?.() ?? null);
    const before = await countListeners();
    for (let run = 0; run < 5; run += 1) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(900);
    }
    const after = await countListeners();
    check(
        'resets do not leak listeners',
        before !== null && after !== null && after.active === before.active,
        `active ${before?.active} -> ${after?.active} (added ${before?.added} -> ${after?.added})`
    );

    await page.close();
}

/** Touch pass: the mobile controls appear once a coarse pointer is emulated. */
{
    const context = await browser.newContext({
        viewport: { width: 900, height: 500 },
        hasTouch: true,
        isMobile: true
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForSelector('#renderCanvas', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 90_000 });
    await page.touchscreen.tap(400, 250);
    await page.waitForTimeout(200);

    check('mobile controls appear on a touch device', await page.locator('.mobile-controls.visible').count() === 1);
    check('joystick and four buttons exist', await page.locator('.joystick-inner').count() === 1
        && await page.locator('.action-button').count() === 4);
    check('desktop controls hide on a touch device', !(await page.locator('.desktop-controls.visible').isVisible()));
    await context.close();
}

await browser.close();
server.close();

const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    process.exitCode = 1;
}
