import { describe, expect, it } from 'vitest';
import { UNITS_PER_METER } from '../game/math/units.js';
import {
    createInitialVehicleState,
    deriveVehicleState,
    longitudinalSpeedMps,
    selectGear,
    shortestAngleDelta,
    theoreticalYawRate,
    type VehicleSample
} from '../game/vehicle-state.js';

const WHEELBASE_METERS = 3;
const MASS_KG = 5000;

/** Heading 0 means "forward is +Z", matching the game's yaw convention. */
function sample(overrides: Partial<VehicleSample> = {}): VehicleSample {
    return {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        steerAngle: 0,
        massKg: MASS_KG,
        wheelbaseMeters: WHEELBASE_METERS,
        ...overrides
    };
}

describe('longitudinalSpeedMps', () => {
    it('reads forward motion as positive', () => {
        // 80 world units/s = 10 m/s
        expect(longitudinalSpeedMps(sample({ velocity: { x: 0, y: 0, z: 80 } }))).toBeCloseTo(10, 12);
    });

    it('reads reverse motion as negative', () => {
        expect(longitudinalSpeedMps(sample({ velocity: { x: 0, y: 0, z: -80 } }))).toBeCloseTo(-10, 12);
    });

    it('ignores sideways motion (the car is sliding, not driving)', () => {
        expect(longitudinalSpeedMps(sample({ velocity: { x: 80, y: 0, z: 0 } }))).toBeCloseTo(0, 12);
    });

    it('projects onto the heading when the car is rotated', () => {
        const yaw = Math.PI / 2; // facing +X
        expect(longitudinalSpeedMps(sample({ yaw, velocity: { x: 80, y: 0, z: 0 } }))).toBeCloseTo(10, 12);
    });

    it('ignores vertical motion', () => {
        expect(longitudinalSpeedMps(sample({ velocity: { x: 0, y: 80, z: 0 } }))).toBeCloseTo(0, 12);
    });
});

describe('shortestAngleDelta', () => {
    it('takes the short way around the wrap point', () => {
        expect(shortestAngleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6, 12);
        expect(shortestAngleDelta(-3, 3)).toBeCloseTo(6 - Math.PI * 2, 12);
    });

    it('returns the plain difference for small angles', () => {
        expect(shortestAngleDelta(0.1, 0.4)).toBeCloseTo(0.3, 12);
    });
});

describe('theoreticalYawRate', () => {
    it('follows the bicycle model', () => {
        // v / L · tan(δ) = 10 / 3 · tan(0.1)
        expect(theoreticalYawRate(10, 0.1, 3)).toBeCloseTo((10 / 3) * Math.tan(0.1), 12);
    });

    it('is zero when standing still or not steering', () => {
        expect(theoreticalYawRate(0, 0.3, 3)).toBe(0);
        expect(theoreticalYawRate(10, 0, 3)).toBe(0);
    });

    it('does not divide by zero for a degenerate wheelbase', () => {
        expect(theoreticalYawRate(10, 0.3, 0)).toBe(0);
    });
});

describe('selectGear', () => {
    it('engages N when standing still without acceleration', () => {
        expect(selectGear(0, 0)).toBe('N');
        expect(selectGear(0.05, 0.05)).toBe('N');
    });

    it('engages D when moving forward', () => {
        expect(selectGear(5, 1)).toBe('D');
    });

    it('engages R when moving backwards', () => {
        expect(selectGear(-2, -1)).toBe('R');
    });
});

