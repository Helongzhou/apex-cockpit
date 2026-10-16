/**
 * loading.ts - Retryable, observable asset loading.
 *
 * The analysis found two caches that stored a **rejected** promise forever
 * (`physics-world.ts` `engineReady`, `car-model.ts` `modelPromise`), so a single transient
 * CDN failure bricked the page for its whole lifetime. {@link cacheOnce} keeps the
 * de-duplication benefit but drops the cache on failure, and {@link loadWithRetry} adds a
 * bounded backoff so the UI can show progress and the user can retry from a known state.
 */

export interface LoadStage {
    /** Machine-readable stage name, e.g. "engine" or "model". */
    name: string;
    /** Human readable text for the loading overlay. */
    label: string;
}

export class LoadFailure extends Error {
    stage: string;

    constructor(stage: string, cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'LoadFailure';
        this.stage = stage;
    }
}

/**
 * Caches the successful result of `create()`. Concurrent callers share one in-flight
 * promise, and a rejection clears the cache so the next call really retries.
 */
export function cacheOnce<T>(create: () => Promise<T>): () => Promise<T> {
    let cached: Promise<T> | null = null;
    return () => {
        if (cached === null) {
            cached = create().catch((error: unknown) => {
                cached = null;
                throw error;
            });
        }
        return cached;
    };
}

export interface RetryOptions {
    attempts?: number;
    /** Delay before attempt `n` (1-based). Defaults to 300/900/2700 ms. */
    delayMs?: (attempt: number) => number;
    /** Reports each attempt so the UI can say "retry 2/3". */
    onAttempt?: (attempt: number, total: number) => void;
}

const defaultDelay = (attempt: number): number => 300 * 3 ** (attempt - 1);

/**
 * Runs `load()` with bounded retries. Every failure is wrapped in a {@link LoadFailure}
 * carrying the stage name so the overlay can tell the user what failed.
 */
export async function loadWithRetry<T>(
    stage: LoadStage,
    load: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const attempts = options.attempts ?? 3;
    const delayMs = options.delayMs ?? defaultDelay;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        options.onAttempt?.(attempt, attempts);
        try {
            return await load();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs(attempt)));
            }
        }
    }

    throw new LoadFailure(stage.name, lastError);
}
