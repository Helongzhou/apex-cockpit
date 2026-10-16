/**
 * physics-stepper.ts - Fixed-timestep accumulator extracted from `game/physics-world.ts`.
 *
 * The stepper only needs `step()` and a timestep from its world, so it is declared against a
 * structural interface instead of Rapier's `World`. That keeps it testable in a plain node
 * environment (importing Rapier would try to load the wasm module).
 */

export const PHYSICS_TIMESTEP = 1 / 120;
/** Keeps the simulation in real time down to 15 fps. */
export const MAX_STEPS_PER_FRAME = 8;

export interface SteppableWorld {
    step(): void;
}

/**
 * Advances the world with a fixed timestep, catching up on the elapsed frame time
 */
export class PhysicsStepper {
    world: SteppableWorld;
    accumulator: number;
    /** Simulated seconds so far, independent of frame rate and tab visibility */
    elapsedSeconds: number;

    constructor(world: SteppableWorld) {
        this.world = world;
        this.accumulator = 0;
        this.elapsedSeconds = 0;
    }

    step(deltaSeconds: number): void {
        this.accumulator += Math.min(deltaSeconds, PHYSICS_TIMESTEP * MAX_STEPS_PER_FRAME);

        let steps = 0;
        while (this.accumulator >= PHYSICS_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
            this.world.step();
            this.accumulator -= PHYSICS_TIMESTEP;
            this.elapsedSeconds += PHYSICS_TIMESTEP;
            steps++;
        }
    }
}
