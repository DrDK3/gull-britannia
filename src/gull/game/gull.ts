/**
 * The player gull: flight, perching, walking and swimming. DOM-free and deterministic (fixed step).
 *
 * Flight model (arcade, tuned for feel; ported from the Godot build and kept the same):
 * - The gull flies towards where you look: its flight path turns towards the view at a rate that depends on speed
 *   (heavier profiles turn more slowly).
 * - Pointing down trades height for speed; pointing up trades speed for height.
 * - Flapping adds thrust (forward) or lift (flap). Dive tucks the wings. Brake flares them: a fast stop and a gentle,
 *   parachute sink.
 * - Below stall speed the gull sinks, but falling rebuilds airspeed: stalls always recover. A hard impact is a tumble,
 *   never a death.
 * - Landing assist glides onto a perch in view, or flares and settles onto whatever is below.
 */
import { World, type V3, v3, add, sub, scale, dot, len, norm, dist, dirOf, wrapAngle, lerpAngle } from './world';

export const GRAVITY = 9.8;
export const RADIUS = 0.3;
export const EYE = 0.14;
const LAND_SPEED = 11;
const WATER_LAND_SPEED = 17;
const SKIM_IMPACT = 4;
const TUMBLE_IMPACT = 9;
export const DROP_IMPACT = 15;
const CEILING = 150;

export const Mode = { Ground: 0, Air: 1, Water: 2, Tumble: 3, Snap: 4 } as const;
export type ModeId = (typeof Mode)[keyof typeof Mode];

export interface GullProfile {
  name: string;
  stallSpeed: number;
  cruiseSpeed: number;
  flapMaxSpeed: number;
  maxSpeed: number;
  flapThrust: number;
  flapLift: number;
  drag: number;
  diveDrag: number;
  brakeDecel: number;
  turnRate: number;
  bankYawRate: number;
  maxSink: number;
  walkSpeed: number;
  takeoffSpeed: number;
  climbFactor: number;
  maxPayload: number;
  payloadRegen: number;
  poopCooldown: number;
}

export const STANDARD_PROFILE: GullProfile = {
  name: 'Standard gull',
  stallSpeed: 7,
  cruiseSpeed: 13,
  flapMaxSpeed: 17.5,
  maxSpeed: 32,
  flapThrust: 6.5,
  flapLift: 4.2,
  drag: 0.0045,
  diveDrag: 0.0016,
  brakeDecel: 10,
  turnRate: 3.2,
  bankYawRate: 1.8,
  maxSink: 8,
  walkSpeed: 2.4,
  takeoffSpeed: 7.5,
  climbFactor: 1,
  maxPayload: 3,
  payloadRegen: 20,
  poopCooldown: 0.35,
};

/** Held controls this step. */
export interface GullControls {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  flap: boolean;
  dive: boolean;
  land: boolean;
  scout: boolean;
}

export const NO_CONTROLS: GullControls = { forward: false, back: false, left: false, right: false, flap: false, dive: false, land: false, scout: false };

export interface Perch {
  id: string;
  name: string;
  hint: string;
  pos: V3;
  highlight?: boolean;
}

/** What the gull asks of the mission it is in. */
export interface GullHost {
  findPerch(from: V3, look: V3, maxDist: number, maxAngleDeg: number): Perch | undefined;
  perchAt(p: V3): Perch | undefined;
  spawnPoop(pos: V3, vel: V3): void;
  onLanded(water: boolean): void;
  onPerched(p: Perch): void;
  onTookOff(): void;
  onTumbled(impact: number): void;
  onPayloadEmpty(): void;
  onOutOfBounds(): void;
}

/** Things that happened in a step, for sound and pictures. */
export interface GullEvents {
  flap: boolean;
  land: boolean;
  splash: boolean;
  bonk: boolean;
  skim: boolean;
  poop: boolean;
}

