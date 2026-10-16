// three-game.ts - Three.js + Rapier game entry points used by the React app
import * as THREE from 'three';
import { initPhysicsEngine } from './physics-world.js';
import { applyPixelRatio, createRenderer, disposeSharedReflectionProbe, requestShadowUpdate, GlowComposer } from './rendering.js';
import { listen, releaseAll, type ListenerHandle } from './listeners.js';
import { createRenderLoop } from './render-loop.js';
import { createContextMonitor, type ContextMonitor } from './context-monitor.js';
import { LoadFailure, loadWithRetry } from './loading.js';
import { GameSession } from './game-session.js';
import { DEFAULT_STAGE, stageDefinition, stageSummaries } from './scenes/index.js';
import { FpsMeter } from './fps-meter.js';
import type { GameHost, StageId } from './types.js';

const CANVAS_FOCUS_DELAY_MS = 100;

/**
 * Optional hooks used by the deterministic regression harness
 * (`scripts/compare-deterministic.mjs`). With no options the game behaves exactly as before.
 */
export interface GameOptions {
    /** Replaces the measured frame delta with a fixed value (deterministic runs). */
    fixedDeltaSeconds?: number;
    /**
     * Called at the end of every rendered frame. The session is handed over so a harness can
     * sample physics state instead of the 20 Hz-throttled HUD.
     */
    onFrame?: (frameIndex: number, session: GameSession | null) => void;
    /**
     * Called after every physics substep with the simulated time so far. Input driven from here
     * lands on the physics grid at any render rate, which is what makes a comparison across
     * 30/60/144 Hz exact (see `scripts/frame-rate-compare.mjs`).
     */
    onSubstep?: (elapsedSeconds: number) => void;
}

let canvas: HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
let glowComposer: GlowComposer;
let fpsMeter: FpsMeter;
let session: GameSession | null = null;
let currentHost: GameHost | null = null;
/** Stage the next session will be built with. */
let currentStage: StageId = DEFAULT_STAGE;
/** Application-side cost of the last stage switch (session rebuild, no rendering). */
let lastSwitchMs = 0;
let gameOptions: GameOptions = {};
let frameIndex = 0;
const timer = new THREE.Timer();
// Enables the Page Visibility guard: without it the first frame after a hidden tab
// carries the whole hidden interval as its delta (docs/research/2026-10-15-external-facts.md §2).
timer.connect(document);

// Viewport handling: resize events are coalesced into one update per frame because
// `EffectComposer.setSize()` rebuilds framebuffers.
let resizeObserver: ResizeObserver | undefined;
let resizeHandle: ListenerHandle | undefined;
let dprHandle: ListenerHandle | undefined;
let resizeFrame: number | null = null;
let pendingResize: { width: number; height: number } | null = null;
let resizeAppliedCount = 0;
const canvasHandles: ListenerHandle[] = [];
let contextMonitor: ContextMonitor | undefined;
let injectedFrameError: string | null = null;

declare global {
    interface Window {
        /** Fault injection for `scripts/stability-check.mjs`: throws on the next frame. */
        __APEX_INJECT_FRAME_ERROR?: (message: string) => void;
        /** Renderer resource counters, used by the stability checks and the perf panel. */
        __APEX_STATS?: () => {
            geometries: number; textures: number; programs: number; resizes: number;
            calls: number; triangles: number; stage: string;
            /** Application-side stage-switch cost (session rebuild), excluding the first frame. */
            lastSwitchMs: number;
        };
    }
}

/**
 * The render loop runs inside an error boundary: an exception inside `renderFrame` would
 * otherwise stop three's animation loop permanently (verified in
 * docs/research/2026-10-15-external-facts.md §1).
 */
const renderLoop = createRenderLoop({
    frame: renderFrame,
    onFatal: error => {
        console.error('❌ Render loop stopped:', error);
        renderer?.setAnimationLoop(null);
        if (currentHost !== null) {
            reportFatal(currentHost, error);
        }
    }
});

/**
 * Initialize renderer, physics engine and the first game session
 * @param host - the UI-side state host the game writes into
 * @param options - deterministic-run hooks; omitted in normal use
 */
export function initializeGame(host: GameHost, options: GameOptions = {}): void {
    gameOptions = options;
    frameIndex = 0;
    currentHost = host;
    host.runtime.phase = 'loading';
    host.runtime.message = '正在加载引擎…';

    canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    renderer = createRenderer(canvas);
    glowComposer = new GlowComposer(renderer);
    fpsMeter = new FpsMeter(fps => {
        host.fps = fps;
    });

    // Fault injection for the stability checks: the only way to prove the boundary works.
    window.__APEX_INJECT_FRAME_ERROR = (message: string) => {
        injectedFrameError = message;
    };
    // Resource counters: a reset must not grow geometries/textures/programs.
    window.__APEX_STATS = () => ({
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        // Applied (not requested) viewport changes: proves the rAF coalescing works.
        resizes: resizeAppliedCount,
        // Draw calls and triangles of the last completed frame (`info.autoReset` is on).
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        stage: currentStage,
        lastSwitchMs
    });

    startGame(host).catch(error => {
        console.error('❌ Game could not be started:', error);
        reportFatal(host, error);
    });
}

