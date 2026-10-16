import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/state.js';

interface Model {
    speed: number;
    position: { x: number; y: number };
    flags: string[];
}

const makeStore = () => createStore<Model>({ speed: 0, position: { x: 0, y: 0 }, flags: [] });

describe('createStore', () => {
    it('starts with the version of the initial state', () => {
        const store = makeStore();
        expect(store.getVersion()).toBe(0);
        expect(store.state.speed).toBe(0);
    });

    it('notifies subscribers and bumps the version on a change', () => {
        const store = makeStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.state.speed = 10;
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.getVersion()).toBe(1);
    });

    it('does not notify when the value is unchanged', () => {
        const store = makeStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.state.speed = 0; // already 0
        expect(listener).not.toHaveBeenCalled();
        expect(store.getVersion()).toBe(0);
    });

    it('notifies for nested writes', () => {
        const store = makeStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.state.position.x = 3;
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.getVersion()).toBe(1);
    });

    it('notifies when a nested object or an array is replaced', () => {
        const store = makeStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.state.position = { x: 1, y: 2 };
        store.state.flags = ['a'];
        expect(store.getVersion()).toBe(2);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('notifies when a method on the state is replaced', () => {
        const store = createStore({ run: () => 0, count: 0 });
        const listener = vi.fn();
        store.subscribe(listener);
        store.state.run = () => 1;
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.state.run()).toBe(1);
    });

    it('stops notifying after unsubscribe', () => {
        const store = makeStore();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.state.speed = 1;
        unsubscribe();
        store.state.speed = 2;
        // No further notification, but the state change itself still bumps the version: the
        // counter tracks the state, not the number of interested subscribers.
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.getVersion()).toBe(2);
    });

    it('supports several independent subscribers', () => {
        const store = makeStore();
        const first = vi.fn();
        const second = vi.fn();
        store.subscribe(first);
        store.subscribe(second);
        store.state.speed = 5;
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });
});
