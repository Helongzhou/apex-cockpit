/**
 * app.ts - Wires the framework-agnostic store to the game layer.
 *
 * This replaces what `vue-app.js` used to do: hold the HUD state, expose it to the UI, and
 * provide the two game commands the UI can trigger (`resetGame`, `toggleView`). The initial
 * values and the reset order mirror `vue-app.js` exactly.
 */

import { loadGame } from './game-bridge';
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
        runtime: { phase: 'loading', message: '', detail: '' },
        resetGame: () => undefined,
        toggleView: () => undefined,
        retry: () => undefined,
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
        // The game chunk may still be loading; the call is queued behind it.
        void loadGame()
            .then(game => game.resetGame(host))
            .catch((error: unknown) => {
                console.error('❌ Game reset failed:', error);
            });
    };
    host.toggleView = () => {
        void loadGame().then(game => game.toggleView());
    };
    host.retry = () => {
        // recoverGame() contains its own failures; no rejection escapes here.
        void loadGame().then(game => game.recoverGame(host));
    };

    return { store, host };
}
