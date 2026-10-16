import { useEffect, useState } from 'react';
import type { GameHost, StageId } from '../../game/types.js';

/**
 * Stages the build can switch to. The highway stage lands in task D3; until a second entry
 * exists the switcher renders nothing, so the UI never advertises something that is not there.
 */
export const STAGES: ReadonlyArray<{ id: StageId; label: string }> = [
    { id: 'studio', label: '影棚' }
];

/** Stage switcher: writes `host.setStage`, which the game layer resolves to a scene factory. */
export function StageSwitcher({ host, stage }: { host: GameHost; stage: StageId }) {
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setBusy(false);
    }, [stage]);

    if (STAGES.length < 2) {
        return null;
    }

    return (
        <div className="stage-switcher" role="group" aria-label="舞台切换">
            {STAGES.map(candidate => (
                <button
                    key={candidate.id}
                    type="button"
                    className={candidate.id === stage ? 'stage-button active' : 'stage-button'}
                    disabled={busy}
                    onClick={() => {
                        if (candidate.id !== stage) {
                            setBusy(true);
                            host.setStage(candidate.id);
                        }
                    }}
                >
                    {candidate.label}
                </button>
            ))}
        </div>
    );
}
