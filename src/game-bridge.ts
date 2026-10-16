/**
 * game-bridge.ts - Loads the game module graph on demand.
 *
 * The game (three + Rapier + the whole simulation) is by far the largest part of the app and
 * nothing in the shell needs it during the first paint. Importing it dynamically moves it out
 * of the first-screen bundle and into a chunk that is fetched in parallel with the React
 * shell. The import is memoised, so a retry never re-downloads it.
 */

export type GameModule = typeof import('../game/three-game.js');

let pending: Promise<GameModule> | null = null;

export function loadGame(): Promise<GameModule> {
    pending ??= import('../game/three-game.js').catch((error: unknown) => {
        // Drop the cache on failure so a retry can really retry.
        pending = null;
        throw error;
    });
    return pending;
}

/** `GameOptions` and friends are re-exported for callers that only need the types. */
export type { GameOptions } from '../game/three-game.js';
