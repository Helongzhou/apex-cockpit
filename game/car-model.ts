// car-model.ts - Loads the hand-made Ford Anglia model once and splits it into the parts the game drives
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// The bundler emits the model and hands back its final URL; a plain relative string
// would not be copied into dist/.
import CAR_MODEL_URL from './models/car.glb?url';
import { cacheOnce } from './loading.js';

// Half-track the physics rig is tuned for; the model is scaled uniformly so its wheels span it.
// Matching the track (not the wheelbase) keeps the original roll-over resistance.
const TARGET_HALF_TRACK = 5;
// The chassis rests ~3.2 above the wheels; the body is lowered by a bit less so a small gap remains
const BODY_DROP = 1.8;
// The steering hub mesh also holds a fixed arm reaching to the dashboard. In raw model units the hub and
// spokes sit within this distance of the ring plane along the column axis; the arm lies beyond it.
const COLUMN_SPLIT_AXIAL = 0.04;
const STEERING_COLUMN_NODE = 'Cube.075'; // the hub node that carries this arm

// Node names inside the model (stable, preserved through Draco compression). Everything not listed is body.
const PART_NAMES = {
    frontWheels: ['Cylinder.023'],
    rearWheels: ['Cylinder.024'],
    steeringWheel: ['Torus.002', 'Cube.074', STEERING_COLUMN_NODE],
    gasPedal: ['Cube.067', 'Cube.068'],
    brakePedal: ['Cube.065', 'Cube.066'],
    shifter: ['Cylinder.030'],
    headlights: ['Plane.021'],
    taillights: ['Plane.041', 'Plane.042', 'Plane.043'],
    glass: ['Plane.001', 'Plane.029', 'Plane.023']
} as const;

const WHEEL_CORNERS = {
    front: ['frontLeft', 'frontRight'],
    rear: ['rearLeft', 'rearRight']
} as const;

/** The parts the model is split into. Everything unlisted ends up in `body`. */
export interface MeshBuckets {
    body: THREE.Mesh[];
    frontWheels: THREE.Mesh[];
    rearWheels: THREE.Mesh[];
    steeringWheel: THREE.Mesh[];
    gasPedal: THREE.Mesh[];
    brakePedal: THREE.Mesh[];
    shifter: THREE.Mesh[];
    headlights: THREE.Mesh[];
    taillights: THREE.Mesh[];
    glass: THREE.Mesh[];
}

type PartKey = Exclude<keyof MeshBuckets, 'body'>;

export interface WheelPart {
    corner: string;
    geometry: THREE.BufferGeometry;
    position: THREE.Vector3;
    radius: number;
}

/** A part recentred on its pivot, with the orientation the pivot node re-applies. */
export interface PivotPart {
    geometry: THREE.BufferGeometry;
    pivot: THREE.Vector3;
    orientation: THREE.Quaternion;
}

export interface SteeringWheelPart {
    geometry: THREE.BufferGeometry;
    pivot: THREE.Vector3;
    axis: THREE.Vector3;
    armGeometry: THREE.BufferGeometry | null;
}

export interface CarModelData {
    bodyGeometry: THREE.BufferGeometry;
    bodyMaterial: THREE.MeshStandardMaterial;
    hullPoints: Float32Array;
    size: THREE.Vector3;
    wheels: WheelPart[];
    wheelRadius: number;
    halfWheelbase: number;
    halfTrack: number;
    steeringWheel: SteeringWheelPart;
    gasPedal: PivotPart;
    brakePedal: PivotPart;
    shifter: PivotPart;
    headlightGeometry: THREE.BufferGeometry;
    taillightGeometry: THREE.BufferGeometry;
    glassGeometry: THREE.BufferGeometry | null;
}

// Cached once, but a rejection clears the cache so a transient failure can be retried
// (the previous version cached the rejected promise for the page's whole lifetime).
const loadOnce = cacheOnce(loadAndPrepare);

/**
 * Loads and prepares the car model; later calls reuse the cached parts, a failed attempt
 * can be retried.
 */
export function loadCarModel(): Promise<CarModelData> {
    return loadOnce();
}

