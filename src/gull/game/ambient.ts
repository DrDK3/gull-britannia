/**
 * The other gulls of Dartmouth. "To them you are just a gull" only works if there are gulls to be one of.
 *
 * AmbientGull is what the view needs to draw one. AmbientFlock moves them: herring gulls living plausible lives
 * (loafing on a ridge, circling over the water, begging at a bench, squabbling, working the wake of a boat), all from
 * one seeded generator, so a mission plays the same way from the same seed. The flock is also the player's cover:
 * `companyOf` says how many gulls nearby are doing what Scrumpy is doing, and the mission's conspicuousness counts on
 * it (conspicuous.ts). A long call is answered (`answerCall`); a fuss on the ground puts them up (`startle`).
 *
 * DOM-free, no wall clock, no Math.random.
 */
import { Rng } from './rng';
import { lerpAngle, v3, wrapAngle, type V3 } from './world';

export type AmbientBehaviour = 'loaf' | 'circle' | 'beg' | 'squabble' | 'follow';

export interface AmbientGull {
  id: string;
  /** The middle of the bird (m): a standing gull's is STAND above what it stands on. */
  pos: V3;
  /** Heading (rad, 0 north, clockwise). */
  yaw: number;
  airborne: boolean;
  flapping: boolean;
  /** Wing-beat phase (cycles); advances while flapping. */
  flapPhase: number;
  /** Calling now (bill open, head back): drawn, and heard. */
  calling: boolean;
  /** What it does with its day. */
  behaviour?: AmbientBehaviour;
  /** On its feet and moving: for the legs. */
  walking?: boolean;
  /** Walk cycle (rad); advances while walking. */
  walkPhase?: number;
  /** Bank (rad, > 0 right wing down) and the pitch of its path (rad, > 0 climbing), for an airborne bird. */
  bank?: number;
  pitch?: number;
}

/** How far a standing gull's middle is above its feet (m). */
export const STAND = 0.25;
/** How near a gull must be to count as company (m): on its feet beside you, or in the air around you. */
export const COMPANY_GROUND = 8;
export const COMPANY_AIR = 18;

/** A boat for gulls to follow: where it is and how it is moving. */
export interface Wake {
  pos: V3;
  vel: V3;
}

/** A boat that is not drawn by the mission: a point going up and down a line at a working boat's pace. */
export class WakeTrack implements Wake {
  pos: V3;
  vel: V3 = v3();
  private dir = 1;
  private s = 0;
  private pause = 0;
  private readonly len: number;

  constructor(
    readonly a: V3,
    readonly b: V3,
    readonly speed = 2.2,
    start = 0.3,
  ) {
    this.len = Math.hypot(b.e - a.e, b.n - a.n);
    this.s = start * this.len;
    this.pos = this.at(this.s);
  }

  private at(s: number): V3 {
    const k = this.len > 0 ? s / this.len : 0;
    return v3(this.a.e + (this.b.e - this.a.e) * k, this.a.n + (this.b.n - this.a.n) * k, this.a.h + (this.b.h - this.a.h) * k);
  }

  /** Heading (rad, 0 north, clockwise). */
  get yaw(): number {
    return Math.atan2((this.b.e - this.a.e) * this.dir, (this.b.n - this.a.n) * this.dir);
  }

  update(dt: number, waterLevel?: number): void {
    if (this.pause > 0) {
      this.pause -= dt;
      this.vel = v3();
    } else {
      this.s += this.dir * this.speed * dt;
      if (this.s > this.len || this.s < 0) {
        this.s = Math.max(0, Math.min(this.len, this.s));
        this.dir = -this.dir;
        this.pause = 6;
      }
      const k = this.len > 0 ? (this.speed * this.dir) / this.len : 0;
      this.vel = v3((this.b.e - this.a.e) * k, (this.b.n - this.a.n) * k, 0);
    }
    this.pos = this.at(this.s);
    if (waterLevel !== undefined) this.pos.h = waterLevel;
  }
}

