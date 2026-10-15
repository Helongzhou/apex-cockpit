import { useEffect, useRef } from 'react';
import type { GameHost } from '../../game/types.js';

const JOYSTICK_DEADZONE_PX = 15;
const JOYSTICK_MAX_DISTANCE_PX = 35; // half of joystick outer radius minus inner radius
const JUMP_REPEAT_MS = 50;

/**
 * Mobile touch controls (was `components/mobile-controls.js`).
 *
 * The joystick writes straight to the DOM (`style.transform`) and to `host.touchControls`,
 * exactly like the Vue version: high-frequency pointer input must not go through React state.
 */
export function MobileControls({ host, isTouchDevice }: { host: GameHost; isTouchDevice: boolean }) {
    const joystickRef = useRef<HTMLDivElement | null>(null);
    const joystickInnerRef = useRef<HTMLDivElement | null>(null);
    const jumpInterval = useRef<number | undefined>(undefined);

    useEffect(() => {
        const joystick = joystickRef.current;
        const joystickInner = joystickInnerRef.current;
        if (!joystick || !joystickInner) {
            return;
        }

        let isDragging = false;
        let joystickCenter = { x: 0, y: 0 };

        const updateJoystickCenter = () => {
            const rect = joystick.getBoundingClientRect();
            joystickCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        };

        const handleStart = (e: TouchEvent | MouseEvent) => {
            e.preventDefault();
            isDragging = true;
            updateJoystickCenter();
        };

        const handleMove = (e: TouchEvent | MouseEvent) => {
            if (!isDragging) return;
            e.preventDefault();

            const touch = 'touches' in e ? e.touches[0] : e;
            const deltaX = touch.clientX - joystickCenter.x;
            const deltaY = touch.clientY - joystickCenter.y;

            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            let x = deltaX;
            let y = deltaY;

            if (distance > JOYSTICK_MAX_DISTANCE_PX) {
                x = (deltaX / distance) * JOYSTICK_MAX_DISTANCE_PX;
                y = (deltaY / distance) * JOYSTICK_MAX_DISTANCE_PX;
            }

            joystickInner.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

            // Update touch controls based on joystick position
            host.touchControls.forward = y < -JOYSTICK_DEADZONE_PX;
            host.touchControls.backward = y > JOYSTICK_DEADZONE_PX;
            host.touchControls.left = x < -JOYSTICK_DEADZONE_PX;
            host.touchControls.right = x > JOYSTICK_DEADZONE_PX;
        };

        const handleEnd = (e: TouchEvent | MouseEvent) => {
            e.preventDefault();
            isDragging = false;

            joystickInner.style.transform = 'translate(-50%, -50%)';

            // Reset all directional controls
            host.touchControls.forward = false;
            host.touchControls.backward = false;
            host.touchControls.left = false;
            host.touchControls.right = false;
        };

        const controller = new AbortController();
        const { signal } = controller;

        // Touch events
        joystick.addEventListener('touchstart', handleStart, { passive: false, signal });
        document.addEventListener('touchmove', handleMove, { passive: false, signal });
        document.addEventListener('touchend', handleEnd, { passive: false, signal });

        // Mouse events for testing on desktop
        joystick.addEventListener('mousedown', handleStart, { signal });
        document.addEventListener('mousemove', handleMove, { signal });
        document.addEventListener('mouseup', handleEnd, { signal });

        return () => {
            controller.abort();
        };
    }, [host]);

    useEffect(() => {
        return () => {
            window.clearInterval(jumpInterval.current);
        };
    }, []);

    const onBrakeStart = (e: React.TouchEvent) => {
        e.preventDefault();
        host.touchControls.brake = true;
    };
    const onBrakeEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        host.touchControls.brake = false;
    };
    const onJumpStart = (e: React.TouchEvent) => {
        e.preventDefault();
        host.touchControls.jump = true;

        // Continuously send jump like spacebar - every 50ms
        jumpInterval.current = window.setInterval(() => {
            host.touchControls.jump = true;
        }, JUMP_REPEAT_MS);
    };
    const onJumpEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        host.touchControls.jump = false;

        if (jumpInterval.current !== undefined) {
            window.clearInterval(jumpInterval.current);
            jumpInterval.current = undefined;
        }
    };
    const onToggleView = (e: React.TouchEvent) => {
        e.preventDefault();
        host.toggleView();
    };
    const onResetTouch = (e: React.TouchEvent) => {
        e.preventDefault();
        host.resetGame();
    };

    return (
        <div className={isTouchDevice ? 'mobile-controls visible' : 'mobile-controls'}>
            {/* Virtual Joystick */}
            <div className="virtual-joystick" ref={joystickRef}>
                <div className="joystick-outer">
                    <div className="joystick-inner" ref={joystickInnerRef}></div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
                <div className="action-button brake" onTouchStart={onBrakeStart} onTouchEnd={onBrakeEnd}>
                    🚗
                </div>
                <div className="action-button jump" onTouchStart={onJumpStart} onTouchEnd={onJumpEnd}>
                    🚀
                </div>
                <div className="action-button view" onTouchStart={onToggleView}>
                    📷
                </div>
                <div className="action-button reset" onTouchStart={onResetTouch}>
                    🔄
                </div>
            </div>
        </div>
    );
}
