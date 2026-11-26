/**
 * The input layer: which physical input does which of the player's actions. Built from the ACTIONS table
 * (game/actions.ts), so an action added there has a binding, a label and a row in the Controls settings without any
 * change here, and is dispatched by its kind:
 *
 *   control  held: sets the GullControls field of the same name (InputMap.controls)
 *   trigger  held: read by name (InputMap.isHeld('poop')) and passed to Mission.step
 *   press    once: the controller calls mission.press(id)
 *   app      once: the controller's own handler for that id, if it has one (pause, camera, log…)
 *   axis     the view: mouse, arrow keys, the pointer's position (trackpad) or a stick
 *
 * Codes are KeyboardEvent.code values, Mouse0…Mouse2, and Pad0…Pad16 for a gamepad in the standard mapping. Bindings
 * can be changed, are checked for clashes, and are saved with a version number. A control can be set to toggle
 * instead of hold (scout and brake are offered in Settings).
 *
 * InputMap is pure: no DOM, no clock. The controller (game.ts) feeds it key, mouse and gamepad events.
 */
import { ACTIONS, ACTION_IDS, keyLabel, type ActionId, type ActionInfo } from '../game/actions';

export const BINDINGS_VERSION = 1;
export const BINDINGS_KEY = 'gull-britannia.bindings';

/** Whose labels to show: the keyboard and mouse, or the gamepad (whichever was used last). */
export type Device = 'keys' | 'pad';
/**
 * How the player steers: the captured mouse; the arrow keys; the pointer's position on screen (a trackpad, no capture);
 * or a gamepad's stick. The keyboard's other keys work in all four.
 */
export type InputProfile = 'mouse' | 'keys' | 'trackpad' | 'pad';

export interface SavedBindings {
  v: number;
  keys: Record<string, string[]>;
  pad: Record<string, string[]>;
  /** Controls that toggle instead of being held. */
  toggle: Record<string, boolean>;
}

const TABLE: Record<string, ActionInfo> = ACTIONS;

/** Gamepad defaults (standard mapping). An action without one here simply has no button until the player gives it one. */
export const PAD_DEFAULTS: Record<string, string[]> = {
  flap: ['Pad0'],
  dive: ['Pad1'],
  interact: ['Pad2'],
  eat: ['Pad3'],
  scout: ['Pad4'],
  poop: ['Pad5'],
  back: ['Pad6'],
  forward: ['Pad7'],
  log: ['Pad8'],
  pause: ['Pad9'],
  signal: ['Pad12'],
  land: ['Pad13'],
  repeat: ['Pad14'],
  camera: ['Pad15'],
};

const PAD_LABELS: Record<string, string> = {
  Pad0: 'A',
  Pad1: 'B',
  Pad2: 'X',
  Pad3: 'Y',
  Pad4: 'LB',
  Pad5: 'RB',
  Pad6: 'LT',
  Pad7: 'RT',
  Pad8: 'View',
  Pad9: 'Menu',
  Pad10: 'L3',
  Pad11: 'R3',
  Pad12: 'D-pad up',
  Pad13: 'D-pad down',
  Pad14: 'D-pad left',
  Pad15: 'D-pad right',
  Pad16: 'Home',
};

/** Keys that cannot be given to an action: the browser's own, and those the game keeps for itself. */
const RESERVED = /^(Escape|Tab|F5|F11|F12|Meta(Left|Right)|ContextMenu|Arrow(Up|Down|Left|Right)|MouseMove|Arrows|PrintScreen)$/;

/** Bindings a player may not remove: there must always be a way to pause. */
const FIXED: Record<string, string[]> = { pause: ['Escape'] };

export const isPad = (code: string) => code.startsWith('Pad');
export const isMouse = (code: string) => code.startsWith('Mouse');

/** Up to this many bindings for an action on each device. */
export const SLOTS = 2;

