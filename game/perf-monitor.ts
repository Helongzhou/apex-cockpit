/**
 * perf-monitor.ts - Fixed-capacity frame-time sampler.
 *
 * Two series matter for a rendering engineer and they answer different questions:
 *   - **interval**: rAF-to-rAF, what the user experiences (includes GPU time and vsync),
 *   - **script**: the time this application spends inside its own frame callback (what we own).
 *
 * Both are sampled into preallocated ring buffers, so recording a frame allocates nothing and a
 * panel can be refreshed at any rate without disturbing the loop it measures.
 */

import { summarize, type Summary } from './math/stats.js';

export interface PerfSnapshot {
    /** Frames currently in the window. */
    interval: Summary;
    script: Summary;
    /** Frames per second derived from the mean interval. */
    fps: number;
    /** Physics substeps executed in the last frame and since the session started. */
    physicsStepsLastFrame: number;
    physicsStepsTotal: number;
}

/** 240 frames is a 4 s window at 60 fps: long enough to be stable, short enough to react. */
export const DEFAULT_WINDOW = 240;

class RingSeries {
    private readonly values: Float64Array;
    private cursor = 0;
    private filled = 0;
    private readonly scratch: number[] = [];

    constructor(capacity: number) {
        this.values = new Float64Array(capacity);
        this.scratch = new Array<number>(capacity).fill(0);
    }

    push(value: number): void {
        this.values[this.cursor] = value;
        this.cursor = (this.cursor + 1) % this.values.length;
        this.filled = Math.min(this.values.length, this.filled + 1);
    }

    clear(): void {
        this.cursor = 0;
        this.filled = 0;
    }

    /** Snapshot without allocating: the scratch array is reused between calls. */
    summary(): Summary {
        for (let index = 0; index < this.filled; index += 1) {
            this.scratch[index] = this.values[index];
        }
        this.scratch.length = this.filled;
        return summarize(this.scratch);
    }
}

export class PerfMonitor {
    private readonly intervalSeries: RingSeries;
    private readonly scriptSeries: RingSeries;
    private lastPhysicsSteps = 0;
    private totalPhysicsSteps = 0;
    private lastSnapshot: PerfSnapshot;

    constructor(window = DEFAULT_WINDOW) {
        this.intervalSeries = new RingSeries(window);
        this.scriptSeries = new RingSeries(window);
        this.lastSnapshot = {
            interval: summarize([]),
            script: summarize([]),
            fps: 0,
            physicsStepsLastFrame: 0,
            physicsStepsTotal: 0
        };
    }

    /**
     * @param intervalMs - time since the previous frame.
     * @param scriptMs - time spent inside this frame's callback.
     * @param physicsSteps - substeps the physics ran this frame.
     */
    frame(intervalMs: number, scriptMs: number, physicsSteps: number): void {
        this.intervalSeries.push(intervalMs);
        this.scriptSeries.push(scriptMs);
        this.lastPhysicsSteps = physicsSteps;
        this.totalPhysicsSteps += physicsSteps;
    }

    /** Latest window statistics; cheap enough to call at panel rate (it sorts ≤240 numbers). */
    snapshot(): PerfSnapshot {
        const interval = this.intervalSeries.summary();
        this.lastSnapshot = {
            interval,
            script: this.scriptSeries.summary(),
            fps: interval.mean > 0 ? 1000 / interval.mean : 0,
            physicsStepsLastFrame: this.lastPhysicsSteps,
            physicsStepsTotal: this.totalPhysicsSteps
        };
        return this.lastSnapshot;
    }

    reset(): void {
        this.intervalSeries.clear();
        this.scriptSeries.clear();
        this.lastPhysicsSteps = 0;
        this.totalPhysicsSteps = 0;
    }
}
