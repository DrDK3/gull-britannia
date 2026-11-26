import { describe, expect, it } from 'vitest';
import { BINDINGS_VERSION, InputMap, PAD_DEFAULTS, actionGroups, defaultBindings, readPad, shapeAxis } from '../../src/gull/app/input';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, cleanSettings } from '../../src/gull/app/settings';
import { ACTIONS, ACTION_IDS, formatActions, isAction } from '../../src/gull/game/actions';
import { NO_CONTROLS } from '../../src/gull/game/gull';

describe('the input map', () => {
  it('is built from the actions table: every action has its default keys', () => {
    const im = new InputMap();
    for (const id of ACTION_IDS) expect(im.keys[id]).toEqual([...ACTIONS[id].keys]);
    expect(Object.keys(PAD_DEFAULTS).every(isAction)).toBe(true);
    const listed = actionGroups().flatMap((g) => g.ids);
    expect(listed.sort()).toEqual([...ACTION_IDS].sort());
  });

  it('a control action sets the GullControls field of the same name while its key is held', () => {
    const im = new InputMap();
    expect(im.controls(NO_CONTROLS)).toEqual(NO_CONTROLS);
    expect(im.press('KeyW')).toEqual(['forward']);
    im.press('Space');
    expect(im.controls(NO_CONTROLS)).toEqual({ ...NO_CONTROLS, forward: true, flap: true });
    im.release('KeyW');
    expect(im.controls(NO_CONTROLS)).toEqual({ ...NO_CONTROLS, flap: true });
    // Either Shift dives; a mouse button scouts.
    im.press('ShiftRight');
    im.press('Mouse2');
    expect(im.controls(NO_CONTROLS)).toMatchObject({ dive: true, scout: true });
    im.releaseAll();
    expect(im.controls(NO_CONTROLS)).toEqual(NO_CONTROLS);
  });

  it('a press fires once however long the key is held, and a trigger is read by name', () => {
    const im = new InputMap();
    expect(im.press('KeyE')).toEqual(['interact']);
    expect(im.press('KeyE')).toEqual([]);
    im.release('KeyE');
    expect(im.press('KeyE')).toEqual(['interact']);
    expect(im.isHeld('poop')).toBe(false);
    im.press('KeyQ');
    expect(im.isHeld('poop')).toBe(true);
    expect(im.press('KeyL')).toEqual(['log']);
    expect(im.press('KeyV')).toEqual(['repeat']);
  });

  it('an action added to the table later is dispatched without a change here', () => {
    // A control and a press that no code in the input layer names.
    const table = ACTIONS as unknown as Record<string, { kind: string; verb: string; keys: string[] }>;
    table['hover'] = { kind: 'control', verb: 'hover', keys: ['KeyZ'] };
    table['caw'] = { kind: 'press', verb: 'caw', keys: ['KeyB'] };
    (ACTION_IDS as string[]).push('hover', 'caw');
    try {
      const im = new InputMap();
      expect(im.press('KeyZ')).toEqual(['hover']);
      expect(im.controls({ ...NO_CONTROLS, hover: false })).toMatchObject({ hover: true });
      expect(im.press('KeyB')).toEqual(['caw']);
      expect(im.label('caw')).toBe('B');
      expect(actionGroups().find((g) => g.title === 'Flight')!.ids).toContain('hover');
    } finally {
      delete table['hover'];
      delete table['caw'];
      (ACTION_IDS as string[]).splice(-2, 2);
    }
  });

  it('scout and brake can toggle instead of being held', () => {
    const im = new InputMap();
    im.setToggle('scout', true);
    im.press('KeyT');
    im.release('KeyT');
    expect(im.isHeld('scout')).toBe(true);
    im.press('KeyT');
    im.release('KeyT');
    expect(im.isHeld('scout')).toBe(false);
    im.setToggle('back', true);
    im.press('KeyS');
    im.release('KeyS');
    expect(im.controls(NO_CONTROLS).back).toBe(true);
    im.unlatch('back');
    expect(im.controls(NO_CONTROLS).back).toBe(false);
    // Only controls can toggle.
    im.setToggle('interact', true);
    expect(im.toggle['interact']).toBeUndefined();
  });

  it('labels follow the device and the way of steering', () => {
    const im = new InputMap();
    expect(im.label('flap')).toBe('Space');
    expect(im.label('look')).toBe('Mouse');
    expect(im.label('scout')).toBe('T');
    im.profile = 'keys';
    expect(im.label('look')).toBe('Arrow keys');
    im.profile = 'trackpad';
    expect(im.label('look')).toBe('Trackpad');
    // A key is preferred to a mouse button when the mouse is not in hand.
    im.keys['scout'] = ['Mouse2', 'KeyT'];
    expect(im.label('scout')).toBe('T');
    im.profile = 'mouse';
    expect(im.label('scout')).toBe('Right mouse');
    // A gamepad, once one of its buttons is pressed.
    expect(im.press('Pad0')).toEqual(['flap']);
    expect(im.device).toBe('pad');
    expect(im.label('flap')).toBe('A');
    expect(im.label('land')).toBe('D-pad down');
    expect(im.label('look')).toBe('Left stick');
    expect(im.label('help')).toBe('H');
    expect(formatActions('Hold {flap} to take off. {look} steers.', (id) => im.label(id))).toBe('Hold A to take off. Left stick steers.');
    im.press('KeyW');
    expect(im.device).toBe('keys');
    // The keyboard's own layout, where the browser tells us.
    im.layout = new Map([['KeyW', 'z']]);
    expect(im.label('forward')).toBe('Z');
  });

  it('remaps a key, warns of a clash, and keeps the browser’s keys and Escape out of it', () => {
    const im = new InputMap();
    expect(im.bind('interact', 'keys', 0, 'KeyX')).toEqual({ ok: true, sharedWith: [] });
    expect(im.press('KeyX')).toEqual(['interact']);
    expect(im.press('KeyE')).toEqual([]);
    // A clash is allowed, and reported both ways.
    const r = im.bind('eat', 'keys', 0, 'KeyX');
    expect(r).toEqual({ ok: true, sharedWith: ['interact'] });
    expect(im.clashes('interact')).toEqual(['eat']);
    expect(im.conflicts()).toEqual([{ code: 'KeyX', label: 'X', actions: ['interact', 'eat'] }]);
    // Reserved keys.
    expect(im.bind('eat', 'keys', 0, 'Escape').ok).toBe(false);
    expect(im.bind('eat', 'keys', 0, 'ArrowUp').ok).toBe(false);
    expect(im.bind('eat', 'keys', 0, 'F5').ok).toBe(false);
    expect(im.bind('look', 'keys', 0, 'KeyJ').ok).toBe(false);
    // Escape always pauses.
    expect(im.bind('pause', 'keys', 0, 'KeyO').ok).toBe(false);
    expect(im.unbind('pause', 'keys', 0)).toBe(false);
    expect(im.bind('pause', 'keys', 1, 'KeyO').ok).toBe(true);
    expect(im.keys['pause']).toEqual(['Escape', 'KeyO']);
    // A second binding, and a pad button only on the pad.
    expect(im.bind('interact', 'keys', 1, 'Mouse1').ok).toBe(true);
    expect(im.keys['interact']).toEqual(['KeyX', 'Mouse1']);
    expect(im.bind('interact', 'keys', 0, 'Pad3').ok).toBe(false);
    expect(im.bind('interact', 'pad', 0, 'Pad10').ok).toBe(true);
    expect(im.press('Pad10')).toEqual(['interact']);
    im.reset();
    expect(im.save()).toEqual(defaultBindings());
  });

  it('saves with a version, loads what it saved, and falls back to defaults for anything else', () => {
    const im = new InputMap();
    im.bind('interact', 'keys', 0, 'KeyX');
    im.setToggle('scout', true);
    const saved = JSON.parse(JSON.stringify(im.save())) as { v: number; keys: Record<string, unknown> };
    expect(saved.v).toBe(BINDINGS_VERSION);
    const again = new InputMap(saved);
    expect(again.keys['interact']).toEqual(['KeyX']);
    expect(again.toggle).toEqual({ scout: true });
    // Another version, or rubbish: defaults.
    expect(new InputMap({ ...saved, v: 99 }).save()).toEqual(defaultBindings());
    expect(new InputMap('nonsense').save()).toEqual(defaultBindings());
    expect(new InputMap({ v: BINDINGS_VERSION, keys: { interact: 'KeyX', flap: [1, 2] } }).save()).toEqual(defaultBindings());
    // A saved file from before an action existed: the new action gets its default.
    delete saved.keys['log'];
    expect(new InputMap(saved).keys['log']).toEqual(['KeyL']);
    // Escape cannot be saved away from pause.
    expect(new InputMap({ v: BINDINGS_VERSION, keys: { pause: ['KeyP'] } }).keys['pause']).toEqual(['Escape', 'KeyP']);
  });

  it('in the trackpad profile a tap on a mouse button toggles a control, and still fires a trigger', () => {
    const im = new InputMap();
    im.profile = 'trackpad';
    im.press('Mouse2');
    im.release('Mouse2');
    expect(im.isHeld('scout')).toBe(true);
    im.press('Mouse2');
    expect(im.isHeld('scout')).toBe(false);
    im.release('Mouse2');
    im.press('Mouse0');
    expect(im.isHeld('poop')).toBe(true);
    im.release('Mouse0');
    expect(im.isHeld('poop')).toBe(false);
    // The key is still a hold.
    im.press('KeyT');
    expect(im.isHeld('scout')).toBe(true);
    im.release('KeyT');
    expect(im.isHeld('scout')).toBe(false);
  });
});

