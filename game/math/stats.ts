/**
 * stats.ts - Small statistics helpers for the performance monitor.
 *
 * Pure and allocation-free on the hot path: `percentileOf` works on an already-sorted buffer that
 * the caller owns, so sampling a frame costs nothing.
 */

export interface Summary {
    samples: number;
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
}

/** Samples below this are ignored as "no measurement" placeholders. */
export const NO_SAMPLE = -1;

/**
 * Percentile of a **sorted ascending** array using nearest-rank (the convention used by
 * frame-time budget tables). Returns 0 for an empty array so callers never see NaN.
 */
export function percentileOfSorted(sorted: readonly number[], fraction: number): number {
    if (sorted.length === 0) {
        return 0;
    }
    if (!Number.isFinite(fraction)) {
        return 0;
    }
    const clamped = Math.min(1, Math.max(0, fraction));
    const rank = Math.ceil(clamped * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function percentile(values: readonly number[], fraction: number): number {
    return percentileOfSorted([...values].sort((a, b) => a - b), fraction);
}

export function mean(values: readonly number[]): number {
    if (values.length === 0) {
        return 0;
    }
    let total = 0;
    for (const value of values) {
        total += value;
    }
    return total / values.length;
}

/** Full summary for a set of samples; NaN/negative placeholders are dropped first. */
export function summarize(values: readonly number[]): Summary {
    const usable = values.filter(value => Number.isFinite(value) && value >= 0);
    if (usable.length === 0) {
        return { samples: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
    }
    const sorted = [...usable].sort((a, b) => a - b);
    return {
        samples: sorted.length,
        min: sorted[0],
        p50: percentileOfSorted(sorted, 0.5),
        p95: percentileOfSorted(sorted, 0.95),
        p99: percentileOfSorted(sorted, 0.99),
        max: sorted[sorted.length - 1],
        mean: mean(sorted)
    };
}
