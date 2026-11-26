/**
 * Player settings, kept in the browser (localStorage) under a versioned key. Each has a default, a range where it is a
 * number, and a tab in the Settings panel (ui/Settings.tsx). Bindings are saved separately (input.ts).
 *
 * Version 2 took over from the unversioned settings of the first releases: what they held is carried across once.
 */
import type { InputProfile } from './input';

export const SETTINGS_VERSION = 2;

export interface Settings {
  // ---- Controls
  /** How the player steers: remembered from the last flight. */
  profile: InputProfile;
  /** Mouse look (rad per pixel × 1000). */
  sensitivity: number;
  invertY: boolean;
  /** How fast the arrow keys, the pointer and a stick turn the view (rad/s). */
  lookSpeed: number;
  /** With the arrow keys: bring the view back to level when they are released in flight. */
  autoLevel: boolean;

  // ---- Camera and comfort
  fov: number;
  /** Removes camera roll, head bob, shake, the scenic camera's drift, and limits the speed FOV kick. */
  reducedMotion: boolean;

  // ---- Display
  /** Menus and cards: 1 to 1.5. */
  textScale: number;
  /** The HUD in play: 1 to 1.5 (never below 1: 16 px on a 1080-line screen is the floor). */
  hudScale: number;
  /** The predicted-impact ring under the gull. */
  dropMarker: boolean;
  /** The compass strip at the top of the HUD. */
  compass: boolean;
  /** Cards in a plain sans face instead of the typewriter. */
  plainText: boolean;

  // ---- Sound
  master: number;
  music: number;
  effects: number;

  // ---- Accessibility
  /** Radio text size: 1 to 1.75. */
  subtitleSize: number;
  /** Radio text on paper, or light on a dark plate. */
  subtitleBackground: 'paper' | 'dark';
  /** How long radio lines stay up: 1 is reading speed (15 characters a second), up to 2. */
  radioPace: number;

  // ---- Assists (none of them changes the grade)
  /** Game speed: 0.7 to 1. */
  gameSpeed: number;
  /** Glide onto the perch the orders point at without holding the landing key. */
  autoLand: boolean;
  /** While scouting, the view settles onto a guard that is nearly in the middle. */
  stickyScout: boolean;
  /** Every operation playable without finishing the one before. */
  unlockAll: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  profile: 'mouse',
  sensitivity: 2.2,
  invertY: false,
  lookSpeed: 1.6,
  autoLevel: true,
  fov: 70,
  reducedMotion: false,
  textScale: 1,
  hudScale: 1,
  dropMarker: true,
  compass: true,
  plainText: false,
  master: 0.8,
  music: 0.6,
  effects: 0.9,
  subtitleSize: 1,
  subtitleBackground: 'paper',
  radioPace: 1,
  gameSpeed: 1,
  autoLand: false,
  stickyScout: false,
  unlockAll: false,
};

/** The allowed range of each numeric setting (a saved value outside it is put back inside). */
export const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  sensitivity: [0.5, 6],
  lookSpeed: [0.8, 3],
  fov: [55, 95],
  textScale: [1, 1.5],
  hudScale: [1, 1.5],
  master: [0, 1],
  music: [0, 1],
  effects: [0, 1],
  subtitleSize: [1, 1.75],
  radioPace: [1, 2],
  gameSpeed: [0.7, 1],
};

const CHOICES: Partial<Record<keyof Settings, readonly string[]>> = {
  profile: ['mouse', 'keys', 'trackpad', 'pad'],
  subtitleBackground: ['paper', 'dark'],
};

/** Which settings each tab holds: "Reset this tab" puts these back. */
export const TABS = {
  controls: ['profile', 'sensitivity', 'invertY', 'lookSpeed', 'autoLevel'],
  camera: ['fov', 'reducedMotion'],
  display: ['textScale', 'hudScale', 'dropMarker', 'compass', 'plainText'],
  sound: ['master', 'music', 'effects'],
  accessibility: ['subtitleSize', 'subtitleBackground', 'radioPace'],
  assists: ['gameSpeed', 'autoLand', 'stickyScout', 'unlockAll'],
} as const satisfies Record<string, readonly (keyof Settings)[]>;

export type SettingsTab = keyof typeof TABS;

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
    const choices = CHOICES[k];
    if (choices && !choices.includes(v as string)) continue;
    const range = RANGES[k];
    if (range && !(Number.isFinite(v) && (v as number) >= range[0] && (v as number) <= range[1])) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The assists that are switched on, in words, for the review ("Flown with …"). */
export function assistsInUse(s: Settings): string[] {
  const out: string[] = [];
  if (s.gameSpeed < 0.995) out.push(`game speed ${Math.round(s.gameSpeed * 100)}%`);
  if (s.autoLand) out.push('automatic landing');
  if (s.stickyScout) out.push('steady scouting');
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
