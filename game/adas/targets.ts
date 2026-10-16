/**
 * targets.ts - Object-pooled ADAS targets (functioning as the "perception output" layer).
 *
 * The pool exists so a 60-target frame costs zero allocations: every mesh, geometry, material and
 * scratch vector is created once in the constructor and only mutated afterwards (acceptance
 * criterion AC-E1.3). Targets come from either ground truth or the perception model, which the
 * caller marks with `source`.
 */

import * as THREE from 'three';
import { markAdas } from './layers.js';
import type { Vec3 } from '../types.js';

export type TargetKind = 'car' | 'truck' | 'pedestrian' | 'unknown';
export type TargetSource = 'truth' | 'perception';

export interface AdasTarget {
    id: string;
    position: Vec3;
    /** Velocity in world units per second. */
    velocity: Vec3;
    /** Heading in radians (0 = +Z). */
    heading: number;
    length: number;
    width: number;
    height: number;
    kind: TargetKind;
    /** 0..1; only meaningful for perceived targets. */
    confidence: number;
    source: TargetSource;
}

const KIND_COLORS: Record<TargetKind, number> = {
    car: 0x38bdf8,
    truck: 0xf59e0b,
    pedestrian: 0xf472b6,
    unknown: 0x94a3b8
};
const PERCEPTION_COLOR = 0xfbbf24;
/** Velocity leader length, in seconds of travel. */
const VELOCITY_SECONDS = 0.6;

/** One pool slot: a wireframe box plus a velocity leader, both reused every frame. */
interface Slot {
    box: THREE.LineSegments;
    velocity: THREE.Line;
    positionAttribute: THREE.BufferAttribute;
    velocityAttribute: THREE.BufferAttribute;
}

/**
 * Fixed-capacity pool of target markers. `update()` never allocates: it hides unused slots and
 * mutates the attributes of the ones it fills.
 */
export class TargetPool {
    private readonly slots: Slot[] = [];
    private activeCount = 0;

    constructor(private readonly scene: THREE.Scene, capacity: number) {
        // One template for the 12 edges of a box; every slot gets its own copy so the shared
        // buffer can never be mutated (and every slot keeps its own position attribute).
        const boxTemplate = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        for (let index = 0; index < capacity; index += 1) {
            const positionAttribute = new THREE.BufferAttribute(new Float32Array(24 * 3), 3);
            const box = new THREE.LineSegments(boxTemplate.clone(), new THREE.LineBasicMaterial({ transparent: true }));
            box.geometry.setAttribute('position', positionAttribute);
            box.frustumCulled = false;
            box.visible = false;

            const velocityAttribute = new THREE.BufferAttribute(new Float32Array(6), 3);
            const velocity = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true }));
            velocity.geometry.setAttribute('position', velocityAttribute);
            velocity.frustumCulled = false;
            velocity.visible = false;

            markAdas(box);
            markAdas(velocity);
            this.scene.add(box, velocity);
            this.slots.push({ box, velocity, positionAttribute, velocityAttribute });
        }
        boxTemplate.dispose(); // the per-slot clones own their buffers from here on
    }

    /** `limit` lets callers pass a reusable buffer plus a valid count (no slice, no map). */
    update(targets: readonly AdasTarget[], limit = targets.length): void {
        const count = Math.min(limit, targets.length, this.slots.length);
        for (let index = 0; index < count; index += 1) {
            const target = targets[index];
            const slot = this.slots[index];
            const halfLength = target.length / 2;
            const halfWidth = target.width / 2;
            const halfHeight = target.height / 2;
            const cos = Math.cos(target.heading);
            const sin = Math.sin(target.heading);
            // Eight corners of the oriented box, emitted as 12 edges (24 vertices).
            const corners: Array<[number, number, number]> = [];
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        const localX = sx * halfWidth;
                        const localZ = sz * halfLength;
                        // Rotate the local corner by the target heading around Y.
                        corners.push([
                            target.position.x + localX * cos + localZ * sin,
                            target.position.y + sy * halfHeight,
                            target.position.z - localX * sin + localZ * cos
                        ]);
                    }
                }
            }
            const edges = [
                [0, 1], [2, 3], [4, 5], [6, 7],
                [0, 2], [1, 3], [4, 6], [5, 7],
                [0, 4], [1, 5], [2, 6], [3, 7]
            ];
            let vertex = 0;
            for (const [from, to] of edges) {
                for (const corner of [corners[from], corners[to]]) {
                    this.slots[index].positionAttribute.setXYZ(vertex, corner[0], corner[1], corner[2]);
                    vertex += 1;
                }
            }
            slot.positionAttribute.needsUpdate = true;

            const leader = VELOCITY_SECONDS;
            slot.velocityAttribute.setXYZ(0, target.position.x, target.position.y, target.position.z);
            slot.velocityAttribute.setXYZ(
                1,
                target.position.x + target.velocity.x * leader,
                target.position.y + target.velocity.y * leader,
                target.position.z + target.velocity.z * leader
            );
            slot.velocityAttribute.needsUpdate = true;

            const color = target.source === 'perception' ? PERCEPTION_COLOR : KIND_COLORS[target.kind];
            (slot.box.material as THREE.LineBasicMaterial).color.setHex(color);
            (slot.box.material as THREE.LineBasicMaterial).opacity = target.source === 'perception'
                ? 0.35 + 0.65 * Math.max(0, Math.min(1, target.confidence))
                : 0.9;
            (slot.velocity.material as THREE.LineBasicMaterial).color.setHex(color);
            slot.box.visible = true;
            slot.velocity.visible = true;
        }

        for (let index = count; index < this.slots.length; index += 1) {
            this.slots[index].box.visible = false;
            this.slots[index].velocity.visible = false;
        }
        this.activeCount = count;
    }

    active(): number {
        return this.activeCount;
    }

    capacity(): number {
        return this.slots.length;
    }
}
