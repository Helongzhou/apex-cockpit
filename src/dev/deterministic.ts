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

import type { GameOptions, GameSession } from '../../game/three-game.js';

export interface DeterministicStep {
    /** 1-based frame index at which the key event is dispatched. */
    frame: number;
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
    return {
        frame,
        elapsed: round(session.stepper.elapsedSeconds),
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
        yaw: round(session.car.yaw()),
        vx: round(velocity.x),
        vy: round(velocity.y),
        vz: round(velocity.z)
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
    const pending = [...config.script].sort((a, b) => a.frame - b.frame);

    return {
        fixedDeltaSeconds: config.fixedDeltaSeconds,
        onFrame: (frame, session) => {
            // Keys are dispatched at the end of the frame, so they take effect on the next
            // frame's `CarControls.update()` in both harness runs.
            while (pending.length > 0 && pending[0].frame <= frame) {
                const step = pending.shift() as DeterministicStep;
                window.dispatchEvent(new KeyboardEvent(step.down ? 'keydown' : 'keyup', { key: step.key }));
            }
            if (session !== null) {
                rows.push(sample(frame, session));
            }
            if (frame >= config.frames) {
                window.__APEX_DUMP = rows;
            }
        }
    };
}
