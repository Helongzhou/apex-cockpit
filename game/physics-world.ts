// physics-world.ts - Rapier physics world setup and shared physics helpers
import RAPIER from '@dimforge/rapier3d';
import type { Object3D } from 'three';
import { cacheOnce } from './loading.js';
import { PHYSICS_TIMESTEP, PhysicsStepper } from './math/physics-stepper.js';

export { PhysicsStepper };

const GRAVITY = { x: 0, y: -150, z: 0 };
const SOLVER_ITERATIONS = 16; // keeps the jointed car straight even on the hard spawn landing
const UNITS_PER_METER = 8; // the car is ~28 units long, so 1 meter is roughly 8 units

// Collision filters: car parts only collide with the environment, never with each other
const MEMBERSHIP = { CarParts: 0x0001, Environment: 0x0002 };
const ALL_GROUPS = 0xffff;
export const COLLISION_GROUPS = {
    CarParts: (MEMBERSHIP.CarParts << 16) | MEMBERSHIP.Environment,
    Environment: (MEMBERSHIP.Environment << 16) | ALL_GROUPS
};

// The non-compat build ships the wasm as a real asset and wires it up on import (there is no
// `init()` export), so initialisation is just "make sure the module is loaded". The previous
// compat build inlined the same wasm as base64 inside a 2.8 MB JS file.
const initEngine = cacheOnce(() => import('@dimforge/rapier3d').then(() => undefined));

/**
 * Loads the Rapier WASM module; a failed attempt can be retried.
 */
export function initPhysicsEngine(): Promise<void> {
    return initEngine();
}

/**
 * Creates a physics world with the gravity and solver settings of the original game
 */
export function createPhysicsWorld(): RAPIER.World {
    const world = new RAPIER.World(GRAVITY);
    world.timestep = PHYSICS_TIMESTEP;
    world.numSolverIterations = SOLVER_ITERATIONS;
    world.lengthUnit = UNITS_PER_METER;
    return world;
}


/**
 * Copies the rigid body transform onto a Three.js object
 */
export function syncMeshWithBody(mesh: Object3D, body: RAPIER.RigidBody): void {
    const translation = body.translation();
    const rotation = body.rotation();
    mesh.position.set(translation.x, translation.y, translation.z);
    mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

export { RAPIER };
