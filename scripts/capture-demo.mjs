#!/usr/bin/env node
/**
 * capture-demo.mjs - Captures the demo assets used by the READMEs.
 *
 *   node scripts/capture-demo.mjs [dir]
 *
 * Writes screenshots (and a short screen recording) into `docs/demo/` while driving the scripted
 * tour: studio drive -> highway with the ADAS overlays -> perception mode -> performance panel.
 */

import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
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
const output = resolve('docs/demo');
await mkdir(output, { recursive: true });

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
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: output, size: { width: 1440, height: 900 } }
});
const page = await context.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#renderCanvas', { timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 300_000 });
await page.waitForTimeout(1500);

const settle = async (ms = 2500) => page.waitForTimeout(ms);

// 1. Studio drive, cockpit view.
await page.keyboard.down('w');
await settle(3000);
await page.keyboard.press('c'); // cockpit view
await settle(2500);
await page.screenshot({ path: join(output, '01-studio-cockpit.png') });
console.log('captured 01-studio-cockpit.png');
await page.keyboard.press('c');
await page.keyboard.up('w');

// 2. Highway with ADAS lanes and the truth targets.
await page.locator('.stage-button', { hasText: '高速' }).click();
await page.waitForFunction(() => document.querySelector('.runtime-overlay') === null, undefined, { timeout: 200_000 });
await page.locator('.adas-button', { hasText: '真值' }).click();
await page.keyboard.down('w');
// ~7 s keeps the car on the road (the stage is 2400 units long) with the lead vehicle in view.
await settle(7000);
await page.screenshot({ path: join(output, '02-highway-adas-truth.png') });
console.log('captured 02-highway-adas-truth.png');

// 3. Perception mode: the same scene as the perception stack would report it.
await page.locator('.adas-button', { hasText: '感知' }).click();
await settle(3000);
await page.screenshot({ path: join(output, '03-highway-adas-perception.png') });
console.log('captured 03-highway-adas-perception.png');
await page.keyboard.up('w');

// 4. Performance panel while driving.
await page.keyboard.press('F9');
await page.keyboard.down('w');
await settle(3500);
await page.screenshot({ path: join(output, '04-perf-panel.png') });
console.log('captured 04-perf-panel.png');
await page.keyboard.up('w');

// 5. Digital cluster close-up (debug panel closed, cluster is bottom-centre).
await page.keyboard.press('F9');
await settle(1500);
await page.screenshot({ path: join(output, '05-cluster.png'), clip: { x: 400, y: 560, width: 640, height: 340 } });
console.log('captured 05-cluster.png');

const videoPath = await page.video()?.path();
await context.close();
await browser.close();
server.close();

if (videoPath !== undefined && videoPath !== null) {
    const target = join(output, 'apex-cockpit-demo.webm');
    const { rename } = await import('node:fs/promises');
    await rename(videoPath, target);
    console.log(`captured ${target}`);
}
