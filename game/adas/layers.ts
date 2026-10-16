/**
 * layers.ts - Layer allocation for the ADAS overlays.
 *
 * ADAS geometry must be visible in the main view but **invisible** to two other passes:
 *   - the reflection probe's cube camera (otherwise the car mirrors its own HUD), and
 *   - the bloom pass's "dim everything that does not glow" traversal.
 *
 * Both fall out of putting ADAS objects on a dedicated layer exclusively: three's `CubeCamera`
 * renders layer 0 only, and `collectNonGlowingMeshes` skips ADAS objects explicitly.
 */

import type * as THREE from 'three';

/** Layer 0 is the regular scene, layer 1 is the glow layer; ADAS overlays get their own. */
export const ADAS_LAYER = 3;

/** Puts an object (and its children) on the ADAS layer and nowhere else. */
export function markAdas(object: THREE.Object3D): void {
    object.layers.set(ADAS_LAYER);
    object.traverse(child => child.layers.set(ADAS_LAYER));
}

export function isAdas(object: THREE.Object3D): boolean {
    return object.layers.isEnabled(ADAS_LAYER);
}
