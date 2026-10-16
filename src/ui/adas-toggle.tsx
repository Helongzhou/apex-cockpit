import type { AdasMode, GameHost } from '../../game/types.js';

const MODES: ReadonlyArray<{ id: AdasMode; label: string }> = [
    { id: 'off', label: '关闭' },
    { id: 'truth', label: '真值' },
    { id: 'perception', label: '感知' }
];

/**
 * Truth / perception / off switch for the ADAS overlays. It only renders when the running stage
 * publishes an ADAS feed (`host.adasAvailable`), so the studio never shows a dead control.
 */
export function AdasToggle({ host, mode, available }: { host: GameHost; mode: AdasMode; available: boolean }) {
    if (!available) {
        return null;
    }
    return (
        <div className="adas-toggle" role="group" aria-label="ADAS 图层">
            <span className="adas-toggle-title">ADAS</span>
            {MODES.map(candidate => (
                <button
                    key={candidate.id}
                    type="button"
                    className={candidate.id === mode ? 'adas-button active' : 'adas-button'}
                    onClick={() => {
                        host.adasMode = candidate.id;
                    }}
                >
                    {candidate.label}
                </button>
            ))}
        </div>
    );
}
