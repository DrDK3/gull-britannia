/**
 * An occupation soldier with a readable routine and suspicion.
 *
 * Suspicion only builds when a gull is *noteworthy* (near what he guards, carrying papers, or very close). An ordinary
 * gull on a roof is beneath his notice: to them you are just a gull.
 *
 * States: ROUTINE → SUSPICIOUS (?) → ALERT (!) → SEARCH at the last-seen spot → RETURN to the routine. Distractions (a
 * poop on his tunic or in his tea) send him away for a while. Loose mission papers are picked up and put back.
 *
 * Compass convention: yaw 0 faces north, π/2 east (clockwise from above). DOM-free.
 */
import type { Gull } from './gull';
import { Item, ItemState } from './items';
import { Rng } from './rng';
import { World, dist, lerpAngle, v3, type V3 } from './world';

export const GuardState = { Routine: 0, Suspicious: 1, Investigate: 2, Alert: 3, Search: 4, Return: 5, Distracted: 6, Recover: 7 } as const;
export type GuardStateId = (typeof GuardState)[keyof typeof GuardState];
export const GUARD_STATE_NAMES = ['routine', 'suspicious', 'investigating', 'alert', 'searching', 'returning', 'distracted', 'recovering'];

export const SUSPICIOUS_AT = 35;
export const ALERT_AT = 100;
/** Eye height above the ground (m). */
export const EYE_H = 1.75;

export type GuardAnim = 'idle' | 'sip' | 'outrage' | 'scrub' | 'shoo' | 'look_up' | 'look_around' | 'point' | 'throw' | 'salute' | 'march' | 'read' | 'attention';

export interface RoutineStep {
  e: number;
  n: number;
  yaw?: number;
  wait?: number;
  anim?: GuardAnim;
  say?: string;
}

export interface DistractionStep {
  e?: number;
  n?: number;
  /** Walking pace as a multiple of his walk. */
  speed?: number;
  yaw?: number;
  anim?: GuardAnim;
  wait?: number;
  say?: string;
  /** Busy: he barely notices anything (scrubbing, queueing for tea). */
  busy?: boolean;
}

export interface GuardHost {
  readonly gull: Gull;
  readonly world: World;
  readonly items: readonly Item[];
  /** The gull's beak (for "carrying papers"). */
  readonly beak: Item | undefined;
  readonly running: boolean;
  lineOfSight(a: V3, b: V3): boolean;
  noteworthiness(g: Guard, dist: number): number;
  onGuardAlert(g: Guard): void;
  onGuardState(g: Guard, prev: GuardStateId, now: GuardStateId): void;
  onTheftDiscovered(g: Guard): void;
  onItemRecovered(g: Guard): void;
  knockGull(from: V3, dir: V3, strength: number): void;
  spawnThrown(g: Guard, from: V3): void;
  sound(name: string, at?: V3, gain?: number): void;
}

const LINES: Record<string, string[]> = {
  suspicious: ['Hm?', 'That gull…', 'What are you looking at, bird?', 'Shoo. Shoo!'],
  alert: ['STOY! Halt, bird!', 'You! Seagull! Stop!', 'Thief! Feathered thief!', 'Comrades! A gull!'],
  search: ['Where did it go?', 'Come out, little capitalist.', 'I know you are up there.'],
  return: ['Just a gull.', 'Gulls. This whole town is gulls.', 'Back to post. Nothing to report.'],
  lost: ['…Gone.', 'It has the cunning of the bourgeoisie.'],
  theft: ['The dispatch! It’s GONE!', 'Who took the papers?!'],
  recover: ['What is this doing on the ground?', 'Papers do not walk.'],
};

export type GuardStyle = 'soldier' | 'officer' | 'cook' | 'sailor';

export class Guard {
  name: string;
  style: GuardStyle = 'soldier';
  routine: RoutineStep[] = [];
  routineText = '';
  area = { eMin: -1e4, eMax: 1e4, nMin: -1e4, nMax: 1e4 };
  viewRange = 24;
  fovDeg = 110;
  hearing = 3;
  walkSpeed = 1.8;
  runSpeed = 4.2;
  canThrow = true;
  lines: Record<string, string[]> = { ...LINES };
  distractions: Record<string, DistractionStep[]> = {};

