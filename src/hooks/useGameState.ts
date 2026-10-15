import { useSyncExternalStore } from 'react';
import type { Store } from '../state';

/**
 * Subscribes a component to the game store.
 *
 * `getVersion` is a number that only changes when a value actually changed, so React
 * re-renders at the same moments the Vue instance used to (e.g. the 20 Hz HUD writes
 * and real changes of `direction`), not on every frame.
 */
export function useGameState<T extends object>(store: Store<T>): T {
    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
    return store.state;
}
