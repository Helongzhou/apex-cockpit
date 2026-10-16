/**
 * highway.ts - The highway stage: a long straight with a gentle S-curve, three lanes, guardrails,
 * gantries and a kinematic lead vehicle cruising a deterministic path.
 *
 * It fulfils the same {@link Environment} contract as the studio, so `GameSession` does not care
 * which stage it is running. The station is the intended canvas for iteration 3's ADAS layers:
 * the lead vehicle gives them a stable target and the path gives them lane geometry.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAPIER, COLLISION_GROUPS, syncMeshWithBody } from '../physics-world.js';
import { babylonColor } from '../color.js';
import { GROUND_LEVEL, type Environment, type KnockableBox } from '../world.js';
import { ROAD_LENGTH, createHighwayPath, type HighwayPath } from '../math/highway-path.js';

const GROUND_THICKNESS = 2;
/** Total drivable length along +Z; the car spawns near the middle. */
/** Three lanes of this width. */
const LANE_WIDTH = 32;
const ROAD_WIDTH = LANE_WIDTH * 3;
const ROAD = { friction: 2, color: [0.12, 0.12, 0.14], specular: [0.05, 0.05, 0.05] } as const;
const MARKING = { height: 0.4, width: 1.2, dashLength: 20, gapLength: 20, color: [0.9, 0.9, 0.85] } as const;
const GUARDRAIL = { height: 5, thickness: 1.6, color: [0.75, 0.76, 0.78] } as const;
const GANTRY = { spacing: 400, height: 90, beamThickness: 4, postThickness: 5 } as const;
const LAMP = { spacing: 120, height: 70, armLength: 18, headSize: 6 } as const;
const LEAD_VEHICLE = { speed: 26, startDistance: 120, color: [0.16, 0.32, 0.62] } as const;
export { createHighwayPath } from '../math/highway-path.js';
export type { HighwayPath } from '../math/highway-path.js';

export interface HighwayEnvironment extends Environment {
    path: HighwayPath;
    /** World position of the kinematic lead vehicle, for the ADAS layers of iteration 3. */
    leadVehiclePosition(): { x: number; y: number; z: number };
    /** Distance the lead vehicle has travelled along the path. */
    leadVehicleDistance(): number;
}

function studioMaterial(color: readonly [number, number, number], specular: readonly [number, number, number]): THREE.MeshPhongMaterial {
    return new THREE.MeshPhongMaterial({ color: babylonColor(...color), specular: babylonColor(...specular) });
}

/** Static box with an optional Rapier collider, mirroring the studio's helper. */
function addBox(
    scene: THREE.Scene,
    world: RAPIER.World | null,
    size: { width: number; height: number; depth: number },
    position: { x: number; y: number; z: number },
    material: THREE.Material,
    friction = 0.4
): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    scene.add(mesh);
    if (world !== null) {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
        world.createCollider(
            RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.depth / 2)
                .setFriction(friction)
                .setCollisionGroups(COLLISION_GROUPS.Environment),
            body
        );
    }
    return mesh;
}

/**
 * Static geometry cache. The road furniture never changes between sessions, and building it
 * (merging hundreds of boxes) dominated the *first* switch to this stage. Caching the merged
 * buffers at module scope makes every switch after the first one cheap.
 */
const staticGeometry = {
    dashes: new Map<number, THREE.BufferGeometry>(),
    gantries: null as THREE.BufferGeometry | null,
    lamps: null as THREE.BufferGeometry | null
};

/** Builds the dashes of one lane separator as a single merged mesh (one draw call). */
function buildDashes(path: HighwayPath, offsetX: number): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const step = MARKING.dashLength + MARKING.gapLength;
    for (let distance = 0; distance + MARKING.dashLength < path.length; distance += step) {
        const middle = distance + MARKING.dashLength / 2;
        const centre = path.pointAt(middle);
        const heading = path.headingAt(middle);
        const geometry = new THREE.BoxGeometry(MARKING.width, MARKING.height, MARKING.dashLength);
        geometry.rotateY(heading);
        geometry.translate(centre.x + offsetX * Math.cos(heading), GROUND_LEVEL + MARKING.height / 2, centre.z - offsetX * Math.sin(heading));
        geometries.push(geometry);
    }
    return mergeGeometries(geometries) as THREE.BufferGeometry;
}

function buildGuardrails(scene: THREE.Scene, world: RAPIER.World): void {
    const material = studioMaterial(GUARDRAIL.color, [0.2, 0.2, 0.2]);
    for (const side of [-1, 1]) {
        const x = side * (ROAD_WIDTH / 2 + GUARDRAIL.thickness);
        addBox(
            scene,
            world,
            { width: GUARDRAIL.thickness, height: GUARDRAIL.height, depth: ROAD_LENGTH },
            { x, y: GROUND_LEVEL + GUARDRAIL.height / 2, z: 0 },
            material,
            0.1
        );
    }
}

function buildGantryGeometry(): THREE.BufferGeometry | null {
    const geometries: THREE.BufferGeometry[] = [];
    for (let z = -ROAD_LENGTH / 2 + GANTRY.spacing; z < ROAD_LENGTH / 2; z += GANTRY.spacing) {
        const beam = new THREE.BoxGeometry(ROAD_WIDTH + 20, GANTRY.beamThickness, GANTRY.beamThickness);
        beam.translate(0, GROUND_LEVEL + GANTRY.height, z);
        geometries.push(beam);
        for (const side of [-1, 1]) {
            const post = new THREE.BoxGeometry(GANTRY.postThickness, GANTRY.height, GANTRY.postThickness);
            post.translate(side * (ROAD_WIDTH / 2 + 8), GROUND_LEVEL + GANTRY.height / 2, z);
            geometries.push(post);
        }
    }
    return mergeGeometries(geometries);
}

