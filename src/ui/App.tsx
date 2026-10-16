import { useEffect } from 'react';

import type { GameHost } from '../../game/types.js';
import type { GameOptions } from '../game-bridge';
import { loadGame } from '../game-bridge';
import { isReplayMode, startReplay } from '../dev/replay-source';
import type { Store } from '../state';
import { useGameState } from '../hooks/useGameState';
import { useTouchDevice } from '../hooks/useTouchDevice';
import { DesktopControls } from './DesktopControls';
import { FpsBadge } from './FpsBadge';
import { InfoPanel } from './InfoPanel';
import { MobileControls } from './MobileControls';
import { RuntimeOverlay } from './RuntimeOverlay';
import { Cluster } from './cluster/Cluster';
import { StageSwitcher } from './scene-switcher';

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
    const { isTouchDevice, stage, stages } = useGameState(store);
    // `?cluster=off` exists so the cluster's cost can be measured against the same build.
    const clusterEnabled = new URLSearchParams(window.location.search).get('cluster') !== 'off';
    useTouchDevice(host);

    useEffect(() => {
        let disposed = false;
        // Replay mode exercises the pluggable data source: the recorded frames drive the same host
        // fields and the game module is never loaded (AC-D1.5).
        if (isReplayMode()) {
            const stop = startReplay(host);
            return () => {
                disposed = true;
                stop();
            };
        }
        void loadGame().then(game => {
            // The effect may already have been cleaned up while the chunk was loading.
            if (!disposed) {
                game.initializeGame(host, options);
            }
        }).catch((error: unknown) => {
            console.error('❌ Game module failed to load:', error);
            host.runtime.phase = 'fatal';
            host.runtime.message = '游戏模块加载失败';
            host.runtime.detail = error instanceof Error ? error.message : String(error);
        });
        return () => {
            disposed = true;
            void loadGame().then(game => game.disposeGame());
        };
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
            {clusterEnabled ? <Cluster store={store} /> : null}
            <StageSwitcher host={host} stage={stage} stages={stages} />
            <RuntimeOverlay store={store} />
        </>
    );
}
