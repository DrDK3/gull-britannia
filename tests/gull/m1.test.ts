import { describe, expect, it } from 'vitest';
import { GuardState } from '../../src/gull/game/guard';
import { Mode, NO_CONTROLS, type GullControls } from '../../src/gull/game/gull';
import { ItemState } from '../../src/gull/game/items';
import { M1, Mission1 } from '../../src/gull/game/m1';
import type { Mission, Results } from '../../src/gull/game/mission';
import { v3, type V3 } from '../../src/gull/game/world';
import { m1World } from './m1world';

const DT = 1 / 60;

function mission(): Mission1 {
  const m = new Mission1(m1World(), 7).init();
  m.start();
  return m;
}

function run(m: Mission, seconds: number, c: Partial<GullControls> = {}, until?: () => boolean, poop = false): boolean {
  const ctl = { ...NO_CONTROLS, ...c };
  for (let i = 0; i < seconds * 60; i++) {
    m.step(DT, ctl, poop);
    if (until?.()) return true;
  }
  return until ? until() : true;
}

/** Fly the gull toward a point: look at it, flap when low or slow, brake near it. */
function flyTo(m: Mission, target: V3, radius = 2, seconds = 60, land = false): boolean {
  const g = m.gull;
  for (let i = 0; i < seconds * 60; i++) {
    const flat0 = Math.hypot(target.e - g.pos.e, target.n - g.pos.n);
    // Cruise over the roofs, then come down to it.
    const aimH = flat0 > 35 ? Math.max(target.h, 26) : target.h;
    const d = v3(target.e - g.pos.e, target.n - g.pos.n, aimH - g.pos.h);
    const flat = Math.hypot(d.e, d.n);
    const dist = Math.hypot(flat, d.h);
    if (dist < radius && (!land || g.mode === Mode.Ground)) return true;
    g.yaw = Math.atan2(d.e, d.n);
    g.pitch = Math.max(-0.9, Math.min(0.6, Math.atan2(d.h, Math.max(flat, 0.1))));
    const ctl: GullControls = { ...NO_CONTROLS };
    if (g.mode !== Mode.Air) ctl.flap = i % 20 < 10;
    else {
      ctl.forward = flat > 25 || g.airSpeed < 9;
      ctl.flap = d.h > 2 && g.airSpeed < 14;
      ctl.back = flat < 10 && g.airSpeed > 8;
      ctl.land = land && flat < 20;
    }
    m.step(DT, ctl);
  }
  return false;
}

function results(m: Mission): Results | undefined {
  for (const e of m.takeEvents()) if (e.type === 'finished') return e.results;
  return undefined;
}

