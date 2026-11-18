import { describe, expect, it } from 'vitest';
import { GuardState } from '../../src/gull/game/guard';
import { Mode, NO_CONTROLS, type GullControls } from '../../src/gull/game/gull';
import { ItemState } from '../../src/gull/game/items';
import { M2, Mission2 } from '../../src/gull/game/m2';
import type { Mission, Results } from '../../src/gull/game/mission';
import { AllyState, MarchState } from '../../src/gull/game/parade';
import { v3 } from '../../src/gull/game/world';
import { m1World } from './m1world';

const DT = 1 / 60;

function mission(): Mission2 {
  const m = new Mission2(m1World(), 11).init();
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

function results(m: Mission): Results | undefined {
  for (const e of m.takeEvents()) if (e.type === 'finished') return e.results;
  return undefined;
}

/** Hit `n` soldiers on the head, one after another. */
function hitSoldiers(m: Mission2, n: number): void {
  for (let i = 0; i < n; i++) {
    const s = m.marchers[i]!;
    m.spawnPoop(v3(s.pos.e, s.pos.n, s.pos.h + 4), v3(0, 0, -1), true);
    run(m, 0.6);
  }
}

describe('Mission 2 on the South Embankment', () => {
  it('flies as Bomber lead from St Saviour’s roof; the parade marches up and down the Embankment', () => {
    const m = mission();
    expect(m.gull.profile.maxPayload).toBe(6);
    expect(m.gull.mode).toBe(Mode.Ground);
    const n0 = m.anchorN;
    run(m, 10);
    expect(m.anchorN).toBeLessThan(n0 - 10);
    const lead = m.marchers[1]!;
    expect(Math.abs(lead.pos.e - M2.paradeE)).toBeLessThan(0.5);
    expect(lead.state).toBe(MarchState.March);
    // At the south end the column halts, turns and comes back.
    m.setParade(M2.routeSouth + 1, -1);
    run(m, 6);
    expect(m.dir).toBe(1);
  });

  it('scouting Voronova from the mooring pile tags her and opens the signal', () => {
    const m = mission();
    const st = m.perches.find((p) => p.id === 'pile')!;
    m.gull.spawn(v3(st.pos.e, st.pos.n, st.pos.h + 0.35), 0);
    const head = m.voronova.headPosition();
    m.gull.yaw = Math.atan2(head.e - m.gull.pos.e, head.n - m.gull.pos.n);
    m.gull.pitch = Math.atan2(head.h - m.gull.eye().h, Math.hypot(head.e - m.gull.pos.e, head.n - m.gull.pos.n));
    expect(run(m, 3, { scout: true }, () => m.voronova.tagged)).toBe(true);
    expect(m.objectiveState('scout')).toBe('done');
    expect(m.objectiveState('signal')).toBe('active');
  });

  it('the Wing answers a signal only from the roost', () => {
    const m = mission();
    m.signal();
    expect(m.allies.every((a) => a.state === AllyState.Roost)).toBe(true);
    m.gull.spawn(v3(m.roostPerch.pos.e, m.roostPerch.pos.n, m.roostPerch.pos.h + 0.35), Math.PI / 2);
    m.signal();
    expect(m.allies.every((a) => a.state === AllyState.Follow)).toBe(true);
    expect(m.objectiveState('strike')).toBe('active');
    // They follow in a box and drop when the leader drops.
    m.gull.takeOff(m);
    run(m, 3, { forward: true, flap: true });
    m.snapFlock();
    for (const a of m.allies) expect(Math.hypot(a.pos.e - m.gull.pos.e, a.pos.n - m.gull.pos.n)).toBeLessThan(6);
    const before = m.stats.drops;
    m.gull.poop(m);
    run(m, 0.6);
    expect(m.stats.drops).toBe(before + 1);
    expect(m.poops.filter((p) => p.fromFlock).length + m.stats.flockHits).toBeGreaterThan(0);
  });

  it('a strike as the column passes the stand breaks the formation and draws Voronova from the lectern', () => {
    const m = mission();
    m.gull.spawn(v3(m.roostPerch.pos.e, m.roostPerch.pos.n, m.roostPerch.pos.h + 0.35), Math.PI / 2);
    m.signal();
    m.setParade(M2.stand.n + 4, -1);
    expect(m.inZone()).toBe(true);
    hitSoldiers(m, 4);
    expect(m.brokenCount).toBe(1);
    expect(m.chaosTimer).toBeGreaterThan(0);
    expect(m.marchers.some((x) => x.state === MarchState.Chaos)).toBe(true);
    expect(m.voronova.state).toBe(GuardState.Distracted);
    expect(m.objectiveState('strike')).toBe('done');
    expect(m.objectiveState('document')).toBe('active');
    // She goes to the north end of the stand and is busy there: the lectern is unwatched.
    expect(run(m, 6, {}, () => m.voronova.isBusy())).toBe(true);
    m.gull.spawn(v3(M2.lectern.e + 0.6, M2.lectern.n, m.deckTop + 1.4), -Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.interact();
    expect(m.beak).toBe(m.document);
    expect(m.objectiveState('deliver')).toBe('active');
    // To the Dorothy May.
    m.gull.spawn(v3(m.pot.pos.e, m.pot.pos.n + 0.5, m.pot.pos.h + 2), 0);
    m.gull.setMode(Mode.Air);
    m.interact();
    expect(m.document.state).toBe(ItemState.Delivered);
    let r: Results | undefined;
    run(m, 5, {}, () => (r = results(m)) !== undefined);
    expect(r).toBeDefined();
    const line = (s: string) => r!.lines.find((l) => l[0].startsWith(s))?.[1];
    expect(line('Formation broken')).toBe(400);
    expect(line('Inspection Order delivered')).toBe(500);
    expect(line('Bomber Wing')).toBe(4 * 15);
    // After the chaos the parade re-forms.
    const m2 = mission();
    m2.setParade(M2.stand.n, -1);
    hitSoldiers(m2, 4);
    run(m2, 40);
    expect(m2.marchers.every((x) => x.state === MarchState.March || x.state === MarchState.Halt || x.state === MarchState.Reform)).toBe(true);
  });

  it('hits away from the stand: the formation holds and the guards are on edge', () => {
    const m = mission();
    m.gull.spawn(v3(m.roostPerch.pos.e, m.roostPerch.pos.n, m.roostPerch.pos.h + 0.35), Math.PI / 2);
    m.signal();
    m.setParade(M2.routeNorth - 2, -1);
    expect(m.inZone()).toBe(false);
    hitSoldiers(m, 4);
    expect(m.brokenCount).toBe(0);
    expect(m.voronova.alarmTimer).toBeGreaterThan(0);
  });

  it('Voronova does not let a gull near the lectern while the parade is in order', () => {
    const m = mission();
    m.voronova.jumpToStep(0);
    m.gull.spawn(v3(M2.lectern.e - 2.5, M2.lectern.n + 0.5, m.deckTop + 2.2), Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.gull.airSpeed = 2;
    expect(run(m, 4, { back: true, flap: true }, () => m.voronova.state === GuardState.Alert)).toBe(true);
    expect(m.stats.spotted).toBe(1);
  });
});
