// game-session.ts - One playable round: scene, physics world, car, environment and the per-frame update
import * as THREE from 'three';
import type { World } from '@dimforge/rapier3d';
import { babylonColor } from './color.js';
import { createPhysicsWorld, PhysicsStepper } from './physics-world.js';
import { disposeSharedReflectionProbe, sharedReflectionProbe, ReflectionProbe } from './rendering.js';
import { FollowCamera } from './follow-camera.js';
import { createCar, type Car } from './car.js';
import type { Environment } from './world.js';
import { DEFAULT_STAGE, stageDefinition } from './scenes/index.js';
import { AdasVisualisation, type AdasMode, type AdasStats } from './adas/manager.js';
import { CarControls } from './controls.js';
import { Telemetry } from './telemetry.js';
import { createStateBus, type StateBus } from './state-bus.js';
import { createInitialVehicleState, deriveVehicleState, type VehicleSample, type VehicleState } from './vehicle-state.js';
import type { GameEvent, GameHost, StageId } from './types.js';

const BACKGROUND_COLOR = [0.95, 0.95, 0.95] as const;
// Babylon.js direction (1, 1, 0) with the X axis mirrored for the right-handed world
const HEMISPHERIC_LIGHT = { direction: [-1, 1, 0] as const, intensity: 0.7 };
/** Pool size for the ADAS target markers (the iteration plan budgets 60 targets). */
const ADAS_TARGET_CAPACITY = 60;

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
    /** Single source of truth for the physical state; the HUD and the ADAS layers consume it. */
    bus: StateBus<VehicleState, GameEvent>;
    /** ADAS overlays; null on stages that do not publish targets (the studio). */
    adas: AdasVisualisation | null;
    host: GameHost;
    private appliedAdasMode: AdasMode = 'off';
    /** While paused, `update()` does nothing: used while the WebGL context is lost. */
    paused: boolean;

    static async create(
        canvas: HTMLCanvasElement,
        renderer: THREE.WebGLRenderer,
        host: GameHost,
        stage: StageId = DEFAULT_STAGE
    ): Promise<GameSession> {
        const scene = createScene();
        const world = createPhysicsWorld();
        const car = await createCar(scene, world);
        // The stage only decides what the environment looks like; the car physics is shared.
        const environment = stageDefinition(stage).createEnvironment(scene, world);
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
        this.bus = createStateBus<VehicleState, GameEvent>(createInitialVehicleState());
        this.telemetry = new Telemetry({ host, boxes: environment.boxes, bus: this.bus, physicsClock: this.stepper });

        this.followCamera = new FollowCamera(canvas);
        this.followCamera.lockTarget(car.mesh);
        this.followCamera.setCockpitRig(car.cockpit.rig);
        console.log('✅ Camera locked to car:', car.mesh.name);

        // Shared across sessions: creating one cube render target per session leaked a
        // texture per reset (see `sharedReflectionProbe`).
        this.reflectionProbe = sharedReflectionProbe();
        this.reflectionProbe.attachToMesh(car.mesh);
        this.paused = false;
        this.host = host;

        // Only stages that publish an ADAS feed get overlays built at all.
        const adas = environment.adas;
        this.adas = adas === undefined
            ? null
            : new AdasVisualisation(scene, {
                path: adas.path,
                laneCount: adas.laneCount,
                laneWidth: adas.laneWidth,
                targetCapacity: ADAS_TARGET_CAPACITY
            });
    }

    get camera(): THREE.Camera {
        return this.followCamera.camera;
    }

    /**
     * @param onSubstep - optional hook called after every physics substep with the simulated
     *   time so far. The regression harness uses it to inject input on the physics grid instead
     *   of on render-frame boundaries.
     */
    update(deltaSeconds: number, onSubstep?: (elapsedSeconds: number) => void): void {
        // A lost WebGL context must not keep simulating: the loop is stopped anyway, and the
        // physics clock would drift while nothing can be drawn.
        if (this.paused) {
            return;
        }
        // Controls advance once per physics substep, so the same manoeuvre produces the same
        // trajectory at 30, 60 or 144 Hz (see game/math/physics-stepper.ts).
        this.stepper.step(deltaSeconds, fixedDeltaSeconds => {
            this.controls.update(fixedDeltaSeconds);
            onSubstep?.(this.stepper.elapsedSeconds);
        });
        this.car.updateVisuals(this.controls.getVisualState(), this.followCamera.cockpit, deltaSeconds);
        this.environment.update?.(deltaSeconds);
        this.car.syncMeshes();
        this.environment.syncMeshes();
        this.followCamera.update(deltaSeconds);
        this.updateAdas();
        this.publishVehicleState(deltaSeconds);
        this.reflectionProbe.update(this.renderer, this.scene);
    }

    /**
     * Samples the simulation, derives the **physical** state and publishes it. Publishing notifies
     * the telemetry consumer synchronously, so the HUD sees exactly the state the physics produced.
     */
    publishVehicleState(deltaSeconds: number): void {
        const velocity = this.car.linearVelocity();
        const sample: VehicleSample = {
            position: this.car.position,
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            yaw: this.car.yaw(),
            steerAngle: this.controls.currentSteeringAngle,
            massKg: this.car.massKg,
            wheelbaseMeters: this.car.wheelbaseMeters
        };
        // `justCollided` comes from the previous snapshot's detection: collisions are reported as
        // events, and the flag lets the next state carry the same fact for one frame.
        this.bus.publish(deriveVehicleState(this.bus.getState(), sample, deltaSeconds, this.telemetry.justCollided));
    }

    /** Applies the UI's ADAS mode and refreshes the overlays from the stage's ground truth. */
    updateAdas(): void {
        if (this.adas === null) {
            return;
        }
        if (this.host.adasMode !== this.appliedAdasMode) {
            this.adas.setMode(this.host.adasMode);
            this.appliedAdasMode = this.host.adasMode;
        }
        const position = this.car.position;
        this.adas.update(
            { position: { x: position.x, y: position.y, z: position.z }, heading: this.car.yaw() },
            this.environment.adas?.targets() ?? []
        );
    }

    adasStats(): AdasStats | null {
        return this.adas?.stats() ?? null;
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    /**
     * Rebuilds the reflection probe after a context restore: its cube render target was
     * created on the old context.
     *
     * The old probe is deliberately **not** disposed: its GL objects died with the previous
     * context, so calling `dispose()` only produces `INVALID_OPERATION: delete` warnings.
     */
    rebuildReflectionProbe(): void {
        disposeSharedReflectionProbe();
        this.reflectionProbe = sharedReflectionProbe();
        this.reflectionProbe.attachToMesh(this.car.mesh);
    }

    resize(aspect: number): void {
        this.followCamera.setAspect(aspect);
    }

    dispose(): void {
        this.adas?.dispose();
        this.telemetry.dispose();
        this.controls.dispose();
        this.followCamera.dispose();
        // The reflection probe is shared and outlives the session; it is released by
        // `disposeGame()`.
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
            // A light's shadow map is owned by its shadow object, not by the light: calling
            // only `light.dispose()` leaks one render target per session.
            const shadowOwner = light as THREE.Light & { shadow?: { dispose(): void } };
            shadowOwner.shadow?.dispose();
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
