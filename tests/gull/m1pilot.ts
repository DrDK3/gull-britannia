/**
 * Mission 1, flown by a pilot with the player's inputs only (tests/gull/pilot.ts): the view turned as a mouse turns
 * it, the control flags the keys hold, and E, F and Q pressed through the mission's own entry points when the prompt
 * or the drop marker says what a player would see. Nothing is placed: not the gull, not the sentry, not a drop.
 *
 * What the pilot reads is what the game exposes for the HUD: the sentry's routine and its clock (`routineStep`,
 * `routineLabels`, `watchingNow`, `windowTimeLeft`), where he is, the prompt, and the drop marker.
 *
 * The opening lesson (take off, land on the station) has its own tests and is being rewritten elsewhere, so each
 * flight starts where the lesson ends, still on the nest (`skipTutorial`).
 *
 * The flying is closed-loop (steer at a point, brake by distance), not timed, so it should survive retuning of the
 * flight model; where it does not, the notes in `log` say how far it got.
 */
import { Mode, type GullControls } from '../../src/gull/game/gull';
import { M1, Mission1 } from '../../src/gull/game/m1';
import type { Results } from '../../src/gull/game/mission';
import { v3, type V3, type World } from '../../src/gull/game/world';
import { Pilot } from './pilot';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class CovePilot extends Pilot {
  declare readonly m: Mission1;
  log: string[] = [];
  results: Results | undefined;
  /** The highest any soldier's suspicion got. */
  worst = 0;

  note(s: string): void {
    this.log.push(`${this.t.toFixed(1)}s ${s}`);
  }

  override step(c: Partial<GullControls> = {}, poop = false): void {
    super.step(c, poop);
    for (const e of this.m.takeEvents()) if (e.type === 'finished') this.results = e.results;
    for (const g of this.m.soldiers()) this.worst = Math.max(this.worst, g.suspicion);
  }

  /** Cruise to a point at a safe height over the roofs, then come down to it. */
  cruiseTo(to: V3, radius: number, seconds: number, high = 30): boolean {
    const g = this.g;
    for (let i = 0; i < seconds * 60; i++) {
      const flat = Math.hypot(to.e - g.pos.e, to.n - g.pos.n);
      if (flat < radius) return true;
      const aim = flat > 45 ? Math.max(high, to.h) : to.h;
      const dh = aim - g.pos.h;
      this.look(Math.atan2(to.e - g.pos.e, to.n - g.pos.n), clamp(Math.atan2(dh, Math.max(flat, 12)), -0.5, 0.45));
      const c: Partial<GullControls> = {};
      // (A held Space does not take off twice: press, release, press.)
      if (g.mode !== Mode.Air) c.flap = i % 20 < 10;
      else {
        c.forward = g.airSpeed < 13;
        c.flap = dh > 1.5 && g.airSpeed < 15;
      }
      this.step(c);
    }
    return false;
  }

  /** Fly at `to`, slowing as it nears, and press E when the prompt offers what is wanted (as a player reads it). */
  pressWhen(want: RegExp, to: V3, seconds: number): boolean {
    const g = this.g;
    for (let i = 0; i < seconds * 60; i++) {
      if (want.test(this.m.prompt())) {
        this.m.interact();
        return true;
      }
      const flat = Math.hypot(to.e - g.pos.e, to.n - g.pos.n);
      const dh = to.h - g.pos.h;
      this.look(Math.atan2(to.e - g.pos.e, to.n - g.pos.n), clamp(Math.atan2(dh, Math.max(flat, 0.5)), -1.3, 0.6));
      const c: Partial<GullControls> = {};
      if (g.mode !== Mode.Air) c.flap = i % 20 < 10;
      else {
        const near = flat < 14;
        c.back = near && g.airSpeed > 6;
        c.forward = !near && g.airSpeed < 11;
        c.flap = dh > 1 && g.airSpeed < 12 && !c.back;
      }
      this.step(c);
    }
    return false;
  }

  /**
   * From a perch above it: step off the edge, come down on the brake with the view on the thing, and snatch it in the
   * air. Returns whether it is in the beak.
   */
  dropAndSnatch(target: () => V3, seconds = 8): boolean {
    const g = this.g;
    const m = this.m;
    for (let i = 0; i < seconds * 60; i++) {
      if (m.beak) return true;
      const t = target();
      const d = Math.hypot(t.e - g.pos.e, t.n - g.pos.n, t.h - g.pos.h);
      this.lookAt(v3(t.e, t.n, t.h + 0.6));
      if (/Snatch/.test(m.prompt())) m.interact();
      if (g.mode === Mode.Ground) this.step({ forward: true });
      else this.step({ back: g.speed() > clamp(2 + 1.5 * d, 5.5, 12) });
    }
    return !!m.beak;
  }

  /**
   * A low pass: from `entry` (a few metres up, a dozen metres short), level over the thing at a walking gull's
   * height, snatching it on the way through. Returns whether it is in the beak.
   */
  swoopAndSnatch(entry: V3, target: () => V3, seconds = 20): boolean {
    const g = this.g;
    const m = this.m;
    this.cruiseTo(entry, 5, seconds, entry.h + 6);
    for (let i = 0; i < 10 * 60; i++) {
      if (m.beak) return true;
      const t = target();
      const aim = v3(t.e, t.n, t.h + 1.3);
      const flat = Math.hypot(aim.e - g.pos.e, aim.n - g.pos.n);
      this.look(Math.atan2(aim.e - g.pos.e, aim.n - g.pos.n), clamp(Math.atan2(aim.h - g.pos.h, Math.max(flat, 3)), -0.5, 0.3));
      if (/Snatch/.test(m.prompt())) m.interact();
      this.step(g.mode === Mode.Air ? { back: g.airSpeed > 8.5, forward: g.airSpeed < 6.5, flap: g.pos.h < aim.h - 0.4 } : { flap: i % 20 < 10 });
    }
    return !!m.beak;
  }

  /** Climb away on a heading: W and Space, nose up. */
  climbOut(yaw: number, toHeight: number, seconds = 8): boolean {
    const g = this.g;
    for (let i = 0; i < seconds * 60; i++) {
      if (g.pos.h >= toHeight) return true;
      this.look(yaw, g.airSpeed > 7 ? 0.55 : 0.2);
      this.step(g.mode === Mode.Air ? { forward: true, flap: true } : { flap: i % 20 < 10 });
    }
    return g.pos.h >= toHeight;
  }

  /** Circle where it is, holding a height, for a time or until `until`. */
  circle(seconds: number, height: number, until?: () => boolean): void {
    const g = this.g;
    for (let i = 0; i < seconds * 60 && !until?.(); i++) {
      this.look(g.yaw + 0.5, 0);
      this.step(g.mode === Mode.Air ? { forward: g.airSpeed < 10, flap: g.pos.h < height } : { flap: i % 20 < 10 });
    }
  }
}

