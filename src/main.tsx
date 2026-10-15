/**
 * main.tsx - Application bootstrap.
 *
 * Order matters: the canvas has to be in the DOM before `initializeGame` looks it up,
 * so the game is initialised from an effect. The root is mounted without `StrictMode`
 * because the game owns a module-level render loop and a singleton renderer, and a
 * double mount would initialise it twice. Stability work (error boundary, context
 * loss recovery, reset re-entry) is task C2.
 */

import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { initializeGame } from '../game/three-game.js';
import { createGameHost } from './app';

import '../css/main.css';
import '../css/info-panel.css';
import '../css/mobile-controls.css';
import '../css/desktop-controls.css';
import '../css/fps-counter.css';

const { host } = createGameHost();

function App() {
    useEffect(() => {
        initializeGame(host);
    }, []);

    return <canvas id="renderCanvas" />;
}

const container = document.getElementById('app');
if (container === null) {
    throw new Error('The #app container is missing from index.html');
}

createRoot(container).render(<App />);
