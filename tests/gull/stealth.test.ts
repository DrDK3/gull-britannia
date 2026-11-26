/**
 * The stealth systems, one acceptance item at a time: scoring that pays for being unseen, ambient gulls and
 * conspicuousness ("just a gull" as a system), the alert ladder, readable perception, and Private Borovsky's windows.
 * The three routes flown with the player's inputs are in m1pilot.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { ALERT_RUNGS, AlertLadder, AlertLevel, HEAT } from '../../src/gull/game/alert';
import { BENEATH_NOTICE, conspicuousness, type GullFacts } from '../../src/gull/game/conspicuous';
import { CALM_GAZE_DEG, GuardState, VIGILANCE_GAZE_DEG, WARY_GAZE_DEG } from '../../src/gull/game/guard';
import { Mode, NO_CONTROLS, type GullControls } from '../../src/gull/game/gull';
import { ItemState } from '../../src/gull/game/items';
import { M1, Mission1 } from '../../src/gull/game/m1';
import { M2, Mission2 } from '../../src/gull/game/m2';
import type { Mission, Results } from '../../src/gull/game/mission';
import { APPROACHES, ORDNANCE_CAP, approachOf, hitPoints, ordnanceScore } from '../../src/gull/game/scoring';
import { dist, v3, type V3, type World } from '../../src/gull/game/world';
import { m1World } from './m1world';
import { realTown } from './realtown';

const DT = 1 / 60;

function m1(world: World = m1World(), seed = 7): Mission1 {
  const m = new Mission1(world, seed).init();
  m.start();
  m.skipTutorial();
  return m;
}

function m2(seed = 11): Mission2 {
  const m = new Mission2(m1World(), seed).init();
  m.start();
  return m;
}

function run(m: Mission, seconds: number, c: Partial<GullControls> = {}, until?: () => boolean): boolean {
  const ctl = { ...NO_CONTROLS, ...c };
  for (let i = 0; i < seconds * 60; i++) {
    m.step(DT, ctl);
    if (until?.()) return true;
  }
  return until ? until() : true;
}

function results(m: Mission, seconds = 8): Results {
  let r: Results | undefined;
  for (let i = 0; i < seconds * 60 && !r; i++) {
    m.step(DT, NO_CONTROLS);
    for (const e of m.takeEvents()) if (e.type === 'finished') r = e.results;
  }
  if (!r) throw new Error('the operation did not end');
  return r;
}

/** Put the gull in the air at a point, nearly still (a hover). */
function hover(m: Mission, at: V3): void {
  m.gull.spawn(at, 0);
  m.gull.setMode(Mode.Air);
  m.gull.airSpeed = 1;
  m.gull.flyDir = v3(0, 1, 0);
  m.gull.vel = v3();
}

/** A drop of the leader's own onto a person's head from `up` metres, led for where he will be when it lands. */
function bomb(m: Mission, on: { pos: V3 }, up = 6): void {
  const was = { ...on.pos };
  m.step(DT, NO_CONTROLS);
  const fall = up - 1.72;
  const t = (-1 + Math.sqrt(1 + 28 * fall)) / 14;
  const lead = t / DT;
  m.spawnPoop(v3(on.pos.e + (on.pos.e - was.e) * lead, on.pos.n + (on.pos.n - was.n) * lead, on.pos.h + up), v3(0, 0, -1));
}

function farAway(m: Mission): void {
  m.gull.spawn(v3(-396, 346, m.world.cellTop(-396, 346) + 0.35), 0);
}

const above = (p: V3, dh: number) => v3(p.e, p.n, p.h + dh);

// ====================================================================================================== 1. scoring

/** Mission 1 done quietly (places as the unit tests place them: the pilot flies it for real in m1pilot.test.ts). */
function m1Finish(m: Mission1): Results {
  if (m.running && m.dispatch.state === ItemState.Placed) {
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.3);
    m.interact();
    if (m.dispatch.covered || !m.beak) m.interact();
    run(m, 0.1);
  }
  if (m.beak === m.dispatch) {
    m.gull.spawn(v3(m.pot.pos.e, m.pot.pos.n + 0.5, m.pot.pos.h + 2), 0);
    m.gull.setMode(Mode.Air);
    m.interact();
  }
  if (m.running && !m.completed) {
    const chip = m.chips[0]!;
    m.gull.spawn(v3(chip.pos.e + 0.6, chip.pos.n, chip.pos.h + 0.4), -Math.PI / 2);
    m.gull.setMode(Mode.Air);
    m.interact();
    m.eat();
    run(m, 1.2);
  }
  return results(m, 30);
}

function m1Unseen(): Results {
  const m = m1();
  const s = m.sentry;
  m.gull.spawn(above(m.gutterPerch.pos, 0.35), Math.PI / 2, -0.5);
  run(m, 60, {}, () => s.routineLabels()[s.routineStep] === 'river wall' && s.atStep);
  return m1Finish(m);
}

/**
 * The review's farm: hit the sentry, and keep hitting him, a drop every two and a half seconds for as long as the
 * operation lasts (eleven at most); then down to the table for the dispatch, if it is still there.
 */
function m1Spam(): { r: Results; m: Mission1 } {
  const m = m1();
  const s = m.sentry;
  s.jumpToStep(2);
  run(m, 0.5);
  farAway(m);
  for (let i = 0; i < 11 && m.running && !m.completed; i++) {
    bomb(m, s, 12);
    run(m, 2.5);
  }
  return { r: m1Finish(m), m };
}

