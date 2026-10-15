/**
 * state.ts - The single seam between the framework-agnostic game modules and the React UI.
 *
 * The game modules used to write straight into the Vue instance's reactive `data`
 * (`telemetry.js` wrote `vueApp.speed`, `controls.js` read `vueApp.touchControls`, ...).
 * This store keeps that write style intact but makes it framework-free:
 *
 *  - `state` is a **deep reactive proxy**: `state.speed = 1` and `state.position.x = 1`
 *    both notify subscribers, so the game code needs no write-API changes.
 *  - Subscribers are only notified when a value **actually changes** (`Object.is`),
 *    which matches Vue's `hasChanged` behaviour: writing the same string every frame
 *    (`vueApp.direction`) does not cause a re-render storm.
 *  - `getVersion()` is a monotonically increasing number that is stable between
 *    notifications, which is exactly what `useSyncExternalStore` needs.
 *
 * Iteration 2 will restructure the *semantics* (immutable snapshots, a fixed publish
 * rate, a separate VehicleState). Iteration 1 only needs the mechanism.
 */

export type Listener = () => void;

export interface Store<T extends object> {
    /** Deep reactive state. Read and write directly. */
    readonly state: T;
    /** Subscribe to change notifications. Returns an unsubscribe function. */
    subscribe(listener: Listener): () => void;
    /** Stable version counter for `useSyncExternalStore`. */
    getVersion(): number;
}

const RAW = Symbol('rawTarget');

type ReactiveTarget = object & { [RAW]?: object };

/**
 * Wraps an object (or array) so that every write, at any depth, notifies `notify`
 * once per changed value.
 */
function deepReactive<T extends object>(target: T, notify: () => void, cache: WeakMap<object, object>): T {
    const cached = cache.get(target);
    if (cached !== undefined) {
        return cached as T;
    }

    const proxy = new Proxy(target, {
        get(source, property, receiver) {
            if (property === RAW) {
                return source;
            }
            const value = Reflect.get(source, property, receiver);
            if (value !== null && typeof value === 'object') {
                return deepReactive(value as object, notify, cache);
            }
            return value;
        },
        set(source, property, value, receiver) {
            const previous = Reflect.get(source, property, receiver);
            // Store the raw value so nested reads keep going through the proxy.
            const raw = value !== null && typeof value === 'object' ? (value as ReactiveTarget)[RAW] ?? value : value;
            const changed = !Object.is(previous, value);
            const stored = Reflect.set(source, property, raw, receiver);
            if (changed) {
                notify();
            }
            return stored;
        },
        deleteProperty(source, property) {
            const had = Object.prototype.hasOwnProperty.call(source, property);
            const removed = Reflect.deleteProperty(source, property);
            if (had) {
                notify();
            }
            return removed;
        },
    });

    cache.set(target, proxy);
    return proxy as T;
}

/**
 * Creates the store. The initial object is taken over (it becomes the reactive root),
 * so pass a fresh object.
 */
export function createStore<T extends object>(initial: T): Store<T> {
    const listeners = new Set<Listener>();
    const cache = new WeakMap<object, object>();
    let version = 0;

    const notify = (): void => {
        version += 1;
        for (const listener of [...listeners]) {
            listener();
        }
    };

    const state = deepReactive(initial, notify, cache);

    return {
        state,
        subscribe(listener: Listener): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getVersion(): number {
            return version;
        },
    };
}
