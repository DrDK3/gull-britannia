/**
 * Mission 1's three ways through, flown by a pilot with the player's inputs only (m1pilot.ts): the unseen route, the
 * tea route, and a Compromised run. On the stand-in town, and the two routes again on the real, baked town
 * (realtown.ts), where the roofs are the ones the player sees.
 */
import { describe, expect, it } from 'vitest';
import { GuardState } from '../../src/gull/game/guard';
import { ItemState } from '../../src/gull/game/items';
import { COURIER_BACK } from '../../src/gull/game/m1watch';
import type { World } from '../../src/gull/game/world';
import { compromisedByAlarm, compromisedByClock, teaRoute, unseenRoute, type Flight } from './m1pilot';
import { m1World } from './m1world';
import { realTown } from './realtown';

const line = (f: Flight, start: string) => f.p.results?.lines.find((l) => l[0].startsWith(start))?.[1];
const story = (f: Flight) => f.p.log.join('\n');

function expectUnseen(world: World): Flight {
  const f = unseenRoute(world);
  const { p, m } = f;
  const r = p.results;
  expect(r, story(f)).toBeDefined();
  expect(r!.outcome).toBe('complete');
  expect(m.delivered, story(f)).toBe(true);
  // Never seen, never wondered about: no exclamation mark, no question mark, no hit on anyone.
  expect(m.stats.spotted, story(f)).toBe(0);
  expect(m.stats.questions, story(f)).toBe(0);
  expect(m.stats.hits).toBe(0);
  expect(m.stats.tumbles).toBe(0);
  expect(r!.approach?.id).toBe('ghost');
  expect(line(f, 'Stealth: never spotted')).toBe(300);
  expect(line(f, 'Clean escape: never seen')).toBe(200);
  expect(line(f, 'Approach: Ghost')).toBe(400);
  expect(r!.grade).toBe('A+');
  return f;
}

function expectTea(world: World): Flight {
  const f = teaRoute(world);
  const { p, m } = f;
  const r = p.results;
  expect(r, story(f)).toBeDefined();
  expect(r!.outcome).toBe('complete');
  expect(m.delivered, story(f)).toBe(true);
  expect(m.stats.teaHits, story(f)).toBe(1);
  expect(m.stats.spotted, story(f)).toBe(0);
  expect(m.stats.questions, story(f)).toBe(0);
  expect(r!.approach?.id).toBe('saboteur');
  expect(line(f, 'Approach: Saboteur')).toBe(150);
  expect(r!.grade).toBe('A');
  return f;
}

describe('Mission 1, flown by a pilot with the player’s inputs only', () => {
  it('the unseen route: from the gutter, in the sentry’s long window, and away; a Ghost, and the best score', () => {
    const f = expectUnseen(m1World());
    // He found the table empty when he looked back, and never knew who.
    expect(f.m.stats.theftDiscovered).toBe(true);
    expect(f.m.stats.carryingSeen).toBe(false);
    expect(f.p.results!.total).toBeGreaterThanOrEqual(1550);
  });

  it('the tea route: a drop in his mug, a low pass while he queues for a refill; a Saboteur, and a grade below', () => {
    const tea = expectTea(m1World());
    const ghost = unseenRoute(m1World());
    expect(ghost.p.results!.total).toBeGreaterThan(tea.p.results!.total);
  });

  it('Compromised by the alarm: a gull that will not leave the table is spotted until the courier is sent for', () => {
    const f = compromisedByAlarm(m1World());
    const { p, m } = f;
    const r = p.results;
    expect(r, story(f)).toBeDefined();
    expect(r!.outcome).toBe('compromised');
    expect(r!.gradeTitle).toBe('Compromised');
    expect(m.alert.toppedOut).toBe(true);
    expect(m.watch.courierRecalled).toBe(true);
    expect(m.watch.posted).toBe(true);
    expect(m.stats.spotted).toBeGreaterThanOrEqual(2);
    // He took it: the dispatch is his again, and the operation is over well before his lunch would have been.
    expect(m.dispatch.state).toBe(ItemState.Taken);
    expect(r!.time).toBeLessThan(COURIER_BACK / 2);
    expect(line(f, 'Stealth')).toBeUndefined();
    expect(line(f, 'Operation compromised')).toBe(0);
    expect(r!.debrief).toMatch(/sent for the courier/);
    // No death, ever: the gull is still flying.
    expect(p.g.controlsEnabled).toBe(false);
    expect(m.stats.knocked + m.stats.tumbles).toBeLessThan(20);
  });

  it('Compromised by the clock: the courier finishes his lunch at 13.30 and takes his dispatch', () => {
    const f = compromisedByClock(m1World());
    const { p, m } = f;
    const r = p.results;
    expect(r, story(f)).toBeDefined();
    expect(r!.outcome).toBe('compromised');
    expect(m.watch.courierRecalled).toBe(false);
    expect(m.dispatch.state).toBe(ItemState.Taken);
    // On the minute: he is at the table at COURIER_BACK, and the review follows.
    expect(r!.time).toBeGreaterThan(COURIER_BACK);
    expect(r!.time).toBeLessThan(COURIER_BACK + 8);
    expect(m.stats.spotted).toBe(0);
    // Nobody calls it a theft when the owner takes his own papers.
    expect(m.stats.theftDiscovered).toBe(false);
    expect(m.sentry.state).toBe(GuardState.Routine);
    expect(r!.debrief).toMatch(/half past one/);
  });

  it('the same two routes on the real town (the baked collision grids)', () => {
    expectUnseen(realTown());
    expectTea(realTown());
  });
});