interface Wheel {
  t: number;
  dur: number;
  /** Where it went up from, and comes down to. */
  from: V3;
  centre: V3;
  radius: number;
  turn: number;
  a0: number;
}

class Bird implements AmbientGull {
  pos: V3;
  yaw = 0;
  airborne = false;
  flapping = false;
  flapPhase = 0;
  calling = false;
  walking = false;
  walkPhase = 0;
  bank = 0;
  pitch = 0;

  /** Where it stands (its middle), for the behaviours that have a place. */
  home: V3;
  /** Personal clock (s). */
  t = 0;
  callFor = 0;
  callIn = 0;
  turnIn = 0;
  wantYaw = 0;
  /** Lifts off when called or startled. A settled bird only answers. */
  flighty = true;
  wheel: Wheel | undefined;
  // circle
  centre: V3 = v3();
  radius = 12;
  turn = 1;
  phase = 0;
  flapIn = 0;
  flapFor = 0;
  // beg
  reach = 3;
  target: { e: number; n: number } | undefined;
  pauseFor = 0;
  ground: ((e: number, n: number) => number) | undefined;
  // squabble
  partner: Bird | undefined;
  role = 0;
  period = 7;
  // follow
  wake: (() => Wake | undefined) | undefined;
  trail = 10;
  weave = 4;
  height = 7;

  constructor(
    readonly id: string,
    readonly behaviour: AmbientBehaviour,
    at: V3,
  ) {
    this.pos = { ...at };
    this.home = { ...at };
  }
}

export class AmbientFlock {
  /** The birds, as the view draws them. The array is the one in Mission.ambient. */
  readonly gulls: AmbientGull[] = [];
  private readonly birds: Bird[] = [];
  private readonly rng: Rng;
  private seq = 0;

  constructor(seed = 1) {
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  }

  private add(kind: AmbientBehaviour, at: V3): Bird {
    const b = new Bird(`gull-${++this.seq}`, kind, at);
    b.t = this.rng.range(0, 20);
    b.callIn = this.rng.range(6, 40);
    b.turnIn = this.rng.range(2, 10);
    b.flapPhase = this.rng.next();
    this.birds.push(b);
    this.gulls.push(b);
    return b;
  }

  /**
   * A gull loafing at `at` (a point on a roof, a wall, a rail: the surface, not the bird's middle), facing `yaw` or
   * so. A `settled` bird stays put whatever happens: use it where the player is meant to find company.
   */
  addLoafer(at: V3, yaw = 0, settled = false): AmbientGull {
    const b = this.add('loaf', v3(at.e, at.n, at.h + STAND));
    b.yaw = b.wantYaw = yaw;
    b.flighty = !settled;
    return b;
  }

  /** A gull circling `centre` (its height is the height it flies at) at `radius`. */
  addCircler(centre: V3, radius: number, clockwise = true): AmbientGull {
    const b = this.add('circle', centre);
    b.centre = { ...centre };
    b.radius = radius;
    b.turn = clockwise ? 1 : -1;
    b.phase = this.rng.range(0, Math.PI * 2);
    b.airborne = true;
    b.flapIn = this.rng.range(1, 6);
    this.stepCircle(b, 0);
    return b;
  }

  /** A gull begging on foot within `reach` of `anchor` (someone's lunch); `ground` gives the height it walks on. */
  addBeggar(anchor: V3, reach: number, ground: (e: number, n: number) => number): AmbientGull {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(1.2, reach);
    const e = anchor.e + Math.sin(a) * r;
    const n = anchor.n + Math.cos(a) * r;
    const b = this.add('beg', v3(e, n, ground(e, n) + STAND));
    b.home = { ...anchor };
    b.reach = reach;
    b.ground = ground;
    b.pauseFor = this.rng.range(0.5, 3);
    b.yaw = Math.atan2(anchor.e - e, anchor.n - n);
    return b;
  }

