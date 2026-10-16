/**
 * units.ts - Unit conversion for the whole project.
 *
 * The physics world runs in "world units": the hand-made car is about 28 units long and the
 * rig is tuned so that `UNITS_PER_METER` world units equal one metre. Upstream defined this
 * constant but never used it, so every HUD readout was a raw world-unit number mislabelled as
 * km/h (analysis findings U1/U2). Everything that displays a physical quantity goes through
 * these helpers now.
 */

/** World units per metre: the car is ~28 units long, so 1 m ≈ 8 units. */
export const UNITS_PER_METER = 8;

export const SECONDS_PER_HOUR = 3600;
export const METERS_PER_KILOMETER = 1000;

/** World units -> metres. */
export function worldUnitsToMeters(worldUnits: number): number {
    return worldUnits / UNITS_PER_METER;
}

/** Metres -> world units. */
export function metersToWorldUnits(meters: number): number {
    return meters * UNITS_PER_METER;
}

/** World units per second -> metres per second. */
export function worldSpeedToMps(worldUnitsPerSecond: number): number {
    return worldUnitsToMeters(worldUnitsPerSecond);
}

/** Metres per second -> km/h. */
export function mpsToKmh(metersPerSecond: number): number {
    return metersPerSecond * (SECONDS_PER_HOUR / METERS_PER_KILOMETER);
}

/** World units per second -> km/h. The single entry point for every displayed speed. */
export function worldSpeedToKmh(worldUnitsPerSecond: number): number {
    return mpsToKmh(worldSpeedToMps(worldUnitsPerSecond));
}
