/**
 * app.ts - Wires the framework-agnostic store to the game layer.
 *
 * This replaces what `vue-app.js` used to do: hold the HUD state, expose it to the UI, and
 * provide the two game commands the UI can trigger (`resetGame`, `toggleView`). The initial
 * values and the reset order mirror `vue-app.js` exactly.
 */

import { resetGame, toggleView } from '../game/three-game.js';
import type { GameHost } from '../game/types.js';
import { createStore, type Store } from './state';

const KNOCKABLE_BOX_COUNT = 5;
const NO_DIRECTION = '—';

const emptyBoxes = () => Array.from({ length: KNOCKABLE_BOX_COUNT }, () => ({ knocked: false }));

/** Same shape and initial values as `vue-app.js` `data()`. */
export function createInitialGameState(): GameHost {
    return {
        fps: 0,
        speed: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        maxSpeed: 0,
        direction: NO_DIRECTION,
        collisions: 0,
        knockedBoxes: 0,
        raceTime: 0,
        isRacing: false,
        isTouchDevice: false,
        touchControls: { forward: false, backward: false, left: false, right: false, brake: false, jump: false },
        boxesStatus: emptyBoxes(),
        resetGame: () => undefined,
        toggleView: () => undefined,
    };
}

/** Same field resets as `vue-app.js` `resetGame()`, before the session rebuild. */
function resetHostFields(host: GameHost): void {
    host.speed = 0;
    host.position = { x: 0, y: 0, z: 0 };
    host.rotation = 0;
    host.direction = NO_DIRECTION;
    host.collisions = 0;
    host.knockedBoxes = 0;
    host.maxSpeed = 0;
    host.raceTime = 0;
    host.isRacing = false;
    host.boxesStatus = emptyBoxes();
}

export interface GameHostRef {
    store: Store<GameHost>;
    host: GameHost;
}

export function createGameHost(): GameHostRef {
    const store = createStore<GameHost>(createInitialGameState());
    const host = store.state;

    host.resetGame = () => {
        resetHostFields(host);
        // The session rebuild is async; surface failures instead of leaving an
        // unhandled rejection. Recoverable error handling is task C2's scope.
        void resetGame(host).catch((error: unknown) => {
            console.error('❌ Game reset failed:', error);
        });
    };
    host.toggleView = () => {
        toggleView();
    };

    return { store, host };
}
