import { describe, expect, it } from 'vitest';
import { DEFAULT_PERCEPTION, PerceptionModel, mulberry32 } from '../game/adas/perception-noise.js';
import type { AdasTarget } from '../game/adas/targets.js';

function truthTarget(id: string, x: number, z: number, heading = 0): AdasTarget {
    return {
        id,
        position: { x, y: 0, z },
        velocity: { x: 0, y: 0, z: 10 },
        heading,
        length: 40,
        width: 20,
        height: 20,
        kind: 'car',
        confidence: 1,
        source: 'truth'
    };
}

const options = (overrides = {}) => ({
    dropoutProbability: 0,
    jitterWorldUnits: 0,
    headingErrorRadians: 0,
    latencySeconds: 0,
    confidenceMin: 0.5,
    confidenceMax: 1,
    seed: 1234,
    ...overrides
});

describe('mulberry32', () => {
    it('is deterministic for a given seed', () => {
        const first = mulberry32(42);
        const second = mulberry32(42);
        const firstValues = Array.from({ length: 5 }, () => first());
        const secondValues = Array.from({ length: 5 }, () => second());
        expect(firstValues).toEqual(secondValues);
    });

    it('stays inside [0, 1)', () => {
        const random = mulberry32(7);
        for (let index = 0; index < 1000; index += 1) {
            const value = random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('produces different sequences for different seeds', () => {
        expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    });
});

describe('PerceptionModel determinism', () => {
    it('produces identical output for the same seed and input sequence', () => {
        const run = () => {
            const model = new PerceptionModel(DEFAULT_PERCEPTION, 4);
            const frames = [];
            for (let tick = 0; tick < 40; tick += 1) {
                const result = model.perceive([truthTarget('a', tick, tick * 2), truthTarget('b', -tick, 0)], 1 / 60);
                frames.push(Array.from({ length: result.count }, (_, index) => ({ ...result.targets[index] })));
            }
            return frames;
        };
        expect(run()).toEqual(run());
    });

    it('marks every output as a perception target with the source field', () => {
        const model = new PerceptionModel(options(), 2);
        const result = model.perceive([truthTarget('a', 1, 2)], 1 / 60);
        expect(result.count).toBe(1);
        expect(result.targets[0].source).toBe('perception');
    });
});

describe('PerceptionModel statistics', () => {
    it('drops approximately the configured fraction', () => {
        const drops = 0.3;
        const model = new PerceptionModel(options({ dropoutProbability: drops }), 1);
        const samples = 2000;
        let seen = 0;
        for (let tick = 0; tick < samples; tick += 1) {
            seen += model.perceive([truthTarget('a', 0, 0)], 1 / 60).count;
        }
        const observed = 1 - seen / samples;
        expect(observed).toBeGreaterThan(drops - 0.05);
        expect(observed).toBeLessThan(drops + 0.05);
        expect(model.droppedTotal()).toBe(samples - seen);
    });

    it('never jitters a target beyond the configured bound', () => {
        const jitter = 5;
        const model = new PerceptionModel(options({ jitterWorldUnits: jitter }), 1);
        for (let tick = 1; tick <= 300; tick += 1) {
            const result = model.perceive([truthTarget('a', 100, 200)], 1 / 60);
            if (result.count === 0) {
                continue;
            }
            const target = result.targets[0];
            expect(Math.abs(target.position.x - 100)).toBeLessThanOrEqual(jitter);
            expect(Math.abs(target.position.z - 200)).toBeLessThanOrEqual(jitter);
        }
    });

    it('keeps the heading error inside the configured bound', () => {
        const error = 0.05;
        const model = new PerceptionModel(options({ headingErrorRadians: error }), 1);
        for (let tick = 1; tick <= 200; tick += 1) {
            const result = model.perceive([truthTarget('a', 0, 0, 1)], 1 / 60);
            if (result.count > 0) {
                expect(Math.abs(result.targets[0].heading - 1)).toBeLessThanOrEqual(error);
            }
        }
    });

    it('reports confidence inside the configured range', () => {
        const model = new PerceptionModel(options({ confidenceMin: 0.2, confidenceMax: 0.6 }), 1);
        for (let tick = 1; tick <= 100; tick += 1) {
            const result = model.perceive([truthTarget('a', 0, 0)], 1 / 60);
            if (result.count > 0) {
                expect(result.targets[0].confidence).toBeGreaterThanOrEqual(0.2);
                expect(result.targets[0].confidence).toBeLessThanOrEqual(0.6);
            }
        }
    });
});

describe('PerceptionModel latency', () => {
    it('reports the position from latencySeconds ago, independent of the frame rate', () => {
        const latency = 0.25;
        const model = new PerceptionModel(options({ latencySeconds: latency }), 1);
        // A target moving at 100 units/s along +Z: at time t its z is 100·t.
        let emitted = null;
        for (let tick = 1; tick <= 120; tick += 1) {
            const time = tick / 60;
            const result = model.perceive([truthTarget('a', 0, 100 * time)], 1 / 60);
            if (tick === 120 && result.count > 0) {
                emitted = result.targets[0].position.z;
            }
        }
        // 2 s - 0.25 s = 1.75 s -> 175 units.
        expect(emitted).not.toBeNull();
        expect(emitted as number).toBeGreaterThan(170);
        expect(emitted as number).toBeLessThan(180);
        expect(model.elapsedSeconds()).toBeCloseTo(2, 9);
    });

    it('emits nothing until the history is older than the latency', () => {
        const model = new PerceptionModel(options({ latencySeconds: 1 }), 1);
        expect(model.perceive([truthTarget('a', 0, 0)], 0.1).count).toBe(0);
        for (let tick = 0; tick < 20; tick += 1) {
            model.perceive([truthTarget('a', 0, tick)], 0.1);
        }
        expect(model.perceive([truthTarget('a', 0, 99)], 0.1).count).toBe(1);
    });
});

describe('PerceptionModel allocation behaviour', () => {
    it('reuses the output objects across calls', () => {
        const model = new PerceptionModel(options(), 3);
        const first = model.perceive([truthTarget('a', 1, 1)], 1 / 60);
        const firstReference = first.targets[0];
        const second = model.perceive([truthTarget('a', 2, 2)], 1 / 60);
        expect(second.targets[0]).toBe(firstReference);
        expect(second.targets).toBe(first.targets);
    });

    it('clamps to the configured capacity', () => {
        const model = new PerceptionModel(options(), 2);
        const many = Array.from({ length: 5 }, (_, index) => truthTarget(`t${index}`, index, 0));
        const result = model.perceive(many, 1 / 60);
        expect(result.count).toBeLessThanOrEqual(2);
    });
});
