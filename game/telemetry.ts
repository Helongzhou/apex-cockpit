// telemetry.ts - Consumes the vehicle state bus: HUD snapshots at 20 Hz plus one-shot events
import type { GameEvent, GameHost } from './types.js';
import type { KnockableBox } from './world.js';
import type { StateBus } from './state-bus.js';
import type { VehicleState } from './vehicle-state.js';
import { mpsToKmh, worldSpeedToMps, worldUnitsToMeters } from './math/units.js';

// Thresholds were tuned in world units per second; they are converted once so the rest of this
// module can work in physical units (analysis findings U1/U2).
const SPEED_DEADZONE_MPS = worldSpeedToMps(1);
const RACE_START_SPEED_MPS = worldSpeedToMps(2);
// Detection timings run on simulated physics seconds, so slow frames or a hidden tab cannot skew them
const COLLISION = { speedDropMps: worldSpeedToMps(5), minimumPreviousSpeedMps: worldSpeedToMps(2), cooldownSeconds: 0.5 };
const BOX = { settleTimeSeconds: 2, knockDistanceMeters: worldUnitsToMeters(3), cooldownSeconds: 1 };
const FULL_CIRCLE_DEGREES = 360;
// Every write to the reactive HUD re-renders it; 20 Hz keeps the readouts smooth without doing that on every frame
const HUD_UPDATE_INTERVAL_MS = 50;

export interface TelemetryOptions {
    host: GameHost;
    boxes: KnockableBox[];
    /** The state bus this instance consumes; it does not sample the car itself any more. */
    bus: StateBus<VehicleState, GameEvent>;
    physicsClock: { elapsedSeconds: number };
}

export class Telemetry {
    host: GameHost;
    boxes: KnockableBox[];
    bus: StateBus<VehicleState, GameEvent>;
    physicsClock: { elapsedSeconds: number };
    raceStarted: boolean;
    raceStartTime: number;
    lastSpeedMps: number;
    peakSpeedKmh: number;
    nextHudUpdate: number;
    lastCollisionTime: number;
    lastKnockTimes: Map<string, number>;
    latest: VehicleState | null;
    /** Speed shown by the HUD (deadzone applied), km/h. */
    declaredSpeedKmh: number;
    /** Set on the frame a collision is detected; `GameSession` publishes it with the next snapshot. */
    justCollided: boolean;
    unsubscribeState: () => void;
    unsubscribeEvents: () => void;

    constructor({ host, boxes, bus, physicsClock }: TelemetryOptions) {
        this.host = host;
        this.boxes = boxes;
        this.bus = bus;
        this.physicsClock = physicsClock;
        this.raceStarted = false;
        this.raceStartTime = 0;
        this.lastSpeedMps = 0;
        this.peakSpeedKmh = 0;
        this.nextHudUpdate = 0;
        this.lastCollisionTime = -Infinity;
        this.lastKnockTimes = new Map();
        this.latest = null;
        this.declaredSpeedKmh = 0;
        this.justCollided = false;

        // The bus is the single source of truth: this consumer keeps its own detection state.
        this.unsubscribeState = bus.subscribe(state => this.onState(state));
        this.unsubscribeEvents = bus.onEvent(event => this.onEvent(event));
    }

    dispose(): void {
        this.unsubscribeState();
        this.unsubscribeEvents();
    }

    /** Consumes one published snapshot: detection every frame, HUD writes at 20 Hz. */
    onState(state: VehicleState): void {
        this.latest = state;
        this.justCollided = false;
        // The readouts treat sub-deadzone motion as standstill (the original behaviour); the
        // collision detector still sees the raw speed.
        this.declaredSpeedKmh = Math.abs(state.speedMps) < SPEED_DEADZONE_MPS ? 0 : state.speedKmh;
        this.peakSpeedKmh = Math.max(this.peakSpeedKmh, this.declaredSpeedKmh);
        this.startRaceWhenMoving(this.declaredSpeedKmh);
        this.detectCollision(state.speedMps);
        this.detectKnockedBoxes();
        this.lastSpeedMps = state.speedMps;
        this.updateHud(state);
    }

    /** One-shot events published on the bus (collision / knocked box / race start). */
    onEvent(event: GameEvent): void {
        switch (event.type) {
            case 'collision':
                this.host.collisions = event.total;
                console.log(`Collision detected! Speed change: ${mpsToKmh(event.speedDropMps).toFixed(2)} km/h, Total collisions: ${event.total}`);
                break;
            case 'boxKnocked':
                this.host.knockedBoxes = event.total;
                console.log(`Box ${event.box} moved ${event.distanceMeters.toFixed(2)} m from settled position! Total: ${event.total}`);
                break;
            case 'raceStart':
                console.log('Race started automatically - car is moving!');
                this.host.isRacing = true;
                break;
        }
    }

    /** Writes the readouts at HUD rate; the detection above still runs on every frame */
    updateHud(state: VehicleState): void {
        const now = performance.now();
        if (now < this.nextHudUpdate) {
            return;
        }
        this.nextHudUpdate = now + HUD_UPDATE_INTERVAL_MS;

        const host = this.host;
        // Physical units from here on: km/h for speeds, metres for the position (findings U1/U2).
        host.speed = this.declaredSpeedKmh;
        host.position.x = state.positionMeters.x;
        host.position.y = state.positionMeters.y;
        host.position.z = state.positionMeters.z;
        host.rotation = ((state.yawRad * 180) / Math.PI) % FULL_CIRCLE_DEGREES;
        host.maxSpeed = this.peakSpeedKmh;

        if (this.raceStarted) {
            this.host.raceTime = (Date.now() - this.raceStartTime) / 1000;
        }
    }

    /** Auto-starts the race when the car starts moving */
    startRaceWhenMoving(speedKmh: number): void {
        if (this.raceStarted || speedKmh <= mpsToKmh(RACE_START_SPEED_MPS)) {
            return;
        }
        this.raceStarted = true;
        this.raceStartTime = Date.now();
        this.bus.emit({ type: 'raceStart' });
    }

    /** A sudden speed drop counts as a collision */
    detectCollision(speedMps: number): void {
        const speedDrop = this.lastSpeedMps - speedMps;
        if (speedDrop <= COLLISION.speedDropMps || this.lastSpeedMps <= COLLISION.minimumPreviousSpeedMps) {
            return;
        }
        const now = this.physicsClock.elapsedSeconds;
        if (now - this.lastCollisionTime <= COLLISION.cooldownSeconds) {
            return;
        }
        this.justCollided = true;
        this.lastCollisionTime = now;
        this.bus.emit({ type: 'collision', speedDropMps: speedDrop, total: this.host.collisions + 1 });
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
            const movedMeters = worldUnitsToMeters(box.distanceFromSettledPosition());
            const lastKnockTime = this.lastKnockTimes.get(box.name) ?? -Infinity;
            if (movedMeters <= BOX.knockDistanceMeters || now - lastKnockTime <= BOX.cooldownSeconds) {
                continue;
            }
            const total = this.host.knockedBoxes + 1;
            this.lastKnockTimes.set(box.name, now);
            box.settle();
            this.bus.emit({ type: 'boxKnocked', box: box.name, distanceMeters: movedMeters, total });
        }
    }
}
