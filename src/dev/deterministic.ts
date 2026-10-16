/**
 * deterministic.ts - Page-side half of the deterministic regression harness.
 *
 * `scripts/compare-deterministic.mjs` injects `window.__APEX_DETERMINISTIC` before the app
 * loads; when present the game runs with a fixed delta and this module drives a scripted
 * input pattern while sampling the **physics** state. It deliberately does not sample the HUD:
 * `Telemetry` throttles writes with `performance.now()`, so HUD values depend on wall-clock
 * time and cannot be compared frame by frame.
 *
 * With no injected config this module is inert and the app behaves normally.
 */

import * as THREE from 'three';
import type { GameOptions } from '../../game/three-game.js';
import type { GameSession } from '../../game/game-session.js';

/** Reused so sampling does not allocate on every frame. */
const followScratch = new THREE.Vector3();

export interface DeterministicStep {
    /** Simulated time (seconds) at which the key event is dispatched. */
    t: number;
    /** `KeyboardEvent.key` value, e.g. "w", "a", " " or "Enter". */
    key: string;
    down: boolean;
}

export interface DeterministicConfig {
    fixedDeltaSeconds: number;
    frames: number;
    script: DeterministicStep[];
}

export interface DeterministicRow {
    frame: number;
    elapsed: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    vx: number;
    vy: number;
    vz: number;
    /** Motor target the control layer is feeding the drive joints (world units/s). */
    motor: number;
    /** Steering angle the control layer is feeding the steering joints (radians). */
    steer: number;
    /** Camera follow error: distance between the camera and its goal position. */
    camError: number;
}

declare global {
    interface Window {
        __APEX_DETERMINISTIC?: DeterministicConfig;
        __APEX_DUMP?: DeterministicRow[];
    }
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Samples the rigid body directly: the source of truth both harness runs compare. */
function sample(frame: number, session: GameSession): DeterministicRow {
    const position = session.car.position;
    const velocity = session.car.linearVelocity();
    const follow = session.followCamera;
    // The camera has no physics feedback, so its follow error is a clean control-loop metric.
    const camError = follow.computeGoalPosition(followScratch).distanceTo(follow.camera.position);
    return {
        frame,
        elapsed: round(session.stepper.elapsedSeconds),
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
        yaw: round(session.car.yaw()),
        vx: round(velocity.x),
        vy: round(velocity.y),
        vz: round(velocity.z),
        motor: round(session.controls.currentSpeed),
        steer: round(session.controls.currentSteeringAngle),
        camError: round(camError)
    };
}

/**
 * Builds the {@link GameOptions} for a deterministic run, or `undefined` for a normal one.
 */
export function createDeterministicOptions(): GameOptions | undefined {
    const config = window.__APEX_DETERMINISTIC;
    console.log('🧪 Deterministic harness:', config ? `${config.frames} frames @ ${config.fixedDeltaSeconds}s` : 'absent');
    if (!config) {
        return undefined;
    }

    const rows: DeterministicRow[] = [];
    const pending = [...config.script].sort((a, b) => a.t - b.t);

    return {
        fixedDeltaSeconds: config.fixedDeltaSeconds,
        // Input is injected on the physics grid, not on render-frame boundaries: a 144 Hz run and
        // a 30 Hz run then see exactly the same input timeline.
        onSubstep: (elapsedSeconds) => {
            while (pending.length > 0 && pending[0].t <= elapsedSeconds) {
                const step = pending.shift() as DeterministicStep;
                window.dispatchEvent(new KeyboardEvent(step.down ? 'keydown' : 'keyup', { key: step.key }));
            }
        },
        onFrame: (frame, session) => {
            if (session !== null) {
                rows.push(sample(frame, session));
            }
            if (frame >= config.frames) {
                window.__APEX_DUMP = rows;
            }
        }
    };
}
