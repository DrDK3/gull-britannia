import { StrictMode } from 'react';
import * as THREE from 'three';
import { createRoot } from 'react-dom/client';
import { GullGame } from './gull/app/game';
import { App } from './gull/ui/App';
import './gull/ui/gull.css';

const game = new GullGame();

// Test and debugging hooks (types in src/gull/app/hooks.d.ts).
window.__gull = { game, THREE };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App game={game} />
  </StrictMode>,
);
