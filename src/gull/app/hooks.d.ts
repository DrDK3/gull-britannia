import type * as THREE from 'three';
import type { GullGame } from './game';

declare global {
  interface Window {
    __gull?: { game: GullGame; THREE: typeof THREE };
  }
}