/** Engine, first session and the render loop, with a visible, retryable failure path. */
async function startGame(host: GameHost): Promise<void> {
    await loadWithRetry({ name: 'engine', label: '物理引擎' }, () => initPhysicsEngine(), {
        onAttempt: (attempt, total) => {
            host.runtime.message = attempt > 1 ? `正在重试物理引擎（${attempt}/${total}）` : '正在加载物理引擎…';
        }
    });

    await startSession(host);

    renderer.setAnimationLoop(() => renderLoop.run());
    renderLoop.start();
    watchViewport();
    watchContext();
    setupCanvasFocus();

    // Publish the stage list so the UI renders the switcher without importing the game.
    host.stages = stageSummaries();
    host.stage = currentStage;
    host.runtime.phase = 'ready';
    host.runtime.message = '';
    host.runtime.detail = '';
    console.log('🎮 Three.js scene created and render loop started');
}

/**
 * Reset the entire game scene.
 *
 * Resets are serialized: the previous implementation disposed `session` and then overwrote the
 * shared variable from an async continuation, so two overlapping resets (holding Enter) left
 * one session — and all of its listeners and GPU resources — orphaned forever.
 */
export function resetGame(host: GameHost): Promise<void> {
    const requestId = ++resetRequested;
    resetChain = resetChain
        .then(async () => {
            // A newer reset is already queued: this one has been superseded.
            if (requestId !== resetRequested) {
                return;
            }
            await runReset(host);
        })
        .catch(error => {
            console.error('❌ Game reset failed:', error);
            reportFatal(host, error);
        });
    return resetChain;
}

async function runReset(host: GameHost): Promise<void> {
    console.log('🔄 Resetting game using Three.js + Rapier...');
    // A reset disposes the session and rebuilds it: the UI must say so, otherwise input pressed
    // in that window reaches the old (disposed) controls and is silently dropped.
    host.runtime.phase = 'loading';
    host.runtime.message = '正在重置…';


    renderer.setAnimationLoop(null);
    renderLoop.stop();
    session?.dispose();
    session = null;

    await startSession(host);
    renderer.setAnimationLoop(() => renderLoop.run());
    renderLoop.start();

    host.runtime.phase = 'ready';
    host.runtime.message = '';
    host.runtime.detail = '';

    // Re-focus canvas for immediate input with delay
    setTimeout(() => canvas.focus(), CANVAS_FOCUS_DELAY_MS);
    console.log('✅ Game reset complete!');
}

/**
 * Switches stage: the next session is built with the new environment. Uses the same serialized,
 * visibly-loading path as a reset, so a fast double click cannot leave a half-built session.
 */
export async function setStage(host: GameHost, stage: StageId): Promise<void> {
    stageDefinition(stage); // throws early on an unknown id
    if (stage === currentStage) {
        return;
    }
    currentStage = stage;
    host.stage = stage;
    const started = performance.now();
    await resetGame(host);
    // Excludes the first rendered frame: this is the rebuild the application is responsible for.
    lastSwitchMs = performance.now() - started;
}

/**
 * Rebuilds the game after a fatal error or a lost WebGL context. Idempotent: the host's
 * `retry()` may be clicked repeatedly while a rebuild is in flight.
 */
export async function recoverGame(host: GameHost): Promise<void> {
    if (recovering) {
        return;
    }
    recovering = true;
    host.runtime.phase = 'loading';
    host.runtime.message = '正在恢复…';
    try {
        await resetGame(host);
    } catch (error) {
        console.error('❌ Recovery failed:', error);
        reportFatal(host, error);
    } finally {
        recovering = false;
    }
}

let recovering = false;
/** Serializes resets; `resetRequested` lets a superseded request no-op instead of rebuilding. */
let resetChain: Promise<void> = Promise.resolve();
let resetRequested = 0;

/**
 * Reset the knockable boxes of the current session
 */
export function resetBoxes(host: GameHost): void {
    host.knockedBoxes = 0;
    host.boxesStatus.forEach(box => {
        box.knocked = false;
    });
    session?.environment.resetBoxes();
}

/** Toggles the camera view from outside the render loop (e.g. the mobile View button). */
export function toggleView(): void {
    const camera = session?.followCamera;
    if (camera) {
        camera.setCockpit(!camera.cockpit);
    }
}

function reportFatal(host: GameHost, error: unknown): void {
    host.runtime.phase = 'fatal';
    host.runtime.message = error instanceof LoadFailure
        ? `加载「${error.stage}」失败`
        : '运行出错，渲染已停止';
    host.runtime.detail = error instanceof Error ? error.message : String(error);
}