function m2Strike(m: Mission2): void {
  m.gull.spawn(above(m.roostPerch.pos, 0.35), Math.PI / 2);
  m.signal();
  m.setParade(M2.stand.n + 4, -1);
  for (let i = 0; i < 4; i++) {
    const s = m.marchers[i]!;
    m.spawnPoop(v3(s.pos.e, s.pos.n, s.pos.h + 4), v3(0, 0, -1), true);
    run(m, 0.6);
  }
  run(m, 6, {}, () => m.voronova.isBusy());
}

function m2Finish(m: Mission2): Results {
  m.gull.spawn(v3(M2.lectern.e + 0.6, M2.lectern.n, m.deckTop + 1.4), -Math.PI / 2);
  m.gull.setMode(Mode.Air);
  m.interact();
  m.gull.spawn(v3(m.pot.pos.e, m.pot.pos.n + 0.5, m.pot.pos.h + 2), 0);
  m.gull.setMode(Mode.Air);
  m.interact();
  return results(m);
}

describe('Scoring: the unseen route is worth the most', () => {
  it('repeat hits on one target are worth less each time, and what a payload can earn is capped', () => {
    expect([1, 2, 3, 4, 9].map(hitPoints)).toEqual([40, 20, 10, 0, 0]);
    const farm = ordnanceScore({ drops: 11, hits: 11, hitsByTarget: { borovsky: 11 }, longFirstHits: 1 });
    expect(farm.hitPoints).toBe(70);
    expect(farm.repeats).toBe(10);
    // One target, however often: no accuracy bonus, and only the first hit counts as a long drop.
    expect(farm.total).toBe(95);
    const spree: Record<string, number> = {};
    for (let i = 0; i < 12; i++) spree[`marcher-${i}`] = 1;
    const many = ordnanceScore({ drops: 12, hits: 12, hitsByTarget: spree, longFirstHits: 5 });
    expect(many.capped).toBe(true);
    expect(many.total).toBe(ORDNANCE_CAP);
    // The quietest approach is worth more than any other approach with every point a payload can earn.
    expect(APPROACHES.ghost.points).toBeGreaterThan(Math.max(APPROACHES.saboteur.points, APPROACHES.shadow.points, APPROACHES.hooligan.points) + ORDNANCE_CAP);
    expect(approachOf({ spotted: 0, questions: 0, watcherHits: 0 }).id).toBe('ghost');
    expect(approachOf({ spotted: 0, questions: 0, watcherHits: 1 }).id).toBe('saboteur');
    expect(approachOf({ spotted: 0, questions: 2, watcherHits: 0 }).id).toBe('shadow');
    expect(approachOf({ spotted: 1, questions: 0, watcherHits: 0 }).id).toBe('hooligan');
  });

  it('Mission 1: an unseen run outscores a poop-spam run', () => {
    const unseen = m1Unseen();
    expect(unseen.outcome).toBe('complete');
    expect(unseen.approach?.id).toBe('ghost');
    expect(unseen.grade).toBe('A+');
    expect(unseen.total).toBeGreaterThanOrEqual(1550);
    // The farm. It used to score 1940 and an A+, unseen. Now the third hit is an alert, the fourth and fifth take
    // the alarm to the top, and the courier comes for his dispatch while the gull is still bombing.
    const { r: spam, m } = m1Spam();
    expect(spam.stats.drops).toBeGreaterThanOrEqual(5);
    expect(spam.stats.guardHits).toBeGreaterThanOrEqual(4);
    expect(spam.stats.spotted).toBeGreaterThanOrEqual(1);
    expect(m.alert.toppedOut).toBe(true);
    expect(m.watch.courierRecalled).toBe(true);
    expect(spam.outcome).toBe('compromised');
    expect(spam.approach).toBeUndefined();
    expect(spam.total).toBeLessThan(unseen.total - 1000);
    // All those hits on one man are worth 70 between them (it was 40 each, for ever).
    expect(spam.lines.find((l) => l[0].startsWith('Accuracy'))![1]).toBe(70);
    // The score is still there for anyone who wants it live: food, and hits with repeats discounted.
    expect(m.liveScore()).toBe(m.foodTotal() + 70);
  });

  it('Mission 1: a sentry hit once is distracted; twice, he wonders; three times, he knows', () => {
    const m = m1();
    const s = m.sentry;
    s.jumpToStep(2);
    run(m, 0.5);
    farAway(m);
    bomb(m, s);
    expect(run(m, 2, {}, () => s.state === GuardState.Distracted)).toBe(true);
    expect(m.stats.questions).toBe(0);
    expect(m.alert.level).toBe(AlertLevel.Calm);
    run(m, 8, {}, () => s.isBusy());
    bomb(m, s);
    expect(run(m, 2, {}, () => s.state === GuardState.Suspicious)).toBe(true);
    expect(s.speech?.text).toMatch(/Again|Twice/);
    expect(m.stats.questions).toBe(1);
    expect(m.alert.level).toBeGreaterThanOrEqual(AlertLevel.Suspicious);
    bomb(m, s);
    expect(run(m, 2, {}, () => s.state === GuardState.Alert)).toBe(true);
    expect(m.stats.spotted).toBe(1);
    // The points say the same: 40, 20, 10.
    expect(m.liveScore()).toBe(70);
  });

  it('Mission 2: an unseen run outscores a poop-spam run', () => {
    const a = m2();
    m2Strike(a);
    const unseen = m2Finish(a);
    const b = m2();
    m2Strike(b);
    // The farm: a dozen drops on the stand's sentries while they are busy with the parade.
    farAway(b);
    for (let i = 0; i < 12; i++) {
      bomb(b, [b.kulik, b.osipov][i % 2]!, 12);
      run(b, 1.2);
    }
    const spam = m2Finish(b);
    expect(unseen.outcome).toBe('complete');
    expect(unseen.stats.spotted).toBe(0);
    expect(unseen.approach?.id).toBe('ghost');
    expect(spam.stats.drops).toBe(12);
    expect(spam.stats.guardHits).toBeGreaterThanOrEqual(6);
    expect(spam.stats.spotted).toBeGreaterThanOrEqual(1);
    expect(spam.approach?.id).toBe('hooligan');
    expect(unseen.total).toBeGreaterThan(spam.total + 300);
    // The bands still mean something: the quiet strike is an A (A+ with a fuller strike and the scouting done),
    // the farm is not.
    expect(unseen.grade).toMatch(/^A/);
    expect(spam.grade).not.toMatch(/^A/);
    expect(spam.lines.find((l) => l[0].includes('Over the allowance'))![1]).toBeLessThan(0);
  });
});