export function defaultBindings(): SavedBindings {
  const keys: Record<string, string[]> = {};
  const pad: Record<string, string[]> = {};
  for (const id of ACTION_IDS) {
    keys[id] = [...TABLE[id]!.keys];
    pad[id] = [...(PAD_DEFAULTS[id] ?? [])];
  }
  return { v: BINDINGS_VERSION, keys, pad, toggle: {} };
}

const codeList = (x: unknown): string[] | undefined => (Array.isArray(x) && x.every((c) => typeof c === 'string') ? (x as string[]).slice(0, 3) : undefined);

export class InputMap {
  keys: Record<string, string[]> = {};
  pad: Record<string, string[]> = {};
  toggle: Record<string, boolean> = {};
  device: Device = 'keys';
  profile: InputProfile = 'mouse';
  /** What each physical key prints on this keyboard (navigator.keyboard.getLayoutMap), where the browser can say. */
  layout: { get(code: string): string | undefined } | undefined;

  private readonly down = new Set<string>();
  private readonly latched = new Set<string>();
  private byCode = new Map<string, string[]>();

  constructor(saved?: unknown) {
    this.load(saved);
  }

  // ------------------------------------------------------------------ saved bindings

  /** Take saved bindings where they are well formed and of this version; defaults for the rest and for new actions. */
  load(saved: unknown): void {
    const d = defaultBindings();
    const s = saved && typeof saved === 'object' ? (saved as Partial<SavedBindings>) : undefined;
    const ok = s?.v === BINDINGS_VERSION;
    for (const id of ACTION_IDS) {
      const axis = TABLE[id]!.kind === 'axis';
      this.keys[id] = (!axis && ok && codeList(s?.keys?.[id])) || d.keys[id]!;
      this.pad[id] = (!axis && ok && codeList(s?.pad?.[id])) || d.pad[id]!;
      for (const code of FIXED[id] ?? []) if (!this.keys[id]!.includes(code)) this.keys[id] = [code, ...this.keys[id]!];
    }
    this.toggle = {};
    if (ok && s?.toggle && typeof s.toggle === 'object') for (const id of ACTION_IDS) if (TABLE[id]!.kind === 'control' && s.toggle[id] === true) this.toggle[id] = true;
    this.index();
    this.releaseAll();
  }

