import { describe, expect, it } from 'vitest';
import {
    forwardOf,
    laneCentreOffset,
    laneIndexOf,
    lateralOffset,
    leftOf,
    roadEdgeExcursion
} from '../game/math/lane-geometry.js';

describe('heading vectors', () => {
    it('points forward along +Z for heading 0', () => {
        expect(forwardOf(0)).toEqual({ x: 0, z: 1 });
        expect(forwardOf(Math.PI / 2).x).toBeCloseTo(1, 12);
    });

    it('puts left at +X when driving along +Z (right-handed, +Y up)', () => {
        expect(leftOf(0)).toEqual({ x: 1, z: -0 });
        // Rotating the heading rotates the left vector with it.
        expect(leftOf(Math.PI / 2).x).toBeCloseTo(0, 12);
        expect(leftOf(Math.PI / 2).z).toBeCloseTo(-1, 12);
    });
});

describe('lateralOffset', () => {
    it('is zero on the centreline', () => {
        expect(lateralOffset({ x: 3, z: 10 }, { x: 3, z: 10 }, 0)).toBe(0);
    });

    it('is positive to the left and negative to the right', () => {
        expect(lateralOffset({ x: 2, z: 0 }, { x: 0, z: 0 }, 0)).toBeCloseTo(2, 12);
        expect(lateralOffset({ x: -2, z: 0 }, { x: 0, z: 0 }, 0)).toBeCloseTo(-2, 12);
    });

    it('measures the perpendicular distance, not the axial one', () => {
        // 3 ahead and 2 to the left of the centre: only the lateral part counts.
        expect(lateralOffset({ x: 2, z: 3 }, { x: 0, z: 0 }, 0)).toBeCloseTo(2, 12);
    });

    it('follows the heading', () => {
        const heading = Math.PI / 2; // driving towards +X, so left is -Z
        expect(lateralOffset({ x: 0, z: -2 }, { x: 0, z: 0 }, heading)).toBeCloseTo(2, 12);
    });
});

describe('lane geometry', () => {
    const laneCount = 3;
    const laneWidth = 32;

    it('centres the middle lane and mirrors the outer ones', () => {
        expect(laneCentreOffset(1, laneCount, laneWidth)).toBe(0);
        expect(laneCentreOffset(0, laneCount, laneWidth)).toBeCloseTo(32, 12);
        expect(laneCentreOffset(2, laneCount, laneWidth)).toBeCloseTo(-32, 12);
    });

    it('assigns lane indices across the road width', () => {
        expect(laneIndexOf(40, laneCount, laneWidth)).toBe(0);
        expect(laneIndexOf(0, laneCount, laneWidth)).toBe(1);
        expect(laneIndexOf(-40, laneCount, laneWidth)).toBe(2);
    });

    it('reports -1 outside the road', () => {
        expect(laneIndexOf(48.1, laneCount, laneWidth)).toBe(-1);
        expect(laneIndexOf(-48.1, laneCount, laneWidth)).toBe(-1);
    });

    it('reports edge excursions only beyond the road', () => {
        expect(roadEdgeExcursion(0, laneCount, laneWidth)).toBe(0);
        expect(roadEdgeExcursion(48, laneCount, laneWidth)).toBe(0);
        expect(roadEdgeExcursion(-60, laneCount, laneWidth)).toBeCloseTo(12, 12);
    });
});
