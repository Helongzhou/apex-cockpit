/**
 * main.tsx - Application bootstrap.
 *
 * Mounted without `StrictMode`: the game owns a module-level render loop and a singleton
 * renderer, so a double mount would initialise it twice. Stability work (error boundary,
 * context loss recovery, reset re-entry) is task C2.
 */

import { createRoot } from 'react-dom/client';

import { createGameHost } from './app';
import { App } from './ui/App';

import '../css/main.css';
import '../css/info-panel.css';
import '../css/mobile-controls.css';
import '../css/desktop-controls.css';
import '../css/fps-counter.css';

const { store, host } = createGameHost();

const container = document.getElementById('app');
if (container === null) {
    throw new Error('The #app container is missing from index.html');
}

createRoot(container).render(<App store={store} host={host} />);
