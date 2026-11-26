/**
 * Player settings, kept in the browser (localStorage) under a versioned key. Bindings are saved separately (input.ts).
 *
 * Version 2 took over from the unversioned settings of the first releases: what they held is carried across once.
 * (The controls panel they could switch on is gone: prompts teach one thing at a time, and the full list is in the
 * pause menu.)
 */

export const SETTINGS_VERSION = 2;

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
  unlockAll: false,
};

/** The allowed range of each numeric setting (a saved value outside it is ignored). */
export const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  sensitivity: [0.5, 6],
  fov: [55, 95],
  master: [0, 1],
  music: [0, 1],
  effects: [0, 1],
};

const KEY = 'gull-britannia.settings.v2';
const OLD_KEY = 'gull-britannia.settings';

/** A settings object from whatever was saved: known keys of the right type and range, defaults for the rest. */
export function cleanSettings(saved: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== 'object') return out;
  const s = saved as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = s[k];
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) continue;
    const range = RANGES[k];
    if (range && !(Number.isFinite(v) && (v as number) >= range[0] && (v as number) <= range[1])) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { v?: number; settings?: unknown };
      if (saved.v === SETTINGS_VERSION) return cleanSettings(saved.settings);
    }
    // The first releases kept a flat object without a version.
    const old = localStorage.getItem(OLD_KEY);
    return cleanSettings(old ? (JSON.parse(old) as unknown) : undefined);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: SETTINGS_VERSION, settings: s }));
  } catch {
    /* private window: settings last for this visit */
  }
}