// ============================================================================== 2. ambient gulls, and "just a gull"

describe('Ambient gulls, and "just a gull" as a system', () => {
  it('six to twelve herring gulls live plausible lives on the cove', () => {
    const m = m1();
    farAway(m);
    expect(m.ambient.length).toBeGreaterThanOrEqual(6);
    expect(m.ambient.length).toBeLessThanOrEqual(12);
    expect(m.ambient).toBe(m.flock.gulls);
    const kinds = new Set(m.ambient.map((g) => g.behaviour));
    for (const k of ['loaf', 'circle', 'beg', 'squabble', 'follow']) expect(kinds.has(k as never), k).toBe(true);
    const start = m.ambient.map((g) => ({ ...g.pos }));
    const path = m.ambient.map(() => 0);
    const prev = m.ambient.map((g) => ({ ...g.pos }));
    let called = 0;
    let hopped = 0;
    for (let i = 0; i < 40 * 60; i++) {
      m.step(DT, NO_CONTROLS);
      m.ambient.forEach((g, k) => {
        path[k]! += dist(g.pos, prev[k]!);
        prev[k] = { ...g.pos };
        if (g.calling) called++;
        if (g.behaviour === 'squabble' && g.airborne) hopped++;
        expect(Number.isFinite(g.pos.e + g.pos.n + g.pos.h + g.yaw)).toBe(true);
      });
    }
    const bench = v3(M1.bench.e, M1.bench.n, m.world.groundAt(M1.bench.e, M1.bench.n));
    m.ambient.forEach((g, k) => {
      const moved = dist(g.pos, start[k]!);
      if (g.behaviour === 'loaf') {
        // On its roof, turning its head: it has not gone anywhere, and it is standing on something.
        expect(moved).toBeLessThan(0.01);
        expect(g.airborne).toBe(false);
        expect(g.pos.h - m.world.cellTop(g.pos.e, g.pos.n)).toBeLessThan(0.6);
      } else if (g.behaviour === 'circle') {
        expect(g.airborne).toBe(true);
        expect(path[k]!).toBeGreaterThan(200);
        expect(g.pos.h - m.world.surfaceAt(g.pos.e, g.pos.n).h).toBeGreaterThan(5);
      } else if (g.behaviour === 'beg') {
        // On foot round the clerk's bench, never far from his chips.
        expect(path[k]!).toBeGreaterThan(2);
        expect(Math.hypot(g.pos.e - bench.e, g.pos.n - bench.n)).toBeLessThan(6);
        expect(Math.abs(g.pos.h - bench.h)).toBeLessThan(0.6);
      } else if (g.behaviour === 'follow') {
        expect(g.airborne).toBe(true);
        expect(Math.hypot(g.pos.e - m.watch.wake.pos.e, g.pos.n - m.watch.wake.pos.n)).toBeLessThan(30);
        expect(m.world.isWater(g.pos.e, g.pos.n)).toBe(true);
      }
    });
    expect(called).toBeGreaterThan(60);
    expect(hopped).toBeGreaterThan(30);
  });

  it('Mission 2 has its gulls too: six to twelve, none of them the Bomber Wing', () => {
    const m = m2();
    expect(m.ambient.length).toBeGreaterThanOrEqual(6);
    expect(m.ambient.length).toBeLessThanOrEqual(12);
    expect(new Set(m.ambient.map((g) => g.behaviour)).size).toBe(5);
    run(m, 20);
    for (const g of m.ambient) {
      expect(Number.isFinite(g.pos.e + g.pos.n + g.pos.h)).toBe(true);
      if (g.behaviour === 'loaf') expect(g.pos.h - m.world.cellTop(g.pos.e, g.pos.n)).toBeLessThan(0.6);
      if (g.behaviour === 'circle' || g.behaviour === 'follow') expect(g.pos.h - m.world.surfaceAt(g.pos.e, g.pos.n).h).toBeGreaterThan(2);
    }
    expect(m.allies.length).toBe(4);
  });

  it('the flock is deterministic: the same seed lives the same day', () => {
    const snap = (seed: number) => {
      const m = m1(m1World(), seed);
      run(m, 25);
      return JSON.stringify(m.ambient.map((g) => [g.pos.e.toFixed(3), g.pos.n.toFixed(3), g.pos.h.toFixed(3), g.calling, g.airborne]));
    };
    expect(snap(7)).toBe(snap(7));
    expect(snap(7)).not.toBe(snap(8));
  });

  it('the rule on its own: company excuses odd behaviour, and nothing excuses papers', () => {
    const base: GullFacts = { papers: false, inCordon: false, hovering: false, zoneLabel: 'the table', airborne: false, settled: true, speed: 0, loiter: 0, thieving: false, food: false, calling: 0, company: 0 };
    expect(conspicuousness({ ...base, company: 2, loiter: 300 })).toEqual({ value: 0, reason: 'loafing among gulls' });
    const alone = conspicuousness({ ...base, loiter: 60 });
    expect(alone.reason).toBe('loitering alone');
    expect(alone.value).toBeGreaterThan(BENEATH_NOTICE);
    const hoverAlone = conspicuousness({ ...base, airborne: true, settled: false, hovering: true });
    const hoverAmong = conspicuousness({ ...base, airborne: true, settled: false, hovering: true, company: 3 });
    expect(hoverAlone.reason).toBe('hovering alone over the table');
    expect(hoverAmong.value).toBeLessThan(hoverAlone.value);
    expect(hoverAmong.value).toBeGreaterThan(BENEATH_NOTICE);
    const papers = conspicuousness({ ...base, papers: true, company: 5 });
    expect(papers).toEqual({ value: 1, reason: 'carrying papers' });
    expect(hoverAlone.value).toBeLessThan(papers.value);
  });

  it('loafing among gulls on a roof is invisible; hovering alone over the table is conspicuous; carrying papers is very conspicuous', () => {
    // Among the loafers on the Custom House roof, for a minute and a half: nobody, and nobody wonders.
    const m = m1();
    const s = m.sentry;
    m.gull.spawn(above(m.gutterPerch.pos, 0.35), Math.PI / 2, -0.5);
    run(m, 90);
    expect(m.company).toBeGreaterThanOrEqual(1);
    expect(m.conspicuousness).toBe(0);
    expect(m.conspicuousReason).toBe('loafing among gulls');
    expect(m.conspicuousLevel).toBe('just a gull');
    expect(m.noteworthiness(s, 10)).toBe(0);
    expect(m.stats.questions).toBe(0);
    expect(m.alert.level).toBe(AlertLevel.Calm);

    // Hovering alone over the table: conspicuous, and the phrase says why.
    const T = m.dispatch.pos;
    hover(m, above(T, 7));
    m.step(DT, { ...NO_CONTROLS, back: true });
    expect(m.company).toBe(0);
    expect(m.conspicuousness).toBeGreaterThanOrEqual(0.4);
    expect(m.conspicuousness).toBeLessThan(0.8);
    expect(m.conspicuousReason).toBe('hovering alone over the table');
    expect(m.conspicuousLevel).toBe('conspicuous');
    const hoverNote = m.noteworthiness(s, 10);

    // With the dispatch in its beak: very conspicuous, wherever it is.
    m.dispatch.hold();
    (m as unknown as { beak: unknown }).beak = m.dispatch;
    hover(m, v3(T.e - 20, T.n + 40, T.h + 25));
    m.step(DT, { ...NO_CONTROLS, forward: true });
    expect(m.conspicuousness).toBeGreaterThanOrEqual(0.9);
    expect(m.conspicuousReason).toBe('carrying papers');
    expect(m.conspicuousLevel).toBe('very conspicuous');
    expect(m.noteworthiness(s, 10)).toBeGreaterThan(hoverNote);
    expect(hoverNote).toBeGreaterThan(0);
  });

  it('a guard’s suspicion gains with it: nothing for a loafer, slowly for a hoverer, fast for a thief', () => {
    const gain = (set: (m: Mission1) => void): number => {
      const m = m1();
      const s = m.sentry;
      // Looking back at the table from the bakery corner: the air above it is under the ceiling of his gaze from there.
      s.jumpToStep(6);
      run(m, 0.6);
      set(m);
      const before = s.suspicion;
      for (let i = 0; i < 30; i++) m.step(DT, { ...NO_CONTROLS, back: true });
      return s.suspicion - before;
    };
    const loafing = gain((m) => m.gull.spawn(above(m.gutterPerch.pos, 0.35), Math.PI / 2));
    const hovering = gain((m) => hover(m, above(m.dispatch.pos, 6.5)));
    const thieving = gain((m) => {
      const at = above(m.dispatch.pos, 6.5);
      m.dispatch.hold();
      (m as unknown as { beak: unknown }).beak = m.dispatch;
      hover(m, at);
    });
    expect(loafing).toBe(0);
    expect(hovering).toBeGreaterThan(3);
    expect(thieving).toBeGreaterThan(hovering * 1.8);
  });

  it('sitting alone by the table for a minute is odd, and earns a question, never an alert', () => {
    const m = m1();
    const s = m.sentry;
    // The quay lamp: in plain view of his post, and no gull for company.
    m.gull.spawn(above(m.lampPerch.pos, 0.33), -Math.PI / 2);
    run(m, 1);
    expect(m.company).toBe(0);
    expect(m.conspicuousReason).toBe('just a gull');
    run(m, 150, {}, () => m.stats.questions > 0);
    expect(m.loiter).toBeGreaterThan(15);
    expect(m.stats.questions).toBeGreaterThanOrEqual(1);
    expect(m.alert.level).toBeGreaterThanOrEqual(AlertLevel.Suspicious);
    run(m, 30);
    expect(m.stats.spotted).toBe(0);
    expect(s.suspicion).toBeLessThanOrEqual(60);
  });
});

