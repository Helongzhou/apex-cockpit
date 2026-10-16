/**
 * lanes.ts - Lane line ribbons derived from the highway centreline.
 *
 * The lines are built once from the same deterministic path the road geometry uses, so the
 * visualisation can never drift away from the track. Rendering them as one indexed ribbon per
 * boundary keeps the draw-call cost at one per boundary.
 */

import * as THREE from 'three';
import { markAdas } from './layers.js';
import type { HighwayPath } from '../math/highway-path.js';

const LANE_LINE = { width: 0.9, color: 0x22d3ee, opacity: 0.55, sampleStep: 20 } as const;
/** Road edges are brighter and slightly wider than the lane separators. */
const ROAD_EDGE = { width: 1.4, color: 0x0ea5e9, opacity: 0.8 } as const;

export interface LaneLines {
    group: THREE.Group;
    /** Number of lane-line ribbons (the draw-call cost of the lanes). */
    lineCount: number;
    dispose(): void;
}

/** Builds a ribbon along the path at a constant lateral offset. */
function buildRibbon(path: HighwayPath, offset: number, width: number, material: THREE.Material): THREE.Mesh {
    const samples = Math.max(2, Math.ceil(path.length / LANE_LINE.sampleStep));
    const positions = new Float32Array((samples + 1) * 2 * 3);
    const indices: number[] = [];
    for (let sample = 0; sample <= samples; sample += 1) {
        const distance = (sample / samples) * path.length;
        const centre = path.pointAt(distance);
        const heading = path.headingAt(distance);
        // Left vector for this heading (see game/math/lane-geometry.ts).
        const leftX = Math.cos(heading);
        const leftZ = -Math.sin(heading);
        const half = width / 2;
        const base = sample * 6;
        positions[base] = centre.x + leftX * (offset + half);
        positions[base + 1] = 0.35;
        positions[base + 2] = centre.z + leftZ * (offset + half);
        positions[base + 3] = centre.x + leftX * (offset - half);
        positions[base + 4] = 0.35;
        positions[base + 5] = centre.z + leftZ * (offset - half);
        if (sample < samples) {
            const a = sample * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    markAdas(mesh);
    return mesh;
}

/**
 * Builds `laneCount + 1` boundaries: the road edges plus one separator between every pair of
 * lanes, all at their true lateral offsets from the centreline.
 */
export function createLaneLines(
    path: HighwayPath,
    laneCount: number,
    laneWidth: number
): LaneLines {
    const group = new THREE.Group();
    group.name = 'AdasLanes';
    const separatorMaterial = new THREE.MeshBasicMaterial({
        color: LANE_LINE.color,
        transparent: true,
        opacity: LANE_LINE.opacity,
        depthWrite: false
    });
    const edgeMaterial = new THREE.MeshBasicMaterial({
        color: ROAD_EDGE.color,
        transparent: true,
        opacity: ROAD_EDGE.opacity,
        depthWrite: false
    });

    const roadHalfWidth = (laneCount * laneWidth) / 2;
    for (let boundary = 0; boundary <= laneCount; boundary += 1) {
        const offset = roadHalfWidth - boundary * laneWidth;
        const isEdge = boundary === 0 || boundary === laneCount;
        group.add(buildRibbon(path, offset, isEdge ? ROAD_EDGE.width : LANE_LINE.width, isEdge ? edgeMaterial : separatorMaterial));
    }
    markAdas(group);

    return {
        group,
        lineCount: group.children.length,
        dispose(): void {
            for (const child of group.children) {
                const mesh = child as THREE.Mesh;
                mesh.geometry.dispose();
            }
            separatorMaterial.dispose();
            edgeMaterial.dispose();
        }
    };
}
