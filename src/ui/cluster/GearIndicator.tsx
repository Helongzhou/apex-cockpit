import type { Gear } from '../../../game/types.js';
import { GEAR_ORDER, isGearActive } from './mapping';

/** P / R / N / D strip; the gear itself comes from the physics state, not from the input. */
export function GearIndicator({ gear }: { gear: Gear }) {
    return (
        <div className="cluster-gears" role="img" aria-label={`挡位 ${gear}`}>
            {GEAR_ORDER.map(candidate => (
                <span
                    key={candidate}
                    className={isGearActive(gear, candidate) ? 'cluster-gear active' : 'cluster-gear'}
                >
                    {candidate}
                </span>
            ))}
        </div>
    );
}