// ======================================================================================== 3. the alert ladder

describe('The alert ladder', () => {
  it('climbs with incidents, cools by no more than a rung, and remembers', () => {
    const a = new AlertLadder();
    expect(a.name).toBe('calm');
    a.raise('question', HEAT.question);
    expect(a.level).toBe(AlertLevel.Suspicious);
    a.raise('spotted', HEAT.spotted);
    expect(a.level).toBe(AlertLevel.Searching);
    expect(a.peak).toBe(AlertLevel.Searching);
    // A guard still stirred up: nothing cools.
    for (let i = 0; i < 120 * 60; i++) a.update(DT, true);
    expect(a.heat).toBe(50);
    // Quiet: it cools, to the rung below the peak and no further.
    for (let i = 0; i < 300 * 60; i++) a.update(DT, false);
    expect(a.level).toBe(AlertLevel.Suspicious);
    expect(a.heat).toBe(ALERT_RUNGS[1]);
    expect(a.peakName).toBe('searching');
    a.raise('spotted', HEAT.spotted);
    a.raise('spotted', HEAT.spotted);
    expect(a.level).toBe(AlertLevel.Alarmed);
    expect(a.toppedOut).toBe(false);
    a.raise('spotted', HEAT.spotted);
    expect(a.toppedOut).toBe(true);
    expect(a.log.length).toBe(5);
    expect(a.seconds[1]!).toBeGreaterThan(100);
  });

  it('Mission 1, suspicious: the sentry looks higher, and checks the sky before he moves on', () => {
    const m = m1();
    const s = m.sentry;
    farAway(m);
    s.jumpToStep(0);
    run(m, 1);
    expect(s.gazeLimitDeg).toBeCloseTo(CALM_GAZE_DEG, 0);
    let looked = false;
    run(m, 4, {}, () => (looked ||= s.anim === 'look_up'));
    expect(looked).toBe(false);
    m.raiseAlert('script', 20);
    expect(m.alert.level).toBe(AlertLevel.Suspicious);
    expect(s.vigilance).toBe(1);
    s.jumpToStep(0);
    run(m, 1);
    expect(s.gazeLimitDeg).toBeCloseTo(CALM_GAZE_DEG + VIGILANCE_GAZE_DEG[1]!, 0);
    let highest = 0;
    run(m, 4, {}, () => {
      if (s.anim === 'look_up') highest = Math.max(highest, s.gazeLimitDeg);
      return false;
    });
    // Craning his neck at the end of the step: the gutter, 49° up from his post, is no longer above his gaze.
    expect(highest).toBeGreaterThanOrEqual(CALM_GAZE_DEG + VIGILANCE_GAZE_DEG[1]! + WARY_GAZE_DEG - 1);
  });

  it('Mission 1, searching: a second watcher is posted at the foot of the lane', () => {
    const m = m1();
    const c = m.watch.corporal;
    farAway(m);
    const table = above(m.dispatch.pos, 0.3);
    run(m, 30);
    // Off duty by the field kitchen: he is there to be seen, and he is watching nothing.
    expect(c.offDuty).toBe(true);
    expect(c.watches(table)).toBe(false);
    expect(Math.hypot(c.pos.e - M1.kitchen.e, c.pos.n - M1.kitchen.n)).toBeLessThan(4);
    m.raiseAlert('script', 50);
    expect(m.alert.level).toBe(AlertLevel.Searching);
    expect(m.watch.posted).toBe(true);
    expect(c.offDuty).toBe(false);
    expect(run(m, 20, {}, () => c.state === GuardState.Routine && Math.hypot(c.pos.e - M1.laneFoot.e, c.pos.n - M1.laneFoot.n) < 0.5)).toBe(true);
    // He has a rhythm of his own, and the unseen moment is now where two windows overlap.
    let his = 0;
    let both = 0;
    let neither = 0;
    for (let i = 0; i < 120 * 60; i++) {
      m.step(DT, NO_CONTROLS);
      const cw = c.watches(table);
      const sw = m.sentry.watches(table);
      if (cw) his++;
      if (!cw && !sw) neither++;
      if (cw && sw) both++;
    }
    expect(his / (120 * 60)).toBeGreaterThan(0.3);
    expect(his / (120 * 60)).toBeLessThan(0.8);
    // Harder, not impossible: the table is unwatched for some of the time, and for less than the sentry alone allows.
    expect(neither / (120 * 60)).toBeGreaterThan(0.05);
    expect(neither / (120 * 60)).toBeLessThan(0.3);
    expect(both).toBeGreaterThan(0);
  });

  it('Mission 1, alarmed: the dispatch is covered; the first pull knocks the mug off with a clatter', () => {
    const m = m1();
    const s = m.sentry;
    farAway(m);
    m.raiseAlert('script', 80);
    expect(m.alert.level).toBe(AlertLevel.Alarmed);
    expect(run(m, 60, {}, () => m.dispatch.covered)).toBe(true);
    expect(m.watch.weight.visible).toBe(true);
    expect(dist(m.watch.weight.pos, m.dispatch.pos)).toBeLessThan(0.1);
    // While he is at the river wall, down to the table.
    run(m, 120, {}, () => s.routineLabels()[s.routineStep] === 'river wall' && s.atStep);
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.2);
    m.interact();
    expect(m.beak).toBeUndefined();
    expect(m.dispatch.covered).toBe(false);
    expect(m.noises.some((n) => n.kind === 'clatter')).toBe(true);
    // Ten metres off, he heard that.
    expect(s.state).toBe(GuardState.Suspicious);
    m.interact();
    expect(m.beak).toBe(m.dispatch);
  });

  it('Mission 1, at the top: the courier is sent for, and takes his dispatch if it is still on the table', () => {
    const m = m1();
    farAway(m);
    run(m, 5);
    expect(m.watch.courierPhase).toBe('lunch');
    expect(m.deadlineLeft).toBeGreaterThan(500);
    m.raiseAlert('script', 100);
    expect(m.alert.toppedOut).toBe(true);
    expect(m.watch.courierRecalled).toBe(true);
    expect(m.watch.courierPhase).toBe('returning');
    // The clock from the fiction comes forward to match: he is seconds away, not minutes.
    expect(m.deadlineLeft).toBeLessThan(15);
    expect(m.deadlineLeft).toBeGreaterThan(5);
    const r = results(m, 40);
    expect(r.outcome).toBe('compromised');
    expect(r.grade).toBe('—');
    expect(r.gradeTitle).toBe('Compromised');
    expect(m.dispatch.state).toBe(ItemState.Taken);
    expect(r.remarks.join(' ')).toMatch(/Compromised/);
  });

  it('Mission 1: if the gull already has the dispatch, the courier finds an empty table and says so', () => {
    const m = m1();
    const s = m.sentry;
    s.jumpToStep(2);
    run(m, 0.2);
    m.gull.spawn(v3(M1.table.e + 0.9, M1.table.n + 0.1, 3.8), -Math.PI / 2);
    run(m, 0.2);
    m.interact();
    expect(m.beak).toBe(m.dispatch);
    farAway(m);
    m.raiseAlert('script', 100);
    run(m, 25);
    expect(m.watch.courierPhase).toBe('at_table');
    expect(m.outcome).toBe('complete');
    expect(m.stats.theftDiscovered).toBe(true);
    expect(m.running).toBe(true);
  });
});

