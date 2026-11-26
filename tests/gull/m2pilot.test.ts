/**
 * Mission 2's strike, flown by a pilot with the player's inputs only (tests/gull/pilot.ts): no teleports, no parade
 * placed by hand, no drops spawned for the Wing.
 *
 * The acceptance test for the formation: following the drop marker's ON TARGET breaks the formation whether the
 * pilot flies with the march or against it.
 */
import { describe, expect, it } from 'vitest';
import { Mode } from '../../src/gull/game/gull';
import { M2, Mission2 } from '../../src/gull/game/m2';
import { AllyState } from '../../src/gull/game/parade';
import { v3 } from '../../src/gull/game/world';
import { m1World } from './m1world';
import { Pilot } from './pilot';

/** The Embankment road (m ODN) in the stand-in town. */
const ROAD_H = 3.5;

interface Run {
  /** Height of the bombing run above the road (m). */
  up: number;
  /** How far to one side of the centre file the pilot flies (m, east positive). */
  aside: number;
  /** Call the Wing first (G on the roost). Without it, the leader bombs alone. */
  wing: boolean;
  seed: number;
}

const DEFAULT: Run = { up: 14, aside: 0, wing: true, seed: 11 };

interface Outcome {
  broken: boolean;
  /** Hits by the Wing, and by the leader. */
  wingHits: number;
  leaderHits: number;
  /** How far the wingmen were from their slots at the release (m, worst). */
  slotError: number;
  /** Where the head of the column was at the release. */
  headN: number;
  marchDir: number;
  flownDir: number;
  log: string[];
}

export function strike(sense: 'with' | 'against', opts: Partial<Run> = {}): Outcome {
  const o = { ...DEFAULT, ...opts };
  const RUN_H = ROAD_H + o.up;
  const lineE = M2.paradeE + o.aside;
  const m = new Mission2(m1World(), o.seed).init();
  m.start();
  const p = new Pilot(m);
  const g = m.gull;
  const log: string[] = [];
  const note = (s: string) => log.push(`${p.t.toFixed(1)}s ${s}`);

  // Scout from the church roof: walk to the eaves (the roof itself hides the stand from the ridge), then view on
  // Voronova's head with T held.
  for (let i = 0; i < 20 * 60 && g.pos.e < -386.4; i++) {
    p.look(Math.PI / 2, -0.1);
    p.step({ forward: true });
  }
  let tagged = false;
  for (let i = 0; i < 8 * 60 && !tagged; i++) {
    p.lookAt(m.voronova.headPosition());
    p.step({ scout: true });
    tagged = m.voronova.tagged;
  }
  note(`scouted: ${tagged}`);
  expect(tagged).toBe(true);

  // To the roost on the Royal Castle Hotel, and land.
  expect(p.takeOff()).toBe(true);
  expect(p.landOn(m.roostPerch)).toBe(true);
  note('on the roost');

  // Wait on the roost for the moment, as a player would: signal when the head of the column will be passing the stand
  // by the time the Wing arrives. `lead` is how far the head must still have to march (m).
  const mid = (M2.zoneSouth + M2.zoneNorth) / 2;
  // Flying with the march the pilot has to go round behind the column and overhaul it (about 34 s from the signal);
  // head-on it meets the column in about 14 s. At 1.3 m/s:
  const lead = sense === 'with' ? 44 : 18;
  const ready = () => {
    const ahead = (mid - m.anchorN) * m.dir;
    return ahead > lead - 2 && ahead < lead + 2 && m.marchVelocity().n !== 0;
  };
  for (let i = 0; i < 200 * 60 && !ready(); i++) p.step();
  expect(ready()).toBe(true);
  if (o.wing) {
    m.signal();
    expect(m.allies.every((a) => a.state === AllyState.Follow)).toBe(true);
  }
  const marchDir = m.dir;
  note(`signalled; head at ${m.anchorN.toFixed(0)} marching ${marchDir > 0 ? 'north' : 'south'}`);

  // Out to a point on the column's line, well clear of it, then along the line.
  const flownDir = sense === 'with' ? marchDir : -marchDir;
  const startN = (flownDir > 0 ? Math.min(m.anchorN, m.anchorN - marchDir * 6) : Math.max(m.anchorN, m.anchorN - marchDir * 6)) - flownDir * 75;
  expect(p.takeOff()).toBe(true);
  expect(p.flyTo(v3(lineE, startN, RUN_H + 3), 10, 60)).toBe(true);
  note(`at the start of the run, n ${g.pos.n.toFixed(0)}; head at ${m.anchorN.toFixed(0)}`);

  // The run: along the line, level, releasing whenever the marker says ON TARGET.
  const endN = startN + flownDir * 190;
  let slotError = 0;
  let released = 0;
  let headN = NaN;
  for (let i = 0; i < 40 * 60 && Math.abs(g.pos.n - endN) > 8 && m.brokenCount === 0; i++) {
    // Steer for a point on the line ahead (it pulls the gull onto the line), holding the run height.
    const aheadN = g.pos.n + flownDir * 25;
    const dh = RUN_H - g.pos.h;
    p.look(Math.atan2(lineE - g.pos.e, aheadN - g.pos.n), Math.max(-0.35, Math.min(0.35, dh * 0.08)));
    const pred = m.dropPrediction();
    const press = !!pred?.onTarget && m.inZone() && g.payload > 0 && released < 2;
    if (press) {
      if (released === 0) {
        headN = m.anchorN;
        for (const a of m.allies) slotError = Math.max(slotError, Math.hypot(a.pos.e - a.slotPosition(g).e, a.pos.n - a.slotPosition(g).n, a.pos.h - a.slotPosition(g).h));
      }
      const before = m.stats.drops;
      p.step({ forward: g.airSpeed < 12 }, true);
      if (m.stats.drops > before) {
        released++;
        note(`released at n ${g.pos.n.toFixed(1)}, ${(g.pos.h - ROAD_H).toFixed(1)} m up, ${g.speed().toFixed(1)} m/s`);
      }
    } else p.step({ forward: g.airSpeed < 12, flap: dh > 1.5 });
  }
  // Let the drops land.
  for (let i = 0; i < 3 * 60 && m.brokenCount === 0; i++) p.step({ forward: true });
  note(`hits: leader ${m.stats.hits}, Wing ${m.stats.flockHits}; broken ${m.brokenCount}`);
  expect(g.mode).toBe(Mode.Air);
  return { broken: m.brokenCount > 0, wingHits: m.stats.flockHits, leaderHits: m.stats.hits, slotError, headN, marchDir, flownDir, log };
}