export interface Flight {
  p: CovePilot;
  m: Mission1;
}

export function begin(world: World, seed = 7): Flight {
  const m = new Mission1(world, seed).init();
  m.start();
  m.skipTutorial();
  return { p: new CovePilot(m), m };
}

/** The heading from the table down the quay to the bakery corner: open air to climb in, away from the river wall. */
export function alongTheQuay(m: Mission1): number {
  const T = m.dispatch.home.pos;
  return Math.atan2(M1.corner.e - T.e, M1.corner.n - T.n);
}

/** West over the roofs and north behind the town: never back past the cove, where they are now looking for a gull. */
export function awayRoundTheTown(p: CovePilot): void {
  p.cruiseTo(v3(-372, 45, 32), 22, 40, 32);
  p.cruiseTo(v3(-372, 330, 32), 30, 60, 32);
}

/** To the Boat Float with the dispatch, deliver it, then a chip from the clerk's bench, eaten on the wing. */
export function deliverAndLunch({ p, m }: Flight): void {
  const pot = m.pot.pos;
  if (!p.cruiseTo(v3(pot.e, pot.n, pot.h + 3), 16, 90)) p.note('never reached the Boat Float');
  const ok = p.pressWhen(/Deliver/, v3(pot.e, pot.n, pot.h + 1.6), 30);
  p.note(`delivered: ${ok && m.delivered}; tumbles so far ${m.stats.tumbles}`);
  const chip = m.chips[0]!;
  p.climbOut(Math.atan2(chip.pos.e - p.g.pos.e, chip.pos.n - p.g.pos.n), 18, 6);
  p.cruiseTo(v3(chip.pos.e, chip.pos.n, chip.pos.h + 2.5), 14, 60, 24);
  const got = p.pressWhen(/Snatch chip/, v3(chip.pos.e, chip.pos.n, chip.pos.h + 0.5), 30);
  p.note(`chip: ${got && m.beak?.kind === 'chip'}; tumbles so far ${m.stats.tumbles}`);
  m.eat();
  // Eat on the wing, climbing away from the bench, until the review comes.
  for (let i = 0; i < 12 * 60 && !p.results; i++) {
    p.look(p.g.yaw, 0.3);
    p.step(p.g.mode === Mode.Air ? { forward: p.g.airSpeed < 10, flap: p.g.pos.h < 20 } : {});
  }
}