  state: GuardStateId = GuardState.Routine;
  suspicion = 0;
  noticing = false;
  seesGull = false;
  lastSeen: V3 = v3();
  tagged = false;
  guardedItem: Item | undefined;
  postStep = 0;
  discoveredTheft = false;
  alarmTimer = 0;
  spottedEvents = 0;

  pos: V3 = v3();
  bodyYaw = 0;
  headYaw = 0;
  headPitch = 0;
  anim: GuardAnim = 'idle';
  moving = false;
  runningNow = false;
  /** Walk cycle (rad). */
  phase = 0;
  time = 0;
  /** Speech bubble. */
  speech: { text: string; t: number } | undefined;
  /** Tea mug in hand. */
  mugInHand = false;
  /** Carrying a recovered item (hand position for it). */
  carrying: Item | undefined;

  private step = 0;
  private stepTimer = 0;
  private arrived = false;
  private notSeen = 0;
  private searchTimer = 0;
  private searchPos: V3 = v3();
  private throwCd = 0;
  private swatCd = 0;
  private distSteps: DistractionStep[] = [];
  private distIndex = 0;
  private distTimer = 0;
  private distArrived = false;
  private distKind = '';
  private recoverItem: Item | undefined;
  private recoverPhase = 0;
  private checkTimer = 0;
  private priming = 1;
  private decayHold = 0;

  constructor(
    readonly id: string,
    name: string,
    private readonly host: GuardHost,
    private readonly rng: Rng,
  ) {
    this.name = name;
  }

  /** Put him at the first step of his routine. */
  place(): void {
    const first = this.routine[0];
    if (first) {
      this.pos = v3(first.e, first.n, this.ground(first.e, first.n));
      this.bodyYaw = first.yaw ?? 0;
      this.arrived = true;
    }
  }

  /** Where he stands, if not on the ground (a reviewing stand's deck). */
  groundOverride?: (e: number, n: number) => number;

  ground(e: number, n: number): number {
    return this.groundOverride ? this.groundOverride(e, n) : this.host.world.groundAt(e, n);
  }

  get stateName(): string {
    return GUARD_STATE_NAMES[this.state]!;
  }

  headPosition(): V3 {
    return v3(this.pos.e, this.pos.n, this.pos.h + EYE_H);
  }

  /** Where he looks, flat (compass yaw of body + head). */
  facingYaw(): number {
    return this.bodyYaw + this.headYaw;
  }

  facing(): V3 {
    const y = this.facingYaw();
    return v3(Math.sin(y), Math.cos(y), 0);
  }

  say(text: string, duration = 2.8): void {
    this.speech = { text, t: duration };
  }

  sayLine(kind: string): void {
    const arr = this.lines[kind];
    if (arr?.length) this.say(this.rng.pick(arr));
  }

  /** A poop hit this guard ("uniform") or his tea ("tea"). */
  onPooped(kind: string): void {
    if (this.state === GuardState.Alert || (this.suspicion >= 50 && this.noticing)) {
      this.suspicion = ALERT_AT;
      this.lastSeen = { ...this.host.gull.pos };
      this.say('You did that on PURPOSE!');
      this.enter(GuardState.Alert);
      return;
    }
    if (this.distractions[kind]) this.startDistraction(kind);
    else {
      this.say('Disgusting bird!');
      this.suspicion = Math.max(this.suspicion, 30);
    }
  }

  onNearMiss(splat: V3): void {
    if (this.state === GuardState.Routine || this.state === GuardState.Return) {
      this.suspicion = Math.max(this.suspicion, SUSPICIOUS_AT + 5);
      this.lastSeen = v3(splat.e, splat.n, splat.h + 5);
      this.say('Hm? …Birds.');
      this.enter(GuardState.Suspicious);
    }
  }

  startDistraction(kind: string): void {
    this.distSteps = this.distractions[kind] ?? [];
    this.distKind = kind;
    this.distIndex = 0;
    this.distTimer = 0;
    this.distArrived = false;
    this.suspicion = Math.min(this.suspicion, 20);
    this.enter(GuardState.Distracted);
  }

  isBusy(): boolean {
    if (this.state !== GuardState.Distracted || this.distIndex >= this.distSteps.length) return false;
    return !!this.distSteps[this.distIndex]!.busy && this.distArrived;
  }

  distractionKind(): string {
    return this.state === GuardState.Distracted ? this.distKind : '';
  }

  currentStep(): RoutineStep | undefined {
    return this.routine[this.step];
  }