export class Gull {
  profile: GullProfile = { ...STANDARD_PROFILE };
  pos: V3 = v3();
  vel: V3 = v3();
  mode: ModeId = Mode.Ground;
  /** View heading (rad, 0 north, clockwise) and pitch (rad, > 0 up): the mouse sets these. */
  yaw = 0;
  pitch = 0;
  airSpeed = 0;
  sink = 0;
  flyDir: V3 = v3(0, 1, 0);
  flapping = false;
  braking = false;
  diving = false;
  landingAssist = false;
  scouting = false;
  controlsEnabled = true;
  perch: Perch | undefined;
  payload = 3;
  eatingTimer = 0;
  timeInMode = 0;
  lastImpact = 0;
  /** Flap cycle (counts up while flapping; the fraction is the wing's phase). */
  flapPhase = 0;
  /** Walking cycle, for the legs. */
  walkPhase = 0;
  /** Turn rate of the view (rad/s, smoothed), for banking. */
  yawRate = 0;
  events: GullEvents = { flap: false, land: false, splash: false, bonk: false, skim: false, poop: false };

  private payloadTimer = 0;
  private poopCooldown = 0;
  private tumbleTimer = 0;
  private offFloor = 0;
  private landCooldown = 0;
  private recoverAssist = 0;
  /** Flap held since before the gull landed: it must be released before it takes off again. */
  private flapBlocked = false;
  private flapHeld = false;
  private prevYaw = 0;
  private boundTimer = 0;
  private snap = { from: v3(), ctrl: v3(), to: v3(), t: 0, dur: 1, perch: undefined as Perch | undefined };

  setProfile(p: Partial<GullProfile>): void {
    this.profile = { ...STANDARD_PROFILE, ...p };
    this.payload = Math.min(this.payload, this.profile.maxPayload);
  }

  spawn(pos: V3, yaw: number, pitch = -0.15): void {
    this.pos = { ...pos };
    this.yaw = yaw;
    this.pitch = pitch;
    this.prevYaw = yaw;
    this.flyDir = this.lookDir();
    this.vel = v3();
    this.airSpeed = 0;
    this.sink = 0;
    this.payload = this.profile.maxPayload;
    this.setMode(Mode.Ground);
  }

  lookDir(): V3 {
    return dirOf(this.yaw, this.pitch);
  }

  flatDir(): V3 {
    return dirOf(this.yaw, 0);
  }

  eye(): V3 {
    return v3(this.pos.e, this.pos.n, this.pos.h + EYE);
  }

  speed(): number {
    return len(this.vel);
  }

  isAirborne(): boolean {
    return this.mode === Mode.Air || this.mode === Mode.Tumble || this.mode === Mode.Snap;
  }

  isPerched(): boolean {
    return this.mode === Mode.Ground && this.perch !== undefined;
  }

  modeName(): string {
    switch (this.mode) {
      case Mode.Ground:
        return this.perch ? 'PERCHED' : 'ON FOOT';
      case Mode.Water:
        return 'AFLOAT';
      case Mode.Tumble:
        return 'TUMBLING';
      case Mode.Snap:
        return 'LANDING';
      default:
        if (this.braking) return 'BRAKING';
        if (this.diving) return 'DIVING';
        if (this.flapping) return 'FLAPPING';
        if (this.airSpeed < this.profile.stallSpeed) return 'STALLING';
        return 'GLIDING';
    }
  }