async function loadAndPrepare(): Promise<CarModelData> {
    console.log('🚗 Loading Ford Anglia car model...');
    const gltf = await createLoader().loadAsync(CAR_MODEL_URL);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const meshes = classifyMeshes(root);
    const material = markShared(pickMaterial(meshes));
    // Match the Babylon PBR look: a strongly metallic paint that mirrors the reflection probe. Three.js needs
    // a high metalness and low roughness for the envMap to read as clearly as Babylon's PBRMaterial does.
    material.metalness = 0.85;
    material.roughness = 0.25;

    // Measure the model's raw half-track, then scale so it matches the physics rig
    const rawFront = splitWheelPair(meshes.frontWheels, new THREE.Matrix4(), WHEEL_CORNERS.front);
    const scale = TARGET_HALF_TRACK / Math.abs(rawFront[0].position.x);
    const bake = computeBakeMatrix(meshes.frontWheels, meshes.rearWheels, scale);

    const wheels = [
        ...splitWheelPair(meshes.frontWheels, bake, WHEEL_CORNERS.front),
        ...splitWheelPair(meshes.rearWheels, bake, WHEEL_CORNERS.rear)
    ];
    const bodyGeometry = markShared(mergeBaked(meshes.body, bake));
    bodyGeometry.computeBoundingBox();

    console.log('✅ Ford Anglia prepared: body + 4 wheels + steering wheel + pedals + gear lever + lights');
    return {
        bodyGeometry,
        bodyMaterial: material,
        hullPoints: extractPoints(bodyGeometry),
        // computeBoundingBox() above always fills the box in.
        size: (bodyGeometry.boundingBox as THREE.Box3).getSize(new THREE.Vector3()),
        wheels,
        wheelRadius: wheels[0].radius,
        halfWheelbase: Math.abs(wheels[0].position.z),
        halfTrack: Math.abs(wheels[0].position.x),
        steeringWheel: buildSteeringWheel(meshes.steeringWheel, bake),
        gasPedal: buildPedal(meshes.gasPedal, bake),
        brakePedal: buildPedal(meshes.brakePedal, bake),
        shifter: buildShifter(meshes.shifter, bake),
        headlightGeometry: markShared(mergeBaked(meshes.headlights, bake)),
        taillightGeometry: markShared(mergeBaked(meshes.taillights, bake)),
        glassGeometry: meshes.glass.length > 0 ? markShared(mergeBaked(meshes.glass, bake)) : null
    };
}

function createLoader(): GLTFLoader {
    // three ships the Draco decoder next to DRACOLoader and resolves it with
    // `new URL(..., import.meta.url)`, so the bundler emits it as a local asset.
    // Do NOT call setDecoderPath(): that would replace those local URLs with a CDN path.
    const draco = new DRACOLoader();
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    return loader;
}

/** GLTFLoader strips the dots from node names, so both sides are compared without them */
function normalizeNodeName(name: string): string {
    return name.replace(/\./g, '');
}

function classifyMeshes(root: THREE.Object3D): MeshBuckets {
    const lookup = new Map<string, PartKey>();
    for (const [part, names] of Object.entries(PART_NAMES)) {
        for (const name of names) {
            lookup.set(normalizeNodeName(name), part as PartKey);
        }
    }
    const buckets: MeshBuckets = {
        body: [], frontWheels: [], rearWheels: [], steeringWheel: [], gasPedal: [],
        brakePedal: [], shifter: [], headlights: [], taillights: [], glass: []
    };
    root.traverse(object => {
        if ((object as THREE.Mesh).isMesh) {
            buckets[lookup.get(normalizeNodeName(object.name)) ?? 'body'].push(object as THREE.Mesh);
        }
    });
    if (buckets.frontWheels.length === 0 || buckets.rearWheels.length === 0) {
        throw new Error('Car model is missing its wheel meshes');
    }
    return buckets;
}

function pickMaterial(meshes: MeshBuckets): THREE.MeshStandardMaterial {
    // The GLB carries a single PBR material; car-lights and world materials are created separately.
    return (meshes.body[0] ?? meshes.frontWheels[0]).material as THREE.MeshStandardMaterial;
}

/**
 * Uniform scale + centering so the wheelbase is centred on Z and the axles sit at y = 0.
 */
function computeBakeMatrix(frontWheels: THREE.Mesh[], rearWheels: THREE.Mesh[], scale: number): THREE.Matrix4 {
    const front = worldBox(frontWheels).getCenter(new THREE.Vector3());
    const rear = worldBox(rearWheels).getCenter(new THREE.Vector3());
    const midZ = (front.z + rear.z) / 2;
    const axleY = (front.y + rear.y) / 2;
    return new THREE.Matrix4()
        .makeTranslation(0, -BODY_DROP, 0)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .multiply(new THREE.Matrix4().makeTranslation(0, -axleY, -midZ));
}

/** Merges meshes into one geometry, each baked with its own world matrix and the shared bake transform. */
function mergeBaked(meshes: THREE.Mesh[], bake: THREE.Matrix4): THREE.BufferGeometry {
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(bake));
    return mergeGeometries(geometries, false);
}

