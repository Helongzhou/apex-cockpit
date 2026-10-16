import type { Store } from '../../state';
import type { GameHost } from '../../../game/types.js';
import { useGameState } from '../../hooks/useGameState';
import { AdasStatusIcons } from './AdasStatusIcons';
import { GearIndicator } from './GearIndicator';
import { PowerBar } from './PowerBar';
import { SpeedGauge } from './SpeedGauge';

/**
 * The cluster reads one 20 Hz snapshot from the store. It deliberately does **not** subscribe to
 * the 60 Hz state bus: React re-renders on every store change, so binding it to the frame rate
 * would move main-thread work into the render loop (see the state-management spec).
 */
export function Cluster({ store }: { store: Store<GameHost> }) {
    const { vehicle, isRacing, runtime } = useGameState(store);
    if (runtime.phase !== 'ready') {
        return null;
    }

    return (
        <div className="cluster" role="group" aria-label="数字仪表">
            <SpeedGauge speedKmh={vehicle.speedKmh} speedMps={vehicle.speedMps} />
            <div className="cluster-side">
                <GearIndicator gear={vehicle.gear} />
                <PowerBar powerKw={vehicle.powerKw} />
                <AdasStatusIcons snapshot={vehicle} isRacing={isRacing} />
            </div>
        </div>
    );
}
