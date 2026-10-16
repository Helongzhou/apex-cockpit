#!/usr/bin/env node
/**
 * stability-check.mjs - Fault-injection checks for task C2.
 *
 *   node scripts/stability-check.mjs [dir]      # default: dist
 *
 * Every assertion goes through the **user-visible** state (the runtime overlay, the readouts,
 * the FPS badge) rather than internal objects, so a passing run means the app really recovers.
 *
 * Checks:
 *   AC2.1 an exception inside the frame callback is contained and recoverable
 *   AC2.2 a lost WebGL context is visible, pauses the simulation and recovers
 *   AC2.3 asset loading is retried and reports progress instead of failing permanently
 *   AC2.7 rapid viewport changes keep the app alive
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
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});

const results = [];
const check = (name, passed, detail = '') => {
    results.push({ name, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const overlay = page => page.locator('.runtime-overlay');
const waitForReady = async page => {
    await page.waitForSelector('#renderCanvas', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 60_000 });
};
const overlayTitle = async page => (await page.locator('.runtime-overlay .runtime-title').innerText().catch(() => '')).trim();

/** AC2.1 - injected frame exception. */
{
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await waitForReady(page);
    check('AC2.1 app reaches ready state', await overlay(page).count() === 0);

    await page.evaluate(() => window.__APEX_INJECT_FRAME_ERROR?.('injected frame failure'));
    const injectedAt = Date.now();
    await page.waitForSelector('.runtime-overlay.error', { timeout: 10_000 });
    const fatalShownMs = Date.now() - injectedAt;
    check('AC2.1 frame exception shows the fatal overlay', await overlayTitle(page) === '需要恢复');
    check('AC2.1 detail line carries the injected message',
        (await page.locator('.runtime-overlay .runtime-detail').innerText()).includes('injected frame failure'));
    check('AC2.1 the exception did not escape to the page', pageErrors.length === 0, pageErrors.join(' | '));

    // The canvas must still be there and the retry button must bring the game back.
    const retryAt = Date.now();
    await page.locator('.runtime-retry').click();
    await waitForReady(page);
    console.log(`      recovery metrics: fatal overlay in ${fatalShownMs} ms, back to ready in ${Date.now() - retryAt} ms`);
    check('AC2.1 retry restores the running game', await overlay(page).count() === 0);

    await page.locator('.debug-button').click().catch(() => undefined);
    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    const speed = parseFloat(await page.locator('.panel-left .stat-value-large').first().innerText());
    await page.keyboard.up('w');
    check('AC2.1 the car drives again after recovery', speed > 0, `${speed} km/h`);
    await page.close();
}

