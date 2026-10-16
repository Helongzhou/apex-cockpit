import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW, PerfMonitor } from '../game/perf-monitor.js';

describe('PerfMonitor', () => {
    it('starts empty and reports zeroes instead of NaN', () => {
        const monitor = new PerfMonitor(4);
        const snapshot = monitor.snapshot();
        expect(snapshot.interval.samples).toBe(0);
        expect(snapshot.fps).toBe(0);
        expect(Number.isNaN(snapshot.fps)).toBe(false);
    });

    it('derives fps from the mean frame interval', () => {
        const monitor = new PerfMonitor(4);
        for (let frame = 0; frame < 4; frame += 1) {
            monitor.frame(16.6667, 2, 2);
        }
        const snapshot = monitor.snapshot();
        expect(snapshot.fps).toBeGreaterThan(59);
        expect(snapshot.fps).toBeLessThan(61);
        expect(snapshot.interval.mean).toBeCloseTo(16.6667, 3);
    });

    it('keeps the script-time series separate from the interval series', () => {
        const monitor = new PerfMonitor(8);
        monitor.frame(100, 1, 1);
        monitor.frame(100, 9, 1);
        const snapshot = monitor.snapshot();
        expect(snapshot.interval.p50).toBe(100);
        expect(snapshot.script.max).toBe(9);
        expect(snapshot.script.p50).toBe(1);
    });

    it('only keeps the configured window', () => {
        const monitor = new PerfMonitor(4);
        for (const value of [1, 2, 3, 4, 5, 6]) {
            monitor.frame(value, 0, 0);
        }
        const snapshot = monitor.snapshot();
        expect(snapshot.interval.samples).toBe(4);
        expect(snapshot.interval.max).toBe(6);
        expect(snapshot.interval.min).toBeGreaterThanOrEqual(3);
    });

    it('accumulates physics substeps', () => {
        const monitor = new PerfMonitor(4);
        monitor.frame(16, 1, 2);
        monitor.frame(16, 1, 3);
        const snapshot = monitor.snapshot();
        expect(snapshot.physicsStepsLastFrame).toBe(3);
        expect(snapshot.physicsStepsTotal).toBe(5);
    });

    it('resets both series and the counters', () => {
        const monitor = new PerfMonitor(4);
        monitor.frame(16, 1, 2);
        monitor.reset();
        const snapshot = monitor.snapshot();
        expect(snapshot.interval.samples).toBe(0);
        expect(snapshot.physicsStepsTotal).toBe(0);
    });

    it('defaults to a four-second window at 60 fps', () => {
        expect(DEFAULT_WINDOW).toBe(240);
    });

    it('reuses its scratch buffer across snapshots', () => {
        const monitor = new PerfMonitor(4);
        monitor.frame(10, 1, 0);
        const first = monitor.snapshot();
        const second = monitor.snapshot();
        expect(second).toEqual(first);
    });
});
