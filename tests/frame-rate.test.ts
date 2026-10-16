import { describe, expect, it } from 'vitest';
import { REFERENCE_FPS, clampStep, decayFactor, perSecondRate, smoothingFactor } from '../game/math/frame-rate.js';

/** Feeds a per-frame rule and the equivalent time-based rule over one second. */
function simulate(frames: number, perFrame: (value: number) => number, perDelta: (value: number, dt: number) => number) {
    const dt = 1 / frames;
    let a = 0;
    let b = 0;
    for (let step = 0; step < frames; step += 1) {
        a = perFrame(a);
        b = perDelta(b, dt);
    }
    return { perFrame: a, perDelta: b };
}

describe('perSecondRate', () => {
    it('scales a per-frame amount by the reference frame rate', () => {
        expect(REFERENCE_FPS).toBe(60);
        expect(perSecondRate(1)).toBe(60);
        expect(perSecondRate(0.05)).toBeCloseTo(3, 12);
    });
});

describe('smoothingFactor', () => {
    it('returns the per-frame factor untouched at the reference rate', () => {
        // Bit-exact on purpose: the refactor must not change 60 Hz behaviour at all.
        expect(smoothingFactor(0.2, 1 / 60)).toBe(0.2);
        expect(smoothingFactor(0.035, 1 / 60)).toBe(0.035);
        expect(smoothingFactor(0.85, 1 / 60)).toBe(0.85);
    });

    it('scales with the frame duration', () => {
        expect(smoothingFactor(0.2, 2 / 60)).toBeCloseTo(0.36, 12); // 1 - 0.8²
        expect(smoothingFactor(0.2, 1 / 30)).toBeGreaterThan(smoothingFactor(0.2, 1 / 60));
    });

    it('never exceeds one', () => {
        expect(smoothingFactor(0.9, 10)).toBeLessThanOrEqual(1);
    });
});

describe('decayFactor', () => {
    it('keeps the 60 Hz behaviour and matches repeated per-frame decay', () => {
        expect(decayFactor(0.92, 1 / 60)).toBeCloseTo(0.92, 12);
        // 30 frames of 0.92 per frame = 0.92^30 over half a second
        expect(decayFactor(0.92, 0.5)).toBeCloseTo(Math.pow(0.92, 30), 12);
    });

    it('decays less in a shorter frame', () => {
        expect(decayFactor(0.92, 1 / 144)).toBeGreaterThan(decayFactor(0.92, 1 / 60));
    });
});

describe('clampStep', () => {
    it('allows the full per-frame step at the reference rate', () => {
        expect(clampStep(10, 10, 1 / 60)).toBe(10);
        expect(clampStep(-10, 10, 1 / 60)).toBe(-10);
    });

    it('scales the allowance with the frame duration', () => {
        expect(clampStep(100, 10, 1 / 30)).toBe(20);
        expect(clampStep(100, 10, 1 / 144)).toBeCloseTo(10 * (60 / 144), 12);
    });

    it('leaves smaller steps untouched', () => {
        expect(clampStep(1, 10, 1 / 60)).toBe(1);
    });
});

describe('frame-rate independence', () => {
    it('a constant acceleration covers the same distance at 30, 60 and 144 Hz', () => {
        const perFrameRule = (v: number) => v + 1;
        const perDeltaRule = (v: number, dt: number) => v + perSecondRate(1) * dt;
        const results = [30, 60, 144].map(frames => simulate(frames, perFrameRule, perDeltaRule));
        for (const result of results) {
            expect(result.perDelta).toBeCloseTo(60, 9);
        }
    });

    it('multiplicative drag ends at the same speed at 30, 60 and 144 Hz', () => {
        const perFrameRule = (v: number) => (v === 0 ? 1 : v) * 0.92;
        const perDeltaRule = (v: number, dt: number) => (v === 0 ? 1 : v) * decayFactor(0.92, dt);
        const results = [30, 60, 144].map(frames => simulate(frames, perFrameRule, perDeltaRule));
        const [at30, at60, at144] = results;
        expect(at60.perDelta).toBeCloseTo(at30.perDelta, 9);
        expect(at144.perDelta).toBeCloseTo(at30.perDelta, 9);
    });

    it('exponential smoothing converges identically at 30, 60 and 144 Hz', () => {
        const perFrameRule = (v: number) => v + (1 - v) * 0.2;
        const perDeltaRule = (v: number, dt: number) => v + (1 - v) * smoothingFactor(0.2, dt);
        const results = [30, 60, 144].map(frames => simulate(frames, perFrameRule, perDeltaRule));
        for (const result of results) {
            expect(result.perDelta).toBeCloseTo(results[0].perDelta, 9);
        }
    });
});
