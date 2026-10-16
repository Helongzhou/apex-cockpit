import { describe, expect, it } from 'vitest';
import { mean, percentile, percentileOfSorted, summarize } from '../game/math/stats.js';

describe('percentileOfSorted', () => {
    it('uses nearest-rank on a sorted array', () => {
        const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(percentileOfSorted(sorted, 0.5)).toBe(5);
        expect(percentileOfSorted(sorted, 0.95)).toBe(10);
        expect(percentileOfSorted(sorted, 0.99)).toBe(10);
        expect(percentileOfSorted(sorted, 0)).toBe(1);
    });

    it('picks the nearest rank for a 100-sample window', () => {
        const sorted = Array.from({ length: 100 }, (_, index) => index + 1);
        expect(percentileOfSorted(sorted, 0.5)).toBe(50);
        expect(percentileOfSorted(sorted, 0.95)).toBe(95);
        expect(percentileOfSorted(sorted, 0.99)).toBe(99);
    });

    it('returns 0 for an empty array instead of NaN', () => {
        expect(percentileOfSorted([], 0.95)).toBe(0);
    });

    it('clamps out-of-range fractions', () => {
        expect(percentileOfSorted([3, 6, 9], -1)).toBe(3);
        expect(percentileOfSorted([3, 6, 9], 2)).toBe(9);
        expect(percentileOfSorted([3, 6, 9], Number.NaN)).toBe(0);
    });
});

describe('percentile and mean', () => {
    it('sorts before computing', () => {
        expect(percentile([10, 1, 5], 0.5)).toBe(5);
        expect(percentile([10, 1, 5], 1)).toBe(10);
    });

    it('averages samples and returns 0 for none', () => {
        expect(mean([2, 4, 6])).toBe(4);
        expect(mean([])).toBe(0);
    });
});

describe('summarize', () => {
    it('reports the full summary', () => {
        const summary = summarize([16, 8, 24, 12]);
        expect(summary.samples).toBe(4);
        expect(summary.min).toBe(8);
        expect(summary.max).toBe(24);
        expect(summary.mean).toBe(15);
        expect(summary.p50).toBe(12);
    });

    it('drops NaN and negative placeholders', () => {
        const summary = summarize([Number.NaN, -1, 10, 20]);
        expect(summary.samples).toBe(2);
        expect(summary.min).toBe(10);
    });

    it('handles an empty window', () => {
        expect(summarize([])).toEqual({ samples: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 });
    });

    it('handles a single sample', () => {
        const summary = summarize([42]);
        expect(summary).toMatchObject({ samples: 1, p50: 42, p95: 42, p99: 42, max: 42, mean: 42 });
    });
});
