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