describe('People hear each other, and the gull', () => {
  it('a sentry’s whistle puts the next man on edge', () => {
    const m = m1();
    const s = m.sentry;
    const c = m.watch.corporal;
    farAway(m);
    m.raiseAlert('script', 50);
    run(m, 25, {}, () => c.state === GuardState.Routine);
    const questions = m.stats.questions;
    // The sentry is hit for the third time: he knows, and whistles.
    s.hitsTaken = 2;
    bomb(m, s);
    expect(run(m, 2, {}, () => s.state === GuardState.Alert)).toBe(true);
    expect(m.noises.some((n) => n.kind === 'whistle')).toBe(true);
    expect(c.state).toBe(GuardState.Suspicious);
    expect(c.alarmTimer).toBeGreaterThan(15);
    expect(c.gazeLimitDeg).toBeGreaterThanOrEqual(CALM_GAZE_DEG + WARY_GAZE_DEG);
    expect(m.stats.questions).toBe(questions + 1);
  });

  it('a long call turns his head, is answered by the gulls, and costs something', () => {
    const m = m1();
    const s = m.sentry;
    // From the quay lamp, off to his right as he sips his tea with his eyes on the table.
    s.jumpToStep(1);
    run(m, 0.5);
    m.gull.spawn(above(m.lampPerch.pos, 0.33), -Math.PI / 2);
    run(m, 0.3);
    expect(s.watches(above(m.dispatch.pos, 0.3))).toBe(true);
    const before = s.stepTimeLeft;
    m.press('signal');
    expect(m.stats.calls).toBe(1);
    expect(m.noises.some((n) => n.kind === 'call')).toBe(true);
    expect(m.conspicuousReason).toBe('just a gull');
    run(m, 0.1);
    expect(m.conspicuousReason).toBe('making a racket');
    expect(m.alert.heat).toBe(HEAT.call);
    // He looks up at the caller, and his round waits while he does: a head turned, for two seconds and a bit.
    run(m, 1);
    expect(s.anim).toBe('look_up');
    expect(s.stepTimeLeft).toBeCloseTo(before, 1);
    const to = Math.atan2(m.gull.pos.e - s.pos.e, m.gull.pos.n - s.pos.n);
    expect(Math.abs(Math.atan2(Math.sin(s.bodyYaw - to), Math.cos(s.bodyYaw - to)))).toBeLessThan(0.3);
    expect(s.watches(above(m.dispatch.pos, 0.3))).toBe(false);
    // The gulls answer.
    let answering = 0;
    run(m, 2, {}, () => {
      answering = Math.max(answering, m.ambient.filter((g) => g.calling).length);
      return false;
    });
    expect(answering).toBeGreaterThanOrEqual(2);
    run(m, 3);
    expect(s.state).toBe(GuardState.Routine);
    expect(s.anim).not.toBe('look_up');
  });
});

