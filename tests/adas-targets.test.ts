import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ADAS_LAYER, isAdas } from '../game/adas/layers.js';
import { TargetPool } from '../game/adas/targets.js';
import type { AdasTarget } from '../game/adas/targets.js';

const target = (id: string, x: number): AdasTarget => ({
    id,
    position: { x, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 10 },
    heading: 0,
    length: 40,
    width: 20,
    height: 20,
    kind: 'car',
    confidence: 1,
    source: 'truth'
});

describe('ADAS layers', () => {
    it('marks an object exclusively on the ADAS layer, including children', () => {
        const group = new THREE.Group();
        const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        group.add(child);
        group.layers.set(ADAS_LAYER);
        child.layers.set(ADAS_LAYER);
        expect(isAdas(group)).toBe(true);
        expect(isAdas(child)).toBe(true);
        expect(group.layers.isEnabled(0)).toBe(false);
    });

    it('keeps the ADAS layer off layer 0 so the reflection probe cannot see it', () => {
        const object = new THREE.Object3D();
        object.layers.set(ADAS_LAYER);
        expect(object.layers.test(new THREE.Layers())).toBe(false); // a default camera sees layer 0
        const adasCamera = new THREE.Layers();
        adasCamera.enable(ADAS_LAYER);
        expect(object.layers.test(adasCamera)).toBe(true);
    });
});

describe('TargetPool', () => {
    it('preallocates the requested capacity', () => {
        const scene = new THREE.Scene();
        const pool = new TargetPool(scene, 8);
        expect(pool.capacity()).toBe(8);
        expect(scene.children).toHaveLength(16); // one box + one velocity leader per slot
    });

    it('reuses the same objects across updates (zero allocation)', () => {
        const scene = new THREE.Scene();
        const pool = new TargetPool(scene, 4);
        const before = [...scene.children];
        pool.update([target('a', 0), target('b', 10)]);
        expect(scene.children).toEqual(before);
        expect(pool.active()).toBe(2);
        pool.update([target('c', 5)]);
        expect(scene.children).toEqual(before);
        expect(pool.active()).toBe(1);
    });

    it('clamps to the capacity and hides the unused slots', () => {
        const scene = new THREE.Scene();
        const pool = new TargetPool(scene, 2);
        pool.update([target('a', 0), target('b', 1), target('c', 2)]);
        expect(pool.active()).toBe(2);
        expect(scene.children.filter(child => child.visible)).toHaveLength(4); // 2 targets × 2 markers
    });

    it('writes the box position and the velocity leader', () => {
        const scene = new THREE.Scene();
        const pool = new TargetPool(scene, 1);
        pool.update([target('a', 7)]);
        const [box, velocity] = scene.children;
        expect(box.visible).toBe(true);
        const positions = box.geometry.getAttribute('position');
        // The box spans ±half width around x = 7, so the extreme corner must be beyond the centre.
        const xs = Array.from({ length: positions.count }, (_, index) => positions.getX(index));
        expect(Math.max(...xs)).toBeGreaterThan(7);
        expect(Math.min(...xs)).toBeLessThan(7);
        const leader = velocity.geometry.getAttribute('position');
        expect(leader.getZ(1)).toBeGreaterThan(0); // the leader points along +Z at 10 units/s
    });

    it('hides everything when the target list is empty', () => {
        const scene = new THREE.Scene();
        const pool = new TargetPool(scene, 2);
        pool.update([target('a', 0)]);
        pool.update([]);
        expect(pool.active()).toBe(0);
        expect(scene.children.every(child => !child.visible)).toBe(true);
    });
});