  /** Mouse look (radians), with sensitivity and invert-Y already applied. */
  look(dYaw: number, dPitch: number): void {
    this.yaw = wrapAngle(this.yaw + dYaw);
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch + dPitch));
  }

  setMode(m: ModeId): void {
    this.mode = m;
    this.timeInMode = 0;
  }

  // ------------------------------------------------------------------ step

  step(dt: number, c: GullControls, world: World, host: GullHost): void {
    const ctl = this.controlsEnabled ? c : NO_CONTROLS;
    this.events = { flap: false, land: false, splash: false, bonk: false, skim: false, poop: false };
    this.timeInMode += dt;
    this.landCooldown = Math.max(0, this.landCooldown - dt);
    this.recoverAssist = Math.max(0, this.recoverAssist - dt);
    this.poopCooldown = Math.max(0, this.poopCooldown - dt);
    this.scouting = ctl.scout && this.mode !== Mode.Tumble;
    switch (this.mode) {
      case Mode.Ground:
      case Mode.Water:
        this.groundStep(dt, ctl, world, host);
        break;
      case Mode.Air:
        this.airStep(dt, ctl, world, host);
        break;
      case Mode.Tumble:
        this.tumbleStep(dt, world, host);
        break;
      case Mode.Snap:
        this.snapStep(dt, host);
        break;
    }
    // Payload regenerates; eating counts down.
    if (this.payload < this.profile.maxPayload) {
      this.payloadTimer += dt;
      if (this.payloadTimer >= this.profile.payloadRegen) {
        this.payloadTimer = 0;
        this.payload++;
      }
    } else this.payloadTimer = 0;
    if (this.eatingTimer > 0) this.eatingTimer -= dt;
    this.boundsStep(dt, world, host);
    const dy = wrapAngle(this.yaw - this.prevYaw);
    this.yawRate += (dy / Math.max(dt, 1e-4) - this.yawRate) * (1 - Math.exp(-8 * dt));
    this.prevYaw = this.yaw;
  }

  private groundStep(dt: number, c: GullControls, world: World, host: GullHost): void {
    const onWater = this.mode === Mode.Water;
    const ix = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const iz = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const f = this.flatDir();
    // Right of the heading (clockwise 90°).
    const r = v3(f.n, -f.e, 0);
    let dir = add(scale(f, iz), scale(r, ix));
    const dl = len(dir);
    if (dl > 1) dir = scale(dir, 1 / dl);
    let spd = this.profile.walkSpeed * (onWater ? 0.6 : 1) * (c.dive ? 1.6 : 1);
    if (this.eatingTimer > 0) spd *= 0.4;
    const accel = 18;
    this.vel.e = moveToward(this.vel.e, dir.e * spd, accel * dt);
    this.vel.n = moveToward(this.vel.n, dir.n * spd, accel * dt);
    if (onWater) this.vel.h = (world.waterLevel + 0.12 + Math.sin(this.timeInMode * 2) * 0.04 - this.pos.h) * 6;
    else this.vel.h -= GRAVITY * dt;
    const res = this.move(dt, world);
    if (dl > 0.1) this.walkPhase += dt * (onWater ? 6 : 13);
    if (this.perch && dist(this.pos, this.perch.pos) > 1.5) this.perch = undefined;
    if (onWater) {
      if (this.pos.h > world.waterLevel + 0.9) {
        this.startFall();
        return;
      }
    } else {
      const floor = res.contacts.some((k) => k.floor);
      const support = world.supportUnder(this.pos, RADIUS);
      const feet = this.pos.h - RADIUS;
      if (floor || feet - support.h < 0.35) {
        // Snap down onto steps and slopes while walking.
        if (feet - support.h < 0.35 && feet > support.h) this.pos.h = support.h + RADIUS;
        if (this.vel.h < 0) this.vel.h = 0;
        this.offFloor = 0;
        if (support.water) this.setMode(Mode.Water);
      } else {
        this.offFloor += dt;
        if (this.offFloor > 0.22) {
          this.startFall();
          return;
        }
      }
    }
    // Take off on flap, a moment after landing; a flap held from before the landing must be pressed again.
    if (!c.flap) this.flapBlocked = false;
    if (c.flap && !this.flapBlocked && this.timeInMode > 0.2) {
      this.takeOff(host);
      return;
    }
  }

  takeOff(host?: GullHost): void {
    const f = this.flatDir();
    this.flyDir = norm(add(f, v3(0, 0, 0.6)));
    this.airSpeed = this.profile.takeoffSpeed;
    this.sink = -3.2 * this.profile.climbFactor - 0.6;
    this.perch = undefined;
    this.landCooldown = 0.45;
    this.setMode(Mode.Air);
    this.flapPhase = 0;
    this.events.flap = true;
    host?.onTookOff();
  }

  private startFall(): void {
    const hs = Math.hypot(this.vel.e, this.vel.n);
    this.flyDir = norm(add(this.flatDir(), v3(0, 0, -0.15)));
    this.airSpeed = Math.max(hs, 4.5);
    this.sink = 0.5;
    this.perch = undefined;
    this.landCooldown = 0.25;
    this.setMode(Mode.Air);
  }

  private airStep(dt: number, c: GullControls, world: World, host: GullHost): void {
    const P = this.profile;
    const fwdIn = c.forward;
    const liftIn = c.flap;
    this.flapHeld = liftIn;
    this.landingAssist = c.land;
    this.braking = c.back || c.land;
    this.diving = c.dive && !this.braking;
    this.flapping = (fwdIn || liftIn) && this.eatingTimer <= 0;
    const turn = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    this.yaw = wrapAngle(this.yaw + turn * P.bankYawRate * dt);

    // Landing assist: glide onto a perch in view.
    if (this.landingAssist) {
      const p = host.findPerch(this.pos, this.lookDir(), 18, 42);
      if (p) {
        this.startSnap(p);
        return;
      }
    }
    // A slow hover down near a perch settles onto it (not while climbing away).
    if (this.airSpeed < 5 && this.landCooldown <= 0 && !liftIn && (this.braking || this.sink > 0.5)) {
      const near = host.findPerch(this.pos, this.lookDir(), 1.8, 180);
      if (near) {
        this.startSnap(near);
        return;
      }
    }

    let look = this.lookDir();
    if (this.landingAssist) look = norm(v3(look.e, look.n, Math.max(-0.45, Math.min(0, look.h))));
    const spdFrac = Math.min(1, Math.max(0, this.airSpeed / P.cruiseSpeed));
    const rate = P.turnRate * lerp(2.6, 1, spdFrac);
    this.flyDir = norm(add(scale(this.flyDir, 1), scale(sub(look, this.flyDir), 1 - Math.exp(-rate * dt))));

    // Energy: height <-> speed.
    let gAlong = -this.flyDir.h * GRAVITY;
    if (gAlong < 0) gAlong /= Math.max(P.climbFactor, 0.2);
    else if (this.diving) gAlong *= 1.4;
    this.airSpeed += gAlong * dt;
    const drag = this.diving ? P.diveDrag : P.drag;
    this.airSpeed -= drag * this.airSpeed * this.airSpeed * dt;
    if (this.braking) this.airSpeed = moveToward(this.airSpeed, 2.4, P.brakeDecel * dt);
    if (this.flapping && !this.braking && this.airSpeed < P.flapMaxSpeed) this.airSpeed += P.flapThrust * dt * (fwdIn ? 1 : 0.45);
    let liftFrac = Math.min(1, Math.max(0, (this.airSpeed - 1) / (P.stallSpeed - 1)));
    if (this.diving) liftFrac *= 0.35;
    // Falling rebuilds airspeed: stalls always recover.
    if (!this.braking) this.airSpeed += ((1 - liftFrac) * 5 + Math.max(this.sink, 0) * 0.55) * dt;
    this.airSpeed = Math.min(Math.max(this.airSpeed, 0), P.maxSpeed);

    let target = (1 - liftFrac) * P.maxSink;
    if (this.braking) target = Math.min(target, 2.2);
    if (this.recoverAssist > 0) target = Math.min(target, 1.5);
    if (liftIn && this.eatingTimer <= 0) target -= P.flapLift * P.climbFactor;
    else if (fwdIn && this.eatingTimer <= 0) target -= (1.6 * (1 - liftFrac) + 0.4) * P.climbFactor;
    const groundBelow = world.cellTop(this.pos.e, this.pos.n);
    if (this.pos.h - Math.max(groundBelow, world.waterLevel) > CEILING) target += (this.pos.h - Math.max(groundBelow, world.waterLevel) - CEILING) * 0.5;
    this.sink = moveToward(this.sink, target, 9 * dt);

    this.vel = add(scale(this.flyDir, this.airSpeed), v3(0, 0, -this.sink));
    const pre = { ...this.vel };
    const res = this.move(dt, world);
    this.airContacts(pre, res.contacts, host);

    if (this.flapping) {
      const prev = this.flapPhase;
      this.flapPhase += dt * 4.2;
      if (Math.floor(this.flapPhase) !== Math.floor(prev) || prev === 0) this.events.flap = true;
    } else this.flapPhase = 0;
  }

  /** Move by the velocity for dt in short sub-steps, colliding as it goes. */
  private move(dt: number, world: World): { contacts: { normal: V3; floor: boolean; water: boolean }[] } {
    const travel = len(this.vel) * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.2));
    const h = dt / steps;
    const contacts: { normal: V3; floor: boolean; water: boolean }[] = [];
    for (let i = 0; i < steps; i++) {
      const next = add(this.pos, scale(this.vel, h));
      const r = world.collideSphere(next, RADIUS);
      this.pos = r.pos;
      if (r.contacts.length) {
        contacts.push(...r.contacts);
        // Slide: take out the part of the velocity into each surface.
        for (const k of r.contacts) {
          const into = dot(this.vel, k.normal);
          if (into < 0) this.vel = sub(this.vel, scale(k.normal, into));
        }
      }
    }
    return { contacts };
  }

  private airContacts(pre: V3, contacts: { normal: V3; floor: boolean; water: boolean }[], host: GullHost): void {
    for (const k of contacts) {
      const into = -dot(pre, k.normal);
      const total = len(pre);
      if (k.floor && k.normal.h > 0.6) {
        if (this.landCooldown > 0) continue;
        const limit = k.water ? WATER_LAND_SPEED : LAND_SPEED;
        if (total <= limit) {
          this.land(k.water, host);
          return;
        }
        if (into < SKIM_IMPACT) {
          // Fast, shallow contact: skim off and keep flying.
          this.flyDir = norm(add(sub(this.flyDir, scale(k.normal, dot(this.flyDir, k.normal))), scale(k.normal, 0.25)));
          this.airSpeed *= 0.85;
          this.sink = Math.min(this.sink, 0);
          this.landCooldown = 0.2;
          this.events.skim = true;
          return;
        }
        this.startTumble(pre, k.normal, into, host);
        return;
      }
      if (into > TUMBLE_IMPACT) {
        this.startTumble(pre, k.normal, into, host);
        return;
      }
      const slid = sub(this.flyDir, scale(k.normal, dot(this.flyDir, k.normal)));
      if (len(slid) > 0.05) this.flyDir = norm(slid);
      this.airSpeed *= 0.92;
    }
  }

  land(water: boolean, host?: GullHost): void {
    this.flapBlocked = this.flapHeld;
    this.vel = v3();
    this.airSpeed = 0;
    this.sink = 0;
    this.flapping = false;
    this.braking = false;
    this.diving = false;
    this.setMode(water ? Mode.Water : Mode.Ground);
    if (water) this.events.splash = true;
    else this.events.land = true;
    if (host && !water) this.perch = host.perchAt(this.pos);
    host?.onLanded(water);
  }

  private startTumble(pre: V3, n: V3, into: number, host: GullHost): void {
    this.lastImpact = into;
    const bounce = sub(pre, scale(n, 2 * dot(pre, n)));
    this.vel = add(add(scale(bounce, 0.28), scale(n, 1.2)), v3(0, 0, 1.8));
    this.tumbleTimer = 0.7;
    this.setMode(Mode.Tumble);
    this.events.bonk = true;
    host.onTumbled(into);
  }

  /** An outside knock (a thrown cap, a swat): into a tumble. The mission drops what the gull carries. */
  knock(fromDir: V3, strength = 6): void {
    const d = norm(v3(fromDir.e, fromDir.n, 0));
    this.vel = add(scale(d, strength), v3(0, 0, 3));
    this.lastImpact = strength;
    this.tumbleTimer = 0.8;
    this.setMode(Mode.Tumble);
    this.events.bonk = true;
  }

  private tumbleStep(dt: number, world: World, host: GullHost): void {
    this.tumbleTimer -= dt;
    this.vel.h -= GRAVITY * dt;
    this.vel.e = moveToward(this.vel.e, 0, 3 * dt);
    this.vel.n = moveToward(this.vel.n, 0, 3 * dt);
    const res = this.move(dt, world);
    const floor = res.contacts.find((k) => k.floor);
    if (floor?.water) this.tumbleTimer = Math.min(this.tumbleTimer, 0);
    if (this.tumbleTimer <= 0) {
      if (floor) this.land(floor.water, host);
      else {
        // Recover into a flutter.
        this.flyDir = norm(add(this.flatDir(), v3(0, 0, 0.1)));
        this.airSpeed = 5;
        this.sink = 0.5;
        this.recoverAssist = 0.8;
        this.setMode(Mode.Air);
      }
    }
  }

  startSnap(p: Perch): void {
    const from = { ...this.pos };
    const to = v3(p.pos.e, p.pos.n, p.pos.h + RADIUS + 0.03);
    const d = dist(from, to);
    const mid = scale(add(from, to), 0.5);
    const ctrl = add(add(mid, v3(0, 0, Math.min(2.5, Math.max(0.3, d * 0.12)))), scale(this.flyDir, Math.min(d * 0.2, 3)));
    this.snap = { from, ctrl, to, t: 0, dur: Math.min(1.8, Math.max(0.35, d / 9)), perch: p };
    this.setMode(Mode.Snap);
  }

  private snapStep(dt: number, host: GullHost): void {
    const s = this.snap;
    s.t = Math.min(1, s.t + dt / s.dur);
    const t = s.t * s.t * (3 - 2 * s.t);
    const a = add(s.from, scale(sub(s.ctrl, s.from), t));
    const b = add(s.ctrl, scale(sub(s.to, s.ctrl), t));
    const p = add(a, scale(sub(b, a), t));
    this.vel = scale(sub(p, this.pos), 1 / Math.max(dt, 1e-4));
    this.pos = p;
    if (s.t >= 1) {
      this.pos = { ...s.to };
      this.land(false, host);
      this.perch = s.perch;
      if (s.perch) host.onPerched(s.perch);
    }
  }

  refillPayload(): void {
    this.payload = this.profile.maxPayload;
    this.payloadTimer = 0;
  }

  /** Release a poop: it keeps the gull's momentum. */
  poop(host: GullHost): void {
    if (!this.controlsEnabled || this.poopCooldown > 0 || this.mode === Mode.Tumble) return;
    if (this.payload <= 0) {
      host.onPayloadEmpty();
      return;
    }
    this.payload--;
    this.poopCooldown = this.profile.poopCooldown;
    const pos = add(this.pos, v3(0, 0, -0.25));
    let vel = add(this.vel, v3(0, 0, -1));
    if (this.mode === Mode.Ground || this.mode === Mode.Water) vel = add(scale(this.flatDir(), 0.6), v3(0, 0, -0.5));
    this.events.poop = true;
    host.spawnPoop(pos, vel);
  }

  private boundsStep(dt: number, world: World, host: GullHost): void {
    this.boundTimer = Math.max(0, this.boundTimer - dt);
    const b = world.bounds;
    const p = this.pos;
    if (p.e >= b.eMin && p.e <= b.eMax && p.n >= b.nMin && p.n <= b.nMax) return;
    const ce = (b.eMin + b.eMax) / 2;
    const cn = (b.nMin + b.nMax) / 2;
    const target = Math.atan2(ce - p.e, cn - p.n);
    this.yaw = lerpAngle(this.yaw, target, 1 - Math.exp(-1.6 * dt));
    if (this.mode === Mode.Ground || this.mode === Mode.Water) {
      p.e = Math.max(b.eMin, Math.min(b.eMax, p.e));
      p.n = Math.max(b.nMin, Math.min(b.nMax, p.n));
    }
    if (this.boundTimer <= 0) {
      this.boundTimer = 12;
      host.onOutOfBounds();
    }
  }

  /**
   * Where a poop released now would land (simulated), and the first target on its way if `target` says so. `target`
   * is given the time of flight so far (s), so that it can test moving targets where they will be.
   */
  predictDrop(world: World, target?: (a: V3, b: V3, t: number) => V3 | undefined): { point: V3; onTarget: boolean } | undefined {
    if (this.mode !== Mode.Air || this.payload <= 0) return undefined;
    let p = add(this.pos, v3(0, 0, -0.25));
    let v = add(this.vel, v3(0, 0, -1));
    const step = 0.06;
    for (let i = 0; i < 80; i++) {
      const nv = add(v, v3(0, 0, -POOP_GRAVITY * step));
      const np = add(p, scale(add(v, nv), 0.5 * step));
      const t = target?.(p, np, (i + 0.5) * step);
      if (t) return { point: t, onTarget: true };
      const hit = world.raycast(p, np);
      if (hit) return { point: hit.point, onTarget: false };
      p = np;
      v = nv;
    }
    return undefined;
  }
}

export const POOP_GRAVITY = 14;

function moveToward(a: number, b: number, d: number): number {
  return Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
