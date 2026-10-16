/**
 * replay-source.ts - Drives the HMI from a recorded snapshot sequence instead of the simulation.
 *
 * This is the "pluggable data source" requirement (AC-D1.5): the recorded frames are replayed
 * through the same `VehicleState` shape the live simulation publishes, and the React shell keeps
 * reading the same `GameHost` fields. In replay mode the game module (three + Rapier) is never
 * even loaded, which is the strongest possible demonstration that the UI is source-agnostic.
 */

import { createReplaySource } from '../../game/state-bus.js';
import type { GameHost } from '../../game/types.js';
import type { VehicleState } from '../../game/vehicle-state.js';

export interface ReplayConfig {
    /** Recorded time between two frames, in seconds. */
    intervalSeconds: number;
    frames: VehicleState[];
}

declare global {
    interface Window {
        /** Injected by a test/recorder script before the app loads. */
        __APEX_REPLAY?: ReplayConfig;
    }
}

export function isReplayMode(): boolean {
    return Array.isArray(window.__APEX_REPLAY?.frames) && (window.__APEX_REPLAY?.frames.length ?? 0) > 0;
}

/** Starts replaying into the host; returns a stop function. */
export function startReplay(host: GameHost): () => void {
    const config = window.__APEX_REPLAY as ReplayConfig;
    const source = createReplaySource(config.frames, config.intervalSeconds);

    host.runtime.phase = 'ready';
    host.runtime.message = '';
    host.runtime.detail = '';
    host.isRacing = true;

    const startedAt = performance.now();
    let last = startedAt;
    let frame = 0;
    const tick = (): void => {
        const now = performance.now();
        const state = source.advance((now - last) / 1000);
        last = now;
        frame += 1;
        if (frame % 3 === 0) { // the HUD rate (20 Hz at 60 fps), same as the live path
            host.speed = state.speedKmh;
            host.maxSpeed = Math.max(host.maxSpeed, state.speedKmh);
            host.position.x = state.positionMeters.x;
            host.position.y = state.positionMeters.y;
            host.position.z = state.positionMeters.z;
            host.rotation = (state.yawRad * 180) / Math.PI;
            host.raceTime = (now - startedAt) / 1000;
        }
        timer = requestAnimationFrame(tick);
    };
    let timer = requestAnimationFrame(tick);

    return () => {
        cancelAnimationFrame(timer);
    };
}
