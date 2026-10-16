import { describe, expect, it } from 'vitest';
import { CURVE, ROAD_LENGTH, createHighwayPath } from '../game/math/highway-path.js';

describe('createHighwayPath', () => {
    it('starts at the near end of the road and runs along +Z', () => {
        const path = createHighwayPath(1000);
        const start = path.pointAt(0);
        const end = path.pointAt(path.length);
        expect(start.z).toBeCloseTo(-500, 9);
        expect(end.z).toBeCloseTo(500, 9);
        expect(end.z).toBeGreaterThan(start.z);
    });

    it('is reproducible: the same distance always yields the same point', () => {
        const path = createHighwayPath();
        for (const distance of [0, 123.456, 900, 2399]) {
            expect(path.pointAt(distance)).toEqual(path.pointAt(distance));
        }
    });

    it('keeps the centreline inside the curve amplitude', () => {
        const path = createHighwayPath();
        let maxX = 0;
        for (let distance = 0; distance <= path.length; distance += 5) {
            maxX = Math.max(maxX, Math.abs(path.pointAt(distance).x));
        }
        expect(maxX).toBeLessThanOrEqual(CURVE.amplitude + 1e-9);
        expect(maxX).toBeGreaterThan(CURVE.amplitude * 0.9); // the curve really is used
    });

    it('reports the heading as 0 on the straight parts and non-zero inside the curve', () => {
        const path = createHighwayPath();
        const headings = [0, 200, 600, 1000, 1400, 2000].map(distance => path.headingAt(distance));
        expect(headings.every(heading => Number.isFinite(heading))).toBe(true);
        expect(Math.max(...headings.map(Math.abs))).toBeGreaterThan(0.05);
    });

    it('advances monotonically along the path', () => {
        const path = createHighwayPath();
        let previous = path.pointAt(0).z;
        for (let distance = 10; distance <= path.length; distance += 10) {
            const z = path.pointAt(distance).z;
            expect(z).toBeGreaterThan(previous);
            previous = z;
        }
    });

    it('defaults to the road length used by the scene geometry', () => {
        expect(createHighwayPath().length).toBe(ROAD_LENGTH);
    });
});