  /** Two gulls squabbling over nothing at `at` (the surface), lined up along `yaw`. */
  addSquabble(at: V3, yaw = 0): [AmbientGull, AmbientGull] {
    const gap = 0.45;
    const fe = Math.sin(yaw);
    const fn = Math.cos(yaw);
    const a = this.add('squabble', v3(at.e - fe * gap, at.n - fn * gap, at.h + STAND));
    const b = this.add('squabble', v3(at.e + fe * gap, at.n + fn * gap, at.h + STAND));
    a.yaw = yaw;
    b.yaw = wrapAngle(yaw + Math.PI);
    a.partner = b;
    b.partner = a;
    a.role = 0;
    b.role = 1;
    a.period = b.period = this.rng.range(5.5, 8.5);
    b.t = a.t;
    return [a, b];
  }

  /** A gull working the wake of a boat: `wake` says where the boat is now (undefined: it waits where it is). */
  addFollower(wake: () => Wake | undefined): AmbientGull {
    const w = wake();
    const b = this.add('follow', w ? v3(w.pos.e, w.pos.n, w.pos.h + 7) : v3());
    b.wake = wake;
    b.trail = this.rng.range(6, 14);
    b.weave = this.rng.range(2.5, 6);
    b.height = this.rng.range(4.5, 9);
    b.phase = this.rng.range(0, Math.PI * 2);
    b.airborne = true;
    return b;
  }

  // ------------------------------------------------------------------ what the mission asks of the flock

  /** How many gulls are doing what a gull at `pos` is doing: on their feet beside it, or in the air around it. */
  companyOf(pos: V3, airborne: boolean): number {
    const r = airborne ? COMPANY_AIR : COMPANY_GROUND;
    let n = 0;
    for (const b of this.birds) {
      if (b.airborne !== airborne) continue;
      if (Math.hypot(b.pos.e - pos.e, b.pos.n - pos.n, b.pos.h - pos.h) <= r) n++;
    }
    return n;
  }

  /** A long call at `at`: gulls within `radius` call back, and the flighty ones go up and wheel. Returns how many answered. */
  answerCall(at: V3, radius = 40): number {
    let n = 0;
    for (const b of this.birds) {
      const d = Math.hypot(b.pos.e - at.e, b.pos.n - at.n, b.pos.h - at.h);
      if (d > radius) continue;
      n++;
      b.callIn = this.rng.range(0.2, 1.4);
      if (b.flighty && !b.airborne && !b.wheel && this.rng.next() < 0.6) this.startWheel(b, this.rng.range(6, 9), 7, 5);
    }
    return n;
  }

  /** A fuss at `at` (a man waving his arms): gulls on their feet within `radius` go up for a moment. */
  startle(at: V3, radius = 5): number {
    let n = 0;
    for (const b of this.birds) {
      if (b.airborne || b.wheel || !b.flighty) continue;
      if (Math.hypot(b.pos.e - at.e, b.pos.n - at.n, b.pos.h - at.h) > radius) continue;
      n++;
      this.startWheel(b, this.rng.range(3, 4.5), 4, 3);
    }
    return n;
  }

  private startWheel(b: Bird, dur: number, radius: number, up: number): void {
    const from = b.behaviour === 'beg' ? { ...b.pos } : { ...b.home };
    const a0 = this.rng.range(0, Math.PI * 2);
    b.wheel = { t: 0, dur, radius, turn: this.rng.next() < 0.5 ? 1 : -1, a0, from, centre: v3(from.e, from.n, from.h + up) };
    b.walking = false;
    b.target = undefined;
  }

  // ------------------------------------------------------------------ simulation