function buildLampGeometry(): THREE.BufferGeometry | null {
    const geometries: THREE.BufferGeometry[] = [];
    for (let z = -ROAD_LENGTH / 2 + LAMP.spacing; z < ROAD_LENGTH / 2; z += LAMP.spacing) {
        for (const side of [-1, 1]) {
            const x = side * (ROAD_WIDTH / 2 + 12);
            const pole = new THREE.BoxGeometry(3, LAMP.height, 3);
            pole.translate(x, GROUND_LEVEL + LAMP.height / 2, z);
            geometries.push(pole);
            const arm = new THREE.BoxGeometry(LAMP.armLength, 2, 2);
            arm.translate(x - side * LAMP.armLength / 2, GROUND_LEVEL + LAMP.height, z);
            geometries.push(arm);
            const head = new THREE.BoxGeometry(LAMP.headSize, 1.5, LAMP.headSize);
            head.translate(x - side * LAMP.armLength, GROUND_LEVEL + LAMP.height - 1, z);
            geometries.push(head);
        }
    }
    return mergeGeometries(geometries);
}

/** Simple low-poly lead vehicle: one merged body plus four wheels. */
function buildLeadVehicleMesh(): THREE.Mesh {
    const body = new THREE.BoxGeometry(26, 12, 55);
    body.translate(0, 6, 0);
    const cabin = new THREE.BoxGeometry(22, 8, 26);
    cabin.translate(0, 15, -4);
    const merged = mergeGeometries([body, cabin]) as THREE.BufferGeometry;
    const mesh = new THREE.Mesh(merged, studioMaterial(LEAD_VEHICLE.color, [0.3, 0.3, 0.3]));
    mesh.name = 'LeadVehicle';
    return mesh;
}

/**
 * Builds the stage. The lead vehicle is a kinematic body: the player can bump into it and it
 * keeps cruising, which is what an ADAS target should do.
 */
export function createHighwayEnvironment(scene: THREE.Scene, world: RAPIER.World): HighwayEnvironment {
    const path = createHighwayPath();
    const roadMaterial = studioMaterial(ROAD.color, ROAD.specular);

    // Ground: its top surface is at GROUND_LEVEL, exactly like the studio track.
    addBox(
        scene,
        world,
        { width: ROAD_WIDTH + 400, height: GROUND_THICKNESS, depth: ROAD_LENGTH + 400 },
        { x: 0, y: GROUND_LEVEL - GROUND_THICKNESS / 2, z: 0 },
        studioMaterial([0.22, 0.24, 0.2], [0.05, 0.05, 0.05])
    );
    // Asphalt (visual only: the ground already carries the collision surface).
    addBox(
        scene,
        null,
        { width: ROAD_WIDTH, height: 0.6, depth: ROAD_LENGTH },
        { x: 0, y: GROUND_LEVEL + 0.3, z: 0 },
        roadMaterial,
        ROAD.friction
    );
    buildGuardrails(scene, world);

    const markingMaterial = studioMaterial(MARKING.color, [0.1, 0.1, 0.1]);
    for (const offset of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
        let dashes = staticGeometry.dashes.get(offset);
        if (dashes === undefined) {
            dashes = buildDashes(path, offset);
            staticGeometry.dashes.set(offset, dashes);
        }
        scene.add(new THREE.Mesh(dashes, markingMaterial));
    }
    staticGeometry.gantries ??= buildGantryGeometry();
    if (staticGeometry.gantries !== null) {
        scene.add(new THREE.Mesh(staticGeometry.gantries, studioMaterial([0.55, 0.58, 0.62], [0.2, 0.2, 0.2])));
    }
    staticGeometry.lamps ??= buildLampGeometry();
    if (staticGeometry.lamps !== null) {
        scene.add(new THREE.Mesh(staticGeometry.lamps, studioMaterial([0.5, 0.5, 0.55], [0.25, 0.25, 0.25])));
    }

    const leadMesh = buildLeadVehicleMesh();
    scene.add(leadMesh);
    const leadBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, GROUND_LEVEL + 2, 0));
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(13, 12, 28).setFriction(0.4).setCollisionGroups(COLLISION_GROUPS.Environment),
        leadBody
    );

    let leadDistance = LEAD_VEHICLE.startDistance;

    const placeLead = (): void => {
        const centre = path.pointAt(leadDistance);
        const heading = path.headingAt(leadDistance);
        leadMesh.position.set(centre.x, GROUND_LEVEL - 6, centre.z);
        leadMesh.rotation.y = heading;
        leadBody.setNextKinematicTranslation({ x: centre.x, y: GROUND_LEVEL + 2, z: centre.z });
        leadBody.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading));
    };
    placeLead();

    const boxes: KnockableBox[] = [];

    return {
        boxes,
        path,
        syncMeshes(): void {
            syncMeshWithBody(leadMesh, leadBody);
        },
        update(deltaSeconds: number): void {
            // Cruise forward; wrap around when the end of the road is reached so the target is
            // always available for the ADAS layers.
            leadDistance = (leadDistance + LEAD_VEHICLE.speed * deltaSeconds) % path.length;
            placeLead();
        },
        resetBoxes(): void {
            // The highway has no knockable props.
        },
        leadVehiclePosition(): { x: number; y: number; z: number } {
            const centre = path.pointAt(leadDistance);
            return { x: centre.x, y: GROUND_LEVEL + 2, z: centre.z };
        },
        leadVehicleDistance(): number {
            return leadDistance;
        }
    };
}