describe('Mission 1 on Bayard’s Cove', () => {
  it('teaches take-off and perching on the station roof', () => {
    const m = mission();
    expect(m.gull.mode).toBe(Mode.Ground);
    expect(m.gull.pos.h).toBeGreaterThan(16);
    expect(run(m, 2, { flap: true }, () => m.objectiveState('takeoff') === 'done')).toBe(true);
    expect(m.objectiveState('perch')).toBe('active');
    const st = m.stationPerch.pos;
    expect(flyTo(m, v3(st.e, st.n, st.h + 4), 6, 40)).toBe(true);
    expect(run(m, 8, { land: true, back: true }, () => m.gull.perch === m.stationPerch)).toBe(true);
    expect(m.objectiveState('perch')).toBe('done');
    expect(m.objectiveState('dispatch')).toBe('active');
  });

  it('the sentry keeps his routine, and an ordinary gull on a roof is beneath his notice', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    const seen = new Set<number>();
    m.gull.spawn(v3(M1.customRidge.e, M1.customRidge.n, 14.8), Math.PI / 2);
    run(m, 40, {}, () => {
      seen.add(s.stepIndex());
      return false;
    });
    expect(seen.size).toBe(4);
    expect(s.state).toBe(GuardState.Routine);
    expect(m.stats.spotted).toBe(0);
  });

  it('unseen route: snatch the dispatch when his back is turned, deliver it, eat a chip; full marks for stealth', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    // Watch from the Custom House gutter until he is at the river wall, looking out.
    m.gull.spawn(v3(M1.customGutter.e, M1.customGutter.n, 13.35), Math.PI / 2, -0.5);
    expect(run(m, 40, {}, () => s.stepIndex() === 2 && s.currentStep() !== undefined && Math.hypot(s.pos.e - M1.river.e, s.pos.n - M1.river.n) < 0.3)).toBe(true);
    // Drop down beside the table (a hop off the gutter) and take it.
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.3);
    m.interact();
    run(m, 0.1);
    expect(m.beak).toBe(m.dispatch);
    expect(m.objectiveState('deliver')).toBe('active');
    // Away over the roofs to the Boat Float.
    run(m, 0.25, { flap: true });
    expect(flyTo(m, v3(m.pot.pos.e, m.pot.pos.n, m.pot.pos.h + 2.5), 2.5, 80)).toBe(true);
    m.interact();
    expect(m.delivered).toBe(true);
    expect(m.dispatch.state).toBe(ItemState.Delivered);
    // Lunch: a chip from the clerk on the Embankment.
    const chip = m.chips[0]!;
    m.gull.spawn(v3(chip.pos.e + 0.6, chip.pos.n, chip.pos.h + 0.4), -Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.interact();
    expect(m.beak?.kind).toBe('chip');
    expect(m.clerk.anim).toBe('flail');
    m.eat();
    run(m, 1.2);
    expect(m.lunchDone).toBe(true);
    let r: Results | undefined;
    run(m, 5, {}, () => (r = results(m)) !== undefined);
    expect(r).toBeDefined();
    expect(r!.stats.spotted).toBe(0);
    const line = (s: string) => r!.lines.find((l) => l[0].startsWith(s))?.[1];
    expect(line('Dispatch delivered')).toBe(500);
    expect(line('Stealth')).toBe(300);
    expect(line('Clean escape')).toBe(200);
    expect(r!.grade).toMatch(/^[AB]/);
  });

  it('tea route: a poop in his tea sends him up the lane, and the table is unwatched', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    s.jumpToStep(0);
    // Hover above the mug and let go.
    const mug = m.mug.pos;
    m.gull.spawn(v3(mug.e, mug.n, mug.h + 7), 0);
    m.gull.setMode(Mode.Air);
    m.gull.airSpeed = 0.5;
    m.gull.flyDir = v3(0, 1, 0);
    m.gull.vel = v3(0, 0, 0);
    m.gull.poop(m);
    expect(run(m, 2, { back: true, flap: true }, () => s.state === GuardState.Distracted)).toBe(true);
    expect(s.distractionKind()).toBe('tea');
    expect(m.stats.teaHits).toBe(1);
    // He walks up the lane to the field kitchen and queues there, busy.
    expect(run(m, 25, {}, () => s.isBusy())).toBe(true);
    expect(Math.hypot(s.pos.e - M1.kitchen.e, s.pos.n - M1.kitchen.n)).toBeLessThan(3);
    // Meanwhile: the dispatch.
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.3);
    m.interact();
    expect(m.beak).toBe(m.dispatch);
    run(m, 1);
    expect(m.stats.spotted).toBe(0);
  });

  it('uniform route: a direct hit sends him to scrub his tunic at the pump', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    s.jumpToStep(2);
    run(m, 0.5);
    m.spawnPoop(v3(s.pos.e, s.pos.n, s.pos.h + 9), v3(0, 0, -1));
    expect(run(m, 2, {}, () => s.state === GuardState.Distracted)).toBe(true);
    expect(s.distractionKind()).toBe('uniform');
    expect(m.stats.guardHits).toBe(1);
    expect(run(m, 20, {}, () => s.isBusy())).toBe(true);
    expect(Math.hypot(s.pos.e - M1.pump.e, s.pos.n - M1.pump.n)).toBeLessThan(2);
    // In time he goes back to his routine.
    expect(run(m, 30, {}, () => s.state === GuardState.Routine)).toBe(true);
  });

  it('a gull on the table in front of him is spotted; out of sight he searches, then gives up', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    s.jumpToStep(0);
    run(m, 0.5);
    m.gull.spawn(v3(M1.table.e + 0.3, M1.table.n - 0.3, 4.6), Math.PI / 2);
    expect(run(m, 4, {}, () => s.state === GuardState.Alert)).toBe(true);
    expect(m.stats.spotted).toBe(1);
    // Gone: high above the Custom House roof and away west.
    m.gull.spawn(v3(-360, 60, 30), -Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.gull.airSpeed = 12;
    expect(run(m, 6, { forward: true }, () => s.state === GuardState.Search)).toBe(true);
    expect(run(m, 30, { forward: true }, () => s.state === GuardState.Return || s.state === GuardState.Routine)).toBe(true);
  });

  it('the theft is discovered when he comes back to his post; papers left lying about are put back', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    s.jumpToStep(2);
    run(m, 0.2);
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.2);
    m.interact();
    expect(m.beak).toBe(m.dispatch);
    // Off to wait on St Saviour's roof, with the papers.
    m.gull.spawn(v3(-396, 346, 14.35), 0);
    expect(run(m, 90, {}, () => s.discoveredTheft)).toBe(true);
    expect(Math.hypot(s.pos.e - M1.table.e, s.pos.n - M1.table.n)).toBeLessThan(13);
    expect(m.stats.theftDiscovered).toBe(true);
    // Set the papers down on the quay where he can see them: he takes them back to the table.
    const m2 = mission();
    m2.skipTutorial();
    m2.sentry.jumpToStep(2);
    m2.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m2, 0.2);
    m2.interact();
    m2.gull.spawn(v3(-305, 64, 3.8), 0);
    run(m2, 0.2);
    m2.interact();
    expect(m2.dispatch.state).toBe(ItemState.Loose);
    m2.gull.spawn(v3(-380, 60, 40), -Math.PI / 2);
    m2.gull.setMode(Mode.Air);
    m2.gull.airSpeed = 12;
    expect(run(m2, 40, { forward: true }, () => m2.dispatch.state === ItemState.Placed)).toBe(true);
    expect(m2.stats.recoveredByGuard).toBe(1);
  });

  it('carrying the papers past him is noticed quickly', () => {
    const m = mission();
    m.skipTutorial();
    const s = m.sentry;
    s.jumpToStep(0);
    m.dispatch.hold();
    (m as unknown as { beak: unknown }).beak = m.dispatch;
    m.gull.spawn(v3(M1.post.e - 6, M1.post.n, 5.5), Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.gull.airSpeed = 3;
    expect(run(m, 3, { back: true, flap: true }, () => s.state === GuardState.Alert)).toBe(true);
    expect(m.stats.carryingSeen).toBe(true);
  });

  it('restart gives a fresh mission', () => {
    const a = mission();
    a.skipTutorial();
    a.sentry.jumpToStep(2);
    a.spawnPoop(v3(a.sentry.pos.e, a.sentry.pos.n, a.sentry.pos.h + 9), v3(0, 0, -1));
    run(a, 2);
    expect(a.stats.guardHits).toBe(1);
    const b = mission();
    expect(b.stats.guardHits).toBe(0);
    expect(b.sentry.state).toBe(GuardState.Routine);
    expect(b.objectiveState('takeoff')).toBe('active');
    expect(b.dispatch.state).toBe(ItemState.Placed);
  });
});