  update(dt: number): void {
    for (const b of this.birds) {
      b.t += dt;
      // Calls: a long call every so often, bill up for a second or two.
      if (b.callFor > 0) {
        b.callFor -= dt;
        if (b.callFor <= 0) b.calling = false;
      } else {
        b.callIn -= dt;
        if (b.callIn <= 0) {
          b.calling = true;
          b.callFor = this.rng.range(1.1, 2.2);
          b.callIn = this.rng.range(18, 55);
        }
      }
      if (b.wheel) this.stepWheel(b, dt);
      else {
        switch (b.behaviour) {
          case 'loaf':
            this.stepLoaf(b, dt);
            break;
          case 'circle':
            this.stepCircle(b, dt);
            break;
          case 'beg':
            this.stepBeg(b, dt);
            break;
          case 'squabble':
            this.stepSquabble(b, dt);
            break;
          case 'follow':
            this.stepFollow(b, dt);
            break;
        }
      }
      if (b.flapping) b.flapPhase += dt * 3.4;
      if (b.walking) b.walkPhase += dt * 11;
    }
  }

  /** Fly to (e, n, h), turning the bird along its path. */
  private flyTo(b: Bird, e: number, n: number, h: number, dt: number): void {
    const de = e - b.pos.e;
    const dn = n - b.pos.n;
    const dh = h - b.pos.h;
    const flat = Math.hypot(de, dn);
    if (dt > 0 && flat > 1e-4) {
      const yaw = Math.atan2(de, dn);
      const turn = wrapAngle(yaw - b.yaw) / dt;
      b.yaw = yaw;
      b.bank += (Math.max(-0.7, Math.min(0.7, turn * 0.5)) - b.bank) * Math.min(1, dt * 4);
      b.pitch = Math.atan2(dh, flat);
    }
    b.pos.e = e;
    b.pos.n = n;
    b.pos.h = h;
  }

  private stepWheel(b: Bird, dt: number): void {
    const w = b.wheel!;
    w.t += dt;
    const edge = 1.3;
    const blend = smooth(Math.min(w.t / edge, (w.dur - w.t) / edge, 1));
    const a = w.a0 + w.turn * w.t * 1.1;
    const ce = w.centre.e + Math.sin(a) * w.radius;
    const cn = w.centre.n + Math.cos(a) * w.radius;
    b.airborne = true;
    b.walking = false;
    this.flyTo(b, w.from.e + (ce - w.from.e) * blend, w.from.n + (cn - w.from.n) * blend, w.from.h + (w.centre.h - w.from.h) * blend, dt);
    b.flapping = blend < 0.98 || Math.sin(w.t * 2.1 + w.a0) > 0.3;
    if (w.t >= w.dur) {
      b.wheel = undefined;
      b.airborne = false;
      b.flapping = false;
      b.bank = 0;
      b.pitch = 0;
      b.pos = { ...w.from };
      if (b.behaviour === 'loaf') b.yaw = b.wantYaw;
      b.pauseFor = this.rng.range(1, 3);
    }
  }

  private stepLoaf(b: Bird, dt: number): void {
    b.airborne = false;
    b.flapping = false;
    b.walking = false;
    b.pos = { ...b.home };
    b.turnIn -= dt;
    if (b.turnIn <= 0) {
      b.turnIn = this.rng.range(5, 14);
      b.wantYaw = wrapAngle(b.wantYaw + this.rng.range(-0.9, 0.9));
    }
    b.yaw = lerpAngle(b.yaw, b.wantYaw, 1 - Math.exp(-2.5 * dt));
  }

  private stepCircle(b: Bird, dt: number): void {
    const speed = 9;
    const r = b.radius * (1 + 0.15 * Math.sin(b.t * 0.13 + b.phase));
    b.phase += (b.turn * speed * dt) / Math.max(r, 2);
    const h = b.centre.h + 2 * Math.sin(b.t * 0.21 + b.radius);
    b.airborne = true;
    this.flyTo(b, b.centre.e + Math.sin(b.phase) * r, b.centre.n + Math.cos(b.phase) * r, h, dt);
    if (b.flapFor > 0) {
      b.flapFor -= dt;
      b.flapping = b.flapFor > 0;
    } else {
      b.flapIn -= dt;
      if (b.flapIn <= 0) {
        b.flapFor = this.rng.range(1, 2.2);
        b.flapIn = this.rng.range(4, 9);
        b.flapping = true;
      }
    }
  }

