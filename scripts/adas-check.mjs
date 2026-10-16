#!/usr/bin/env node
/**
 * adas-check.mjs - End-to-end checks for the ADAS overlays (task E1).
 *
 *   node scripts/adas-check.mjs [dir]
 *
 * Checks:
 *   AC-E1.1  lane lines and target boxes appear on the highway stage and follow the lead vehicle
 *   AC-E1.2  the overlays live on a dedicated layer, off layer 0 (invisible to the reflection
 *            probe and to the bloom dim pass)
 *   AC-E1.5  driving still works with the overlays on; no page errors
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#renderCanvas', { timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 300_000 });

const results = [];
const check = (name, passed, detail = '') => {
    results.push({ name, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const adas = () => page.evaluate(() => window.__APEX_STATS?.().adas ?? null);

check('AC-E1.1 the studio has no ADAS overlays', await adas() === null);
check('AC-E1.1 the ADAS toggle is hidden on the studio', await page.locator('.adas-toggle').count() === 0);

// Switch to the highway: the toggle appears because the stage publishes targets.
await page.locator('.stage-button', { hasText: '高速' }).click();
await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 120_000 });
const idle = await adas();
check('AC-E1.1 the highway exposes the ADAS feed', idle !== null, JSON.stringify(idle));
check('AC-E1.2 the overlays are isolated on their own layer', idle?.layerIsolated === true && idle?.layer === 3,
    `layer ${idle?.layer}, isolated ${idle?.layerIsolated}`);
check('AC-E1.1 lanes are built (3 lanes -> 4 boundaries)', idle?.lanes === 4, `${idle?.lanes} ribbons`);
check('AC-E1.1 the ADAS toggle appears', await page.locator('.adas-toggle').count() === 1);

// Truth mode: the kinematic lead vehicle shows up as one target.
await page.locator('.adas-button', { hasText: '真值' }).click();
await page.waitForTimeout(1200);
const truth = await adas();
check('AC-E1.1 truth mode shows the lead vehicle', truth?.mode === 'truth' && truth?.targets === 1,
    `mode ${truth?.mode}, targets ${truth?.targets}`);
check('AC-E1.1 the lane error is finite', Number.isFinite(truth?.laneErrorMeters) && Math.abs(truth.laneErrorMeters) < 200,
    `${truth?.laneErrorMeters?.toFixed(2)} m, lane ${truth?.laneIndex}`);

// Turning the overlays off must hide them (mode off short-circuits the pool).
await page.locator('.adas-button', { hasText: '关闭' }).click();
await page.waitForTimeout(1200);
const off = await adas();
check('AC-E1.1 turning the overlays off clears the targets', off?.mode === 'off' && off?.targets === 0 && off?.visible === false,
    `mode ${off?.mode}, targets ${off?.targets}`);

// Driving still works with the overlays on.
await page.locator('.adas-button', { hasText: '感知' }).click();
await page.keyboard.down('w');
const drives = await page.waitForFunction(
    () => parseFloat(document.querySelector('.cluster-speed-value')?.textContent ?? '0') > 0,
    undefined,
    { timeout: 60_000 }
).then(() => true).catch(() => false);
await page.keyboard.up('w');
check('AC-E1.5 the car drives with the overlays on', drives);
const perceiving = await adas();
check('AC-E1.1 perception mode keeps rendering targets', perceiving?.mode === 'perception' && (perceiving?.targets ?? 0) >= 1,
    `mode ${perceiving?.mode}, targets ${perceiving?.targets}`);
check('AC-E1.5 no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    process.exitCode = 1;
}
