import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Static-host friendly build: relative asset URLs so `dist/` can be served from
 * any subdirectory (and from a plain `python3 -m http.server`).
 */
export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        target: 'es2022',
        sourcemap: true,
    },
    server: {
        port: 5173,
    },
});