  private stepBeg(b: Bird, dt: number): void {
    b.airborne = false;
    b.flapping = false;
    const g = b.ground!;
    if (b.target) {
      const de = b.target.e - b.pos.e;
      const dn = b.target.n - b.pos.n;
      const d = Math.hypot(de, dn);
      if (d < 0.08) {
        b.target = undefined;
        b.walking = false;
        b.pauseFor = this.rng.range(1.2, 4.5);
      } else {
        const s = Math.min(d, 0.75 * dt);
        b.pos.e += (de / d) * s;
        b.pos.n += (dn / d) * s;
        b.yaw = lerpAngle(b.yaw, Math.atan2(de, dn), 1 - Math.exp(-8 * dt));
        b.walking = true;
      }
    } else {
      // Standing, with an eye on the lunch.
      b.walking = false;
      b.yaw = lerpAngle(b.yaw, Math.atan2(b.home.e - b.pos.e, b.home.n - b.pos.n), 1 - Math.exp(-3 * dt));
      b.pauseFor -= dt;
      if (b.pauseFor <= 0) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(1.1, b.reach);
        b.target = { e: b.home.e + Math.sin(a) * r, n: b.home.n + Math.cos(a) * r };
      }
    }
    b.pos.h = g(b.pos.e, b.pos.n) + STAND;
  }

  private stepSquabble(b: Bird, dt: number): void {
    const p = b.partner!;
    const face = Math.atan2(p.home.e - b.home.e, p.home.n - b.home.n);
    const round = Math.floor(b.t / b.period);
    const u = b.t - round * b.period;
    const victim = (round + b.role) % 2 === 0;
    const hop = 0.9;
    b.walking = false;
    if (u < hop && victim) {
      // The loser of this round flutters back and returns.
      const k = Math.sin((Math.PI * u) / hop);
      b.pos.e = b.home.e - Math.sin(face) * 0.6 * k;
      b.pos.n = b.home.n - Math.cos(face) * 0.6 * k;
      b.pos.h = b.home.h + 0.7 * k;
      b.airborne = true;
      b.flapping = true;
    } else {
      b.pos = { ...b.home };
      b.airborne = false;
      b.flapping = false;
      if (u < 1.3 && !victim) {
        // The winner says so.
        b.calling = true;
        b.callFor = Math.max(b.callFor, 0.2);
      }
    }
    b.yaw = lerpAngle(b.yaw, face, dt > 0 ? 1 - Math.exp(-6 * dt) : 1);
  }

  private stepFollow(b: Bird, dt: number): void {
    const w = b.wake?.();
    if (!w) return;
    const sp = Math.hypot(w.vel.e, w.vel.n);
    // Astern of a moving boat; over a stopped one, round and round.
    const yaw = sp > 0.2 ? Math.atan2(w.vel.e, w.vel.n) : b.t * 0.35 + b.phase;
    const fe = Math.sin(yaw);
    const fn = Math.cos(yaw);
    const side = Math.sin(b.t * 0.55 + b.phase) * b.weave;
    const back = b.trail + Math.sin(b.t * 0.31 + b.phase * 2) * 3;
    const e = w.pos.e - fe * back + fn * side;
    const n = w.pos.n - fn * back - fe * side;
    const h = w.pos.h + b.height + Math.sin(b.t * 0.8 + b.phase) * 1.2;
    // Ease towards the station astern, so that a boat going about does not fling the bird across the river.
    const k = dt > 0 ? 1 - Math.exp(-1.2 * dt) : 1;
    b.airborne = true;
    this.flyTo(b, b.pos.e + (e - b.pos.e) * k, b.pos.n + (n - b.pos.n) * k, b.pos.h + (h - b.pos.h) * k, dt);
    b.flapping = Math.sin(b.t * 1.3 + b.phase) > -0.4;
  }
}

function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
