import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_FRAME, PHYSICS_TIMESTEP, PhysicsStepper, type SteppableWorld } from '../game/math/physics-stepper.js';

/** Records how often the world was stepped instead of simulating anything. */
function fakeWorld(): SteppableWorld & { steps: number } {
    const world = {
        steps: 0,
        step(): void {
            world.steps += 1;
        }
    };
    return world;
}

describe('PhysicsStepper', () => {
    it('steps exactly once for one timestep of elapsed time', () => {
        const world = fakeWorld();
        const stepper = new PhysicsStepper(world);
        stepper.step(PHYSICS_TIMESTEP);
        expect(world.steps).toBe(1);
        expect(stepper.elapsedSeconds).toBeCloseTo(PHYSICS_TIMESTEP, 12);
    });

    it('catches up with multiple steps for a longer frame', () => {
        const world = fakeWorld();
        const stepper = new PhysicsStepper(world);
        stepper.step(PHYSICS_TIMESTEP * 3);
        expect(world.steps).toBe(3);
        expect(stepper.elapsedSeconds).toBeCloseTo(PHYSICS_TIMESTEP * 3, 12);
    });

    it('clamps a huge delta to the maximum number of steps', () => {
        const world = fakeWorld();
        const stepper = new PhysicsStepper(world);
        // A tab that was hidden for seconds must not run hundreds of substeps at once.
        stepper.step(30);
        expect(world.steps).toBe(MAX_STEPS_PER_FRAME);
        expect(stepper.accumulator).toBeLessThan(PHYSICS_TIMESTEP);
    });

    it('carries the remainder into the next frame', () => {
        const world = fakeWorld();
        const stepper = new PhysicsStepper(world);
        stepper.step(PHYSICS_TIMESTEP / 2);
        expect(world.steps).toBe(0);
        stepper.step(PHYSICS_TIMESTEP / 2);
        expect(world.steps).toBe(1);
    });

    it('keeps elapsedSeconds monotonic and in real time', () => {
        const world = fakeWorld();
        const stepper = new PhysicsStepper(world);
        let previous = 0;
        for (let frame = 0; frame < 120; frame += 1) {
            stepper.step(1 / 60); // 2 simulated steps per frame at a 120 Hz timestep
            expect(stepper.elapsedSeconds).toBeGreaterThanOrEqual(previous);
            previous = stepper.elapsedSeconds;
        }
        expect(stepper.elapsedSeconds).toBeCloseTo(2, 6);
        expect(world.steps).toBe(240);
    });
});
