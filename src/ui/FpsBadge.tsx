import type { GameHost } from '../../game/types.js';
import { useGameState } from '../hooks/useGameState';
import type { Store } from '../state';

const LOW_FPS_THRESHOLD = 30;

/** Frames Per Second badge (was `components/fps-counter.js`). */
export function FpsBadge({ store }: { store: Store<GameHost> }) {
    const { fps } = useGameState(store);
    const isLow = fps > 0 && fps < LOW_FPS_THRESHOLD;

    return (
        <div className={isLow ? 'fps-counter low' : 'fps-counter'} title="Frames per second">
            {Math.round(fps)} FPS
        </div>
    );
}
