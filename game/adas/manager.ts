/**
 * manager.ts - Composes the ADAS visualisation: lane lines plus the target pool.
 *
 * The manager is the only place that knows about the mode ('off' / 'truth' / 'perception') and
 * the ego lane error, so the perception model of task E2 plugs in here without touching the scene
 * code, and the perf panel (E3) reads its counters from one place.
 */

import type * as THREE from 'three';
import { createLaneLines, type LaneLines } from './lanes.js';
import { TargetPool, type AdasTarget } from './targets.js';
import { laneCentreOffset, laneIndexOf, lateralOffset } from '../math/lane-geometry.js';
import { ADAS_LAYER, isAdas } from './layers.js';
import type { HighwayPath } from '../math/highway-path.js';
import type { Vec3 } from '../types.js';

export type AdasMode = 'off' | 'truth' | 'perception';

export interface EgoState {
    /** World-space position of the ego vehicle (world units). */
    position: Vec3;
    /** Heading in radians (0 = +Z). */
    heading: number;
}

export interface AdasStats {
    lanes: number;
    targets: number;
    capacity: number;
    /** Signed lateral error from the current lane centre, in metres (positive = left). */
    laneErrorMeters: number;
    /** Lane the ego is in, or -1 when outside the road. */
    laneIndex: number;
    visible: boolean;
    mode: AdasMode;
    /** Layer the overlays live on (documented in the panel and asserted by the checks). */
    layer: number;
    /** True when the lane group is on the ADAS layer *and nowhere else*. */
    layerIsolated: boolean;
}

export interface AdasOptions {
    path: HighwayPath;
    laneCount: number;
    laneWidth: number;
    targetCapacity: number;
}

export class AdasVisualisation {
    private readonly lanes: LaneLines;
    private readonly pool: TargetPool;
    private readonly path: HighwayPath;
    private readonly laneCount: number;
    private readonly laneWidth: number;
    private mode: AdasMode = 'off';
    private laneErrorMeters = 0;
    private currentLane = 0;

    constructor(scene: THREE.Scene, options: AdasOptions) {
        this.path = options.path;
        this.laneCount = options.laneCount;
        this.laneWidth = options.laneWidth;
        this.lanes = createLaneLines(options.path, options.laneCount, options.laneWidth);
        this.pool = new TargetPool(scene, options.targetCapacity);
        scene.add(this.lanes.group);
        this.setMode('off');
    }

    setMode(mode: AdasMode): void {
        this.mode = mode;
        this.lanes.group.visible = mode !== 'off';
        if (mode === 'off') {
            this.pool.update([]);
        }
    }

    /**
     * @param targets - ground-truth targets; in perception mode the caller (E2) has already
     *   downgraded them, so the manager renders whatever it is given.
     */
    update(ego: EgoState, targets: readonly AdasTarget[]): void {
        const distance = Math.min(Math.max(ego.position.z - -this.path.length / 2, 0), this.path.length);
        const centre = this.path.pointAt(distance);
        const heading = this.path.headingAt(distance);
        this.laneErrorMeters = lateralOffset(ego.position, centre, heading);
        this.currentLane = laneIndexOf(this.laneErrorMeters, this.laneCount, this.laneWidth);

        if (this.mode === 'off') {
            this.pool.update([]);
            return;
        }
        this.pool.update(targets.map(target => ({
            ...target,
            source: this.mode === 'truth' ? 'truth' : target.source
        })));
    }

    /** Lane centre lateral offset for a lane index, used by the tests and the panel. */
    laneOffset(index: number): number {
        return laneCentreOffset(index, this.laneCount, this.laneWidth);
    }

    stats(): AdasStats {
        return {
            lanes: this.lanes.lineCount,
            targets: this.pool.active(),
            capacity: this.pool.capacity(),
            laneErrorMeters: this.laneErrorMeters,
            laneIndex: this.currentLane,
            visible: this.mode !== 'off',
            mode: this.mode,
            layer: ADAS_LAYER,
            // Layer 0 is what the reflection probe and the default camera render: being off it is
            // exactly the isolation requirement (AC-E1.2).
            layerIsolated: isAdas(this.lanes.group) && !this.lanes.group.layers.isEnabled(0)
        };
    }

    dispose(): void {
        this.lanes.dispose();
    }
}
