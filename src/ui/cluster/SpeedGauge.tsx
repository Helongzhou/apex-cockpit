import { memo } from 'react';
import { GAUGE_MAX_KMH, gaugeTicks, speedToNeedleDegrees } from './mapping';

/** Static face: computed once, never re-rendered while driving. */
const TICKS = gaugeTicks();
const MAJOR_TICKS = TICKS.filter(tick => tick.label !== null);

const GaugeFace = memo(function GaugeFace() {
    return (
        <svg viewBox="0 0 120 120" className="cluster-gauge-face" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="cluster-gauge-ring" />
            {TICKS.map(tick => (
                <line
                    key={`tick-${tick.value}`}
                    x1="60"
                    y1="12"
                    x2="60"
                    y2={tick.label === null ? '17' : '21'}
                    transform={`rotate(${tick.degrees} 60 60)`}
                    className={tick.label === null ? 'cluster-tick' : 'cluster-tick cluster-tick-major'}
                />
            ))}
            {MAJOR_TICKS.map(tick => (
                <text
                    key={`label-${tick.value}`}
                    x="60"
                    y="31"
                    transform={`rotate(${tick.degrees} 60 60)`}
                    textAnchor="middle"
                    className="cluster-tick-label"
                >
                    {tick.label}
                </text>
            ))}
        </svg>
    );
});

/**
 * Analogue speed gauge. Everything that changes per frame is a `transform` (needle) or a text
 * node, so no layout is invalidated; there is deliberately no canvas here.
 */
export function SpeedGauge({ speedKmh, speedMps }: { speedKmh: number; speedMps: number }) {
    const needle = speedToNeedleDegrees(speedKmh);
    return (
        <div className="cluster-gauge" role="img" aria-label={`车速 ${speedKmh.toFixed(1)} km/h`}>
            <GaugeFace />
            <div className="cluster-needle" style={{ transform: `rotate(${needle}deg)` }} />
            <div className="cluster-hub" />
            <div className="cluster-gauge-reading">
                <span className="cluster-speed-value">{speedKmh.toFixed(1)}</span>
                <span className="cluster-speed-unit">km/h</span>
                <span className="cluster-speed-secondary">{speedMps.toFixed(1)} m/s</span>
            </div>
            <span className="cluster-gauge-max">满量程 {GAUGE_MAX_KMH}</span>
        </div>
    );
}
