import { useEffect, useState } from 'react';
import type { GameHost, StageId } from '../../game/types.js';

/**
 * Stage switcher. The list comes from `host.stages`, which the game publishes at startup, so the
 * UI never hardcodes stage ids and this file stays out of the game bundle. With a single stage
 * nothing is rendered: the UI never advertises something that does not exist.
 */
export function StageSwitcher({ host, stage, stages }: { host: GameHost; stage: StageId; stages: Array<{ id: StageId; label: string }> }) {
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setBusy(false);
    }, [stage]);


    if (stages.length < 2) {
        return null;
    }

    return (
        <div className="stage-switcher" role="group" aria-label="舞台切换">
            {stages.map(candidate => (
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