  save(): SavedBindings {
    const copy = (r: Record<string, string[]>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v]]));
    return { v: BINDINGS_VERSION, keys: copy(this.keys), pad: copy(this.pad), toggle: { ...this.toggle } };
  }

  reset(): void {
    this.load(undefined);
  }

  private index(): void {
    this.byCode = new Map();
    for (const id of ACTION_IDS) {
      for (const code of [...this.keys[id]!, ...this.pad[id]!]) {
        const list = this.byCode.get(code);
        if (list) list.push(id);
        else this.byCode.set(code, [id]);
      }
    }
  }

  // ------------------------------------------------------------------ events in

  /** The actions a code is bound to. */
  actionsOn(code: string): ActionId[] {
    return (this.byCode.get(code) ?? []) as ActionId[];
  }

  /**
   * A key, mouse button or pad button went down. Returns the actions that fire on this press (none if it was already
   * down: key repeat). A control in toggle mode flips; in the trackpad profile so does one on a mouse button, since a
   * tap cannot be held.
   */
  press(code: string): ActionId[] {
    if (this.down.has(code)) return [];
    this.down.add(code);
    this.device = isPad(code) ? 'pad' : 'keys';
    const actions = this.actionsOn(code);
    for (const id of actions) {
      if (TABLE[id]!.kind !== 'control') continue;
      if (this.toggle[id] || (this.profile === 'trackpad' && isMouse(code))) {
        if (this.latched.has(id)) this.latched.delete(id);
        else this.latched.add(id);
      }
    }
    return actions;
  }

  release(code: string): void {
    this.down.delete(code);
  }

  /** Let go of everything (pause, lost focus): held keys and toggles alike. */
  releaseAll(): void {
    this.down.clear();
    this.latched.clear();
  }

  /** Switch a toggled control off (the brake when the gull has landed). */
  unlatch(id: string): void {
    this.latched.delete(id);
  }

  /** Is this action being held (or toggled on)? */
  isHeld(id: string): boolean {
    if (this.latched.has(id)) return true;
    if (this.toggle[id]) return false;
    // In the trackpad profile a control on a mouse button is a toggle (see press), so holding the button is not it.
    const tapOnly = this.profile === 'trackpad' && TABLE[id]?.kind === 'control';
    for (const code of this.keys[id] ?? []) if (this.down.has(code) && !(tapOnly && isMouse(code))) return true;
    for (const code of this.pad[id] ?? []) if (this.down.has(code)) return true;
    return false;
  }

  /** `base` with every control action that is held set to true: the mission's controls for this step. */
  controls<T extends object>(base: T): T {
    const c = { ...base } as Record<string, unknown>;
    for (const id of ACTION_IDS) if (TABLE[id]!.kind === 'control' && this.isHeld(id)) c[id] = true;
    return c as T;
  }

  // ------------------------------------------------------------------ labels

  /** A code as the player reads it: "W", "Right mouse", "LB". Follows the keyboard's layout where that is known. */
  codeLabel(code: string): string {
    if (isPad(code)) return PAD_LABELS[code] ?? code;
    const printed = code.startsWith('Key') ? this.layout?.get(code) : undefined;
    if (printed && printed.length === 1) return printed.toUpperCase();
    return keyLabel(code);
  }

  /** Every binding of an action on a device, as labels. */
  bindingLabels(id: string, device: Device = this.device): string[] {
    return (device === 'pad' ? this.pad[id] : this.keys[id])?.map((c) => this.codeLabel(c)) ?? [];
  }

  /**
   * The one label to show in a prompt for an action, for the device and profile in use. Without a mouse in hand
   * (keyboard, trackpad) a key is preferred to a mouse button; on a gamepad, its button, or the key if it has none.
   */
  label(id: string, device: Device = this.device): string {
    if (TABLE[id]?.kind === 'axis') {
      if (device === 'pad' || this.profile === 'pad') return 'Left stick';
      return this.profile === 'mouse' ? 'Mouse' : this.profile === 'trackpad' ? 'Trackpad' : 'Arrow keys';
    }
    if (device === 'pad' && this.pad[id]?.length) return this.codeLabel(this.pad[id]![0]!);
    const codes = this.keys[id] ?? [];
    const noMouse = this.profile !== 'mouse';
    const pick = (noMouse && codes.find((c) => !isMouse(c))) || codes[0];
    return pick ? this.codeLabel(pick) : 'unbound';
  }

  // ------------------------------------------------------------------ remapping

  /** Can this code be given to an action at all? */
  static bindable(code: string): boolean {
    return !RESERVED.test(code);
  }

  /**
   * Give `code` to an action in one of its slots. Refused for reserved keys and for the view axis. A clash with another
   * action is allowed (the caller warns): `sharedWith` lists the others that now have the same code.
   */
  bind(id: string, device: Device, slot: number, code: string): { ok: boolean; reason?: string; sharedWith: string[] } {
    const info = TABLE[id];
    if (!info || info.kind === 'axis') return { ok: false, reason: 'Steering is set by the way you choose to fly.', sharedWith: [] };
    if (isPad(code) !== (device === 'pad')) return { ok: false, reason: device === 'pad' ? 'Press a button on the controller.' : 'Press a key or a mouse button.', sharedWith: [] };
    if (!InputMap.bindable(code) && !(FIXED[id] ?? []).includes(code)) return { ok: false, reason: `${this.codeLabel(code)} is kept for the browser or the game.`, sharedWith: [] };
    const list = device === 'pad' ? this.pad[id]! : this.keys[id]!;
    const fixed = FIXED[id] ?? [];
    if (device === 'keys' && fixed.includes(list[slot] ?? '')) return { ok: false, reason: `${this.codeLabel(list[slot]!)} always does this.`, sharedWith: [] };
    const at = list.indexOf(code);
    if (at >= 0 && at !== slot) list.splice(at, 1);
    const s = Math.min(slot, list.length);
    list[s] = code;
    this.index();
    this.releaseAll();
    return { ok: true, sharedWith: this.actionsOn(code).filter((a) => a !== id) };
  }

  /** Remove the binding in a slot (never the last way to pause). */
  unbind(id: string, device: Device, slot: number): boolean {
    const list = device === 'pad' ? this.pad[id] : this.keys[id];
    if (!list || slot >= list.length) return false;
    if (device === 'keys' && (FIXED[id] ?? []).includes(list[slot]!)) return false;
    list.splice(slot, 1);
    this.index();
    return true;
  }

  setToggle(id: string, on: boolean): void {
    if (TABLE[id]?.kind !== 'control') return;
    if (on) this.toggle[id] = true;
    else delete this.toggle[id];
    this.latched.delete(id);
  }

  /** Codes that more than one action is bound to, on either device. */
  conflicts(): { code: string; label: string; actions: ActionId[] }[] {
    const out: { code: string; label: string; actions: ActionId[] }[] = [];
    for (const [code, actions] of this.byCode) if (actions.length > 1) out.push({ code, label: this.codeLabel(code), actions: actions as ActionId[] });
    return out;
  }

  /** The other actions that share a binding with this one. */
  clashes(id: string): ActionId[] {
    const out = new Set<string>();
    for (const code of [...(this.keys[id] ?? []), ...(this.pad[id] ?? [])]) for (const other of this.actionsOn(code)) if (other !== id) out.add(other);
    return [...out] as ActionId[];
  }
}

