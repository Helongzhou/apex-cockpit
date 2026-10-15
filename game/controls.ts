// controls.ts - Keyboard and touch input mapped onto the car's motors every frame
import type { Car } from './car.js';
import type { GameHost, TouchControls } from './types.js';

const MAX_SPEED = 80;
const REVERSE_SPEED_LIMIT = MAX_SPEED * 0.5;
const ACCELERATION_PER_FRAME = 1;
const NATURAL_SLOWDOWN = 0.92;
const MAX_STEERING_ANGLE = Math.PI / 4;
const STEERING_STEP = 0.05;
const STEERING_CENTERING = 0.85;
const NO_DIRECTION = '—';

type Action = keyof TouchControls;

const KEY_ACTIONS = new Map<string, Action>([
    ['w', 'forward'], ['W', 'forward'], ['ArrowUp', 'forward'],
    ['s', 'backward'], ['S', 'backward'], ['ArrowDown', 'backward'],
    ['a', 'left'], ['A', 'left'], ['ArrowLeft', 'left'],
    ['d', 'right'], ['D', 'right'], ['ArrowRight', 'right'],
    ['b', 'brake'], ['B', 'brake'],
    [' ', 'jump']
]);
const RESET_KEY = 'Enter';

const DIRECTION_LABELS: ReadonlyArray<readonly [Action, string]> = [
    ['forward', '↑ Forward'],
    ['backward', '↓ Backward'],
    ['left', '← Left'],
    ['right', '→ Right'],
    ['brake', '🚗 Brake'],
    ['jump', '🚀 Jump']
];

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
    /** Reused every frame instead of allocating new input objects */
    input: TouchControls;
    visualState: CarVisualState;
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;

    constructor(car: Car, host: GameHost) {
        this.car = car;
        this.host = host;
        this.pressed = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.currentSpeed = 0;
        this.currentSteeringAngle = 0;
        this.input = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
        this.visualState = { steerAngle: 0, forward: false, backward: false, brake: false };

        this.onKeyDown = (event) => this.handleKey(event, true);
        this.onKeyUp = (event) => this.handleKey(event, false);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    dispose(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
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
    update(): void {
        const input = this.combineInputs();

        if (input.jump) {
            this.car.holdJump();
        }
        this.updateSteering(input);
        this.updateSpeed(input);
        this.host.direction = describeDirection(input);

        this.car.setBrake(input.brake);
        this.car.setMotorSpeed(this.currentSpeed);
        this.car.setSteeringAngle(this.currentSteeringAngle);
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

    updateSteering({ left, right }: TouchControls): void {
        if (left && this.currentSteeringAngle < MAX_STEERING_ANGLE) {
            this.currentSteeringAngle += STEERING_STEP;
        } else if (right && this.currentSteeringAngle > -MAX_STEERING_ANGLE) {
            this.currentSteeringAngle -= STEERING_STEP;
        } else if (!left && !right) {
            this.currentSteeringAngle *= STEERING_CENTERING;
        }
    }

    updateSpeed({ forward, backward, brake }: TouchControls): void {
        if (brake) {
            this.currentSpeed = 0;
        } else if (forward && this.currentSpeed < MAX_SPEED) {
            this.currentSpeed += ACCELERATION_PER_FRAME;
        } else if (backward && this.currentSpeed > -REVERSE_SPEED_LIMIT) {
            this.currentSpeed -= ACCELERATION_PER_FRAME;
        } else if (!forward && !backward) {
            this.currentSpeed *= NATURAL_SLOWDOWN;
        }
    }
}

function describeDirection(input: TouchControls): string {
    const labels = DIRECTION_LABELS.filter(([action]) => input[action]).map(([, label]) => label);
    return labels.length > 0 ? labels.join(' + ') : NO_DIRECTION;
}
