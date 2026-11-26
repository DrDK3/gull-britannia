import { describe, expect, it } from 'vitest';
import { actionsIn, isAction } from '../../src/gull/game/actions';
import { Coach, LESSONS, REMINDERS, tokenise } from '../../src/gull/game/coach';
import { Mode, type GullControls } from '../../src/gull/game/gull';
import { Mission1 } from '../../src/gull/game/m1';
import { Mission2 } from '../../src/gull/game/m2';
import type { Mission } from '../../src/gull/game/mission';
import { v3 } from '../../src/gull/game/world';
import { m1World, WATER } from './m1world';
import { DT, Pilot } from './pilot';

/** A pilot whose every step also steps the coach, and notes each change of prompt. */
class Pupil extends Pilot {
  readonly coach: Coach;
  /** Prompt ids in the order they came up (a change of id is a new entry). */
  readonly seen: string[] = [];
  /** Every prompt text shown. */
  readonly texts = new Set<string>();

  constructor(m: Mission) {
    super(m);
    this.coach = new Coach(m);
  }

  override step(c: Partial<GullControls> = {}, poop = false): void {
    super.step(c, poop);
    this.coach.step(DT);
    const p = this.coach.prompt();
    const id = p?.id ?? '';
    if (p) this.texts.add(p.text);
    if (this.seen[this.seen.length - 1] !== id) this.seen.push(id);
  }
}

function m1(seed = 7): Mission1 {
  const m = new Mission1(m1World(), seed).init();
  m.start();
  return m;
}

/** Fly the opening of Mission 1 as a new player would, doing each thing the coach asks for. */
function flyTheLesson(p: Pupil): void {
  const m = p.m as Mission1;
  p.hold(1.5); // reads the prompt
  p.hold(3, { flap: true }, () => p.coach.lessonId() !== 'takeoff');
  const st = m.stationPerch.pos;
  // Steer: look about, then turn the view onto the marker, still climbing.
  const yaw0 = p.g.yaw;
  for (let i = 0; i < 40; i++) {
    p.look(yaw0 + 0.8, 0);
    p.step({ flap: true });
  }
  expect(p.coach.lessonId()).toBe('steer');
  for (let i = 0; i < 6 * 60 && p.coach.lessonId() === 'steer'; i++) {
    p.lookAt(v3(st.e, st.n, st.h + 3));
    p.step({ flap: p.g.pos.h < st.h + 8 });
  }
  // Flap towards it.
  for (let i = 0; i < 6 * 60 && p.coach.lessonId() === 'flap'; i++) {
    p.lookAt(v3(st.e, st.n, st.h + 6));
    p.step({ forward: true });
  }
  p.landOn(m.stationPerch);
}

