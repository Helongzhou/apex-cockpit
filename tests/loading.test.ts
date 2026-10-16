import { describe, expect, it, vi } from 'vitest';
import { LoadFailure, cacheOnce, loadWithRetry } from '../game/loading.js';

describe('cacheOnce', () => {
    it('creates the value once and reuses it', async () => {
        const create = vi.fn().mockResolvedValue('engine');
        const cached = cacheOnce(create);
        expect(await cached()).toBe('engine');
        expect(await cached()).toBe('engine');
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight promise between concurrent callers', async () => {
        let resolve: (value: string) => void = () => undefined;
        const create = vi.fn(() => new Promise<string>(r => { resolve = r; }));
        const cached = cacheOnce(create);
        const first = cached();
        const second = cached();
        expect(create).toHaveBeenCalledTimes(1);
        resolve('done');
        expect(await first).toBe('done');
        expect(await second).toBe('done');
    });

    it('drops a rejected promise so the next call really retries', async () => {
        const create = vi.fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce('engine');
        const cached = cacheOnce(create);
        await expect(cached()).rejects.toThrow('network');
        expect(await cached()).toBe('engine');
        expect(create).toHaveBeenCalledTimes(2);
    });
});

describe('loadWithRetry', () => {
    it('returns as soon as an attempt succeeds', async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error('flaky'))
            .mockResolvedValueOnce('model');
        await expect(loadWithRetry({ name: 'model', label: '模型' }, load, { delayMs: () => 0 })).resolves.toBe('model');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('wraps the last error in a LoadFailure tagged with the stage', async () => {
        const load = vi.fn().mockRejectedValue(new Error('offline'));
        const failure = await loadWithRetry({ name: 'engine', label: '物理引擎' }, load, { delayMs: () => 0 })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(LoadFailure);
        expect((failure as LoadFailure).stage).toBe('engine');
        expect((failure as LoadFailure).message).toBe('offline');
        expect(load).toHaveBeenCalledTimes(3);
    });

    it('reports every attempt so the UI can show progress', async () => {
        const attempts: Array<[number, number]> = [];
        const load = vi.fn().mockRejectedValue(new Error('offline'));
        await loadWithRetry({ name: 'engine', label: '物理引擎' }, load, {
            attempts: 2,
            delayMs: () => 0,
            onAttempt: (attempt, total) => attempts.push([attempt, total])
        }).catch(() => undefined);
        expect(attempts).toEqual([[1, 2], [2, 2]]);
    });

    it('honours a custom attempt budget', async () => {
        const load = vi.fn().mockRejectedValue(new Error('offline'));
        await loadWithRetry({ name: 'engine', label: '物理引擎' }, load, { attempts: 1, delayMs: () => 0 })
            .catch(() => undefined);
        expect(load).toHaveBeenCalledTimes(1);
    });
});
