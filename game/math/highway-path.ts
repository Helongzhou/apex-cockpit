/**
 * highway-path.ts - Deterministic centreline of the highway stage.
 *
 * Pure maths (no three, no Rapier, no DOM) so it is unit testable and so the same geometry can be
 * consumed by the scene, by the kinematic lead vehicle and - in iteration 3 - by the ADAS lane
 * visualisation. "Reproducible" here means: the same distance along the path always yields the
 * same point, independent of frame rate or wall-clock time.
 */

/** Total drivable length along +Z, matching the road geometry. */
export const ROAD_LENGTH = 2400;
/** Along the path, in world units: the S-curve amplitude and wavelength. */
export const CURVE = { amplitude: 26, wavelength: 800 } as const;

/**
 * Deterministic centreline. Everything on the highway (lane markings, guardrails, the lead
 * vehicle, and iteration 3's lane visualisation) is derived from this one function, so the stage
 * is fully reproducible.
 */
export interface HighwayPath {
    length: number;
    /** Centre of the road at `distance` along the path. */
    pointAt(distance: number): { x: number; y: number; z: number };
    /** Heading (radians, 0 = +Z) of the path at `distance`. */
    headingAt(distance: number): number;
}

export function createHighwayPath(length = ROAD_LENGTH): HighwayPath {
    const startZ = -length / 2;
    const centreX = (z: number): number =>
        CURVE.amplitude * Math.sin((z / CURVE.wavelength) * Math.PI * 2);

    return {
        length,
        pointAt(distance: number) {
            const z = startZ + distance;
            return { x: centreX(z), y: 0, z };
        },
        headingAt(distance: number) {
            const z = startZ + distance;
            const step = 1;
            return Math.atan2(centreX(z + step) - centreX(z), step);
        }
    };
}

