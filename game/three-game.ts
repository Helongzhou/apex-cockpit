// three-game.ts - Three.js + Rapier game entry points used by the React app
import * as THREE from 'three';
import { initPhysicsEngine } from './physics-world.js';
import { createRenderer, requestShadowUpdate, GlowComposer } from './rendering.js';
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
            window.addEventListener('resize', handleResize);
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

function handleResize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    glowComposer.setSize(window.innerWidth, window.innerHeight);
    session?.resize(window.innerWidth / window.innerHeight);
}

function setupCanvasFocus(): void {
    setTimeout(() => {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
        canvas.addEventListener('click', () => canvas.focus());
    }, CANVAS_FOCUS_DELAY_MS);
}