/**
 * The unseen route: onto the Custom House gutter among the gulls that loaf there, wait for the sentry's long window
 * (he has left his tea for the river wall, and is out of earshot of the table), drop, snatch, and out along the quay.
 */
export function unseenRoute(world: World, seed = 7): Flight {
  const f = begin(world, seed);
  const { p, m } = f;
  const s = m.sentry;
  p.takeOff();
  const gp = m.gutterPerch.pos;
  // Down the town and in from the north, so that the gutter is the perch in view.
  p.cruiseTo(v3(gp.e + 1, gp.n + 40, gp.h + 8), 12, 90);
  const landed = p.landOn(m.gutterPerch, 30);
  p.note(`on the gutter: ${landed}; company ${m.company}; ${m.conspicuousReason} (${m.conspicuousness.toFixed(2)})`);
  const atRiver = () => s.routineStep >= 0 && s.routineLabels()[s.routineStep] === 'river wall';
  const clear = () => Math.hypot(s.pos.e - m.dispatch.pos.e, s.pos.n - m.dispatch.pos.n) > 6.5;
  for (let i = 0; i < 120 * 60 && !(atRiver() && !s.watchingNow && s.windowTimeLeft > 6.5 && clear()); i++) {
    p.lookAt(m.dispatch.pos);
    p.step();
  }
  p.note(`window: ${s.routineLabels()[s.routineStep] ?? s.stateName}, ${s.windowTimeLeft.toFixed(1)} s left; worst suspicion so far ${p.worst.toFixed(0)}`);
  const t0 = p.t;
  const got = p.dropAndSnatch(() => m.dispatch.pos);
  p.note(`snatched: ${got} after ${(p.t - t0).toFixed(1)} s`);
  p.climbOut(alongTheQuay(m), m.dispatch.home.pos.h + 18, 8);
  p.note(`climbed out after ${(p.t - t0).toFixed(1)} s; sentry ${s.stateName}, suspicion ${s.suspicion.toFixed(0)}; spotted ${m.stats.spotted}`);
  awayRoundTheTown(p);
  deliverAndLunch(f);
  return f;
}

/**
 * The tea route: a bombing run down the quay, releasing when the drop marker sits on his mug; round again while he
 * goes up the lane for a refill; a low pass over the table once he is at the field kitchen; and out along the quay.
 */
