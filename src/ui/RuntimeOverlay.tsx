import type { GameHost } from '../../game/types.js';
import { useGameState } from '../hooks/useGameState';
import type { Store } from '../state';

/**
 * Loading, fatal-error and context-lost states (task C2). Healthy runs render nothing.
 *
 * The busy states pass pointer events through so the canvas stays interactive as soon as
 * the loop is running again; only a fatal state takes the click, for its retry button.
 */
export function RuntimeOverlay({ store }: { store: Store<GameHost> }) {
    const { runtime } = useGameState(store);
    if (runtime.phase === 'ready') {
        return null;
    }

    const isBusy = runtime.phase === 'loading';
    const title = runtime.phase === 'context-lost'
        ? '显卡上下文丢失'
        : isBusy ? '加载中' : '需要恢复';

    return (
        <div className={isBusy ? 'runtime-overlay busy' : 'runtime-overlay error'} role="status">
            <div className="runtime-card">
                <div className="runtime-title">{title}</div>
                {runtime.message ? <div className="runtime-message">{runtime.message}</div> : null}
                {runtime.detail ? <div className="runtime-detail">{runtime.detail}</div> : null}
                {!isBusy ? (
                    <button className="runtime-retry" onClick={() => store.state.retry()}>
                        重试
                    </button>
                ) : null}
            </div>
        </div>
    );
}
