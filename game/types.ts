/**
 * types.ts - The contract the game layer needs from its host (the UI layer).
 *
 * `game/` must stay framework-agnostic: it never imports React, Vue or any store
 * implementation. It only needs an object shaped like this, which `src/app.ts`
 * provides. Field names and write timings match the original Vue implementation
 * (`vue-app.js` data + `telemetry.js` writes) so the migration cannot change
 * observable behaviour.
 */

export interface TouchControls {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    brake: boolean;
    jump: boolean;
}

export interface BoxStatus {
    knocked: boolean;
}

/**
 * Domain events published on the state bus. Consumers no longer poll for them: the HUD counters
 * and the future ADAS layers subscribe instead (task D1, AC-D1.6).
 */
export type GameEvent =
    | { type: 'collision'; speedDropMps: number; total: number }
    | { type: 'boxKnocked'; box: string; distanceMeters: number; total: number }
    | { type: 'raceStart' };

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export type RuntimePhase = 'loading' | 'ready' | 'fatal' | 'context-lost';

export interface RuntimeState {
    phase: RuntimePhase;
    /** Short user-facing message; empty while healthy. */
    message: string;
    /** Technical first line, shown for diagnosis. */
    detail: string;
}

export type Gear = 'P' | 'R' | 'N' | 'D';

/**
 * The cluster snapshot: written from the state bus at the HUD rate (20 Hz), never at frame rate.
 * React re-renders on every store change, so subscribing the UI to the 60 Hz bus would tie the
 * render frequency to the frame rate (see `.trellis/spec/frontend/state-management.md`).
 */
export interface VehicleSnapshot {
    speedMps: number;
    speedKmh: number;
    gear: Gear;
    /** Drive power in kW; negative while braking (energy recovered). */
    powerKw: number;
    accelLongitudinal: number;
    accelLateral: number;
    yawRate: number;
    steerAngleDeg: number;
    /** True on the frame a collision was detected; the cluster flashes its warning icon. */
    collision: boolean;
}

export type StageId = 'studio' | 'highway';

/** ADAS overlay mode owned by the UI, read by the game layer. */
export type { AdasMode } from './adas/manager.js';

export interface GameHost {
    /** Written by `FpsMeter` every 500 ms. */
    fps: number;
    /** Written by `Telemetry` at HUD rate (20 Hz). */
    speed: number;
    position: Vec3;
    rotation: number;
    maxSpeed: number;
    /** Written by `CarControls` every frame (notifies only when the text changes). */
    direction: string;
    /** Written by `Telemetry` on discrete events. */
    collisions: number;
    knockedBoxes: number;
    raceTime: number;
    isRacing: boolean;
    /** Cluster snapshot, written field by field from the bus at the HUD rate. */
    vehicle: VehicleSnapshot;
    /** ADAS overlay mode; the toggle writes it and the game layer reads it every frame. */
    adasMode: import('./adas/manager.js').AdasMode;
    /** True when the running stage publishes an ADAS feed; written by the game. */
    adasAvailable: boolean;
    /** Active stage; the switcher writes it through `setStage`. */
    stage: StageId;
    /** Stages the running build provides; written by the game so the UI never hardcodes them. */
    stages: Array<{ id: StageId; label: string }>;
    setStage(stage: StageId): void;
    /** Owned by the UI layer, read by `CarControls.combineInputs`. */
    isTouchDevice: boolean;
    touchControls: TouchControls;
    /** Read by `resetBoxes` in `game/three-game.ts`. */
    boxesStatus: BoxStatus[];
    /** Clears the HUD fields and rebuilds the scene/physics world. */
    resetGame(): void;
    /** Toggles between the follow camera and the cockpit view. */
    toggleView(): void;
    /** Health of the render loop and of asset loading, shown by the runtime overlay. */
    runtime: RuntimeState;
    /** Rebuilds the session after a fatal error or a lost WebGL context. */
    retry(): void;
}