describe('a gamepad in the standard mapping', () => {
  const pad = (down: number[], axes = [0, 0, 0, 0], values: Record<number, number> = {}) => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: values[i] ?? (down.includes(i) ? 1 : 0) })),
    axes,
  });

  it('reads buttons as codes, triggers past a third, and the sticks with a dead zone', () => {
    expect(readPad(pad([0, 13]))).toEqual({ codes: ['Pad0', 'Pad13'], x: 0, y: 0 });
    expect(readPad(pad([], [0, 0, 0, 0], { 7: 0.5, 6: 0.2 })).codes).toEqual(['Pad7']);
    const still = readPad(pad([], [0.1, -0.12, 0.05, 0]));
    expect(still.x === 0 && still.y === 0).toBe(true);
    const r = readPad(pad([], [1, -1, 0, 0]));
    expect(r.x).toBe(1);
    expect(r.y).toBe(1);
    expect(shapeAxis(0.5)).toBeGreaterThan(0);
    expect(shapeAxis(0.5)).toBeLessThan(0.5);
    expect(shapeAxis(-1)).toBe(-1);
  });

  it('drives the same actions as the keys', () => {
    const im = new InputMap();
    const fired: string[] = [];
    for (const code of readPad(pad([7, 0, 2])).codes) fired.push(...im.press(code));
    expect(fired).toEqual(['flap', 'interact', 'forward']);
    expect(im.controls(NO_CONTROLS)).toMatchObject({ forward: true, flap: true });
    expect(im.device).toBe('pad');
  });
});

describe('settings', () => {
  it('keeps what is valid from a saved file and defaults the rest', () => {
    expect(cleanSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = cleanSettings({ fov: 80, sensitivity: 99, invertY: 'yes', showControls: true, master: 0.25 });
    expect(s.fov).toBe(80);
    expect(s.master).toBe(0.25);
    // Out of range or of the wrong kind: the default.
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(s.invertY).toBe(false);
    // The controls panel of the first releases is gone, and its switch with it.
    expect('showControls' in s).toBe(false);
    expect(SETTINGS_VERSION).toBe(2);
  });
});
