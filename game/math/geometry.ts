/**
 * geometry.ts - Pure buffer-geometry helpers extracted from `game/car-model.ts`.
 *
 * `filterTriangles` only touches CPU-side typed arrays (no WebGL context), so it is unit
 * testable in a plain node environment.
 */

import * as THREE from 'three';

/** glTF node names carry dots (`Cube.075`); the part lookup keys are dot-free. */
export function normalizeNodeName(name: string): string {
    return name.replace(/\./g, '');
}

/**
 * Keeps only the triangles whose centroid passes `keep`, preserving the vertex layout of the
 * source (position always, normal/uv only when the source has them).
 */
export function filterTriangles(
    geometry: THREE.BufferGeometry,
    keep: (cx: number, cy: number, cz: number) => boolean
): THREE.BufferGeometry {
    const src = geometry.attributes;
    const out: { position: number[]; normal: number[]; uv: number[] } = { position: [], normal: [], uv: [] };
    const pos = src.position;
    for (let t = 0; t < pos.count; t += 3) {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
        const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        if (!keep(cx, cy, cz)) {
            continue;
        }
        for (let v = t; v < t + 3; v++) {
            out.position.push(pos.getX(v), pos.getY(v), pos.getZ(v));
            if (src.normal) {
                out.normal.push(src.normal.getX(v), src.normal.getY(v), src.normal.getZ(v));
            }
            if (src.uv) {
                out.uv.push(src.uv.getX(v), src.uv.getY(v));
            }
        }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    if (src.normal) {
        result.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    }
    if (src.uv) {
        result.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    }
    return result;
}
