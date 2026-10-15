// color.ts - Color helper that keeps the original Babylon.js color values readable
import * as THREE from 'three';

/**
 * Babylon.js StandardMaterial colors are displayed without gamma correction, so the
 * original RGB values are interpreted as sRGB here to reproduce the same on-screen look.
 */
export function babylonColor(r: number, g: number, b: number): THREE.Color {
    return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}
