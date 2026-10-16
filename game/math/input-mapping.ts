/**
 * input-mapping.ts - Input vocabulary extracted from `game/controls.ts`.
 *
 * Kept separate from the control loop so the action list and the HUD direction label are
 * testable without a keyboard, a DOM or a physics world.
 */

import type { TouchControls } from '../types.js';

export const NO_DIRECTION = '—';

export type Action = keyof TouchControls;

export const DIRECTION_LABELS: ReadonlyArray<readonly [Action, string]> = [
    ['forward', '↑ Forward'],
    ['backward', '↓ Backward'],
    ['left', '← Left'],
    ['right', '→ Right'],
    ['brake', '🚗 Brake'],
    ['jump', '🚀 Jump']
];

/** Builds the HUD direction string, e.g. `↑ Forward + ← Left`, or `—` when idle. */
export function describeDirection(input: TouchControls): string {
    const labels = DIRECTION_LABELS.filter(([action]) => input[action]).map(([, label]) => label);
    return labels.length > 0 ? labels.join(' + ') : NO_DIRECTION;
}
