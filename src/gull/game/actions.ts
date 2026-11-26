/**
 * The player's actions, by name. Anything that asks the player to do something names an action, never a key: mission
 * text writes `{flap}` and the interface puts the current binding's label there (formatActions). The same ids drive
 * the input layer, so a key can be remapped, or come from a gamepad, without touching a mission.
 *
 * Kinds:
 *  - control: held; a field of GullControls with the same name (gull.ts).
 *  - trigger: held; passed to Mission.step as its own argument (poop: one drop per cool-down while held).
 *  - press:   one event; sent to Mission.press(id).
 *  - app:     handled by the application (camera, pause, help), never by a mission.
 *  - axis:    the view (mouse, arrow keys or a stick).
 *
 * `keys` are the default bindings: KeyboardEvent.code values, or Mouse0 (left), Mouse2 (right), MouseMove, Arrows.
 * Add to this table; do not rename or remove ids (saved bindings and mission text refer to them).
 */
export interface ActionInfo {
  kind: 'control' | 'trigger' | 'press' | 'app' | 'axis';
  /** What it does, as a short verb phrase for a prompt: "take off", "scout". */
  verb: string;
  keys: readonly string[];
}

export const ACTIONS = {
  look: { kind: 'axis', verb: 'steer', keys: ['MouseMove', 'Arrows'] },
  forward: { kind: 'control', verb: 'flap for speed', keys: ['KeyW'] },
  back: { kind: 'control', verb: 'brake', keys: ['KeyS'] },
  left: { kind: 'control', verb: 'bank left', keys: ['KeyA'] },
  right: { kind: 'control', verb: 'bank right', keys: ['KeyD'] },
  flap: { kind: 'control', verb: 'flap for height', keys: ['Space'] },
  dive: { kind: 'control', verb: 'dive', keys: ['ShiftLeft', 'ShiftRight'] },
  land: { kind: 'control', verb: 'land', keys: ['KeyR'] },
  scout: { kind: 'control', verb: 'scout', keys: ['KeyT', 'Mouse2'] },
  poop: { kind: 'trigger', verb: 'poop', keys: ['KeyQ', 'Mouse0'] },
  interact: { kind: 'press', verb: 'snatch', keys: ['KeyE'] },
  eat: { kind: 'press', verb: 'eat', keys: ['KeyF'] },
  signal: { kind: 'press', verb: 'signal', keys: ['KeyG'] },
  camera: { kind: 'app', verb: 'change camera', keys: ['KeyC'] },
  pause: { kind: 'app', verb: 'pause', keys: ['Escape', 'KeyP'] },
  help: { kind: 'app', verb: 'show controls', keys: ['KeyH', 'F1'] },
  log: { kind: 'app', verb: 'read the radio log', keys: ['KeyL'] },
  repeat: { kind: 'app', verb: 'hear the last message again', keys: ['KeyV'] },
} as const satisfies Record<string, ActionInfo>;

export type ActionId = keyof typeof ACTIONS;

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export function isAction(id: string): id is ActionId {
  return Object.prototype.hasOwnProperty.call(ACTIONS, id);
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Mouse0: 'Left mouse',
  Mouse1: 'Middle mouse',
  Mouse2: 'Right mouse',
  MouseMove: 'Mouse',
  Arrows: 'Arrow keys',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** A binding as a player reads it: KeyW → "W", ShiftLeft → "Shift", Mouse2 → "Right mouse". */
export function keyLabel(code: string): string {
  const known = KEY_LABELS[code];
  if (known) return known;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** The default binding's label for an action. */
export function defaultLabel(id: ActionId): string {
  return keyLabel(ACTIONS[id].keys[0] ?? '');
}

/** The action ids a text refers to, in order, without repeats. */
export function actionsIn(text: string): ActionId[] {
  const out: ActionId[] = [];
  for (const m of text.matchAll(/\{([a-zA-Z]+)\}/g)) {
    const id = m[1]!;
    if (isAction(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Replace each `{action}` in a text with its label. Unknown names are left as written, so a typo shows. */
export function formatActions(text: string, label: (id: ActionId) => string = defaultLabel): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, id: string) => (isAction(id) ? label(id) : whole));
}
