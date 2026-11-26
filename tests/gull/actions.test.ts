import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_IDS, actionsIn, defaultLabel, formatActions, keyLabel } from '../../src/gull/game/actions';
import { NO_CONTROLS } from '../../src/gull/game/gull';
import { Mission1 } from '../../src/gull/game/m1';
import { m1World } from './m1world';

describe('the player’s actions', () => {
  it('every held control is a field of GullControls, and every field has an action', () => {
    const controls = ACTION_IDS.filter((id) => ACTIONS[id].kind === 'control');
    expect(controls.sort()).toEqual(Object.keys(NO_CONTROLS).sort());
  });

  it('every action has a default binding and a verb', () => {
    for (const id of ACTION_IDS) {
      expect(ACTIONS[id].keys.length, id).toBeGreaterThan(0);
      expect(ACTIONS[id].verb.length, id).toBeGreaterThan(2);
    }
  });

  it('labels keys as a player reads them', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Mouse2')).toBe('Right mouse');
    expect(defaultLabel('flap')).toBe('Space');
  });

  it('puts labels into text, and leaves an unknown name showing', () => {
    expect(formatActions('Hold {scout} on him, then {interact}.')).toBe('Hold T on him, then E.');
    expect(formatActions('{flap} to take off', () => 'A button')).toBe('A button to take off');
    expect(formatActions('Press {flapp}.')).toBe('Press {flapp}.');
    expect(actionsIn('Hold {scout}, {scout} again, then {eat} or {nonsense}.')).toEqual(['scout', 'eat']);
  });

  it('a mission answers presses by action name', () => {
    const m = new Mission1(m1World(), 3).init();
    m.start();
    m.press('signal');
    m.press('eat');
    m.press('interact');
    expect(m.running).toBe(true);
  });
});