describe('the coach', () => {
  it('opens Mission 1 with one instruction, and keeps it up until the player has done it', () => {
    const p = new Pupil(m1());
    p.hold(11);
    let prompt = p.coach.prompt()!;
    expect(prompt.id).toBe('takeoff');
    expect(prompt.kind).toBe('lesson');
    expect(prompt.actions).toEqual(['flap']);
    expect(prompt.nudged).toBe(false);
    expect(p.seen).toEqual(['takeoff']);
    // Still there half a minute on, now as a nudge.
    p.hold(20);
    prompt = p.coach.prompt()!;
    expect(prompt.id).toBe('takeoff');
    expect(prompt.nudged).toBe(true);
    expect(prompt.text).toContain('{flap}');
    // Done: it goes, and does not come back.
    expect(p.takeOff()).toBe(true);
    p.hold(0.5, { flap: true });
    expect(p.coach.learned()).toContain('takeoff');
    expect(p.coach.prompt()?.id).not.toBe('takeoff');
  });

  it('teaches take off, steer, flap, land, then look: one at a time, in that order', () => {
    const p = new Pupil(m1());
    flyTheLesson(p);
    expect(p.m.objectiveState('perch')).toBe('done');
    p.hold(1);
    const lessons = p.seen.filter((id) => id && id !== 'action');
    expect(lessons).toEqual(['takeoff', 'steer', 'flap', 'land', 'look']);
    expect(p.coach.learned()).toEqual(['takeoff', 'steer', 'flap', 'land']);
    // On the roof: a closer look. Holding scout for a moment finishes it.
    expect(p.coach.prompt()?.id).toBe('look');
    p.hold(1, { scout: true });
    expect(p.coach.learned()).toContain('look');
    expect(p.coach.prompt()?.id).not.toBe('look');
  });

  it('says the same thing for the same flight', () => {
    const a = new Pupil(m1(11));
    const b = new Pupil(m1(11));
    flyTheLesson(a);
    flyTheLesson(b);
    expect(a.seen).toEqual(b.seen);
    expect(a.t).toBe(b.t);
  });

  it('asks for a take-off again if the gull comes down during a flying lesson', () => {
    const p = new Pupil(m1());
    p.takeOff();
    p.hold(0.5, { flap: true });
    expect(p.coach.lessonId()).toBe('steer');
    // Let go of everything over the nest roof: the gull settles back onto it.
    p.hold(12, {}, () => p.g.mode === Mode.Ground);
    expect(p.g.mode).toBe(Mode.Ground);
    p.hold(1.5);
    expect(p.coach.prompt()).toMatchObject({ id: 'relaunch', kind: 'lesson' });
    expect(p.coach.prompt()!.actions).toEqual(['flap']);
    p.takeOff();
    p.hold(0.3, { flap: true });
    expect(p.coach.prompt()?.id).toBe('steer');
  });

  it('the landing lesson names the key only when the roof is close', () => {
    const p = new Pupil(m1());
    const m = p.m as Mission1;
    p.takeOff();
    const yaw0 = p.g.yaw;
    for (let i = 0; i < 40; i++) {
      p.look(yaw0 - 0.8, 0);
      p.step({ flap: true });
    }
    for (let i = 0; i < 20 * 60 && p.coach.lessonId() !== 'land'; i++) {
      p.lookAt(v3(m.stationPerch.pos.e, m.stationPerch.pos.n, m.stationPerch.pos.h + 6));
      p.step({ forward: true });
    }
    expect(p.coach.lessonId()).toBe('land');
    const far = p.coach.prompt()!;
    expect(far.actions).toEqual([]);
    expect(far.text).toMatch(/yellow marker/);
    p.flyTo(v3(m.stationPerch.pos.e, m.stationPerch.pos.n, m.stationPerch.pos.h + 5), 30, 30);
    expect(p.coach.prompt()!.actions).toEqual(['land']);
  });

  it('skips the flying lessons when the tutorial is skipped, and teaches snatching at the first food', () => {
    const m = m1();
    m.skipTutorial();
    const p = new Pupil(m);
    p.hold(0.2);
    expect(p.coach.learned()).toEqual(['takeoff', 'steer', 'flap', 'land']);
    const chip = m.chips[0]!;
    m.gull.spawn(v3(chip.pos.e, chip.pos.n + 5, chip.pos.h + 0.3), Math.PI);
    p.hold(0.5);
    const snatch = p.coach.prompt()!;
    expect(snatch.id).toBe('snatch');
    expect(snatch.actions).toEqual(['interact']);
    // Walk up and take it: the lesson goes, and the mission's own prompt follows, written with actions, not keys.
    m.gull.spawn(v3(chip.pos.e, chip.pos.n + 0.9, chip.pos.h + 0.3), Math.PI);
    p.hold(0.4);
    m.press('interact');
    p.hold(0.2);
    expect(m.beak?.kind).toBe('chip');
    expect(p.coach.learned()).toContain('snatch');
    const own = p.coach.prompt()!;
    expect(own.kind).toBe('action');
    expect(own.actions).toEqual(['eat', 'interact']);
    expect(own.text).not.toMatch(/\[/);
  });

  it('reminds a floating gull how to get off the water, twice, then trusts it', () => {
    const m = m1();
    m.skipTutorial();
    const p = new Pupil(m);
    const afloat = () => {
      m.gull.spawn(v3(-290, 200, WATER + 0.12), 0);
      m.gull.setMode(Mode.Water);
      p.hold(4);
      return p.coach.prompt()?.id;
    };
    expect(afloat()).toBe('afloat');
    p.takeOff();
    p.hold(1, { flap: true });
    expect(p.coach.prompt()?.id).not.toBe('afloat');
    expect(afloat()).toBe('afloat');
    p.takeOff();
    p.hold(1, { flap: true });
    expect(afloat()).not.toBe('afloat');
  });

  it('teaches Mission 2 its own verb on the roost', () => {
    const m = new Mission2(m1World(), 5).init();
    m.start();
    const p = new Pupil(m);
    m.setObjective('scout', 'done');
    m.setObjective('signal', 'active');
    const ro = m.roostPerch;
    m.gull.spawn(v3(ro.pos.e, ro.pos.n, ro.pos.h + 0.33), 0);
    m.gull.perch = ro;
    p.hold(0.5);
    expect(p.coach.prompt()).toMatchObject({ id: 'signal', actions: ['signal'] });
    m.press('signal');
    p.hold(0.2);
    expect(p.coach.learned()).toContain('signal');
  });

  it('writes every lesson as one short instruction that names actions, never keys', () => {
    const m = m1();
    const texts: string[] = REMINDERS.map((r) => r.text);
    for (const list of Object.values(LESSONS)) {
      for (const l of list) {
        texts.push(typeof l.text === 'function' ? l.text(m) : l.text);
        if (l.nudge) texts.push(l.nudge);
      }
    }
    for (const t of texts) {
      expect(t.length, t).toBeLessThanOrEqual(80);
      for (const name of t.matchAll(/\{([a-zA-Z]+)\}/g)) expect(isAction(name[1]!), t).toBe(true);
      // One or two actions at most: one thing at a time.
      expect(actionsIn(t).length, t).toBeLessThanOrEqual(1);
    }
  });

  it('turns a key named in old text into its action', () => {
    expect(tokenise('[E] Snatch chip')).toBe('{interact} Snatch chip');
    expect(tokenise('[F] Eat chip   [E] Set down')).toBe('{eat} Eat chip   {interact} Set down');
    expect(tokenise('Brake with S before you touch down, or hold R and let the wings do the work.')).toBe('Brake with {back} before you touch down, or hold {land} and let the wings do the work.');
    expect(tokenise('Take off [Space]')).toBe('Take off {flap}');
    expect(tokenise('Section G regulations. S-197 berths at Sandquay.')).toBe('Section G regulations. S-197 berths at Sandquay.');
    expect(tokenise('Hold {scout} on him.')).toBe('Hold {scout} on him.');
  });
});