export function teaRoute(world: World, seed = 7): Flight {
  const f = begin(world, seed);
  const { p, m } = f;
  const s = m.sentry;
  const g = p.g;
  p.takeOff();
  const mug = m.mug.pos;
  const runH = mug.h + 12;
  let released = false;
  for (let pass = 0; pass < 4 && !released; pass++) {
    p.cruiseTo(v3(mug.e, mug.n + 95, runH + 3), 10, 90);
    for (let i = 0; i < 20 * 60 && g.pos.n > mug.n - 25 && !released; i++) {
      const dh = runH - g.pos.h;
      p.look(Math.atan2(mug.e - g.pos.e, -25), clamp(dh * 0.08, -0.35, 0.35));
      const pred = m.dropPrediction();
      const press = !!pred?.onTarget && Math.hypot(pred.point.e - mug.e, pred.point.n - mug.n) < 0.5 && s.routineStep >= 0;
      const before = m.stats.drops;
      p.step({ forward: g.airSpeed < 11, flap: dh > 1.5 }, press);
      if (m.stats.drops > before) {
        released = true;
        p.note(`released ${(g.pos.h - mug.h).toFixed(1)} m above the mug at ${g.speed().toFixed(1)} m/s; sentry at ${s.routineLabels()[s.routineStep]}`);
      }
    }
  }
  p.hold(2.5, { forward: g.airSpeed < 11 });
  p.note(`tea hits ${m.stats.teaHits}; sentry ${s.stateName} (${s.distractionKind()})`);
  const T = m.dispatch.pos;
  const away = () => Math.hypot(s.pos.e - T.e, s.pos.n - T.n);
  p.cruiseTo(v3(T.e + 2, T.n + 30, T.h + 12), 8, 40, 20);
  p.circle(30, T.h + 12, () => away() > 20);
  p.note(`he is ${away().toFixed(0)} m from the table, ${s.stateName}`);
  const got = p.swoopAndSnatch(v3(T.e + 0.6, T.n + 15, T.h + 3), () => m.dispatch.pos);
  p.note(`snatched: ${got}; sentry ${s.stateName}, busy ${s.isBusy()}`);
  p.climbOut(alongTheQuay(m), T.h + 18, 8);
  awayRoundTheTown(p);
  deliverAndLunch(f);
  return f;
}

/**
 * Compromised, the loud way: sit on the courier's table in front of the sentry, be chased off, and come back, until
 * the alarm tops out and the courier is sent for. The beak stays shut throughout.
 */
export function compromisedByAlarm(world: World, seed = 7): Flight {
  const f = begin(world, seed);
  const { p, m } = f;
  const g = p.g;
  p.takeOff();
  const T = m.dispatch.pos;
  for (let visit = 0; visit < 8 && !p.results; visit++) {
    p.cruiseTo(v3(T.e + 1, T.n + 1, T.h + 8), 6, 60, 24);
    const before = m.stats.spotted;
    for (let i = 0; i < 14 * 60 && m.stats.spotted === before && !p.results; i++) {
      p.lookAt(v3(T.e, T.n, T.h + 0.8));
      const d = Math.hypot(T.e - g.pos.e, T.n - g.pos.n, T.h - g.pos.h);
      p.step(g.mode === Mode.Air ? { back: g.speed() > (d > 5 ? 9 : 4) } : {});
    }
    p.note(`visit ${visit + 1}: spotted ${m.stats.spotted}, alert ${m.alert.name} (${m.alert.heat.toFixed(0)}), courier ${m.watch.courierPhase}`);
    p.climbOut(alongTheQuay(m), T.h + 18, 6);
    p.cruiseTo(v3(-365, 110, 32), 20, 30, 32);
    p.circle(12, 30, () => !!p.results);
  }
  return f;
}

/** Compromised, the quiet way: never leave the nest, and let the courier finish his lunch. */
export function compromisedByClock(world: World, seed = 7): Flight {
  const f = begin(world, seed);
  for (let i = 0; i < 640 * 60 && !f.p.results; i++) f.p.step();
  return f;
}
