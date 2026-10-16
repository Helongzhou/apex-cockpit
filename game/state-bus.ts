/**
 * state-bus.ts - Single source of truth for vehicle state, plus swappable state sources.
 *
 * The point of the bus is that the simulation and the HMI consume the **same** data: the
 * physics side publishes a snapshot (with events for things that happen once), the UI
 * subscribes. Because the producers implement {@link StateSource}, a recorded replay can be
 * plugged in instead of the live simulation without touching a single consumer.
 *
 * Dependency-free: no three, no Rapier, no DOM.
 */

export type Listener<T> = (value: T) => void;

export interface StateBus<TState, TEvent> {
    /** Latest published state. */
    getState(): TState;
    /** Monotonic version; bumps only when the state actually changes. */
    getVersion(): number;
    /** Publishes a new snapshot (compared with `Object.is` per call, so pass a new object). */
    publish(state: TState): void;
    /** Publishes only if `equals` says the value differs; handy for hot loops. */
    publishIfChanged(state: TState): void;
    subscribe(listener: Listener<TState>): () => void;
    /** Fire-and-forget events (collision, box knocked, race start). */
    emit(event: TEvent): void;
    onEvent(listener: Listener<TEvent>): () => void;
}

/**
 * Creates the bus. `equals` defaults to reference equality, which is what the simulation wants:
 * pushing a freshly derived snapshot is by definition a new state.
 */
export function createStateBus<TState, TEvent = never>(
    initial: TState,
    equals: (a: TState, b: TState) => boolean = Object.is
): StateBus<TState, TEvent> {
    let state = initial;
    let version = 0;
    const stateListeners = new Set<Listener<TState>>();
    const eventListeners = new Set<Listener<TEvent>>();

    const publish = (next: TState): void => {
        if (equals(state, next)) {
            return;
        }
        state = next;
        version += 1;
        for (const listener of [...stateListeners]) {
            listener(state);
        }
    };

    return {
        getState: () => state,
        getVersion: () => version,
        publish,
        publishIfChanged: publish,
        subscribe(listener: Listener<TState>): () => void {
            stateListeners.add(listener);
            return () => {
                stateListeners.delete(listener);
            };
        },
        emit(event: TEvent): void {
            for (const listener of [...eventListeners]) {
                listener(event);
            }
        },
        onEvent(listener: Listener<TEvent>): () => void {
            eventListeners.add(listener);
            return () => {
                eventListeners.delete(listener);
            };
        }
    };
}

/**
 * A producer of state snapshots. The live simulation advances by stepping the world; a replay
 * advances by moving along its recorded timeline. Consumers cannot tell the two apart.
 */
export interface StateSource<TState> {
    readonly kind: 'live' | 'replay';
    current(): TState;
    /** Advances the source by `deltaSeconds` and returns the (possibly new) snapshot. */
    advance(deltaSeconds: number): TState;
}

/**
 * Replays a recorded snapshot sequence. The first frame is available immediately; afterwards one
 * recorded frame is consumed every `intervalSeconds` of simulated time, so a replay runs at the
 * same speed regardless of the frame rate driving it.
 */
export function createReplaySource<TState>(
    frames: readonly TState[],
    intervalSeconds = 1 / 60
): StateSource<TState> {
    if (frames.length === 0) {
        throw new Error('createReplaySource needs at least one frame');
    }
    let index = 0;
    let accumulator = 0;

    return {
        kind: 'replay',
        current: () => frames[index],
        advance(deltaSeconds: number): TState {
            accumulator += Math.max(deltaSeconds, 0);
            while (accumulator >= intervalSeconds && index < frames.length - 1) {
                accumulator -= intervalSeconds;
                index += 1;
            }
            return frames[index];
        }
    };
}

/** Wraps a live getter so the simulation satisfies {@link StateSource} too. */
export function createLiveSource<TState>(sample: (deltaSeconds: number) => TState): StateSource<TState> {
    let state: TState | null = null;
    return {
        kind: 'live',
        current(): TState {
            if (state === null) {
                state = sample(0);
            }
            return state;
        },
        advance(deltaSeconds: number): TState {
            state = sample(deltaSeconds);
            return state;
        }
    };
}
