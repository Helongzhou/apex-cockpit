// controls.ts - Keyboard and touch input mapped onto the car's motors every frame
import type { Car } from './car.js';
import type { GameHost, TouchControls } from './types.js';
import { listen, releaseAll, type ListenerHandle } from './listeners.js';
import { describeDirection, type Action } from './math/input-mapping.js';
import { decayFactor, perSecondRate } from './math/frame-rate.js';

const MAX_SPEED = 80;
const REVERSE_SPEED_LIMIT = MAX_SPEED * 0.5;
// Rates are time-based: the upstream per-frame constants ran 2.4× faster at 144 Hz (findings F1-F4).
const ACCELERATION_PER_SECOND = perSecondRate(1);
const NATURAL_SLOWDOWN = 0.92; // reference factor at 60 fps, applied through decayFactor()
const MAX_STEERING_ANGLE = Math.PI / 4;
const STEERING_RATE_PER_SECOND = perSecondRate(0.05);
const STEERING_CENTERING = 0.85; // reference factor at 60 fps
// `Car.holdJump()` is level-triggered; budgeting the impulse per second keeps the jump
// identical at any frame rate (60 impulses/s is the original 60 fps behaviour).
const JUMP_IMPULSES_PER_SECOND = perSecondRate(1);
const KEY_ACTIONS = new Map<string, Action>([
    ['w', 'forward'], ['W', 'forward'], ['ArrowUp', 'forward'],
    ['s', 'backward'], ['S', 'backward'], ['ArrowDown', 'backward'],
    ['a', 'left'], ['A', 'left'], ['ArrowLeft', 'left'],
    ['d', 'right'], ['D', 'right'], ['ArrowRight', 'right'],
    ['b', 'brake'], ['B', 'brake'],
    [' ', 'jump']
]);
const RESET_KEY = 'Enter';

export interface CarVisualState {
    steerAngle: number;
    forward: boolean;
    backward: boolean;
    brake: boolean;
}

export class CarControls {
    car: Car;
    host: GameHost;
    pressed: TouchControls;
    currentSpeed: number;
    currentSteeringAngle: number;
    /** Fractional impulse budget for the level-triggered jump (see `applyJump`). */
    jumpBudget: number;
    /** Reused every frame instead of allocating new input objects */
    input: TouchControls;
    visualState: CarVisualState;
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
    handles: ListenerHandle[];

    constructor(car: Car, host: GameHost) {
        this.car = car;
        this.host = host;
        this.pressed = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.currentSpeed = 0;
        this.currentSteeringAngle = 0;
        this.jumpBudget = 0;
        this.input = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.visualState = { steerAngle: 0, forward: false, backward: false, brake: false };

        this.onKeyDown = (event) => this.handleKey(event, true);
        this.onKeyUp = (event) => this.handleKey(event, false);
        this.handles = [
            listen(window, 'keydown', this.onKeyDown),
            listen(window, 'keyup', this.onKeyUp)
        ];
    }

    dispose(): void {
        releaseAll(this.handles);
        this.handles = [];
    }

    handleKey(event: KeyboardEvent, isDown: boolean): void {
        if (event.key === RESET_KEY) {
            if (isDown) {
                this.host.resetGame();
            }
            return;
        }

        const action = KEY_ACTIONS.get(event.key);
        if (!action) {
            return;
        }
        this.pressed[action] = isDown;

        if (action === 'jump' && isDown && !event.repeat) {
            console.log('🚀 Jump button pressed!');
            this.car.jump();
        }
    }

    /** Applies the combined keyboard and touch input to the car, once per rendered frame */
    update(deltaSeconds: number): void {
        const input = this.combineInputs();

        if (input.jump) {
            this.applyJump(deltaSeconds);
        }
        this.updateSteering(input, deltaSeconds);
        this.updateSpeed(input, deltaSeconds);
        this.host.direction = describeDirection(input);

        this.car.setBrake(input.brake);
        this.car.setMotorSpeed(this.currentSpeed);
        this.car.setSteeringAngle(this.currentSteeringAngle);
    }

    /**
     * `Car.holdJump()` applies an impulse every time it is called, so holding the key used to
     * lift the car once per rendered frame: 14 impulses per 0.1 s at 144 Hz against 3 at 30 Hz.
     * The impulse is now budgeted per second, which keeps the 60 Hz feel at any frame rate.
     */
    applyJump(deltaSeconds: number): void {
        this.jumpBudget += JUMP_IMPULSES_PER_SECOND * deltaSeconds;
        while (this.jumpBudget >= 1) {
            this.car.holdJump();
            this.jumpBudget -= 1;
        }
    }

    /** Cockpit animation state for the steering wheel, pedals and gear lever. */
    getVisualState(): CarVisualState {
        const state = this.visualState;
        state.steerAngle = this.currentSteeringAngle;
        state.forward = this.input.forward;
        state.backward = this.input.backward;
        state.brake = this.input.brake;
        return state;
    }

    /** Merges the keyboard and touch input into the reused input object. */
    combineInputs(): TouchControls {
        const touch = this.host.touchControls;
        const input = this.input;
        input.forward = this.pressed.forward || Boolean(touch.forward);
        input.backward = this.pressed.backward || Boolean(touch.backward);
        input.left = this.pressed.left || Boolean(touch.left);
        input.right = this.pressed.right || Boolean(touch.right);
        input.brake = this.pressed.brake || Boolean(touch.brake);
        input.jump = this.pressed.jump || Boolean(touch.jump);
        return input;
    }

    updateSteering({ left, right }: TouchControls, deltaSeconds: number): void {
        const step = STEERING_RATE_PER_SECOND * deltaSeconds;
        if (left && this.currentSteeringAngle < MAX_STEERING_ANGLE) {
            this.currentSteeringAngle = Math.min(MAX_STEERING_ANGLE, this.currentSteeringAngle + step);
        } else if (right && this.currentSteeringAngle > -MAX_STEERING_ANGLE) {
            this.currentSteeringAngle = Math.max(-MAX_STEERING_ANGLE, this.currentSteeringAngle - step);
        } else if (!left && !right) {
            this.currentSteeringAngle *= decayFactor(STEERING_CENTERING, deltaSeconds);
        }
    }

    updateSpeed({ forward, backward, brake }: TouchControls, deltaSeconds: number): void {
        const step = ACCELERATION_PER_SECOND * deltaSeconds;
        if (brake) {
            this.currentSpeed = 0;
        } else if (forward && this.currentSpeed < MAX_SPEED) {
            this.currentSpeed = Math.min(MAX_SPEED, this.currentSpeed + step);
        } else if (backward && this.currentSpeed > -REVERSE_SPEED_LIMIT) {
            this.currentSpeed = Math.max(-REVERSE_SPEED_LIMIT, this.currentSpeed - step);
        } else if (!forward && !backward) {
            this.currentSpeed *= decayFactor(NATURAL_SLOWDOWN, deltaSeconds);
        }
    }
}

