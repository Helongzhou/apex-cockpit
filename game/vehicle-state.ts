/**
 * vehicle-state.ts - Pure derivation of the vehicle signals the HMI consumes.
 *
 * Dependency-free (no three, no Rapier, no DOM) so it is unit testable and can also be fed by a
 * recorded replay instead of a live physics world (`game/state-bus.ts`).
 *
 * All output values are in **physical units**: m/s, km/h, m/s², rad/s, degrees. The conversion
 * from world units happens here and nowhere else (see `game/math/units.ts`).
 */

import { mpsToKmh, worldSpeedToMps, worldUnitsToMeters } from './math/units.js';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Raw per-frame sample taken from the simulation. */
export interface VehicleSample {
    /** World units. */
    position: Vec3;
    /** World units per second. */
    velocity: Vec3;
    /** Heading in radians (0 = +Z). */
    yaw: number;
    /** Average front-wheel steering angle in radians (positive = left). */
    steerAngle: number;
    /** Chassis mass in kilograms, used for the power readout. */
    massKg: number;
    /** Distance between the axles in metres (2 × halfWheelbase in world units / UNITS_PER_METER). */
    wheelbaseMeters: number;
}

export type Gear = 'P' | 'R' | 'N' | 'D';

export interface VehicleState {
    /** Physical speed, m/s. */
    speedMps: number;
    /** Physical speed, km/h — what the HUD and the cluster show. */
    speedKmh: number;
    /** Signed longitudinal acceleration in m/s² (positive = speeding up). */
    accelLongitudinal: number;
    /** Lateral (centripetal) acceleration in m/s², always ≥ 0. */
    accelLateral: number;
    /** Measured yaw rate in rad/s. */
    yawRate: number;
    /** Heading in radians (0 = +Z), carried so the next frame can derive the yaw rate. */
    yawRad: number;
    /** Yaw rate the steering geometry would produce at this speed, in rad/s. */
    yawRateTheoretical: number;
    /** Average front-wheel steering angle in degrees. */
    steerAngleDeg: number;
    /** Estimated drive power in kW (mass × acceleration × speed). */
    powerKw: number;
    gear: Gear;
    /** World-space position, metres. */
    positionMeters: Vec3;
    /** True on the frame a sudden speed drop was detected. */
    collision: boolean;
}

/** Speed below which the car counts as standing still (km/h). */
const STANDSTILL_KMH = 0.5;
/** Acceleration below which no gear is engaged (m/s²). */
const GEAR_DEADBAND_MPS2 = 0.15;
/** Finite differences amplify frame-to-frame noise; the raw value is clamped to this range. */
const MAX_PLAUSIBLE_ACCEL_MPS2 = 100;
const FULL_CIRCLE_RADIANS = Math.PI * 2;

export function createInitialVehicleState(): VehicleState {
    return {
        speedMps: 0,
        speedKmh: 0,
        accelLongitudinal: 0,
        accelLateral: 0,
        yawRate: 0,
        yawRad: 0,
        yawRateTheoretical: 0,
        steerAngleDeg: 0,
        powerKw: 0,
        gear: 'N',
        positionMeters: { x: 0, y: 0, z: 0 },
        collision: false
    };
}

/** Shortest signed difference between two angles, in radians. */
export function shortestAngleDelta(from: number, to: number): number {
    let delta = (to - from) % FULL_CIRCLE_RADIANS;
    if (delta > Math.PI) {
        delta -= FULL_CIRCLE_RADIANS;
    } else if (delta < -Math.PI) {
        delta += FULL_CIRCLE_RADIANS;
    }
    return delta;
}

/**
 * Longitudinal speed in m/s: the projection of the velocity onto the heading. Using the
 * projection (not the magnitude) means a car sliding sideways reports the speed it is actually
 * travelling forwards, and reversing yields a negative number.
 */
export function longitudinalSpeedMps(sample: VehicleSample): number {
    const forwardX = Math.sin(sample.yaw);
    const forwardZ = Math.cos(sample.yaw);
    const worldSpeed = sample.velocity.x * forwardX + sample.velocity.z * forwardZ;
    return worldSpeedToMps(worldSpeed);
}

/** Yaw rate in rad/s implied by the steering geometry (bicycle model). */
export function theoreticalYawRate(speedMps: number, steerAngle: number, wheelbaseMeters: number): number {
    if (wheelbaseMeters === 0) {
        return 0;
    }
    return (speedMps / wheelbaseMeters) * Math.tan(steerAngle);
}

const clamp = (value: number, limit: number): number =>
    value > limit ? limit : value < -limit ? -limit : value;

/**
 * Derives the current state from a sample. `previous` supplies the finite-difference reference
 * for the accelerations and the yaw rate; pass the state of the previous frame (or the initial
 * state) and the elapsed seconds.
 */
export function deriveVehicleState(
    previous: VehicleState,
    sample: VehicleSample,
    deltaSeconds: number,
    collision = false
): VehicleState {
    const speedMps = longitudinalSpeedMps(sample);
    const yawRate = deltaSeconds > 0 ? shortestAngleDelta(previous.yawRad, sample.yaw) / deltaSeconds : 0;

    const rawAccel = deltaSeconds > 0 ? (speedMps - previous.speedMps) / deltaSeconds : 0;
    const accelLongitudinal = clamp(rawAccel, MAX_PLAUSIBLE_ACCEL_MPS2);
    // Centripetal acceleration: a = v · ω (magnitude only, sign is carried by the yaw rate).
    const accelLateral = Math.abs(speedMps * yawRate);

    return {
        speedMps,
        speedKmh: mpsToKmh(speedMps),
        accelLongitudinal,
        accelLateral,
        yawRate,
        yawRad: sample.yaw,
        yawRateTheoretical: theoreticalYawRate(speedMps, sample.steerAngle, sample.wheelbaseMeters),
        steerAngleDeg: (sample.steerAngle * 180) / Math.PI,
        // Mechanical power: F · v with F = m · a. Negative while braking (energy recovered).
        powerKw: (sample.massKg * accelLongitudinal * speedMps) / 1000,
        gear: selectGear(speedMps, accelLongitudinal),
        positionMeters: {
            x: worldUnitsToMeters(sample.position.x),
            y: worldUnitsToMeters(sample.position.y),
            z: worldUnitsToMeters(sample.position.z)
        },
        collision
    };
}

/** Gear selection from the longitudinal motion: reverse below zero, drive above the standstill band. */
export function selectGear(speedMps: number, accelMps2: number): Gear {
    const speedKmh = mpsToKmh(Math.abs(speedMps));
    if (speedMps < -STANDSTILL_KMH / 3.6) {
        return 'R';
    }
    if (speedKmh < STANDSTILL_KMH && Math.abs(accelMps2) < GEAR_DEADBAND_MPS2) {
        return 'N';
    }
    return 'D';
}