describe('Mission 2, flown by a pilot with the player’s inputs only', () => {
  it('breaks the formation flying WITH the march, releasing on ON TARGET', () => {
    const r = strike('with');
    expect(r.flownDir).toBe(r.marchDir);
    expect(r.slotError).toBeLessThan(0.6);
    expect(r.wingHits).toBeGreaterThanOrEqual(2);
    expect(r.broken, r.log.join('\n')).toBe(true);
  });

  it('breaks the formation flying AGAINST the march, releasing on ON TARGET', () => {
    const r = strike('against');
    expect(r.flownDir).toBe(-r.marchDir);
    expect(r.slotError).toBeLessThan(0.6);
    expect(r.wingHits).toBeGreaterThanOrEqual(2);
    expect(r.broken, r.log.join('\n')).toBe(true);
  });

  it('does so higher, lower, and along an outer file instead of the centre one', () => {
    for (const sense of ['with', 'against'] as const) {
      for (const run of [{ up: 9 }, { up: 20 }, { aside: 1.6 }, { aside: -1.6 }, { up: 18, aside: 0.4 }]) {
        const r = strike(sense, run);
        expect(r.broken, `${sense} ${JSON.stringify(run)}\n${r.log.join('\n')}`).toBe(true);
      }
    }
    // handoff: (stealth) ten flights take 2 to 4 s, and up to 6 s when every test file runs at once on a busy
    // machine; the default limit of 5 s then fails this test for no fault of the flying.
  }, 30_000);

  it('it is the Wing that does it: the same two drops alone leave the formation standing', () => {
    for (const sense of ['with', 'against'] as const) {
      const r = strike(sense, { wing: false });
      expect(r.leaderHits, r.log.join('\n')).toBeGreaterThanOrEqual(1);
      expect(r.wingHits).toBe(0);
      expect(r.broken).toBe(false);
    }
  });

  it('the wingmen hold their slots through a turn and a climb', () => {
    const m = new Mission2(m1World(), 5).init();
    m.start();
    const p = new Pilot(m);
    expect(p.takeOff()).toBe(true);
    expect(p.landOn(m.roostPerch)).toBe(true);
    m.signal();
    expect(p.takeOff()).toBe(true);
    expect(p.flyTo(v3(-330, 330, 30), 8, 30)).toBe(true);
    let worst = 0;
    const measure = () => {
      for (const a of m.allies) {
        const s = a.slotPosition(m.gull);
        worst = Math.max(worst, Math.hypot(a.pos.e - s.e, a.pos.n - s.n, a.pos.h - s.h));
      }
    };
    // Straight and level at cruising speed: on the slot.
    for (let i = 0; i < 6 * 60; i++) {
      p.look(Math.PI, 0);
      p.step({ forward: m.gull.airSpeed < 13 });
      if (i > 3 * 60) measure();
    }
    expect(m.gull.speed()).toBeGreaterThan(9);
    expect(worst).toBeLessThan(0.3);
    // A full turn with A held, climbing: the box swings round with the leader and stays within a wing's length.
    worst = 0;
    for (let i = 0; i < 6 * 60; i++) {
      p.look(m.gull.yaw, 0.2);
      p.step({ left: true, forward: true, flap: true });
      if (i > 60) measure();
    }
    expect(worst).toBeLessThan(1.5);
  });
});
