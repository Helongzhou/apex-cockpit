import { useEffect } from 'react';
import type { GameHost } from '../../game/types.js';
import { listen, releaseAll } from '../../game/listeners.js';

/**
 * Port of `vue-app.js` `detectTouchOnly()`: capability queries plus a runtime switch on the
 * first real touch / mouse event, so connecting a mouse to a tablet flips the UI back.
 */
export function useTouchDevice(host: GameHost): void {
    useEffect(() => {
        // Primary: Touch-only = (hover: none) & (pointer: coarse) and NO any input that can hover (Mouse/Trackpad)
        const mqCoarseNoHover = window.matchMedia('(hover: none) and (pointer: coarse)');
        const mqAnyHover = window.matchMedia('(any-hover: hover)');

        const updateTouchOnly = () => {
            host.isTouchDevice = mqCoarseNoHover.matches && !mqAnyHover.matches;
            console.log('📱 Touch-only detected:', host.isTouchDevice);
        };

        updateTouchOnly();
        mqCoarseNoHover.addEventListener?.('change', updateTouchOnly);
        mqAnyHover.addEventListener?.('change', updateTouchOnly);

        // Listen for first touch event - set to touch device
        const handleTouch = () => {
            if (!host.isTouchDevice) {
                host.isTouchDevice = true;
                console.log('📱 Touch detected - switching to touch mode');
            }
        };

        // Listen for first mouse event - set to non-touch device
        const handleMouse = () => {
            if (host.isTouchDevice) {
                host.isTouchDevice = false;
                console.log('🖱️ Mouse detected - switching to desktop mode');
            }
        };

        const handles = [
            listen(window, 'touchstart', handleTouch, { passive: true }),
            listen(window, 'touchmove', handleTouch, { passive: true }),
            listen(window, 'mousedown', handleMouse, { passive: true }),
            listen(window, 'mousemove', handleMouse, { passive: true })
        ];

        // Fallback for very old browsers (optional)
        if (!('matchMedia' in window)) {
            host.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        }

        return () => {
            mqCoarseNoHover.removeEventListener?.('change', updateTouchOnly);
            mqAnyHover.removeEventListener?.('change', updateTouchOnly);
            releaseAll(handles);
        };
    }, [host]);
}
