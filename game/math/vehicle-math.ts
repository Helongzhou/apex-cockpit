/**
 * vehicle-math.ts - Pure physics/steering helpers extracted from `game/car.ts`.
 *
 * Dependency-free on purpose: no three, no Rapier, no DOM. The formulas are copied verbatim
 * from the modules they were extracted from (task C4 S1 is a move, not a rewrite) so the unit
 * tests pin the behaviour the simulation depends on.
 */

/** Minimal wheel geometry the Ackermann solver needs; `CarModelData` satisfies it structurally. */
export interface WheelGeometry {
    halfWheelbase: number;
    halfTrack: number;
}

/** Principal inertia of a solid cylinder around its local axis (x) — wheels. */
export function cylinderInertia(mass: number, radius: number, length: number): { x: number; y: number; z: number } {
    const aroundAxis = 0.5 * mass * radius * radius;
    const acrossAxis = mass * (3 * radius * radius + length * length) / 12;
    return { x: aroundAxis, y: acrossAxis, z: acrossAxis };
}

/** Principal inertia of a solid box, used as approximation for the car body */
export function boxInertia(mass: number, size: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const factor = mass / 12;
    return {
        x: factor * (size.y * size.y + size.z * size.z),
        y: factor * (size.x * size.x + size.z * size.z),
        z: factor * (size.x * size.x + size.y * size.y)
    };
}

/** Ackermann steering derived from the model's wheelbase and track: the inner wheel turns sharper */
export function makeAckermann(model: WheelGeometry): (averageAngle: number) => [number, number] {
    const wheelbase = 2 * model.halfWheelbase;
    const trackWidth = 2 * model.halfTrack;
    return (averageAngle) => {
        const averageRadius = wheelbase / Math.tan(averageAngle);
        const innerRadius = averageRadius - trackWidth / 2;
        const outerRadius = averageRadius + trackWidth / 2;
        return [Math.atan(wheelbase / innerRadius), Math.atan(wheelbase / outerRadius)];
    };
}

/**
 * Symmetric clamp used by the camera panning speed. Unlike the original local helper it takes
 * the limit as a parameter, so this module stays free of the camera constants.
 */
export function clampSymmetric(value: number, limit: number): number {
    if (value < -limit) {
        return -limit;
    }
    return value > limit ? limit : value;
}