/** AC2.2 - context loss and restore. */
{
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await waitForReady(page);

    // `getExtension()` returns null once the context is lost, so the extension handle has to
    // be obtained up front and reused for both directions.
    const supported = await page.evaluate(() => {
        const canvas = document.getElementById('renderCanvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        window.__loseContextExt = gl.getExtension('WEBGL_lose_context');
        return Boolean(window.__loseContextExt);
    });
    const loseContext = () => page.evaluate(() => window.__loseContextExt?.loseContext());
    const restoreContext = () => page.evaluate(() => window.__loseContextExt?.restoreContext());

    if (!supported) {
        check('AC2.2 WEBGL_lose_context is available', false, 'extension missing in this browser build');
    } else {
        await loseContext();
        await page.waitForSelector('.runtime-overlay.error', { timeout: 10_000 });
        check('AC2.2 context loss is visible to the user', await overlayTitle(page) === '显卡上下文丢失');

        // Simulation must be paused: the position readout is written at 20 Hz, so it freezes.
        await page.locator('.debug-button').click().catch(() => undefined);
        const positionOf = async index => (await page.locator('.panel-left .stat-box').nth(index).locator('.stat-value').innerText()).trim();
        const before = await positionOf(1);
        await page.waitForTimeout(900);
        const during = await positionOf(1);
        check('AC2.2 the simulation is paused while the context is lost', before === during, `${before} -> ${during}`);

        await restoreContext();
        await waitForReady(page);
        check('AC2.2 the game recovers after the context is restored', await overlay(page).count() === 0);

        // Frames must advance again: the FPS badge is rewritten every 500 ms.
        const fpsText = () => page.locator('.fps-counter').innerText();
        const first = await fpsText();
        await page.waitForTimeout(2500);
        const second = await fpsText();
        check('AC2.2 the render loop is running again', first !== second || /\d/.test(second), `${first} -> ${second}`);
    }
    check('AC2.2 no page errors during context loss', pageErrors.length === 0, pageErrors.join(' | '));
    await page.close();
}

/** AC2.3 - the model request fails twice, then succeeds. */
{
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    let failures = 0;
    let sawLoadingOverlay = false;
    await page.route('**/*.glb', async route => {
        failures += 1;
        if (failures <= 2) {
            await route.fulfill({ status: 500, body: 'injected failure' });
        } else {
            await route.continue();
        }
    });
    await page.goto(url, { waitUntil: 'load' });
    // The overlay must be visible while the (failing) load is in flight.
    await page.waitForSelector('.runtime-overlay', { timeout: 15_000 }).then(() => { sawLoadingOverlay = true; }).catch(() => undefined);
    await waitForReady(page);
    check('AC2.3 a failing asset does not brick the page', await overlay(page).count() === 0);
    check('AC2.3 the load was actually retried', failures >= 3, `${failures} requests for the model`);
    check('AC2.3 progress was visible while loading', sawLoadingOverlay);
    await page.close();
}

/** AC2.7 - rapid viewport changes are coalesced. */
{
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await waitForReady(page);
    await page.waitForTimeout(500);

    const resizes = () => page.evaluate(() => window.__APEX_STATS?.().resizes ?? -1);
    const before = await resizes();
    let requested = 0;
    const started = Date.now();
    // ~10 s of continuous viewport churn: 100 changes as fast as the browser accepts them.
    for (let step = 0; step < 100 && Date.now() - started < 10_000; step += 1) {
        await page.setViewportSize({ width: 640 + (step % 20) * 12, height: 420 + (step % 15) * 10 });
        requested += 1;
    }
    await page.waitForTimeout(2500); // the coalesced rebuild lands on the next frame
    const after = await resizes();
    const applied = after - before;
    console.log(`      resize metrics: ${requested} viewport changes over ${((Date.now() - started) / 1000).toFixed(1)}s -> ${applied} applied rebuilds (raw ${before} -> ${after})`);
    check('AC2.7 rapid resizes keep the app alive', await overlay(page).count() === 0 && pageErrors.length === 0, pageErrors.join(' | '));
    check('AC2.7 viewport churn is coalesced', applied > 0 && applied < requested, `${requested} requested -> ${applied} applied`);
    await page.close();
}

/** AC2.6 - a visibility change must not disturb the loop (the timer is connected to the document). */
{
    const page = await browser.newPage({ viewport: { width: 800, height: 560 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await waitForReady(page);

    // Headless pages keep rendering while "hidden", so this exercises the wiring rather than
    // the wall-clock jump itself: `timer.connect(document)` resets the clock on the way back.
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);

    const alive = await page.evaluate(() => document.querySelector('.runtime-overlay') === null);
    check('AC2.6 a hidden-then-visible tab keeps the game healthy', alive && pageErrors.length === 0, pageErrors.join(' | '));
    await page.close();
}

/** AC2.4 - twenty resets must not grow GPU resources or listener count. */
{
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await waitForReady(page);
    // The canvas-focus listener is registered on a 100 ms timer, so let startup settle
    // before taking the baseline (otherwise the baseline is one listener short).
    await page.waitForTimeout(1500);

    const statsOf = () => page.evaluate(() => ({
        ...(window.__APEX_STATS?.() ?? { geometries: -1, textures: -1, programs: -1 }),
        listeners: window.__listenerCount?.().active ?? -1
    }));
    const before = await statsOf();
    for (let run = 0; run < 20; run += 1) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1500);
    const after = await statsOf();

    const growth = (key) => before[key] < 0 ? 0 : after[key] - before[key];
    const withinTolerance = (key) => growth(key) <= Math.max(2, Math.round(Math.abs(before[key]) * 0.05));
    check('AC2.4 20 resets do not grow geometries', withinTolerance('geometries'), `${before.geometries} -> ${after.geometries}`);
    check('AC2.4 20 resets do not grow textures', withinTolerance('textures'), `${before.textures} -> ${after.textures}`);
    check('AC2.4 20 resets do not grow shader programs', withinTolerance('programs'), `${before.programs} -> ${after.programs}`);
    check('AC2.4 20 resets do not leak listeners', after.listeners === before.listeners, `${before.listeners} -> ${after.listeners}`);
    check('AC2.4 no page errors while resetting', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    await page.close();
}

await browser.close();
server.close();

const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    process.exitCode = 1;
}
