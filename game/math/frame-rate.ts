/**
 * frame-rate.ts - Converts per-frame constants into time-based ones.
 *
 * The upstream code expressed every rate as "amount per frame": acceleration, steering rate,
 * natural slowdown, camera smoothing. At 144 Hz those run 2.4× faster than at 60 Hz, so the same
 * input produces a different car (analysis findings F1–F4). Everything that used to be a
 * per-frame constant now goes through this module, which keeps 60 Hz as the reference so the
 * tuned feel of the original is preserved exactly at that rate.
 */

/** The frame rate the original constants were tuned at. */
export const REFERENCE_FPS = 60;

/** Converts a per-frame amount into a per-second rate. */
export function perSecondRate(perFrameAmount: number): number {
    return perFrameAmount * REFERENCE_FPS;
}

/**
 * Equivalent of applying `perFrameFactor` once per frame for `deltaSeconds`.
 *
 * Used for exponential smoothing (slowdown, centring, pedal easing): repeatedly lerping by a
 * fixed factor is `(1 - k)^frames`, so the delta-based form is `1 - (1 - k)^(delta·60)`.
 */
export function smoothingFactor(perFrameFactor: number, deltaSeconds: number): number {
    const frames = deltaSeconds * REFERENCE_FPS;
    // At the reference rate the factor must be returned untouched: `1 - (1 - k)` is not exactly
    // `k` in binary floating point (0.035 becomes 0.03500000000000003), and the whole point of
    // this refactor is that behaviour at 60 Hz is bit-identical to the original.
    return frames === 1 ? perFrameFactor : 1 - Math.pow(1 - perFrameFactor, frames);
}

/** Repeated multiplicative decay (e.g. drag): `factorPerFrame^frames`. */
export function decayFactor(perFrameFactor: number, deltaSeconds: number): number {
    return Math.pow(perFrameFactor, deltaSeconds * REFERENCE_FPS);
}

/** Clamps a step so that a spike cannot move more than the per-frame limit at the reference rate. */
export function clampStep(step: number, perFrameLimit: number, deltaSeconds: number): number {
    const limit = perFrameLimit * deltaSeconds * REFERENCE_FPS;
    if (step > limit) {
        return limit;
    }
    return step < -limit ? -limit : step;
}
