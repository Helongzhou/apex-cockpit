/**
 * perception-noise.ts - Downgrades ground truth into a perception output.
 *
 * The point of this module is the story a visualisation engineer has to be able to tell: the same
 * scene can be shown as **ground truth** or as **what a perception stack would report**. The model
 * covers the four failure modes that matter visually:
 *
 *   - missed detections (dropout),
 *   - position jitter (metres),
 *   - heading error (degrees),
 *   - sensor latency (seconds, implemented with a timestamped history ring).
 *
 * Everything is deterministic: a seeded mulberry32 PRNG, no `Math.random`, no wall clock. Two
 * models constructed with the same seed and fed the same sequence produce identical output, which
 * is what makes the regression baseline and the on-stage demo trustworthy.
 */

import type { AdasTarget, TargetKind, TargetSource } from './targets.js';

export interface PerceptionOptions {
    /** Probability that a target is missed in a given frame, 0..1. */
    dropoutProbability: number;
    /** Uniform position error bound, in world units. */
    jitterWorldUnits: number;
    /** Uniform heading error bound, in radians. */
    headingErrorRadians: number;
    /** Sensor latency in seconds. */
    latencySeconds: number;
    /** Reported confidence range (uniform). */
    confidenceMin: number;
    confidenceMax: number;
    /** PRNG seed; identical seeds give identical output. */
    seed: number;
}

export const DEFAULT_PERCEPTION: PerceptionOptions = {
    dropoutProbability: 0.12,
    jitterWorldUnits: 6,
    headingErrorRadians: 0.035,
    latencySeconds: 0.25,
    confidenceMin: 0.55,
    confidenceMax: 0.98,
    seed: 0x5eed
};

/** Deterministic 32-bit PRNG. Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface PerceptionResult {
    /** Reused output buffer; only the first `count` entries are valid. */
    targets: AdasTarget[];
    count: number;
    /** Targets that were dropped this frame. */
    dropped: number;
}

interface HistoryFrame {
    time: number;
    targets: AdasTarget[];
    count: number;
}

/** Creates a blank target used to preallocate the buffers. */
function blankTarget(): AdasTarget {
    return {
        id: '',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        heading: 0,
        length: 1,
        width: 1,
        height: 1,
        kind: 'unknown' as TargetKind,
        confidence: 1,
        source: 'perception' as TargetSource
    };
}

function copyTarget(from: AdasTarget, to: AdasTarget): void {
    to.id = from.id;
    to.position.x = from.position.x;
    to.position.y = from.position.y;
    to.position.z = from.position.z;
    to.velocity.x = from.velocity.x;
    to.velocity.y = from.velocity.y;
    to.velocity.z = from.velocity.z;
    to.heading = from.heading;
    to.length = from.length;
    to.width = from.width;
    to.height = from.height;
    to.kind = from.kind;
    to.confidence = from.confidence;
    to.source = 'perception';
}

/**
 * Applies the configured degradation to a ground-truth stream.
 *
 * `perceive()` allocates nothing after construction: the history ring and the output buffer are
 * preallocated for `capacity` targets, so a 60-target frame costs no garbage.
 */
export class PerceptionModel {
    private readonly options: PerceptionOptions;
    private readonly capacity: number;
    private readonly history: HistoryFrame[] = [];
    private readonly output: AdasTarget[] = [];
    private readonly random: () => number;
    private time = 0;
    private historyCursor = 0;
    private droppedCount = 0;

    constructor(options: PerceptionOptions = DEFAULT_PERCEPTION, capacity = 60, historyFrames = 24) {
        this.options = options;
        this.capacity = capacity;
        this.random = mulberry32(options.seed);
        for (let frame = 0; frame < historyFrames; frame += 1) {
            this.history.push({ time: -Infinity, targets: [], count: 0 });
        }
        for (let index = 0; index < capacity; index += 1) {
            this.output.push(blankTarget());
        }
        for (const frame of this.history) {
            for (let index = 0; index < capacity; index += 1) {
                frame.targets.push(blankTarget());
            }
        }
    }

    /** Deterministic and side-effect free w.r.t. the caller's targets. */
    perceive(truth: readonly AdasTarget[], deltaSeconds: number): PerceptionResult {
        this.time += Math.max(0, deltaSeconds);

        // 1. Record the ground truth into the ring (overwriting the oldest frame).
        const frame = this.history[this.historyCursor];
        frame.time = this.time;
        frame.count = Math.min(truth.length, this.capacity);
        for (let index = 0; index < frame.count; index += 1) {
            copyTarget(truth[index], frame.targets[index]);
        }
        this.historyCursor = (this.historyCursor + 1) % this.history.length;

        // 2. Pick the newest frame that is at least `latencySeconds` old. The epsilon absorbs
        // floating-point drift from accumulating the frame deltas: `sum(120) - sum(105)` is not
        // guaranteed to equal `sum(15)` exactly, which would silently drop the frame we want.
        const requiredAge = Math.max(0, this.options.latencySeconds - 1e-9);
        let delayed: HistoryFrame | null = null;
        for (const candidate of this.history) {
            if (candidate.time > -Infinity && this.time - candidate.time >= requiredAge) {
                if (delayed === null || candidate.time > delayed.time) {
                    delayed = candidate;
                }
            }
        }
        if (delayed === null) {
            return { targets: this.output, count: 0, dropped: 0 };
        }

        // 3. Degrade: dropout, jitter, heading error, confidence.
        let count = 0;
        let dropped = 0;
        for (let index = 0; index < delayed.count; index += 1) {
            if (this.random() < this.options.dropoutProbability) {
                dropped += 1;
                continue;
            }
            const source = delayed.targets[index];
            const target = this.output[count];
            copyTarget(source, target);
            const jitter = this.options.jitterWorldUnits;
            target.position.x += (this.random() * 2 - 1) * jitter;
            target.position.y += (this.random() * 2 - 1) * jitter;
            target.position.z += (this.random() * 2 - 1) * jitter;
            target.heading += (this.random() * 2 - 1) * this.options.headingErrorRadians;
            const { confidenceMin, confidenceMax } = this.options;
            target.confidence = confidenceMin + this.random() * (confidenceMax - confidenceMin);
            count += 1;
        }
        this.droppedCount += dropped;

        return { targets: this.output, count, dropped };
    }

    droppedTotal(): number {
        return this.droppedCount;
    }

    /** Simulated time the model has advanced so far (seconds). */
    elapsedSeconds(): number {
        return this.time;
    }
}