  stepIndex(): number {
    return this.step;
  }

  /** Force the routine to a step (tests and mission scripting). */
  jumpToStep(i: number): void {
    this.step = i % this.routine.length;
    this.stepTimer = 0;
    const st = this.routine[this.step]!;
    this.pos = v3(st.e, st.n, this.ground(st.e, st.n));
    this.arrived = true;
    this.bodyYaw = st.yaw ?? this.bodyYaw;
    this.enter(GuardState.Routine);
  }

  // ------------------------------------------------------------------ simulation

  enter(s: GuardStateId): void {
    const prev = this.state;
    this.state = s;
    switch (s) {
      case GuardState.Suspicious:
        this.notSeen = 0;
        if (prev === GuardState.Routine || prev === GuardState.Return) {
          this.sayLine('suspicious');
          this.host.sound('huh', this.headPosition(), -2);
        }
        break;
      case GuardState.Alert:
        this.notSeen = 0;
        this.spottedEvents++;
        this.sayLine('alert');
        this.host.sound('whistle', this.headPosition(), 0);
        this.host.onGuardAlert(this);
        break;
      case GuardState.Search:
        this.searchTimer = 9;
        this.searchPos = { ...this.lastSeen };
        this.priming = 2;
        this.suspicion = Math.min(this.suspicion, 75);
        this.decayHold = 0;
        this.sayLine('search');
        break;
      case GuardState.Investigate:
        this.searchTimer = 5;
        this.searchPos = { ...this.lastSeen };
        this.suspicion = Math.min(this.suspicion, 80);
        break;
      case GuardState.Return:
        this.arrived = false;
        this.priming = 1;
        break;
      case GuardState.Routine:
        this.priming = 1;
        break;
    }
    if (prev !== s) this.host.onGuardState(this, prev, s);
  }

