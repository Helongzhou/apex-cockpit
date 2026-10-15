// game-session.ts - One playable round: scene, physics world, car, environment and the per-frame update
import * as THREE from 'three';
import type { World } from '@dimforge/rapier3d-compat';
import { babylonColor } from './color.js';
import { createPhysicsWorld, PhysicsStepper } from './physics-world.js';
import { ReflectionProbe } from './rendering.js';
import { FollowCamera } from './follow-camera.js';
import { createCar, type Car } from './car.js';
import { createEnvironment, type Environment } from './world.js';
import { CarControls } from './controls.js';
import { Telemetry } from './telemetry.js';
import type { GameHost } from './types.js';

const BACKGROUND_COLOR = [0.95, 0.95, 0.95] as const;
// Babylon.js direction (1, 1, 0) with the X axis mirrored for the right-handed world
const HEMISPHERIC_LIGHT = { direction: [-1, 1, 0] as const, intensity: 0.7 };

export interface GameSessionOptions {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    host: GameHost;
    scene: THREE.Scene;
    world: World;
    car: Car;
    environment: Environment;
}

export class GameSession {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    world: World;
    car: Car;
    environment: Environment;
    stepper: PhysicsStepper;
    controls: CarControls;
    telemetry: Telemetry;
    followCamera: FollowCamera;
    reflectionProbe: ReflectionProbe;

    static async create(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer, host: GameHost): Promise<GameSession> {
        const scene = createScene();
        const world = createPhysicsWorld();
        const car = await createCar(scene, world);
        const environment = createEnvironment(scene, world);
        return new GameSession({ canvas, renderer, host, scene, world, car, environment });
    }

    constructor({ canvas, renderer, host, scene, world, car, environment }: GameSessionOptions) {
        this.renderer = renderer;
        this.scene = scene;
        this.world = world;
        this.car = car;
        this.environment = environment;
        this.stepper = new PhysicsStepper(world);
        this.controls = new CarControls(car, host);
        this.telemetry = new Telemetry({ car, boxes: environment.boxes, host, physicsClock: this.stepper });

        this.followCamera = new FollowCamera(canvas);
        this.followCamera.lockTarget(car.mesh);
        this.followCamera.setCockpitRig(car.cockpit.rig);
        console.log('✅ Camera locked to car:', car.mesh.name);

        this.reflectionProbe = new ReflectionProbe();
        this.reflectionProbe.attachToMesh(car.mesh);
    }

    get camera(): THREE.Camera {
        return this.followCamera.camera;
    }

    update(deltaSeconds: number): void {
        this.controls.update();
        this.car.updateVisuals(this.controls.getVisualState(), this.followCamera.cockpit);
        this.stepper.step(deltaSeconds);
        this.car.syncMeshes();
        this.environment.syncMeshes();
        this.followCamera.update();
        this.telemetry.update();
        this.reflectionProbe.update(this.renderer, this.scene);
    }

    resize(aspect: number): void {
        this.followCamera.setAspect(aspect);
    }

    dispose(): void {
        this.controls.dispose();
        this.followCamera.dispose();
        this.reflectionProbe.dispose();
        disposeSceneResources(this.scene);
        this.world.free();
    }
}

function createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = babylonColor(...BACKGROUND_COLOR);

    const light = new THREE.HemisphereLight(0xffffff, 0x000000, HEMISPHERIC_LIGHT.intensity);
    light.position.set(...HEMISPHERIC_LIGHT.direction);
    scene.add(light);

    return scene;
}

/** Frees GPU resources created for this session; assets marked as shared stay alive for the next one */
function disposeSceneResources(scene: THREE.Scene): void {
    scene.traverse(object => {
        const light = object as THREE.Light;
        if (light.isLight) {
            light.dispose();
        }
        const mesh = object as THREE.Mesh;
        if (mesh.geometry && !mesh.geometry.userData.shared) {
            mesh.geometry.dispose();
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (material && !material.userData.shared) {
                material.dispose();
            }
        }
    });
}