/**
 * Splits a wheel-pair mesh into its left (+X) and right (-X) wheel, each recentred on its own hub.
 */
function splitWheelPair(
    wheelMeshes: THREE.Mesh[],
    bake: THREE.Matrix4,
    [leftCorner, rightCorner]: readonly [string, string]
): WheelPart[] {
    const pair = mergeBaked(wheelMeshes, bake).toNonIndexed();
    return [
        finishWheel(filterTriangles(pair, cx => cx > 0), leftCorner),
        finishWheel(filterTriangles(pair, cx => cx < 0), rightCorner)
    ];
}

function finishWheel(geometry: THREE.BufferGeometry, corner: string): WheelPart {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    const position = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    geometry.translate(-position.x, -position.y, -position.z);
    return { corner, geometry: markShared(geometry), position, radius: Math.max(size.y, size.z) / 2 };
}

/** Keeps the triangles whose centroid (cx, cy, cz) passes the predicate, as a fresh non-indexed geometry. */
function filterTriangles(
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

function buildSteeringWheel(meshes: THREE.Mesh[], bake: THREE.Matrix4): SteeringWheelPart {
    const ring = meshes.find(mesh => mesh.name.startsWith('Torus')) ?? meshes[0];
    // The steering column axis is the ring's hole axis (its local Y), carried into car-frame coordinates
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(ring.getWorldQuaternion(new THREE.Quaternion())).normalize();

    // Ring centre: in world space for the axial split, in car-frame (the pivot) so the wheel spins in place.
    // The bake is a uniform scale plus translations, so the centre maps straight into car-frame coordinates.
    const ringWorld = ring.geometry.clone().applyMatrix4(ring.matrixWorld);
    ringWorld.computeBoundingBox();
    const center = (ringWorld.boundingBox as THREE.Box3).getCenter(new THREE.Vector3());
    const pivot = center.clone().applyMatrix4(bake);

    // The hub mesh bundles the spinning hub + spokes with a fixed arm reaching the dashboard.
    // Split it by distance from the ring plane along the column axis: the near part spins, the arm stays.
    const column = meshes.find(mesh => normalizeNodeName(mesh.name).startsWith(normalizeNodeName(STEERING_COLUMN_NODE)));
    const axialOf = (x: number, y: number, z: number): number =>
        (x - center.x) * axis.x + (y - center.y) * axis.y + (z - center.z) * axis.z;
    // Re-extracting with an always-true predicate gives every part the same attribute layout for mergeGeometries
    const bakeAndNormalize = (geometry: THREE.BufferGeometry): THREE.BufferGeometry =>
        filterTriangles(geometry.applyMatrix4(bake), () => true);

    const spinning: THREE.BufferGeometry[] = [];
    let armGeometry: THREE.BufferGeometry | null = null;
    for (const mesh of meshes) {
        const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
        if (mesh === column) {
            spinning.push(bakeAndNormalize(filterTriangles(world, (x, y, z) => Math.abs(axialOf(x, y, z)) < COLUMN_SPLIT_AXIAL)));
            armGeometry = markShared(bakeAndNormalize(filterTriangles(world, (x, y, z) => Math.abs(axialOf(x, y, z)) >= COLUMN_SPLIT_AXIAL)));
        } else {
            spinning.push(bakeAndNormalize(world));
        }
    }
    const geometry = mergeGeometries(spinning, false);
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    return { geometry: markShared(geometry), pivot, axis, armGeometry };
}

function buildPedal(meshes: THREE.Mesh[], bake: THREE.Matrix4): PivotPart {
    const geometry = mergeBaked(meshes, bake);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    // Hinge at the top so pressing rotates the pad forward and down around X
    const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    return { geometry: markShared(geometry), pivot, orientation: new THREE.Quaternion() };
}

function buildShifter(meshes: THREE.Mesh[], bake: THREE.Matrix4): PivotPart {
    const geometry = mergeBaked(meshes, bake);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    // Hinge at the base so tilting rocks the lever forward and back around X
    const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    return { geometry: markShared(geometry), pivot, orientation: new THREE.Quaternion() };
}

function worldBox(meshes: THREE.Mesh[]): THREE.Box3 {
    const box = new THREE.Box3();
    meshes.forEach(mesh => box.expandByObject(mesh));
    return box;
}

function extractPoints(geometry: THREE.BufferGeometry): Float32Array {
    const position = geometry.attributes.position;
    const points = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
        points[i * 3] = position.getX(i);
        points[i * 3 + 1] = position.getY(i);
        points[i * 3 + 2] = position.getZ(i);
    }
    return points;
}

function markShared<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
    resource.userData.shared = true;
    return resource;
}
