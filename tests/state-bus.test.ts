import { describe, expect, it, vi } from 'vitest';
import { createLiveSource, createReplaySource, createStateBus } from '../game/state-bus.js';

interface Snapshot {
    speed: number;
}

describe('createStateBus', () => {
    it('starts with the initial state and version zero', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 });
        expect(bus.getState()).toEqual({ speed: 0 });
        expect(bus.getVersion()).toBe(0);
    });

    it('notifies subscribers and bumps the version on publish', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 });
        const listener = vi.fn();
        bus.subscribe(listener);
        const next = { speed: 10 };
        bus.publish(next);
        expect(listener).toHaveBeenCalledWith(next);
        expect(bus.getState()).toBe(next);
        expect(bus.getVersion()).toBe(1);
    });

    it('ignores a republished identical reference', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 });
        const listener = vi.fn();
        bus.subscribe(listener);
        const state = bus.getState();
        bus.publish(state);
        expect(listener).not.toHaveBeenCalled();
        expect(bus.getVersion()).toBe(0);
    });

    it('accepts a custom equality so hot loops can skip equal snapshots', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 }, (a, b) => a.speed === b.speed);
        const listener = vi.fn();
        bus.subscribe(listener);
        bus.publishIfChanged({ speed: 0 });
        expect(listener).not.toHaveBeenCalled();
        bus.publishIfChanged({ speed: 1 });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 });
        const listener = vi.fn();
        const unsubscribe = bus.subscribe(listener);
        bus.publish({ speed: 1 });
        unsubscribe();
        bus.publish({ speed: 2 });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(bus.getState()).toEqual({ speed: 2 });
    });

    it('delivers one-shot events to event listeners only', () => {
        const bus = createStateBus<Snapshot, string>({ speed: 0 });
        const stateListener = vi.fn();
        const eventListener = vi.fn();
        bus.subscribe(stateListener);
        const off = bus.onEvent(eventListener);
        bus.emit('collision');
        expect(eventListener).toHaveBeenCalledWith('collision');
        expect(stateListener).not.toHaveBeenCalled();
        off();
        bus.emit('collision');
        expect(eventListener).toHaveBeenCalledTimes(1);
    });
});

describe('createReplaySource', () => {
    const frames: Snapshot[] = [{ speed: 0 }, { speed: 1 }, { speed: 2 }];

    it('exposes the first frame immediately', () => {
        const source = createReplaySource(frames, 1 / 60);
        expect(source.kind).toBe('replay');
        expect(source.current()).toBe(frames[0]);
    });

    it('advances one frame per interval, independent of how the time is chunked', () => {
        const source = createReplaySource(frames, 1 / 60);
        expect(source.advance(1 / 120)).toBe(frames[0]);
        expect(source.advance(1 / 120)).toBe(frames[1]);
        // A single coarse step consumes the same amount of recorded time.
        expect(source.advance(1 / 30)).toBe(frames[2]);
    });

    it('holds the last frame at the end of the recording', () => {
        const source = createReplaySource(frames, 1 / 60);
        for (let step = 0; step < 100; step += 1) {
            source.advance(1 / 60);
        }
        expect(source.current()).toBe(frames[2]);
    });

    it('refuses an empty recording', () => {
        expect(() => createReplaySource([], 1 / 60)).toThrow(/at least one frame/);
    });
});

describe('createLiveSource', () => {
    it('samples on advance and caches the value for current()', () => {
        const sample = vi.fn((delta: number) => ({ speed: delta }));
        const source = createLiveSource(sample);
        expect(source.kind).toBe('live');
        expect(source.current()).toEqual({ speed: 0 });
        expect(source.advance(0.5)).toEqual({ speed: 0.5 });
        expect(source.current()).toEqual({ speed: 0.5 });
        expect(sample).toHaveBeenCalledTimes(2);
    });
});