async function startSession(host: GameHost): Promise<void> {
    host.runtime.message = '正在加载车辆模型…';
    session = await loadWithRetry({ name: 'model', label: '车辆模型' }, () => GameSession.create(canvas, renderer, host, currentStage), {
        onAttempt: (attempt, total) => {
            if (attempt > 1) {
                host.runtime.message = `正在重试加载车辆模型（${attempt}/${total}）`;
            }
        }
    });
    glowComposer.setScene(session.scene, session.camera);
    timer.update(); // discard the loading time so the first frame does not jump ahead
}

function renderFrame(): void {
    // Injected by the stability checks; throws inside the boundary on purpose.
    if (injectedFrameError !== null) {
        const message = injectedFrameError;
        injectedFrameError = null;
        throw new Error(message);
    }
    timer.update();
    // `info.autoReset` is off, so the frame's draw calls/triangles are accumulated here and
    // cover the main pass, the bloom passes, the shadow pass and the reflection probe.
    renderer.info.reset();
    requestShadowUpdate(renderer);
    session?.update(gameOptions.fixedDeltaSeconds ?? timer.getDelta(), gameOptions.onSubstep);
    glowComposer.render();
    fpsMeter.tick();
    frameIndex += 1;
    gameOptions.onFrame?.(frameIndex, session);
}

/**
 * Watches for context loss. On loss the loop and the simulation stop and the UI says so; on
 * restore the render targets are rebuilt (composer + reflection probe were created on the
 * old context) and the time base is reset so no frame jump lands on the rebuilt scene.
 */
function watchContext(): void {
    contextMonitor?.dispose();
    contextMonitor = createContextMonitor({
        canvas,
        onLost: () => {
            renderLoop.stop();
            renderer.setAnimationLoop(null);
            session?.pause();
            if (currentHost !== null) {
                currentHost.runtime.phase = 'context-lost';
                currentHost.runtime.message = '图形上下文丢失，正在等待恢复…';
                currentHost.runtime.detail = '';
            }
        },
        onRestored: () => {
            try {
                timer.update(); // discard the lost interval
                rebuildRenderTargets();
                session?.resume();
                renderer.setAnimationLoop(() => renderLoop.run());
                renderLoop.start();
                if (currentHost !== null) {
                    currentHost.runtime.phase = 'ready';
                    currentHost.runtime.message = '';
                    currentHost.runtime.detail = '';
                }
            } catch (error) {
                // A failed rebuild must be visible instead of leaving the overlay hanging.
                console.error('❌ Context restore failed:', error);
                if (currentHost !== null) {
                    reportFatal(currentHost, error);
                }
            }
        }
    });
}

/** Both render targets live on the GL context, so they are recreated after a restore. */
function rebuildRenderTargets(): void {
    glowComposer = new GlowComposer(renderer);
    if (session !== null) {
        glowComposer.setScene(session.scene, session.camera);
        session.rebuildReflectionProbe();
    }
}

/** Coalesces viewport changes so framebuffers are rebuilt at most once per frame. */
function requestResize(): void {
    pendingResize = { width: window.innerWidth, height: window.innerHeight };
    if (resizeFrame !== null) {
        return;
    }
    resizeFrame = requestAnimationFrame(applyPendingResize);
}

function applyPendingResize(): void {
    resizeFrame = null;
    const size = pendingResize;
    pendingResize = null;
    if (size === null) {
        return;
    }
    renderer.setSize(size.width, size.height);
    applyPixelRatio(renderer);
    glowComposer.setSize(size.width, size.height);
    session?.resize(size.width / size.height);
    resizeAppliedCount += 1;
}

function watchViewport(): void {
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(requestResize);
        resizeObserver.observe(document.documentElement);
    } else {
        resizeHandle = listen(window, 'resize', requestResize);
    }
    watchPixelRatio();
}

/** Reacts to a device-pixel-ratio change (e.g. a window dragged to another display). */
function watchPixelRatio(): void {
    dprHandle?.release();
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprHandle = listen(query, 'change', () => {
        requestResize();
        watchPixelRatio();
    });
}

function setupCanvasFocus(): void {
    setTimeout(() => {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
        canvasHandles.push(listen(canvas, 'click', () => canvas.focus()));
    }, CANVAS_FOCUS_DELAY_MS);
}

/**
 * Tears the game down and releases every listener it registered. Called from the React
 * effect cleanup; also keeps `window.__listenerCount()` meaningful across remounts.
 */
export function disposeGame(): void {
    renderer?.setAnimationLoop(null);
    renderLoop.stop();
    session?.dispose();
    session = null;
    disposeSharedReflectionProbe();

    resizeObserver?.disconnect();
    resizeObserver = undefined;
    contextMonitor?.dispose();
    contextMonitor = undefined;
    releaseAll([resizeHandle, dprHandle, ...canvasHandles]);
    canvasHandles.length = 0;
    resizeHandle = undefined;
    dprHandle = undefined;

    if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
    }
    pendingResize = null;
}
