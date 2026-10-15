// telemetry.ts - Vehicle data, race timer, collision and knocked-box detection for the HUD
import * as THREE from 'three';
import type { Car } from './car.js';
import type { GameHost } from './types.js';
import type { KnockableBox } from './world.js';

const SPEED_DEADZONE = 1;
const RACE_START_SPEED = 2;
// Detection timings run on simulated physics seconds, so slow frames or a hidden tab cannot skew them
const COLLISION = { speedDrop: 5, minimumPreviousSpeed: 2, cooldownSeconds: 0.5 };
const BOX = { settleTimeSeconds: 2, knockDistance: 3, cooldownSeconds: 1 };
const FULL_CIRCLE_DEGREES = 360;
// Every write to the reactive HUD re-renders it; 20 Hz keeps the readouts smooth without doing that on every frame
const HUD_UPDATE_INTERVAL_MS = 50;

export interface TelemetryOptions {
    car: Car;
    boxes: KnockableBox[];
    host: GameHost;
    physicsClock: { elapsedSeconds: number };
}

export class Telemetry {
    car: Car;
    boxes: KnockableBox[];
    host: GameHost;
    physicsClock: { elapsedSeconds: number };
    raceStarted: boolean;
    raceStartTime: number;
    lastSpeed: number;
    peakSpeed: number;
    nextHudUpdate: number;
    lastCollisionTime: number;
    lastKnockTimes: Map<string, number>;

    constructor({ car, boxes, host, physicsClock }: TelemetryOptions) {
        this.car = car;
        this.boxes = boxes;
        this.host = host;
        this.physicsClock = physicsClock;
        this.raceStarted = false;
        this.raceStartTime = 0;
        this.lastSpeed = 0;
        this.peakSpeed = 0;
        this.nextHudUpdate = 0;
        this.lastCollisionTime = -Infinity;
        this.lastKnockTimes = new Map();
    }

    update(): void {
        const velocity = this.car.linearVelocity();
        const rawSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const speed = rawSpeed < SPEED_DEADZONE ? 0 : rawSpeed;
        this.peakSpeed = Math.max(this.peakSpeed, speed);

        this.startRaceWhenMoving(speed);
        this.detectCollision(rawSpeed);
        this.detectKnockedBoxes();
        this.lastSpeed = rawSpeed;
        this.updateHud(speed);
    }

    /** Writes the readouts at HUD rate; the detection above still runs on every frame */
    updateHud(speed: number): void {
        const now = performance.now();
        if (now < this.nextHudUpdate) {
            return;
        }
        this.nextHudUpdate = now + HUD_UPDATE_INTERVAL_MS;
        this.updateVehicleData(speed);
        this.updateRaceTimer();
    }

    updateVehicleData(speed: number): void {
        const host = this.host;
        const position = this.car.position;

        host.speed = speed;
        host.position.x = position.x;
        host.position.y = position.y;
        host.position.z = position.z;
        host.rotation = THREE.MathUtils.radToDeg(this.car.yaw()) % FULL_CIRCLE_DEGREES;
        host.maxSpeed = Math.max(host.maxSpeed, this.peakSpeed);
    }

    /** Auto-starts the race when the car starts moving */
    startRaceWhenMoving(speed: number): void {
        if (this.raceStarted || speed <= RACE_START_SPEED) {
            return;
        }
        console.log('Race started automatically - car is moving!');
        this.raceStarted = true;
        this.raceStartTime = Date.now();
        this.host.isRacing = true;
    }

    updateRaceTimer(): void {
        if (this.raceStarted && this.host.isRacing) {
            this.host.raceTime = (Date.now() - this.raceStartTime) / 1000;
        }
    }

    /** A sudden speed drop counts as a collision */
    detectCollision(rawSpeed: number): void {
        const speedDrop = this.lastSpeed - rawSpeed;
        if (speedDrop <= COLLISION.speedDrop || this.lastSpeed <= COLLISION.minimumPreviousSpeed) {
            return;
        }
        const now = this.physicsClock.elapsedSeconds;
        if (now - this.lastCollisionTime <= COLLISION.cooldownSeconds) {
            return;
        }
        this.host.collisions++;
        this.lastCollisionTime = now;
        console.log(`Collision detected! Speed change: ${speedDrop.toFixed(2)}, Total collisions: ${this.host.collisions}`);
    }

    /** Boxes are checked after the physics settled, every box can be counted multiple times */
    detectKnockedBoxes(): void {
        const now = this.physicsClock.elapsedSeconds;
        if (now < BOX.settleTimeSeconds) {
            return;
        }

        for (const box of this.boxes) {
            if (!box.isSettled) {
                box.settle();
                continue;
            }
            const movedDistance = box.distanceFromSettledPosition();
            const lastKnockTime = this.lastKnockTimes.get(box.name) ?? -Infinity;
            if (movedDistance <= BOX.knockDistance || now - lastKnockTime <= BOX.cooldownSeconds) {
                continue;
            }
            this.host.knockedBoxes++;
            this.lastKnockTimes.set(box.name, now);
            box.settle();
            console.log(`Box ${box.name} moved ${movedDistance.toFixed(2)} units from settled position! Total: ${this.host.knockedBoxes}`);
        }
    }
}
