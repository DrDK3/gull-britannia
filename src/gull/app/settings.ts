/** Player settings, kept in the browser (localStorage). */

export interface Settings {
  /** Mouse look (rad per pixel × 1000). */
  sensitivity: number;
  invertY: boolean;
  /** Removes camera roll, head bob, shake, the scenic camera's drift, and limits the speed FOV kick. */
  reducedMotion: boolean;
  fov: number;
  master: number;
  music: number;
  effects: number;
  /** The predicted-impact ring under the gull. */
  dropMarker: boolean;
  /** The controls panel on the HUD. */
  showControls: boolean;
  /** Every operation playable without finishing the one before. */
  unlockAll: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.2,
  invertY: false,
  reducedMotion: false,
  fov: 70,
  master: 0.8,
  music: 0.6,
  effects: 0.9,
  dropMarker: true,
  showControls: true,
  unlockAll: false,
};

const KEY = 'gull-britannia.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof s[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = s[k];
    }
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private window: settings last for this visit */
  }
}
