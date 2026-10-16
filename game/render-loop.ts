/**
 * render-loop.ts - Frame-loop host with an error boundary.
 *
 * Verified externally (docs/research/2026-10-15-external-facts.md §1): three's
 * `WebGLAnimation.onAnimationFrame` runs the user callback *before* scheduling the next
 * `requestAnimationFrame`, so an exception thrown inside the callback stops the loop for
 * good. Everything therefore runs inside a try/catch here, and a throw is turned into a
 * visible fatal state that the user can recover from.
 */

export interface RenderLoopOptions {
    /** One frame of work. May throw; the loop contains it. */
    frame: () => void;
    /** Called once when a frame throws. The loop is already stopped at this point. */
    onFatal: (error: Error) => void;
}

export interface RenderLoop {
    /** Runs one frame inside the boundary. Wire this into `setAnimationLoop`. */
    run(): void;
    start(): void;
    stop(): void;
    isRunning(): boolean;
    /** Consecutive-error counter; reset to zero by a successful frame. */
    errorCount(): number;
}

const toError = (thrown: unknown): Error =>
    thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * One consecutive failure is fatal on purpose: after an exception the game state may already
 * be inconsistent, so continuing silently would hide the bug and produce unpredictable
 * frames. The recovery entry point rebuilds the session instead of retrying blindly.
 */
export function createRenderLoop({ frame, onFatal }: RenderLoopOptions): RenderLoop {
    let running = false;
    let failed = 0;

    return {
        run(): void {
            if (!running) {
                return;
            }
            try {
                frame();
                failed = 0;
            } catch (thrown) {
                failed += 1;
                running = false;
                onFatal(toError(thrown));
            }
        },
        start(): void {
            failed = 0;
            running = true;
        },
        stop(): void {
            running = false;
        },
        isRunning(): boolean {
            return running;
        },
        errorCount(): number {
            return failed;
        }
    };
}