// ---------------------------------------------------------------------- gamepad

export interface PadLike {
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

/** A stick axis with the dead zone taken out and a gentle curve, so small movements are fine and full ones are fast. */
export function shapeAxis(v: number, deadZone = 0.15, curve = 1.6): number {
  const a = Math.abs(v);
  if (!(a > deadZone)) return 0;
  return Math.sign(v) * Math.pow(Math.min(1, (a - deadZone) / (1 - deadZone)), curve);
}

/**
 * What a gamepad in the standard mapping is doing: the buttons that are down, as codes, and the sticks. Triggers count
 * as down past a third of their travel. Both sticks steer (x to the right, y up).
 */
export function readPad(p: PadLike, deadZone = 0.15): { codes: string[]; x: number; y: number } {
  const codes: string[] = [];
  p.buttons.forEach((b, i) => {
    if (i > 16) return;
    if (b.pressed || ((i === 6 || i === 7) && b.value > 0.33)) codes.push(`Pad${i}`);
  });
  const ax = (i: number) => shapeAxis(p.axes[i] ?? 0, deadZone);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { codes, x: clamp(ax(0) + ax(2)), y: clamp(0 - ax(1) - ax(3)) };
}

// ---------------------------------------------------------------------- storage

export function loadBindings(): unknown {
  try {
    return JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? 'null') as unknown;
  } catch {
    return undefined;
  }
}

export function saveBindings(b: SavedBindings): void {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(b));
  } catch {
    /* private window: bindings last for this visit */
  }
}

/** The rows of the Controls list, in groups, straight from the table (new actions appear under their kind). */
export function actionGroups(): { title: string; ids: ActionId[] }[] {
  const flight: ActionId[] = [];
  const act: ActionId[] = [];
  const app: ActionId[] = [];
  for (const id of ACTION_IDS) {
    const kind = TABLE[id]!.kind;
    if (kind === 'axis' || kind === 'control') flight.push(id);
    else if (kind === 'app') app.push(id);
    else act.push(id);
  }
  return [
    { title: 'Flight', ids: flight },
    { title: 'Actions', ids: act },
    { title: 'Interface', ids: app },
  ];
}
