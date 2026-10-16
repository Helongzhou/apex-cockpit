import { useEffect, useRef, useState } from 'react';
import { listen, releaseAll } from '../../game/listeners.js';

/** Keyboard controls display (was `components/desktop-controls.js`). */
export function DesktopControls({ isTouchDevice }: { isTouchDevice: boolean }) {
    const [keyStates, setKeyStates] = useState({
        w: false, a: false, s: false, d: false, space: false, b: false, c: false, enter: false
    });
    const enterTimeout = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (isTouchDevice) {
            return;
        }

        const updateKeyState = (key: string, isPressed: boolean) => {
            const next: Partial<typeof keyStates> = {};
            switch (key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    next.w = isPressed;
                    break;
                case 'a':
                case 'arrowleft':
                    next.a = isPressed;
                    break;
                case 's':
                case 'arrowdown':
                    next.s = isPressed;
                    break;
                case 'd':
                case 'arrowright':
                    next.d = isPressed;
                    break;
                case ' ':
                    next.space = isPressed;
                    break;
                case 'b':
                    next.b = isPressed;
                    break;
                case 'c':
                    next.c = isPressed;
                    break;
                case 'enter':
                    next.enter = isPressed;
                    // Reset after short delay for visual feedback
                    if (isPressed) {
                        enterTimeout.current = window.setTimeout(() => {
                            setKeyStates(current => ({ ...current, enter: false }));
                        }, 200);
                    }
                    break;
                default:
                    return;
            }
            setKeyStates(current => ({ ...current, ...next }));
        };

        const onKeyDown = (event: KeyboardEvent) => updateKeyState(event.key, true);
        const onKeyUp = (event: KeyboardEvent) => updateKeyState(event.key, false);
        const handles = [
            listen(window, 'keydown', onKeyDown),
            listen(window, 'keyup', onKeyUp)
        ];

        return () => {
            releaseAll(handles);
            window.clearTimeout(enterTimeout.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTouchDevice]);

    const keyClass = (name: keyof typeof keyStates, extra = '') =>
        `key-display${extra ? ` ${extra}` : ''}${keyStates[name] ? ' active' : ''}`;

    return (
        <div className={isTouchDevice ? 'desktop-controls' : 'desktop-controls visible'}>
            <div className="control-group">
                <div className={keyClass('w', 'wasd')}>W</div>
                <div className={keyClass('a', 'wasd')}>A</div>
                <div className={keyClass('s', 'wasd')}>S</div>
                <div className={keyClass('d', 'wasd')}>D</div>
                <span className="control-label">Move</span>
            </div>

            <div className="control-separator"></div>

            <div className="control-group">
                <div className={keyClass('space', 'space')}>SPACE</div>
                <span className="control-label">Jump</span>
            </div>

            <div className="control-separator"></div>

            <div className="control-group">
                <div className={keyClass('b', 'b')}>B</div>
                <span className="control-label">Brake</span>
            </div>

            <div className="control-separator"></div>

            <div className="control-group">
                <div className={keyClass('c', 'c')}>C</div>
                <span className="control-label">View</span>
            </div>

            <div className="control-separator"></div>

            <div className="control-group">
                <div className={keyClass('enter', 'enter')}>ENTER</div>
                <span className="control-label">Reset</span>
            </div>
        </div>
    );
}
