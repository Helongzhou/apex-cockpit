// three-game.ts - Three.js + Rapier game entry points used by the React app
import * as THREE from 'three';
import { initPhysicsEngine } from './physics-world.js';
import { applyPixelRatio, createRenderer, requestShadowUpdate, GlowComposer } from './rendering.js';
import { listen, releaseAll, type ListenerHandle } from './listeners.js';
import { GameSession } from './game-session.js';
import { FpsMeter } from './fps-meter.js';
import type { GameHost } from './types.js';

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
}

let canvas: HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
let glowComposer: GlowComposer;
let fpsMeter: FpsMeter;
let session: GameSession | null = null;
let gameOptions: GameOptions = {};
let frameIndex = 0;
const timer = new THREE.Timer();

// Viewport handling: resize events are coalesced into one update per frame because
// `EffectComposer.setSize()` rebuilds framebuffers.
let resizeObserver: ResizeObserver | undefined;
let resizeHandle: ListenerHandle | undefined;
let dprHandle: ListenerHandle | undefined;
let resizeFrame: number | null = null;
let pendingResize: { width: number; height: number } | null = null;
const canvasHandles: ListenerHandle[] = [];

/**
 * Initialize renderer, physics engine and the first game session
 * @param host - the UI-side state host the game writes into
 * @param options - deterministic-run hooks; omitted in normal use
 */
export function initializeGame(host: GameHost, options: GameOptions = {}): void {
    gameOptions = options;
    frameIndex = 0;
    canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    renderer = createRenderer(canvas);
    glowComposer = new GlowComposer(renderer);
    fpsMeter = new FpsMeter(fps => {
        host.fps = fps;
    });

    initPhysicsEngine()
        .then(() => startSession(host))
        .then(() => {
            renderer.setAnimationLoop(renderFrame);
            watchViewport();
            setupCanvasFocus();
            console.log('🎮 Three.js scene created and render loop started');
        })
        .catch(error => console.error('❌ Game could not be started:', error));
}

/**
 * Reset the entire game scene
 */
export async function resetGame(host: GameHost): Promise<void> {
    console.log('🔄 Resetting game using Three.js + Rapier...');

    renderer.setAnimationLoop(null);
    session?.dispose();
    session = null;

    await startSession(host);
    renderer.setAnimationLoop(renderFrame);

    // Re-focus canvas for immediate input with delay
    setTimeout(() => canvas.focus(), CANVAS_FOCUS_DELAY_MS);
    console.log('✅ Game reset complete!');
}

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

async function startSession(host: GameHost): Promise<void> {
    session = await GameSession.create(canvas, renderer, host);
    glowComposer.setScene(session.scene, session.camera);
    timer.update(); // discard the loading time so the first frame does not jump ahead
}

function renderFrame(): void {
    timer.update();
    requestShadowUpdate(renderer);
    session?.update(gameOptions.fixedDeltaSeconds ?? timer.getDelta());
    glowComposer.render();
    fpsMeter.tick();
    frameIndex += 1;
    gameOptions.onFrame?.(frameIndex, session);
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
    session?.dispose();
    session = null;

    resizeObserver?.disconnect();
    resizeObserver = undefined;
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