describe('deriveVehicleState', () => {
    it('reports every speed in physical units', () => {
        const initial = createInitialVehicleState();
        const state = deriveVehicleState(initial, sample({ velocity: { x: 0, y: 0, z: 80 } }), 1 / 60);
        expect(state.speedMps).toBeCloseTo(10, 12);
        expect(state.speedKmh).toBeCloseTo(36, 12);
    });

    it('converts the position from world units to metres', () => {
        const state = deriveVehicleState(createInitialVehicleState(), sample({ position: { x: 8, y: 16, z: -24 } }), 1 / 60);
        expect(state.positionMeters).toEqual({ x: 1, y: 2, z: -3 });
    });

    it('differentiates speed for the longitudinal acceleration', () => {
        const previous = { ...createInitialVehicleState(), speedMps: 0, yawRad: 0 };
        const state = deriveVehicleState(previous, sample({ velocity: { x: 0, y: 0, z: 8 } }), 1);
        expect(state.accelLongitudinal).toBeCloseTo(1, 12); // 1 m/s gained in 1 s
    });

    it('clamps an implausible finite difference (frame spike)', () => {
        const previous = createInitialVehicleState();
        const state = deriveVehicleState(previous, sample({ velocity: { x: 0, y: 0, z: 8 * 1000 } }), 1 / 1000);
        expect(Math.abs(state.accelLongitudinal)).toBeLessThanOrEqual(100);
    });

    it('derives the yaw rate and the lateral acceleration from the heading change', () => {
        const previous = { ...createInitialVehicleState(), yawRad: 0 };
        const yaw = 0.1;
        // In a steady turn the velocity vector follows the heading, so the longitudinal speed
        // stays 10 m/s (a velocity still pointing along the old heading would project to
        // 10·cos(0.1) and is a different manoeuvre).
        const velocity = { x: 80 * Math.sin(yaw), y: 0, z: 80 * Math.cos(yaw) };
        const state = deriveVehicleState(previous, sample({ yaw, velocity }), 0.1);
        expect(state.yawRate).toBeCloseTo(1, 12);
        expect(state.speedMps).toBeCloseTo(10, 12);
        expect(state.accelLateral).toBeCloseTo(10, 12); // v · ω = 10 · 1
        expect(state.yawRad).toBe(yaw);
    });

    it('reports no yaw rate for a zero-length frame instead of NaN', () => {
        const state = deriveVehicleState(createInitialVehicleState(), sample({ yaw: 1 }), 0);
        expect(state.yawRate).toBe(0);
        expect(state.accelLongitudinal).toBe(0);
    });

    it('converts the steering angle to degrees and computes the theoretical yaw rate', () => {
        const state = deriveVehicleState(createInitialVehicleState(), sample({ steerAngle: Math.PI / 4, velocity: { x: 0, y: 0, z: 80 } }), 1 / 60);
        expect(state.steerAngleDeg).toBeCloseTo(45, 12);
        expect(state.yawRateTheoretical).toBeCloseTo((10 / 3) * Math.tan(Math.PI / 4), 12);
    });

    it('computes the drive power from mass, acceleration and speed', () => {
        const previous = createInitialVehicleState();
        const state = deriveVehicleState(previous, sample({ velocity: { x: 0, y: 0, z: 160 } }), 1);
        // 20 m/s reached in 1 s with 5000 kg: 5000 · 20 · 20 / 1000 = 2000 kW
        expect(state.powerKw).toBeCloseTo(2000, 6);
    });

    it('passes the collision flag through', () => {
        expect(deriveVehicleState(createInitialVehicleState(), sample(), 1 / 60, true).collision).toBe(true);
        expect(deriveVehicleState(createInitialVehicleState(), sample(), 1 / 60).collision).toBe(false);
    });

    it('keeps the gear consistent with the direction of travel', () => {
        const forward = deriveVehicleState(createInitialVehicleState(), sample({ velocity: { x: 0, y: 0, z: 80 } }), 1 / 60);
        const backward = deriveVehicleState(createInitialVehicleState(), sample({ velocity: { x: 0, y: 0, z: -80 } }), 1 / 60);
        expect(forward.gear).toBe('D');
        expect(backward.gear).toBe('R');
    });

    it('is frame-rate independent for a constant acceleration', () => {
        // Same physical motion sampled at 30 Hz and 144 Hz must agree in speed.
        const run = (steps: number, dt: number) => {
            let state = createInitialVehicleState();
            let worldSpeed = 0;
            const accelWorldUnits = 8; // 1 m/s² in world units
            for (let step = 0; step < steps; step += 1) {
                worldSpeed += accelWorldUnits * dt;
                state = deriveVehicleState(state, sample({ velocity: { x: 0, y: 0, z: worldSpeed } }), dt);
            }
            return state;
        };
        const at30Hz = run(30, 1 / 30);
        const at144Hz = run(144, 1 / 144);
        expect(at30Hz.speedMps).toBeCloseTo(at144Hz.speedMps, 10);
        expect(at30Hz.accelLongitudinal).toBeCloseTo(at144Hz.accelLongitudinal, 10);
    });

    it('exposes the world scale so the conversion stays in one place', () => {
        expect(UNITS_PER_METER).toBe(8);
    });
});
