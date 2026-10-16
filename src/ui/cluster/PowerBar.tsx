import { POWER_BAR_MAX_KW, powerToFraction } from './mapping';

/**
 * Centre-zero power bar: right of centre is drive, left is braking/regen. The fill is scaled with
 * `transform: scaleX()` from the centre mark, so updating it never triggers layout.
 */
export function PowerBar({ powerKw }: { powerKw: number }) {
    const fraction = powerToFraction(powerKw);
    const drive = Math.max(0, fraction);
    const regen = Math.max(0, -fraction);
    return (
        <div className="cluster-power" role="img" aria-label={`功率 ${powerKw.toFixed(0)} kW`}>
            <div className="cluster-power-track">
                <div className="cluster-power-fill regen" style={{ transform: `scaleX(${regen})` }} />
                <div className="cluster-power-fill drive" style={{ transform: `scaleX(${drive})` }} />
                <div className="cluster-power-centre" />
            </div>
            <div className="cluster-power-legend">
                <span className="cluster-power-value">{powerKw.toFixed(0)} kW</span>
                <span className="cluster-power-range">满量程 ±{POWER_BAR_MAX_KW} kW</span>
            </div>
        </div>
    );
}
