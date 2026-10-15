import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../hooks/useGameState';
import type { Store } from '../state';
import type { GameHost } from '../../game/types.js';

const HIDE_ANIMATION_MS = 400;

/** Debug panel with the vehicle readouts and the game statistics (was `components/info-panel.js`). */
export function InfoPanel({ store, isTouchDevice }: { store: Store<GameHost>; isTouchDevice: boolean }) {
    const state = useGameState(store);
    const [debugVisible, setDebugVisible] = useState(false);
    const [isHidden, setIsHidden] = useState(true); // Start hidden with display: none
    // Mirrors `debugVisible` for the keydown listener and the hide timeout, so neither needs
    // to re-register when the panel toggles.
    const visibleRef = useRef(false);
    const hideTimeout = useRef<number | undefined>(undefined);

    // Remove display: none first, then start slide animation
    const show = () => {
        window.clearTimeout(hideTimeout.current);
        visibleRef.current = true;
        setIsHidden(false);
        setDebugVisible(true);
    };

    // Start slide-out animation first, hide after it completes
    const hide = () => {
        visibleRef.current = false;
        setDebugVisible(false);
        hideTimeout.current = window.setTimeout(() => {
            if (!visibleRef.current) { // Only hide if still closed
                setIsHidden(true);
            }
        }, HIDE_ANIMATION_MS);
    };

    useEffect(() => {
        const handleGlobalKeydown = (e: KeyboardEvent) => {
            if (e.key === 'F12' || e.key === '`') {
                e.preventDefault();
                if (visibleRef.current) {
                    hide();
                } else {
                    show();
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeydown);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeydown);
            window.clearTimeout(hideTimeout.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const panelClass = (side: string) =>
        `panel panel-${side}${debugVisible ? ' visible' : ''}${isHidden ? ' hidden' : ''}`;

    return (
        <>
            {/* Debug Button */}
            {!debugVisible && !isTouchDevice && (
                <button className="debug-button" onClick={show}>
                    🐛 Debug
                </button>
            )}

            {/* Left Panel */}
            <div className={panelClass('left')}>
                <button className="hide-button" onClick={hide}>✕ Hide</button>
                <h2>Vehicle Data</h2>
                <div>
                    <div className="stat-box">
                        <div className="stat-label">Speed</div>
                        <div className="stat-value-large stat-value-green">{state.speed.toFixed(1)} km/h</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Position X</div>
                        <div className="stat-value">{state.position.x.toFixed(2)}</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Position Y</div>
                        <div className="stat-value">{state.position.y.toFixed(2)}</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Position Z</div>
                        <div className="stat-value">{state.position.z.toFixed(2)}</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Rotation</div>
                        <div className="stat-value">{state.rotation.toFixed(1)}°</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Direction</div>
                        <div className="stat-value">{state.direction}</div>
                    </div>
                </div>
                <div className="controls">
                    <h3>Controls</h3>
                    <div>⬆️ W - Forward</div>
                    <div>⬇️ S - Backward</div>
                    <div>⬅️ A - Left</div>
                    <div>➡️ D - Right</div>
                    <div>🚀 Space - Jump</div>
                    <div>🚗 B - Brake</div>
                    <div>🔄 Enter - Reset</div>
                </div>
            </div>

            {/* Right Panel */}
            <div className={panelClass('right')}>
                <h2>Game Statistics</h2>
                <div>
                    <div className="stat-box">
                        <div className="stat-label">Race Time</div>
                        <div className="stat-value-large stat-value-blue">
                            {state.isRacing ? <span>{state.raceTime.toFixed(2)}s</span> : <span>START</span>}
                        </div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Knocked Boxes</div>
                        <div className="stat-value-large stat-value-yellow">{state.knockedBoxes}</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Collisions</div>
                        <div className="stat-value-large stat-value-red">{state.collisions}</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-label">Top Speed</div>
                        <div className="stat-value stat-value-green">{state.maxSpeed.toFixed(1)} km/h</div>
                    </div>
                </div>
                <div className="controls">
                    <h3 style={{ color: '#a78bfa' }}>Info</h3>
                    <div>🏁 Press W to start</div>
                    <div>⏱️ Time starts with first gas</div>
                    <div>🎯 Knock down all 5 boxes</div>
                    <div>💥 Avoid collisions with towers</div>
                    <div>🏎️ Reach top speed</div>
                </div>
            </div>
        </>
    );
}
