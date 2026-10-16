/**
 * context-monitor.ts - Application-level handling of a lost WebGL context.
 *
 * three's `WebGLRenderer` already registers both events, calls `preventDefault()` on loss and
 * re-initialises its GL state on restore (verified in docs/research/2026-10-15-external-facts.md §6).
 * What it cannot know is application state, so this monitor reports the two transitions and
 * the game layer decides what to pause and what to rebuild (composer + reflection probe hold
 * render targets, and the glow mix pass references the bloom target's texture directly).
 */

import { listen, type ListenerHandle } from './listeners.js';

export interface ContextMonitorOptions {
    canvas: HTMLCanvasElement;
    onLost: () => void;
    onRestored: () => void;
}

export interface ContextMonitor {
    isLost(): boolean;
    dispose(): void;
}

export function createContextMonitor({ canvas, onLost, onRestored }: ContextMonitorOptions): ContextMonitor {
    let lost = false;

    const handles: ListenerHandle[] = [
        listen(canvas, 'webglcontextlost', event => {
            // Also called by three's own handler; keeping it here documents the requirement
            // that the event must be cancelled for a restore to be possible.
            event.preventDefault();
            if (lost) {
                return;
            }
            lost = true;
            console.warn('⚠️ WebGL context lost');
            onLost();
        }),
        listen(canvas, 'webglcontextrestored', () => {
            if (!lost) {
                return;
            }
            lost = false;
            console.warn('✅ WebGL context restored');
            onRestored();
        })
    ];

    return {
        isLost: () => lost,
        dispose(): void {
            for (const handle of handles) {
                handle.release();
            }
        }
    };
}
