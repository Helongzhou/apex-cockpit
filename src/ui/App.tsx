import { useEffect } from 'react';

import { initializeGame, type GameOptions } from '../../game/three-game.js';
import type { GameHost } from '../../game/types.js';
import type { Store } from '../state';
import { useGameState } from '../hooks/useGameState';
import { useTouchDevice } from '../hooks/useTouchDevice';
import { DesktopControls } from './DesktopControls';
import { FpsBadge } from './FpsBadge';
import { InfoPanel } from './InfoPanel';
import { MobileControls } from './MobileControls';

export interface AppProps {
    store: Store<GameHost>;
    host: GameHost;
    /** Deterministic-run hooks; undefined in normal use. */
    options?: GameOptions;
}

/**
 * DOM order mirrors the original `index.html`: panels first, then the canvas that fills the
 * layout, then the control overlays.
 */
export function App({ store, host, options }: AppProps) {
    const { isTouchDevice } = useGameState(store);
    useTouchDevice(host);

    useEffect(() => {
        initializeGame(host, options);
        // Initialised once: the game owns a module-level render loop and a singleton renderer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <InfoPanel store={store} isTouchDevice={isTouchDevice} />
            <FpsBadge store={store} />
            <canvas id="renderCanvas" />
            <DesktopControls isTouchDevice={isTouchDevice} />
            <MobileControls host={host} isTouchDevice={isTouchDevice} />
        </>
    );
}
