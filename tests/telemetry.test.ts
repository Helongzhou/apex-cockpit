import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStateBus } from '../game/state-bus.js';
import { Telemetry } from '../game/telemetry.js';
import { UNITS_PER_METER } from '../game/math/units.js';
import { createInitialVehicleState, type VehicleState } from '../game/vehicle-state.js';
import type { GameEvent, GameHost } from '../game/types.js';
import type { KnockableBox } from '../game/world.js';

/**
 * Telemetry no longer samples the car: it consumes the state bus. The double below only carries
 * the fields the HUD writes, which keeps this suite free of three.js and Rapier (importing Rapier
 * would try to load its wasm module in node).
 */
function fakeHost(): GameHost {
    return {
        speed: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        maxSpeed: 0,
        direction: '—',
        collisions: 0,
        knockedBoxes: 0,
        raceTime: 0,
        isRacing: false,
        fps: 0,
        isTouchDevice: false,
        touchControls: { forward: false, backward: false, left: false, right: false, brake: false, jump: false },
        boxesStatus: [],
        runtime: { phase: 'ready', message: '', detail: '' },
        resetGame: () => undefined,
        toggleView: () => undefined,
        retry: () => undefined
    } as unknown as GameHost;
}

const fakeBox = (name: string, movedWorldUnits: number): KnockableBox => ({
    name,
    isSettled: true,
    settle: vi.fn(),
    distanceFromSettledPosition: () => movedWorldUnits,
    reset: () => undefined,
    syncMesh: () => undefined
}) as unknown as KnockableBox;

function stateWith(overrides: Partial<VehicleState> = {}): VehicleState {
    return { ...createInitialVehicleState(), ...overrides };
}

function setup(boxes: KnockableBox[] = [], clock = { elapsedSeconds: 10 }) {
    const host = fakeHost();
    const bus = createStateBus<VehicleState, GameEvent>(createInitialVehicleState());
    const telemetry = new Telemetry({ host, boxes, bus, physicsClock: clock });
    // The HUD is throttled to 20 Hz by `performance.now()`; a controllable clock keeps that
    // behaviour under test instead of working around it.
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    return { host, bus, telemetry, advance: (ms: number) => { now += ms; } };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Telemetry as a bus consumer', () => {
    it('writes the HUD from the published state, in physical units', () => {
        const { host, bus } = setup();
        bus.publish(stateWith({ speedMps: 10, speedKmh: 36, yawRad: Math.PI / 2, positionMeters: { x: 1, y: 2, z: 3 } }));
        expect(host.speed).toBe(36); // km/h, not world units/s (findings U1/U2)
        expect(host.position).toEqual({ x: 1, y: 2, z: 3 }); // metres
        expect(host.rotation).toBeCloseTo(90, 9);
    });

    it('treats sub-deadzone motion as standstill in the readout', () => {
        const { host, bus } = setup();
        // One world unit per second is the deadzone: 1/8 m/s ≈ 0.45 km/h
        bus.publish(stateWith({ speedMps: 1 / UNITS_PER_METER / 2, speedKmh: 0.225 }));
        expect(host.speed).toBe(0);
    });

    it('tracks the peak speed in km/h and keeps the HUD at 20 Hz', () => {
        const { host, bus, advance } = setup();
        bus.publish(stateWith({ speedMps: 10, speedKmh: 36 }));
        expect(host.maxSpeed).toBe(36);
        // A second publish inside the 50 ms window must not re-render the HUD...
        bus.publish(stateWith({ speedMps: 20, speedKmh: 72 }));
        expect(host.maxSpeed).toBe(36);
        // ...but the next window sees the new peak.
        advance(60);
        bus.publish(stateWith({ speedMps: 20, speedKmh: 72 }));
        expect(host.maxSpeed).toBe(72);
    });

    it('turns a speed drop into a collision event instead of the consumer polling', () => {
        const { host, bus, telemetry } = setup();
        const events: GameEvent[] = [];
        bus.onEvent(event => events.push(event));

        bus.publish(stateWith({ speedMps: 10, speedKmh: 36 }));
        // The detector needs a drop *above* 5 world units/s (strict comparison, as upstream)
        bus.publish(stateWith({ speedMps: 10 - 6 / UNITS_PER_METER, speedKmh: 27 }));

        // The first moving snapshot starts the race, the speed drop right after is the collision.
        expect(events).toEqual([
            { type: 'raceStart' },
            { type: 'collision', speedDropMps: 6 / UNITS_PER_METER, total: 1 }
        ]);
        expect(host.collisions).toBe(1);
        expect(telemetry.justCollided).toBe(true);
    });

    it('ignores a speed drop without enough previous speed', () => {
        const { bus, telemetry } = setup();
        const events: GameEvent[] = [];
        bus.onEvent(event => events.push(event));
        bus.publish(stateWith({ speedMps: 0.1, speedKmh: 0.36 }));
        bus.publish(stateWith({ speedMps: 0, speedKmh: 0 }));
        expect(events).toEqual([]);
        expect(telemetry.justCollided).toBe(false);
    });

    it('emits race start once, and knocks boxes after they settled', () => {
        const box = fakeBox('Box1', UNITS_PER_METER * 5); // 5 m away from its settled position
        const { host, bus } = setup([box]);
        const events: GameEvent[] = [];
        bus.onEvent(event => events.push(event));

        bus.publish(stateWith({ speedMps: 10, speedKmh: 36 }));
        bus.publish(stateWith({ speedMps: 10, speedKmh: 36 }));

        expect(events.filter(event => event.type === 'raceStart')).toHaveLength(1);
        expect(host.isRacing).toBe(true);
        const knock = events.find(event => event.type === 'boxKnocked');
        expect(knock).toEqual({ type: 'boxKnocked', box: 'Box1', distanceMeters: 5, total: 1 });
        expect(host.knockedBoxes).toBe(1);
        expect(box.settle).toHaveBeenCalled();
    });

    it('stops consuming after dispose', () => {
        const { host, bus, telemetry } = setup();
        telemetry.dispose();
        bus.publish(stateWith({ speedMps: 10, speedKmh: 36 }));
        expect(host.speed).toBe(0);
    });
});
