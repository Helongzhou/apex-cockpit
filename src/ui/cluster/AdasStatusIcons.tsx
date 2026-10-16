import type { VehicleSnapshot } from '../../../game/types.js';
import { activeStatusIcons } from './mapping';

const ICON_GLYPHS: Record<string, string> = {
    collision: '⚠',
    reverse: '⏪',
    standstill: '⏸',
    driving: '▶',
    racing: '⏱'
};

/**
 * Data-driven status strip. Only signals that actually exist are shown today; the ADAS-specific
 * icons (lane keeping, target lock, ACC) are added in iteration 3, when those layers land.
 */
export function AdasStatusIcons({ snapshot, isRacing }: { snapshot: VehicleSnapshot; isRacing: boolean }) {
    const icons = activeStatusIcons(snapshot, isRacing);
    return (
        <div className="cluster-status" role="status" aria-label="车辆状态">
            {icons.length === 0
                ? <span className="cluster-status-empty">—</span>
                : icons.map(icon => (
                    <span key={icon.id} className={`cluster-status-icon ${icon.tone}`}>
                        <span aria-hidden="true">{ICON_GLYPHS[icon.id]}</span>
                        <span className="cluster-status-label">{icon.label}</span>
                    </span>
                ))}
        </div>
    );
}
