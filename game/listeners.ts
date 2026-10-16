/**
 * listeners.ts - One place that registers DOM listeners and can prove they are released.
 *
 * The codebase analysis found four window/document listener sets that were never removed
 * (`vue-app.js` and `mobile-controls.js` before the React port). Every listener now goes
 * through {@link listen}, which keeps a counter so `window.__listenerCount()` can assert
 * "registered == released" in a dev build (acceptance criterion AC2.5).
 */

export interface ListenerHandle {
    release(): void;
}

export interface ListenerStats {
    added: number;
    removed: number;
    active: number;
}

type ListenerTarget = Window | Document | HTMLElement | MediaQueryList;

type EventMapOf<T> = T extends Window ? WindowEventMap
    : T extends Document ? DocumentEventMap
    : T extends MediaQueryList ? MediaQueryListEventMap
    : T extends HTMLElement ? HTMLElementEventMap
    : never;

let addedCount = 0;
let removedCount = 0;

/**
 * Registers a listener and returns a handle that removes it exactly once.
 * The handler is typed from the target's event map, so call sites stay precise.
 */
export function listen<T extends ListenerTarget, K extends keyof EventMapOf<T> & string>(
    target: T,
    type: K,
    handler: (event: EventMapOf<T>[K]) => void,
    options?: AddEventListenerOptions | boolean
): ListenerHandle {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    addedCount += 1;

    let released = false;
    return {
        release(): void {
            if (released) {
                return;
            }
            released = true;
            target.removeEventListener(type, listener, options);
            removedCount += 1;
        }
    };
}

/** Releases several handles, ignoring undefined entries. */
export function releaseAll(handles: Array<ListenerHandle | undefined>): void {
    for (const handle of handles) {
        handle?.release();
    }
}

export function listenerStats(): ListenerStats {
    return { added: addedCount, removed: removedCount, active: addedCount - removedCount };
}

declare global {
    interface Window {
        __listenerCount?: () => ListenerStats;
    }
}

// Introspection hook: `scripts/ui-smoke.mjs` asserts that resetting the game does not grow
// the active-listener count (acceptance criterion AC2.5). Cheap enough to always expose.
window.__listenerCount = listenerStats;
