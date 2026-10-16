import { describe, expect, it } from 'vitest';
import { boxInertia, clampSymmetric, cylinderInertia, makeAckermann } from '../game/math/vehicle-math.js';

/** Geometry the physics rig is actually tuned for. */
const MODEL = { halfWheelbase: 1.5, halfTrack: 1 };

describe('makeAckermann', () => {
    it('turns the inner wheel sharper than the outer wheel', () => {
        const ackermann = makeAckermann(MODEL);
        const [inner, outer] = ackermann(0.3);
        expect(inner).toBeGreaterThan(outer);
        expect(outer).toBeGreaterThan(0);
    });

    it('swaps inner and outer wheel when steering the other way', () => {
        const ackermann = makeAckermann(MODEL);
        const [inner, outer] = ackermann(0.3);
        const [innerRight, outerRight] = ackermann(-0.3);
        // Mirroring the turn also mirrors which physical wheel is the inner one.
        expect(innerRight).toBeCloseTo(-outer, 12);
        expect(outerRight).toBeCloseTo(-inner, 12);
    });

    it('returns zero angles for zero steering instead of NaN', () => {
        // tan(0) is 0, so the average radius is Infinity and both atan() terms are exactly 0.
        expect(makeAckermann(MODEL)(0)).toEqual([0, 0]);
    });

    it('needs less steering angle with a longer wheelbase', () => {
        const short = makeAckermann({ halfWheelbase: 1, halfTrack: 1 })(0.3);
        const long = makeAckermann({ halfWheelbase: 2, halfTrack: 1 })(0.3);
        const average = (angles: [number, number]) => (angles[0] + angles[1]) / 2;
        expect(Math.abs(average(long))).toBeLessThan(Math.abs(average(short)));
        // A longer wheelbase also narrows the spread, so the outer wheel can turn *more* than
        // before even though the average drops — hence the spread assertion, not per-wheel.
        expect(long[0] - long[1]).toBeLessThan(short[0] - short[1]);
    });

    it('spreads the angles further apart with a wider track', () => {
        const narrow = makeAckermann({ halfWheelbase: 1.5, halfTrack: 0.5 })(0.3);
        const wide = makeAckermann({ halfWheelbase: 1.5, halfTrack: 1.5 })(0.3);
        expect(wide[0]).toBeGreaterThan(narrow[0]);
        expect(wide[1]).toBeLessThan(narrow[1]);
    });
});

describe('boxInertia', () => {
    it('matches the principal-axis formula', () => {
        // mass/12 = 1 for these numbers, so the sums are directly readable.
        expect(boxInertia(12, { x: 2, y: 4, z: 6 })).toEqual({ x: 52, y: 40, z: 20 });
    });

    it('is symmetric for a cube', () => {
        const inertia = boxInertia(8, { x: 3, y: 3, z: 3 });
        expect(inertia.x).toBe(inertia.y);
        expect(inertia.y).toBe(inertia.z);
        expect(inertia.x).toBeCloseTo(8 / 12 * 18, 12);
    });

    it('scales linearly with mass', () => {
        const single = boxInertia(5, { x: 1, y: 2, z: 3 });
        const double = boxInertia(10, { x: 1, y: 2, z: 3 });
        expect(double.x).toBeCloseTo(single.x * 2, 12);
        expect(double.y).toBeCloseTo(single.y * 2, 12);
        expect(double.z).toBeCloseTo(single.z * 2, 12);
    });
});

describe('cylinderInertia', () => {
    it('uses ½·m·r² around the axis', () => {
        expect(cylinderInertia(2, 3, 4).x).toBe(9);
    });

    it('uses the same value on both lateral axes', () => {
        const inertia = cylinderInertia(2, 3, 4);
        expect(inertia.y).toBe(inertia.z);
        expect(inertia.y).toBeCloseTo(2 * (3 * 9 + 16) / 12, 12);
    });

    it('approaches the thin-disc inertia as the length goes to zero', () => {
        const thin = cylinderInertia(2, 3, 0);
        expect(thin.y).toBeCloseTo(2 * 27 / 12, 12);
        expect(cylinderInertia(2, 3, 10).y).toBeGreaterThan(thin.y);
    });
});

describe('clampSymmetric', () => {
    it('clamps to the negative limit', () => {
        expect(clampSymmetric(-40, 10)).toBe(-10);
    });

    it('clamps to the positive limit', () => {
        expect(clampSymmetric(40, 10)).toBe(10);
    });

    it('passes values inside the range and on the boundary through', () => {
        expect(clampSymmetric(4, 10)).toBe(4);
        expect(clampSymmetric(-10, 10)).toBe(-10);
        expect(clampSymmetric(10, 10)).toBe(10);
        expect(clampSymmetric(0, 10)).toBe(0);
    });
});
