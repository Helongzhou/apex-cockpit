// follow-camera.ts - Port of the Babylon.js FollowCamera including the mouse orbit control
import * as THREE from 'three';
import { listen, releaseAll, type ListenerHandle } from './listeners.js';
import { clampSymmetric } from './math/vehicle-math.js';

const FIELD_OF_VIEW_DEGREES = 45.8; // Babylon.js default camera fov (0.8 rad)
const COCKPIT_FIELD_OF_VIEW_DEGREES = 74; // wide driver-POV: full windshield above, wheel + footwell below
const NEAR_PLANE = 1;
const FAR_PLANE = 5000;
const INITIAL_POSITION = new THREE.Vector3(0, 10, -10);
const FOLLOW = {
    radius: 50,
    heightOffset: 20,
    rotationOffset: 180,
    cameraAcceleration: 0.035,
    maxCameraSpeed: 10
};
const MOUSE_DEGREES_PER_PIXEL = 0.5;

/** Driver's-eye rig in the car's local frame. */
export interface CockpitRig {
    eye: THREE.Vector3;
    look: THREE.Vector3;
}

export class FollowCamera {
    camera: THREE.PerspectiveCamera;
    rotationOffset: number;
    lockedTarget: THREE.Object3D | null;
    isMouseDown: boolean;
    canvas: HTMLCanvasElement;
    cockpit: boolean;
    cockpitRig: CockpitRig | null;
    scratch: { goal: THREE.Vector3; forward: THREE.Vector3; eye: THREE.Vector3; look: THREE.Vector3 };
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerMove: (event: PointerEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    handles: ListenerHandle[];

    constructor(canvas: HTMLCanvasElement) {
        this.camera = new THREE.PerspectiveCamera(
            FIELD_OF_VIEW_DEGREES, window.innerWidth / window.innerHeight, NEAR_PLANE, FAR_PLANE
        );
        this.camera.position.copy(INITIAL_POSITION);
        this.rotationOffset = FOLLOW.rotationOffset;
        this.lockedTarget = null;
        this.isMouseDown = false;
        this.canvas = canvas;
        this.cockpit = false;
        this.cockpitRig = null;
        // Reused every frame instead of allocating fresh vectors in the update
        this.scratch = { goal: new THREE.Vector3(), forward: new THREE.Vector3(), eye: new THREE.Vector3(), look: new THREE.Vector3() };

        this.onPointerDown = () => { this.isMouseDown = true; };
        this.onPointerUp = () => { this.isMouseDown = false; };
        this.onPointerMove = (event) => {
            if (this.isMouseDown) {
                // Rotate camera around the car using mouse movement
                this.rotationOffset += event.movementX * MOUSE_DEGREES_PER_PIXEL;
            }
        };
        this.onKeyDown = (event) => {
            if ((event.key === 'c' || event.key === 'C') && !event.repeat) {
                this.setCockpit(!this.cockpit);
            }
        };
        this.handles = [
            listen(canvas, 'pointerdown', this.onPointerDown),
            listen(window, 'pointerup', this.onPointerUp),
            listen(window, 'pointermove', this.onPointerMove),
            listen(window, 'keydown', this.onKeyDown)
        ];
    }

    lockTarget(object: THREE.Object3D): void {
        this.lockedTarget = object;
    }

    /** Interior camera pose in the car's local frame: { eye, look } vectors. */
    setCockpitRig(rig: CockpitRig): void {
        this.cockpitRig = rig;
    }

    setCockpit(on: boolean): void {
        this.cockpit = on;
        this.camera.fov = on ? COCKPIT_FIELD_OF_VIEW_DEGREES : FIELD_OF_VIEW_DEGREES;
        this.camera.updateProjectionMatrix();
    }

    setAspect(aspect: number): void {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    update(): void {
        if (!this.lockedTarget) {
            return;
        }
        if (this.cockpit && this.cockpitRig) {
            this.updateCockpit();
            return;
        }

        const velocity = this.computeGoalPosition(this.scratch.goal).sub(this.camera.position);
        velocity.x = clampSymmetric(velocity.x * FOLLOW.cameraAcceleration * 2, FOLLOW.maxCameraSpeed);
        velocity.y = clampSymmetric(velocity.y * FOLLOW.cameraAcceleration, FOLLOW.maxCameraSpeed);
        velocity.z = clampSymmetric(velocity.z * FOLLOW.cameraAcceleration * 2, FOLLOW.maxCameraSpeed);

        this.camera.position.add(velocity);
        // The single shared camera keeps the car's roll from the cockpit's up vector; the bird's-eye
        // view must stay world-upright, so reset up before lookAt regardless of how the car is lying.
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.lockedTarget.position);
    }

    /** Rigidly places the camera at the driver's eye, looking forward through the windshield. */
    updateCockpit(): void {
        // update() only routes here while both are set.
        const car = this.lockedTarget as THREE.Object3D;
        const rig = this.cockpitRig as CockpitRig;
        car.updateWorldMatrix(true, false);
        this.camera.position.copy(this.scratch.eye.copy(rig.eye).applyMatrix4(car.matrixWorld));
        this.camera.up.set(0, 1, 0).applyQuaternion(car.quaternion);
        this.camera.lookAt(this.scratch.look.copy(rig.look).applyMatrix4(car.matrixWorld));
    }

    /** The camera's goal position behind the car, written into `goal`. */
    computeGoalPosition(goal: THREE.Vector3): THREE.Vector3 {
        const target = (this.lockedTarget as THREE.Object3D).position;
        const forward = this.scratch.forward.set(0, 0, 1).applyQuaternion((this.lockedTarget as THREE.Object3D).quaternion);
        const yaw = Math.atan2(forward.x, forward.z);
        // Babylon.js uses sin/cos(rotationOffset + yaw) in its left-handed system; with the X axis
        // mirrored for Three.js the yaw changes sign, which keeps the orbit direction identical.
        const angle = yaw - THREE.MathUtils.degToRad(this.rotationOffset);

        return goal.set(
            target.x + Math.sin(angle) * FOLLOW.radius,
            target.y + FOLLOW.heightOffset,
            target.z + Math.cos(angle) * FOLLOW.radius
        );
    }

    dispose(): void {
        releaseAll(this.handles);
        this.handles = [];
    }
}

