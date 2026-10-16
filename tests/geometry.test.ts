import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { filterTriangles, normalizeNodeName } from '../game/math/geometry.js';

/** Two triangles: the first entirely at x > 0, the second entirely at x < 0. */
function twoTriangles(withNormal = true, withUv = true): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        1, 0, 0, 2, 0, 0, 3, 0, 0,
        -1, 0, 0, -2, 0, 0, -3, 0, 0
    ], 3));
    if (withNormal) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3));
    }
    if (withUv) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    }
    return geometry;
}

describe('normalizeNodeName', () => {
    it('strips every dot from a glTF node name', () => {
        expect(normalizeNodeName('Cube.075')).toBe('Cube075');
        expect(normalizeNodeName('Wheel.001.Front')).toBe('Wheel001Front');
    });

    it('leaves a name without dots untouched', () => {
        expect(normalizeNodeName('CarBody')).toBe('CarBody');
    });
});

describe('filterTriangles', () => {
    it('keeps only the triangles whose centroid passes the predicate', () => {
        const result = filterTriangles(twoTriangles(), cx => cx > 0);
        expect(result.attributes.position.count).toBe(3);
        expect(Array.from(result.attributes.position.array)).toEqual([1, 0, 0, 2, 0, 0, 3, 0, 0]);
    });

    it('copies the normal and uv attributes when the source has them', () => {
        const result = filterTriangles(twoTriangles(), cx => cx > 0);
        expect(result.attributes.normal.count).toBe(3);
        expect(result.attributes.uv.count).toBe(3);
    });

    it('omits the normal and uv attributes when the source lacks them', () => {
        const result = filterTriangles(twoTriangles(false, false), () => true);
        expect(result.attributes.position.count).toBe(6);
        expect(result.attributes.normal).toBeUndefined();
        expect(result.attributes.uv).toBeUndefined();
    });

    it('returns an empty geometry when nothing is kept', () => {
        const result = filterTriangles(twoTriangles(), () => false);
        expect(result.attributes.position.count).toBe(0);
    });

    it('does not mutate the source geometry', () => {
        const source = twoTriangles();
        filterTriangles(source, cx => cx > 0);
        expect(source.attributes.position.count).toBe(6);
    });
});