// ====================================================================================== 4. readable perception

describe('Readable perception', () => {
  it('each guard exposes his cone, the ceiling of his gaze, and his routine with its playhead and clock', () => {
    const m = m1();
    const s = m.sentry;
    farAway(m);
    s.jumpToStep(0);
    run(m, 0.5);
    for (const g of m.guards) {
      const c = g.cone;
      expect(c.range).toBe(g.viewRangeNow);
      expect(c.fovDeg).toBe(g.fovDeg);
      expect(c.gazeLimitDeg).toBe(g.gazeLimitDeg);
      expect(g.routineLabels().length).toBe(g.routine.length);
      // The HUD's readout splits routineText: one name per step, so the playhead lines up.
      expect(g.routineText.split(' · ').length).toBe(g.routine.length);
    }
    expect(s.cone.range).toBe(24);
    expect(s.cone.fovDeg).toBe(110);
    expect(s.gazeLimitDeg).toBeCloseTo(CALM_GAZE_DEG, 0);
    expect(s.routineStep).toBe(0);
    expect(s.atStep).toBe(true);
    expect(s.watchingNow).toBe(true);
    // The time left in the step counts down in real seconds, and the playhead moves on when it reaches nothing.
    const t0 = s.stepTimeLeft;
    run(m, 1);
    expect(t0 - s.stepTimeLeft).toBeCloseTo(1, 1);
    const w0 = s.windowTimeLeft;
    expect(w0).toBeGreaterThan(s.stepTimeLeft);
    expect(run(m, 20, {}, () => !s.watchingNow)).toBe(true);
    expect(s.routineLabels()[s.routineStep]).toBe('river wall');
    // Walking to the river wall: the clock is the walk and the wait, and it is the length of the window.
    expect(s.atStep).toBe(false);
    expect(s.stepTimeLeft).toBeGreaterThan(9);
    expect(s.windowTimeLeft).toBeCloseTo(s.stepTimeLeft, 5);
    // Suspicious, his gaze goes up by forty degrees, and he is off his routine: no playhead.
    s.onNearMiss(v3(s.pos.e + 1, s.pos.n, s.pos.h));
    run(m, 0.5);
    expect(s.state).toBe(GuardState.Suspicious);
    expect(s.routineStep).toBe(-1);
    expect(s.stepTimeLeft).toBe(0);
    expect(s.gazeLimitDeg).toBeGreaterThanOrEqual(CALM_GAZE_DEG + WARY_GAZE_DEG);
  });

  it('the ceiling is the rule: above it a thief is not seen, below it he is', () => {
    const seen = (up: number): boolean => {
      const m = m1();
      const s = m.sentry;
      s.jumpToStep(0);
      run(m, 0.5);
      // (So that the empty table does not put him on edge, which is another rule: this one is about his gaze.)
      s.guardedItem = undefined;
      m.dispatch.hold();
      (m as unknown as { beak: unknown }).beak = m.dispatch;
      // West of his post, where he is looking, 8 m off in plan.
      hover(m, v3(s.pos.e - 8, s.pos.n, s.pos.h + 1.75 + up));
      for (let i = 0; i < 20; i++) m.step(DT, { ...NO_CONTROLS, back: true });
      return s.noticing;
    };
    // 30° at 8 m is 4.6 m above his eye.
    expect(seen(3.2)).toBe(true);
    expect(seen(6.5)).toBe(false);
  });

  it('who is noticing me: a bearing and a strength for each guard', () => {
    const m = m1();
    const s = m.sentry;
    s.jumpToStep(0);
    run(m, 0.5);
    // On the table, facing north; he is at his post to the east-south-east.
    m.gull.spawn(v3(M1.table.e + 0.3, M1.table.n - 0.3, 4.6), 0);
    run(m, 0.5);
    const ids = m.noticers.map((n) => n.id);
    expect(ids).toContain('borovsky');
    expect(ids).toContain('baker');
    const n = m.noticers.find((x) => x.id === 'borovsky')!;
    const want = Math.atan2(s.pos.e - m.gull.pos.e, s.pos.n - m.gull.pos.n);
    expect(n.bearing).toBeCloseTo(want, 5);
    // The gull looks north, so the bearing from its view is the compass bearing: to the right, and a little behind.
    expect(n.relBearing).toBeCloseTo(want, 5);
    expect(n.relBearing).toBeGreaterThan(Math.PI / 2);
    expect(n.sees).toBe(true);
    expect(n.noticing).toBe(true);
    expect(n.strength).toBeGreaterThan(0.2);
    expect(n.distance).toBeCloseTo(dist(s.headPosition(), m.gull.eye()), 5);
    const first = m.noticing()[0]!;
    expect(first.id).toBe('borovsky');
    // The baker, forty metres off and minding her pasty, is on the list with no interest at all.
    expect(m.noticers.find((x) => x.id === 'baker')!.strength).toBe(0);
    const before = n.strength;
    run(m, 0.5);
    expect(m.noticers.find((x) => x.id === 'borovsky')!.strength).toBeGreaterThan(before);
  });
});

