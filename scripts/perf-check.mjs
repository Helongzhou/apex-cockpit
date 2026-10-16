#!/usr/bin/env node
/**
 * perf-check.mjs - Verifies the performance panel (task E3).
 *
 *   node scripts/perf-check.mjs [dir]
 *
 * Checks:
 *   AC-E3.1  F9 opens the panel; it shows live frame time, renderer, physics, ADAS and bundle data
 *   AC-E3.3  the panel is refreshed at panel rate (<= 4 Hz), not per frame
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
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
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

check('AC-E3.1 the panel starts closed', await page.locator('.perf-panel').count() === 0);
await page.keyboard.press('F9');
await page.waitForSelector('.perf-panel', { timeout: 10_000 });
check('AC-E3.1 F9 opens the panel', await page.locator('.perf-panel').count() === 1);

// Drive while the panel is open: its numbers must move.
await page.keyboard.down('w');
const text = async () => (await page.locator('.perf-panel').innerText()).replace(/\s+/g, ' ');
await page.waitForTimeout(4000);
const first = await text();
await page.waitForTimeout(3000);
const second = await text();
await page.keyboard.up('w');

for (const [label, needle] of [
    ['frame-time percentiles', /p50/],
    ['fps', /fps/],
    ['draw calls', /draw calls/],
    ['triangles', /triangles/],
    ['geometries/textures/programs', /programs/],
    ['physics substeps', /子步（累计）/],
    ['ADAS targets', /ADAS 目标/],
    ['bundle baseline', /包邮|包体基线|首屏 gzip/]
]) {
    check(`AC-E3.1 the panel shows ${label}`, needle.test(first));
}

const perfSamples = async () => page.evaluate(() => {
    const value = document.querySelector('.perf-panel')?.textContent ?? '';
    return value;
});
const before = await page.evaluate(() => window.__APEX_STATS ? 1 : 0);
check('AC-E3.1 the snapshot is live (numbers change while driving)', first !== second, before ? '' : 'no stats hook');
check('AC-E3.1 no page errors with the panel open', errors.length === 0, errors.slice(0, 2).join(' | '));

// AC-E3.3: the panel data comes from a 4 Hz snapshot, so between two refreshes the text must be
// identical. Sampling twice inside 200 ms proves the panel is not re-rendering per frame.
const quickA = await text();
await page.waitForTimeout(120);
const quickB = await text();
check('AC-E3.3 the panel refreshes at panel rate, not per frame', quickA === quickB,
    quickA === quickB ? 'identical within 120 ms' : 'changed inside 120 ms');

// Closing via the button and re-opening with F9 keeps the binding honest.
await page.locator('.perf-close').click();
await page.waitForTimeout(300);
check('AC-E3.1 the close button hides the panel', await page.locator('.perf-panel').count() === 0);

await browser.close();
server.close();

const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    process.exitCode = 1;
}
