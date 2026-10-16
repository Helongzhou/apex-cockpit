import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover the pure modules under `game/math/` and the store; no DOM and no WebGL are
 * needed, so the node environment is enough (and much faster than jsdom).
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: [
                'game/math/**/*.ts',
                'game/loading.ts',
                'game/vehicle-state.ts',
                'game/state-bus.ts',
                'game/telemetry.ts',
                'src/state.ts'
            ],
            reporter: ['text', 'text-summary']
        }
    }
});