// ============================================================================ 5. Borovsky's windows, and the pasty

interface Windows {
  /** Lengths of the spells when the table is outside his view (s). */
  windows: number[];
  unwatched: number;
}

function windowsOf(world: World, seconds = 306): Windows {
  const m = m1(world);
  farAway(m);
  const s = m.sentry;
  const windows: number[] = [];
  let cur = 0;
  let un = 0;
  for (let i = 0; i < seconds * 60; i++) {
    m.step(DT, NO_CONTROLS);
    if (!s.watches(above(m.dispatch.pos, 0.3))) {
      cur++;
      un++;
    } else if (cur > 0) {
      windows.push(cur / 60);
      cur = 0;
    }
  }
  expect(s.state).toBe(GuardState.Routine);
  expect(m.stats.questions).toBe(0);
  return { windows, unwatched: un / (seconds * 60) };
}

describe('Private Borovsky', () => {
  it('his unwatched windows are 6 to 12 seconds, on the stand-in town and on the real one', () => {
    for (const world of [m1World(), realTown()]) {
      const { windows, unwatched } = windowsOf(world);
      // Six rounds of 51 s: two windows a round.
      expect(windows.length).toBeGreaterThanOrEqual(11);
      for (const w of windows) {
        expect(w).toBeGreaterThanOrEqual(6);
        expect(w).toBeLessThanOrEqual(12);
      }
      // A long one at the river wall and a short one at the bakery corner: a choice, not a queue.
      const long = windows.filter((w) => w > 10);
      const short = windows.filter((w) => w < 9.5);
      expect(long.length).toBeGreaterThanOrEqual(5);
      expect(short.length).toBeGreaterThanOrEqual(5);
      expect(Math.max(...windows) - Math.min(...windows)).toBeGreaterThan(1.5);
      // The table was unwatched 71% of the time, in 48 s spells. Now it is watched more often than not.
      expect(unwatched).toBeGreaterThan(0.3);
      expect(unwatched).toBeLessThan(0.5);
    }
  });

  it('he gives a tell before he turns back: a line and a stretch, a second and a half ahead', () => {
    const m = m1();
    farAway(m);
    const s = m.sentry;
    const tells: { step: string; lead: number; line: string; anim: string }[] = [];
    let since = -1;
    let line = '';
    let anim = '';
    let step = '';
    for (let i = 0; i < 110 * 60; i++) {
      const was = s.watchingNow;
      m.step(DT, NO_CONTROLS);
      if (s.telling && since < 0) {
        since = 0;
        line = s.telling;
        anim = s.anim;
        step = s.routineLabels()[s.routineStep]!;
        expect(s.speech?.text).toBe(line);
        expect(s.watchingNow).toBe(false);
      }
      if (since >= 0) since += DT;
      if (!was && s.watchingNow) {
        // He has turned. Every turn back to the table was announced.
        expect(since).toBeGreaterThan(0);
        tells.push({ step, lead: since, line, anim });
        since = -1;
      }
    }
    expect(tells.length).toBeGreaterThanOrEqual(4);
    for (const t of tells) {
      expect(t.lead).toBeGreaterThanOrEqual(1.4);
      expect(t.lead).toBeLessThanOrEqual(1.8);
      expect(t.anim).toBe('stretch');
      expect(t.line.length).toBeGreaterThan(3);
    }
    expect(new Set(tells.map((t) => t.step))).toEqual(new Set(['river wall', 'fort side']));
    expect(s.telling).toBeUndefined();
  });

  it('the pasty is riskier than the chips: the sill is watched half the time, the bench never', () => {
    const m = m1();
    farAway(m);
    const s = m.sentry;
    const b = m.watch.baker;
    const sill = () => above(m.pasty.pos, 0.2);
    const chips = above(m.chips[0]!.pos, 0.2);
    let pasty = 0;
    let chip = 0;
    const N = 204 * 60;
    for (let i = 0; i < N; i++) {
      m.step(DT, NO_CONTROLS);
      if (b.watches(sill()) || s.watches(sill())) pasty++;
      if (m.guards.some((g) => g.watches(chips))) chip++;
    }
    expect(chip).toBe(0);
    expect(pasty / N).toBeGreaterThan(0.4);
    expect(pasty / N).toBeLessThan(0.7);
    for (const g of m.guards) expect(dist(g.pos, chips)).toBeGreaterThan(150);
  });

  it('taking a chip troubles nobody; taking the pasty in the baker’s sight brings a shout, and the sentry', () => {
    // A chip, whenever: the clerk flails, and that is all.
    const a = m1();
    const chip = a.chips[0]!;
    a.gull.spawn(v3(chip.pos.e + 0.6, chip.pos.n, chip.pos.h + 0.4), -Math.PI / 2);
    a.gull.setMode(Mode.Air);
    a.interact();
    expect(a.beak?.kind).toBe('chip');
    run(a, 8, { forward: true, flap: true });
    expect(a.clerk.speech === undefined || a.clerk.anim === 'sit' || a.clerk.anim === 'flail').toBe(true);
    expect(a.stats.shouts).toBe(0);
    expect(a.stats.questions).toBe(0);
    expect(a.alert.heat).toBe(0);
    expect(a.sentry.state).toBe(GuardState.Routine);

    // The pasty, while Mrs Pascoe is at her door.
    const m = m1();
    const b = m.watch.baker;
    const s = m.sentry;
    farAway(m);
    expect(run(m, 60, {}, () => b.watchingNow && b.atStep && b.stepTimeLeft > 4 && s.routineStep >= 0)).toBe(true);
    const snatchPasty = (mm: Mission1) => {
      const p = mm.pasty.pos;
      mm.gull.spawn(v3(p.e + 0.7, p.n - 0.2, p.h + 0.5), -Math.PI / 2);
      mm.gull.setMode(Mode.Air);
      mm.gull.airSpeed = 3;
      mm.interact();
      expect(mm.beak).toBe(mm.pasty);
    };
    snatchPasty(m);
    expect(m.gullFacts().thieving).toBe(true);
    // She sees it go, and says so. The sentry hears her and comes to look.
    expect(run(m, 4, { forward: true, flap: true }, () => b.state === GuardState.Alert)).toBe(true);
    expect(b.speech?.text).toMatch(/pasty|bird/i);
    expect(m.stats.shouts).toBe(1);
    expect(m.noises.some((n) => n.kind === 'shout')).toBe(true);
    expect(s.state === GuardState.Suspicious || s.state === GuardState.Investigate).toBe(true);
    expect(m.stats.questions).toBe(1);
    expect(m.alert.level).toBeGreaterThanOrEqual(AlertLevel.Suspicious);
    // A baker is not the garrison: it is a question, not a sighting. But the Ghost is gone.
    expect(m.stats.spotted).toBe(0);
    expect(m.approach().id).toBe('shadow');
    // And it is an opening: he leaves his round to see about it.
    expect(run(m, 12, { forward: true, flap: true }, () => s.state === GuardState.Investigate && s.moving)).toBe(true);

    // The same pasty while she is at the oven and he is at the river wall: nobody the wiser.
    const q = m1();
    farAway(q);
    const qb = q.watch.baker;
    const qs = q.sentry;
    expect(run(q, 120, {}, () => !qb.watchingNow && qb.atStep && qb.stepTimeLeft > 4 && qs.routineLabels()[qs.routineStep] === 'river wall' && qs.atStep)).toBe(true);
    snatchPasty(q);
    run(q, 3, { forward: true, flap: true });
    farAway(q);
    run(q, 20);
    expect(q.stats.shouts).toBe(0);
    expect(q.stats.questions).toBe(0);
    expect(q.alert.level).toBe(AlertLevel.Calm);
  });
});
