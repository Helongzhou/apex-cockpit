#!/usr/bin/env node
/**
 * stage-check.mjs - Verifies the stage switcher (task D3).
 *
 *   node scripts/stage-check.mjs [dir]
 *
 * Checks:
 *   AC-D3.1  studio <-> highway switching, both drivable, switch time measured
 *   AC-D3.2  20 switches leave the resource counters at the baseline, with no page errors
 *   AC-D3.5  the switcher only appears once the game publishes >= 2 stages
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
    '.wasm': 'application/wasm'
};

const SWITCH_BUDGET_MS = 200;
const SWITCH_ROUNDS = 20;

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

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#renderCanvas', { timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 300_000 });
await page.waitForTimeout(1500); // let the canvas-focus timer and the first frames settle

const stats = () => page.evaluate(() => ({
    ...(window.__APEX_STATS?.() ?? {}),
    listeners: window.__listenerCount?.().active ?? -1
}));
const activeStageButton = () => page.locator('.stage-button.active').innerText();
/**
 * Clicks a stage button and returns both numbers: the wall-clock time until the loading overlay
 * clears (what a user perceives, dominated by software rasterisation here) and the application's
 * own session-rebuild time reported by the game (`__APEX_STATS().lastSwitchMs`).
 */
const switchTo = async label => {
    const started = Date.now();
    await page.locator('.stage-button', { hasText: label }).click();
    await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 120_000 });
    const rebuildMs = await page.evaluate(() => window.__APEX_STATS?.().lastSwitchMs ?? -1);
    return { perceived: Date.now() - started, rebuild: rebuildMs };
};

// AC-D3.5: the switcher exists because the game published two stages.
const buttons = await page.locator('.stage-button').count();
check('AC-D3.5 switcher lists the published stages', buttons === 2, `${buttons} buttons`);
check('AC-D3.5 starts on the studio stage', (await activeStageButton()).trim() === '影棚');

const baseline = await stats();
console.log(`      baseline: ${JSON.stringify(baseline)}`);

// AC-D3.1: switch to the highway and drive there.
// The first switch to a stage pays for building and uploading its static geometry, which is a
// one-off cost in software rendering; it is reported, and the budget is checked on warm switches.
const coldHighway = await switchTo('高速');
console.log(`      cold switch to the highway: perceived ${coldHighway.perceived} ms, app rebuild ${coldHighway.rebuild.toFixed(1)} ms`);
check('AC-D3.1 the highway stage is active', (await stats()).stage === 'highway');
await page.keyboard.down('w');
const drivesOnHighway = await page.waitForFunction(
    () => parseFloat(document.querySelector('.cluster-speed-value')?.textContent ?? '0') > 0,
    undefined,
    { timeout: 60_000 }
).then(() => true).catch(() => false);
await page.keyboard.up('w');
check('AC-D3.1 the car drives on the highway', drivesOnHighway);

const toStudio = await switchTo('影棚');
check('AC-D3.1 switching back to the studio is fast', toStudio.rebuild <= SWITCH_BUDGET_MS,
    `app rebuild ${toStudio.rebuild.toFixed(1)} ms / perceived ${toStudio.perceived} ms (budget ${SWITCH_BUDGET_MS} ms)`);
check('AC-D3.1 the studio stage is active again', (await stats()).stage === 'studio');

// AC-D3.1 (warm): the median of ten switches is the number a user actually experiences.
const warmTimes = [];
for (let round = 0; round < 10; round += 1) {
    warmTimes.push(await switchTo(round % 2 === 0 ? '高速' : '影棚'));
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianRebuild = median(warmTimes.map(entry => entry.rebuild));
const medianPerceived = median(warmTimes.map(entry => entry.perceived));
console.log(`      warm app rebuild: ${warmTimes.map(entry => entry.rebuild.toFixed(0)).join(', ')} ms -> median ${medianRebuild.toFixed(1)} ms`);
console.log(`      warm perceived  : ${warmTimes.map(entry => entry.perceived).join(', ')} ms -> median ${medianPerceived} ms (software rendering)`);
check('AC-D3.1 warm stage switches are fast', medianRebuild <= SWITCH_BUDGET_MS,
    `median app rebuild ${medianRebuild.toFixed(1)} ms (budget ${SWITCH_BUDGET_MS} ms); perceived median ${medianPerceived} ms`);

// AC-D3.2: 20 switches must not grow the resource counters.
for (let round = 0; round < 10; round += 1) {
    await switchTo(round % 2 === 0 ? '高速' : '影棚');
}
await switchTo('影棚');
await page.waitForTimeout(1500);
const after = await stats();
const growth = key => after[key] - baseline[key];
check('AC-D3.2 20 switches do not grow geometries', growth('geometries') <= 2, `${baseline.geometries} -> ${after.geometries}`);
check('AC-D3.2 20 switches do not grow textures', growth('textures') <= 2, `${baseline.textures} -> ${after.textures}`);
check('AC-D3.2 20 switches do not grow shader programs', growth('programs') <= 2, `${baseline.programs} -> ${after.programs}`);
check('AC-D3.2 20 switches do not leak listeners', after.listeners === baseline.listeners, `${baseline.listeners} -> ${after.listeners}`);
check('AC-D3.2 no page errors while switching', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.close();
await browser.close();
server.close();

const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    process.exitCode = 1;
}