  update(dt: number): void {
    if (!this.host.running) return;
    this.time += dt;
    this.throwCd = Math.max(this.throwCd - dt, 0);
    this.swatCd = Math.max(this.swatCd - dt, 0);
    this.alarmTimer = Math.max(this.alarmTimer - dt, 0);
    if (this.speech) {
      this.speech.t -= dt;
      if (this.speech.t <= 0) this.speech = undefined;
    }
    this.moving = false;
    this.runningNow = false;
    this.perceive(dt);
    switch (this.state) {
      case GuardState.Routine:
        this.doRoutine(dt);
        if (this.suspicion >= SUSPICIOUS_AT) this.enter(GuardState.Suspicious);
        break;
      case GuardState.Suspicious:
        this.doSuspicious(dt);
        break;
      case GuardState.Investigate:
        this.doInvestigate(dt);
        break;
      case GuardState.Alert:
        this.doAlert(dt);
        break;
      case GuardState.Search:
        this.doSearch(dt);
        break;
      case GuardState.Return:
        this.doReturn(dt);
        break;
      case GuardState.Distracted:
        this.doDistracted(dt);
        break;
      case GuardState.Recover:
        this.doRecover(dt);
        break;
    }
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 0.3;
      this.checkItems();
    }
  }

  private perceive(dt: number): void {
    const g = this.host.gull;
    this.seesGull = false;
    this.noticing = false;
    const eye = this.headPosition();
    const gp = g.eye();
    const to = v3(gp.e - eye.e, gp.n - eye.n, gp.h - eye.h);
    const d = Math.hypot(to.e, to.n, to.h);
    const busy = this.isBusy();
    let senses = false;
    if (d < this.hearing && (g.speed() > 0.6 || g.flapping)) senses = true;
    else if (g.flapping && d < 6 && !busy) senses = true;
    else if (!busy) {
      const range = this.viewRange * (this.alarmTimer > 0 ? 1.25 : 1);
      if (d < range) {
        const flat = Math.hypot(to.e, to.n);
        const hang = flat > 0.05 ? (Math.abs(wrap(Math.atan2(to.e, to.n) - this.facingYaw())) * 180) / Math.PI : 0;
        const vang = (Math.atan2(to.h, Math.max(flat, 0.01)) * 180) / Math.PI;
        let upLim = 30 + (this.headPitch * 180) / Math.PI;
        const s = this.state;
        if (s === GuardState.Alert || s === GuardState.Search || s === GuardState.Investigate || s === GuardState.Suspicious || this.alarmTimer > 0) upLim += 40;
        if (this.anim === 'look_up') upLim += 40;
        if (hang < this.fovDeg * 0.5 && vang < upLim && vang > -70) senses = this.host.lineOfSight(eye, gp);
      }
    }
    this.seesGull = senses;
    if (!senses) return;
    let note = this.host.noteworthiness(this, d);
    if (this.alarmTimer > 0 && d < 18) note = Math.max(note, 0.45);
    if (note <= 0) return;
    this.noticing = true;
    this.lastSeen = { ...g.pos };
    const t = lerp(0.75, 3.4, clamp(d / this.viewRange, 0, 1));
    let gain = ((note * 100) / t) * this.priming;
    if (busy) gain *= 0.3;
    this.suspicion = Math.min(this.suspicion + gain * dt, ALERT_AT);
    this.decayHold = 1.2;
  }

  private decay(dt: number, rate: number, floor = 0): void {
    if (this.noticing) return;
    if (this.decayHold > 0) {
      this.decayHold -= dt;
      return;
    }
    this.suspicion = Math.max(this.suspicion - rate * dt, floor);
  }

  private faceToward(t: { e: number; n: number }, dt: number, rate = 5): void {
    const de = t.e - this.pos.e;
    const dn = t.n - this.pos.n;
    if (Math.hypot(de, dn) < 0.05) return;
    this.bodyYaw = lerpAngle(this.bodyYaw, Math.atan2(de, dn), 1 - Math.exp(-rate * dt));
  }

  private faceYaw(want: number, dt: number, rate = 4): void {
    this.bodyYaw = lerpAngle(this.bodyYaw, want, 1 - Math.exp(-rate * dt));
  }

  /** Walk toward (e, n); true when there. */
  private moveTo(t: { e: number; n: number }, spd: number, dt: number): boolean {
    const de = t.e - this.pos.e;
    const dn = t.n - this.pos.n;
    const d = Math.hypot(de, dn);
    if (d < 0.2) return true;
    const step = Math.min(spd * dt, d);
    this.pos.e += (de / d) * step;
    this.pos.n += (dn / d) * step;
    this.pos.h = this.ground(this.pos.e, this.pos.n);
    this.faceToward(t, dt, 7);
    this.moving = true;
    this.runningNow = spd > this.walkSpeed * 1.3;
    this.phase += dt * spd * 3.6;
    return false;
  }

  private doRoutine(dt: number): void {
    this.decay(dt, 12);
    if (!this.routine.length) return;
    const st = this.routine[this.step]!;
    if (!this.arrived) {
      this.anim = 'idle';
      if (this.moveTo(st, this.walkSpeed, dt)) {
        this.arrived = true;
        this.stepTimer = 0;
        if (st.say && this.rng.next() < 0.85) this.say(st.say);
      }
    } else {
      this.faceYaw(st.yaw ?? this.bodyYaw, dt);
      this.anim = st.anim ?? 'idle';
      this.mugInHand = this.anim === 'sip';
      this.stepTimer += dt;
      if (this.stepTimer >= (st.wait ?? 3)) {
        this.step = (this.step + 1) % this.routine.length;
        this.arrived = false;
        this.mugInHand = false;
      }
    }
    this.headPitch = lerp(this.headPitch, 0, dt * 3);
    this.headYaw = lerp(this.headYaw, 0, dt * 3);
  }

  private doSuspicious(dt: number): void {
    this.anim = 'idle';
    this.mugInHand = false;
    this.faceToward(this.lastSeen, dt, 4);
    this.lookAtPoint(this.lastSeen, dt);
    if (this.suspicion >= ALERT_AT) {
      this.enter(GuardState.Alert);
      return;
    }
    if (this.noticing) {
      this.notSeen = 0;
      if (dist(this.pos, this.host.gull.pos) < 4) this.anim = 'shoo';
      return;
    }
    this.notSeen += dt;
    this.decay(dt, 9);
    if (this.suspicion < 20) {
      this.sayLine('return');
      this.enter(GuardState.Return);
    } else if (this.notSeen > 2.2) this.enter(GuardState.Investigate);
  }

  private doInvestigate(dt: number): void {
    this.decay(dt, 6);
    const target = this.clampArea(this.searchPos);
    if (this.moveTo(target, this.walkSpeed * 1.15, dt)) {
      this.anim = 'look_up';
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.sayLine('return');
        this.enter(GuardState.Return);
      }
    } else {
      this.anim = 'idle';
      this.headPitch = lerp(this.headPitch, 0.35, dt * 2);
    }
    if (this.suspicion >= ALERT_AT) this.enter(GuardState.Alert);
  }

  private doAlert(dt: number): void {
    const g = this.host.gull;
    if (this.noticing) {
      this.notSeen = 0;
      this.suspicion = ALERT_AT;
    } else this.notSeen += dt;
    const gp = g.pos;
    const d = dist(this.pos, gp);
    const flat = Math.hypot(this.pos.e - gp.e, this.pos.n - gp.n);
    this.lookAtPoint(this.noticing ? gp : this.lastSeen, dt);
    const target = this.clampArea(this.lastSeen);
    if (flat > 2.2) this.moveTo(target, this.runSpeed, dt);
    else this.faceToward(gp, dt, 8);
    this.anim = 'point';
    if (d < 1.9 && this.swatCd <= 0 && this.noticing) {
      this.swatCd = 1.6;
      this.anim = 'shoo';
      this.host.knockGull(this.pos, v3(gp.e - this.pos.e, gp.n - this.pos.n, gp.h - this.pos.h), 6.5);
    } else if (this.canThrow && this.noticing && this.throwCd <= 0 && d < 14 && d > 2.5 && gp.h - this.pos.h < 10) {
      this.throwCd = 2.8;
      this.anim = 'throw';
      this.host.sound('throw', this.headPosition(), -2);
      this.host.spawnThrown(this, v3(this.pos.e, this.pos.n, this.pos.h + EYE_H + 0.3));
    }
    if (this.notSeen > 2) {
      this.sayLine('lost');
      this.enter(GuardState.Search);
    }
  }

  private doSearch(dt: number): void {
    this.decay(dt, 5, 40);
    const target = this.clampArea(this.searchPos);
    if (this.moveTo(target, this.walkSpeed * 1.3, dt)) {
      this.anim = 'look_around';
      this.searchTimer -= dt;
    } else {
      this.anim = 'idle';
      this.headPitch = lerp(this.headPitch, 0.4, dt * 2);
    }
    if (this.suspicion >= ALERT_AT) {
      this.enter(GuardState.Alert);
      return;
    }
    if (this.searchTimer <= 0) {
      this.suspicion = Math.min(this.suspicion, 45);
      this.sayLine('return');
      this.enter(GuardState.Return);
    }
  }

  private doReturn(dt: number): void {
    this.decay(dt, 10);
    this.anim = 'idle';
    this.headPitch = lerp(this.headPitch, 0, dt * 2);
    this.headYaw = lerp(this.headYaw, 0, dt * 2);
    if (this.suspicion >= SUSPICIOUS_AT + 10 && this.noticing) {
      this.enter(GuardState.Suspicious);
      return;
    }
    if (!this.routine.length) {
      this.enter(GuardState.Routine);
      return;
    }
    const st = this.routine[this.step]!;
    if (this.moveTo(st, this.walkSpeed, dt)) {
      this.arrived = true;
      this.stepTimer = 0;
      this.enter(GuardState.Routine);
    }
  }

  private doDistracted(dt: number): void {
    this.decay(dt, 15);
    if (this.suspicion >= ALERT_AT) {
      this.enter(GuardState.Alert);
      return;
    }
    if (this.distIndex >= this.distSteps.length) {
      this.enter(GuardState.Return);
      return;
    }
    const st = this.distSteps[this.distIndex]!;
    if (!this.distArrived) {
      this.anim = 'idle';
      const spd = this.walkSpeed * (st.speed ?? 1.2);
      if (st.e === undefined || st.n === undefined || this.moveTo({ e: st.e, n: st.n }, spd, dt)) {
        this.distArrived = true;
        this.distTimer = 0;
        if (st.say) this.say(st.say, 3);
      }
    } else {
      if (st.yaw !== undefined) this.faceYaw(st.yaw, dt);
      this.anim = st.anim ?? 'idle';
      this.mugInHand = this.anim === 'sip';
      this.distTimer += dt;
      if (this.distTimer >= (st.wait ?? 1)) {
        this.distIndex++;
        this.distArrived = false;
        this.mugInHand = false;
      }
    }
  }

  private doRecover(dt: number): void {
    this.decay(dt, 8);
    const it = this.recoverItem;
    if (!it) {
      this.enter(GuardState.Return);
      return;
    }
    if (this.recoverPhase === 0) {
      if (it.state !== ItemState.Loose) {
        this.recoverItem = undefined;
        this.enter(GuardState.Return);
        return;
      }
      this.anim = 'idle';
      if (this.moveTo(it.pos, this.walkSpeed * 1.4, dt)) {
        it.pickUpByGuard();
        this.carrying = it;
        this.sayLine('recover');
        this.recoverPhase = 1;
      }
    } else {
      const home = it.home.pos;
      const away = Math.hypot(this.pos.e - home.e, this.pos.n - home.n) || 1;
      const stand = { e: home.e + ((this.pos.e - home.e) / away) * 0.9, n: home.n + ((this.pos.n - home.n) / away) * 0.9 };
      if (this.moveTo(stand, this.walkSpeed, dt)) {
        it.placeHome();
        this.carrying = undefined;
        this.recoverItem = undefined;
        this.suspicion = Math.max(this.suspicion, 45);
        this.host.onItemRecovered(this);
        this.step = this.postStep;
        this.arrived = false;
        this.enter(GuardState.Return);
      }
    }
    if (this.suspicion >= ALERT_AT) {
      if (this.recoverItem && this.recoverPhase === 1) {
        this.recoverItem.placeHome();
        this.carrying = undefined;
        this.recoverItem = undefined;
      }
      this.enter(GuardState.Alert);
    }
  }

  /** Where his right hand is (a carried item or his mug). */
  handPosition(): V3 {
    const y = this.bodyYaw;
    const side = v3(Math.cos(y), -Math.sin(y), 0);
    return v3(this.pos.e + side.e * 0.25 + Math.sin(y) * 0.25, this.pos.n + side.n * 0.25 + Math.cos(y) * 0.25, this.pos.h + 1.05);
  }

  private lookAtPoint(p: V3, dt: number): void {
    const eye = this.headPosition();
    const flat = Math.hypot(p.e - eye.e, p.n - eye.n);
    const want = clamp(Math.atan2(p.h - eye.h, Math.max(flat, 0.1)), -0.6, 0.9);
    this.headPitch = lerp(this.headPitch, want, 1 - Math.exp(-5 * dt));
    this.headYaw = lerp(this.headYaw, 0, dt * 4);
  }

  private clampArea(p: V3): { e: number; n: number } {
    return { e: clamp(p.e, this.area.eMin, this.area.eMax), n: clamp(p.n, this.area.nMin, this.area.nMax) };
  }

  private checkItems(): void {
    const s = this.state;
    if (s === GuardState.Alert || s === GuardState.Recover || s === GuardState.Distracted) return;
    const eye = this.headPosition();
    const half = this.fovDeg * 0.5;
    const inView = (p: V3) => {
      const de = p.e - eye.e;
      const dn = p.n - eye.n;
      return Math.hypot(de, dn) < 1.5 || (Math.abs(wrap(Math.atan2(de, dn) - this.facingYaw())) * 180) / Math.PI < half;
    };
    // Loose papers get tidied away.
    for (const it of this.host.items) {
      if (!it.isMission || it.state !== ItemState.Loose || it.onWater) continue;
      if (dist(eye, it.pos) > 16 || !inView(it.pos)) continue;
      if (!this.host.lineOfSight(eye, v3(it.pos.e, it.pos.n, it.pos.h + 0.2))) continue;
      this.recoverItem = it;
      this.recoverPhase = 0;
      this.enter(GuardState.Recover);
      return;
    }
    // Has the thing he guards gone missing?
    const gi = this.guardedItem;
    if (gi && !this.discoveredTheft && (s === GuardState.Routine || s === GuardState.Return || s === GuardState.Suspicious || s === GuardState.Investigate)) {
      if (gi.state !== ItemState.Placed && gi.state !== ItemState.CarriedByGuard) {
        const home = gi.home.pos;
        if (dist(eye, home) < 13 && inView(home) && this.host.lineOfSight(eye, v3(home.e, home.n, home.h + 0.3))) {
          this.discoveredTheft = true;
          this.alarmTimer = 35;
          this.sayLine('theft');
          this.host.sound('whistle', this.headPosition(), 2);
          this.lastSeen = v3(home.e, home.n, home.h + 4);
          this.suspicion = Math.max(this.suspicion, 60);
          this.host.onTheftDiscovered(this);
          this.enter(GuardState.Search);
        }
      }
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
