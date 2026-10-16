/**
 * lane-geometry.ts - Pure lane maths (no three, no Rapier, no DOM).
 *
 * Conventions: the world is right-handed with +Y up, so with forward = +Z the driver's left is
 * +X. A heading of 0 means "driving towards +Z". Lateral offsets are signed: **positive is left
 * of the lane centre**.
 */

export interface PointXZ {
    x: number;
    z: number;
}

/** Forward unit vector for a heading (radians, 0 = +Z). */
export function forwardOf(heading: number): PointXZ {
    return { x: Math.sin(heading), z: Math.cos(heading) };
}

/** Left unit vector for a heading: forward rotated +90° about Y. */
export function leftOf(heading: number): PointXZ {
    const forward = forwardOf(heading);
    return { x: forward.z, z: -forward.x };
}

/** Signed lateral offset of `point` from `centre`, given the lane heading. */
export function lateralOffset(point: PointXZ, centre: PointXZ, heading: number): number {
    const left = leftOf(heading);
    return (point.x - centre.x) * left.x + (point.z - centre.z) * left.z;
}

/** Lateral offset of a lane centre relative to the road centre, in metres. */
export function laneCentreOffset(index: number, laneCount: number, laneWidth: number): number {
    // Lane 0 is the leftmost lane, so its centre has the *largest* positive (left) offset —
    // the convention `laneIndexOf` uses as well.
    const centredIndex = (laneCount - 1) / 2 - index;
    return centredIndex * laneWidth;
}

/** Lane a lateral offset belongs to, or -1 when the vehicle is outside the road. */
export function laneIndexOf(offset: number, laneCount: number, laneWidth: number): number {
    const roadHalfWidth = (laneCount * laneWidth) / 2;
    if (Math.abs(offset) > roadHalfWidth) {
        return -1;
    }
    // +half road width is the left edge of lane 0.
    const index = Math.floor((roadHalfWidth - offset) / laneWidth);
    return Math.min(laneCount - 1, Math.max(0, index));
}

/** Distance of a point beyond the road edge; 0 while the vehicle is inside the lanes. */
export function roadEdgeExcursion(offset: number, laneCount: number, laneWidth: number): number {
    const roadHalfWidth = (laneCount * laneWidth) / 2;
    return Math.max(0, Math.abs(offset) - roadHalfWidth);
}
