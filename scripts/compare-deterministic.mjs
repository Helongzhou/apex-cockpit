#!/usr/bin/env node
/**
 * compare-deterministic.mjs - Frame-by-frame regression harness for the game loop.
 *
 * The migration must not change observable behaviour, so this script runs a scripted input
 * sequence with a **fixed** timestep and compares the sampled physics state frame by frame.
 *
 * Usage:
 *   node scripts/compare-deterministic.mjs --dump   --dir dist         --out /tmp/candidate.json
 *   node scripts/compare-deterministic.mjs --dump   --dir <baselineDir> --out /tmp/baseline.json
 *   node scripts/compare-deterministic.mjs --compare /tmp/baseline.json /tmp/candidate.json
 *
 * `--dir` serves that directory over HTTP and drives it; the instrumented baseline copy
 * (`~/Documents/archive/ARCHIVED-three-js-car-example-*`) understands the same injected
 * `window.__APEX_DETERMINISTIC` payload.
 *
 * Chromium is expected under `PLAYWRIGHT_BROWSERS_PATH`; the bundled default is
 * `<repo>/.playwright-browsers`.
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';

const FIXED_DELTA_SECONDS = 1 / 60;
const FRAMES = 600;
const TIMEOUT_MS = 120_000;

/** Scripted input: pressing W, steering both ways, a jump and a brake. */
const SCRIPT = [
    { frame: 10, key: 'w', down: true },
    { frame: 120, key: 'a', down: true },
    { frame: 200, key: 'a', down: false },
    { frame: 220, key: 'd', down: true },
    { frame: 300, key: 'd', down: false },
    { frame: 320, key: ' ', down: true },
    { frame: 330, key: ' ', down: false },
    { frame: 400, key: 'w', down: false },
    { frame: 430, key: 'b', down: true },
    { frame: 520, key: 'b', down: false },
    { frame: 540, key: 'w', down: true }
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function startStaticServer(root) {
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
        const body = await readFile(filePath);
        response.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        response.end(body);
    });
    return new Promise(ready => {
        server.listen(0, '127.0.0.1', () => ready({ server, port: server.address().port }));
    });
}

async function launchChromium() {
    // Set before importing playwright so its module initialisation picks the bundled path up.
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(process.cwd(), '.playwright-browsers');
    const { chromium } = await import('playwright');
    return chromium.launch({
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
    });
}

async function dumpRun({ dir, out }) {
    const root = resolve(dir);
    const { server, port } = await startStaticServer(root);
    const browser = await launchChromium();
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    });

    let rows = [];
    try {
        await page.addInitScript(payload => {
            // 1. The migrated app reads this and builds its own hooks (src/dev/deterministic.ts).
            window.__APEX_DETERMINISTIC = payload;

            // 2. The instrumented baseline copy calls window.__APEX_ON_FRAME from its renderFrame,
            //    so the same scenario and sampling live here as a dependency-free shim.
            const rows = [];
            const pending = [...payload.script].sort((a, b) => a.frame - b.frame);
            const round = value => Math.round(value * 1e6) / 1e6;
            window.__APEX_FIXED_DT = payload.fixedDeltaSeconds;
            window.__APEX_ON_FRAME = (frame, session) => {
                while (pending.length > 0 && pending[0].frame <= frame) {
                    const step = pending.shift();
                    window.dispatchEvent(new KeyboardEvent(step.down ? 'keydown' : 'keyup', { key: step.key }));
                }
                if (session) {
                    const position = session.car.position;
                    const velocity = session.car.linearVelocity();
                    rows.push({
                        frame,
                        elapsed: round(session.stepper.elapsedSeconds),
                        x: round(position.x),
                        y: round(position.y),
                        z: round(position.z),
                        yaw: round(session.car.yaw()),
                        vx: round(velocity.x),
                        vy: round(velocity.y),
                        vz: round(velocity.z)
                    });
                }
                if (frame >= payload.frames) {
                    window.__APEX_DUMP = rows;
                }
            };
        }, { fixedDeltaSeconds: FIXED_DELTA_SECONDS, frames: FRAMES, script: SCRIPT });

        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
        await page.waitForFunction(
            frames => Array.isArray(window.__APEX_DUMP) && window.__APEX_DUMP.length >= frames,
            FRAMES,
            { timeout: TIMEOUT_MS }
        );
        rows = await page.evaluate(() => window.__APEX_DUMP);
    } catch (error) {
        const reached = await page.evaluate(() => window.__APEX_DUMP?.length ?? 0).catch(() => 0);
        console.error(`FAILED: ${error.message}`);
        console.error(`frames captured: ${reached}/${FRAMES}`);
        for (const problem of problems.slice(0, 20)) {
            console.error(`  ${problem}`);
        }
        process.exitCode = 1;
        return;
    } finally {
        await browser.close();
        server.close();
    }

    await writeFile(out, `${JSON.stringify({ fixedDeltaSeconds: FIXED_DELTA_SECONDS, frames: FRAMES, rows }, null, 1)}\n`);
    console.log(`captured ${rows.length} frames from ${root} -> ${out}`);
}

const FIELDS = ['elapsed', 'x', 'y', 'z', 'yaw', 'vx', 'vy', 'vz'];

async function compareRuns({ baselinePath, candidatePath }) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));

    const frames = Math.min(baseline.rows.length, candidate.rows.length);
    if (frames === 0) {
        console.error('FAILED: one of the dumps is empty');
        process.exitCode = 1;
        return;
    }

    let worst = 0;
    let worstField = '';
    let firstDivergenceFrame = -1;
    for (let index = 0; index < frames; index += 1) {
        const a = baseline.rows[index];
        const b = candidate.rows[index];
        for (const field of FIELDS) {
            const delta = Math.abs(a[field] - b[field]);
            if (delta > worst) {
                worst = delta;
                worstField = field;
            }
            if (delta > 1e-6 && firstDivergenceFrame === -1) {
                firstDivergenceFrame = a.frame;
            }
        }
    }

    console.log(`compared ${frames} frames (baseline ${baseline.rows.length}, candidate ${candidate.rows.length})`);
    console.log(`max |delta| = ${worst.toExponential(3)} on "${worstField}"`);
    console.log(firstDivergenceFrame === -1
        ? 'RESULT: identical within 1e-6'
        : `RESULT: first divergence at frame ${firstDivergenceFrame}`);
    if (firstDivergenceFrame !== -1 || baseline.rows.length !== candidate.rows.length) {
        process.exitCode = 1;
    }
}

const args = process.argv.slice(2);
const flag = name => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
};

if (args.includes('--dump')) {
    await dumpRun({ dir: flag('--dir') ?? 'dist', out: flag('--out') ?? 'deterministic.json' });
} else if (args.includes('--compare')) {
    const positionals = args.filter(arg => !arg.startsWith('--') && arg.endsWith('.json'));
    await compareRuns({ baselinePath: positionals[0], candidatePath: positionals[1] });
} else {
    console.error('usage: --dump --dir <dir> --out <file> | --compare <baseline.json> <candidate.json>');
    process.exitCode = 1;
}
