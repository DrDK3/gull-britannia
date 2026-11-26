/**
 * A mission: objectives, scoring, the beak slot, poop resolution, guard callbacks, scouting and tagging, and the
 * performance review. Concrete missions override the `setup`, `onStart`, `tick` and `on*` hooks.
 *
 * Everything that the view or the sound needs to hear about (Mother on the radio, a toast, a banner, a sound, a splat)
 * is queued in `events` for the controller to drain each frame. DOM-free.
 */
import type { ActionId } from './actions';
import { ALERT_LEVEL_NAMES, AlertLadder, HEAT, type AlertIncident, type AlertLevelId } from './alert';
import { AmbientFlock, type AmbientGull } from './ambient';
import { BENEATH_NOTICE, JUST_A_GULL, NOTE_PER_CONSPICUOUS, STARE_DIST, conspicuousLevel, conspicuousness, type Conspicuousness, type GullFacts } from './conspicuous';
import { DROP_IMPACT, Gull, Mode, POOP_GRAVITY, type GullControls, type GullHost, type GullProfile, type Perch } from './gull';
import { FLAP_HEARING, Guard, GuardState, gullNoise, type GuardHost, type GuardStateId, type NoiseKind } from './guard';
import { Item, ItemState, type ItemKind } from './items';
import type { AllyGull, Marcher } from './parade';
import { Rng } from './rng';
import { CLEAN_ESCAPE_POINTS, ORDNANCE_CAP, STEALTH_POINTS, approachOf, hitsOnTarget, ordnanceScore, type Approach } from './scoring';
import { World, add, closestOnSegment, dist, dist2d, scale, v3, type Solid, type V3 } from './world';

export type Tone = 'good' | 'food' | 'warn' | 'bad' | 'info';

/** The day an operation happens on: its clock, wind, tide and sky. The controller builds the scene's weather from it. */
export interface MissionConditions {
  /** When the operation starts (ISO, UTC). */
  startTime: string;
  windKn: number;
  /** Where the wind blows from (degrees true). */
  windFromDeg: number;
  /** A high water near the start, and the heights of high and low water that day (m above chart datum). */
  hwTime: string;
  hwHeightM: number;
  lwHeightM: number;
  sky: 'clear' | 'fair' | 'hazy' | 'overcast';
}

export type MissionEvent =
  | { type: 'radio'; speaker: string; text: string; dur: number }
  | { type: 'toast'; text: string; tone: Tone }
  | { type: 'banner'; text: string; tone: Tone; dur: number }
  | { type: 'sfx'; name: string; at?: V3; gain?: number; rate?: number }
  | { type: 'loop'; name: string; on: boolean; gain?: number }
  | { type: 'music'; name: string }
  | { type: 'splat'; at: V3; normal: V3; size: number; guard?: string }
  | { type: 'finished'; results: Results };

export type ObjectiveState = 'active' | 'hidden' | 'done' | 'failed';

export interface Objective {
  id: string;
  text: string;
  target?: V3 | (() => V3 | undefined);
  optional: boolean;
  state: ObjectiveState;
}

export interface DropPoint {
  id: string;
  label: string;
  /** Item kinds accepted, or 'food' for any food. */
  accepts: (ItemKind | 'food')[];
  pos: V3;
  radius: number;
  style: 'nest' | 'lobster_pot';
  deposited: Item[];
}

export interface PoopTarget {
  kind: 'guard' | 'tea' | 'soldier' | 'officer' | 'stand';
  radius: number;
  pos: () => V3;
  /** How it is moving (m/s), if it is: a falling drop is tested against where it will be. */
  vel?: () => V3;
  active?: () => boolean;
  guard?: Guard;
  /** Any object the mission wants back in `onTargetHit`. */
  owner?: unknown;
}

/** A thing in the world the view draws: tables, barrels, boats, lamps. Floating ones rise and fall with the tide. */
export interface Prop {
  id: string;
  kind: string;
  pos: V3;
  yaw: number;
  /** Height above the water (m) for a floating prop; its pos.h follows the tide. */
  float?: number;
  visible?: boolean;
  /** Prop-specific state for the view (a spilled mug, a lid open…). */
  data?: Record<string, unknown>;
  /** Solids that move with it (offsets from pos for floating props). */
  solids?: { solid: Solid; dh0: number; dh1: number }[];
}

/** A person who is not a guard (a clerk eating chips, a cook). */
export interface Npc {
  id: string;
  style: 'civilian' | 'cook' | 'officer' | 'soldier' | 'sailor';
  pos: V3;
  yaw: number;
  anim: string;
  headYaw: number;
  headPitch: number;
  phase: number;
  moving: boolean;
  speech?: { text: string; t: number };
}

export interface Poop {
  pos: V3;
  vel: V3;
  releaseH: number;
  fromFlock: boolean;
  life: number;
}

export interface Thrown {
  pos: V3;
  vel: V3;
  life: number;
  spin: number;
  landed: boolean;
}

export interface Results {
  missionId: string;
  title: string;
  lines: [string, number][];
  total: number;
  grade: string;
  gradeTitle: string;
  remarks: string[];
  time: number;
  stats: MissionStats;
  debrief: string;
  /** 'compromised': the operation was lost (never the operative). The review says so and offers another go. */
  outcome: 'complete' | 'compromised';
  /** How the job was done, when it was done: Ghost, Saboteur, Shadow or Hooligan. */
  approach?: Approach;
  /** The highest the alert ladder went: 'calm', 'suspicious', 'searching' or 'alarmed'. */
  alertPeak: string;
}

/**
 * A mission's stealth script, kept in a file of its own beside the mission (m1watch.ts): the extra watchers, the
 * clock, and what each rung of the alert ladder does to the level. The mission installs one in `setup`
 * (`this.director = …`) and the base class calls it.
 */
export interface StealthDirector {
  tick?(dt: number): void;
  onAlertLevel?(level: AlertLevelId, prev: AlertLevelId): void;
  onAlertTop?(): void;
  onItemUncovered?(it: Item): void;
  /** The debrief and the Committee's remarks when the operation was compromised. */
  compromisedDebrief?(): string;
  compromisedRemarks?(): string[];
}

/** A clock from the fiction: something happens at `at` seconds of mission time (the courier is back from lunch). */
export interface Deadline {
  /** What the clock is, for a HUD label: "Courier back". */
  label: string;
  /** The time by the town's clocks when it happens: "13.30". */
  clock: string;
  /** Mission time (s) when it happens. A director may bring it forward. */
  at: number;
}

/** Someone who may be taking an interest in the gull: where he is from the gull, and how much he cares. */
export interface Noticer {
  id: string;
  name: string;
  /** Compass bearing from the gull to him (rad, 0 north, clockwise). */
  bearing: number;
  /** The same, from the way the gull is looking: 0 dead ahead, > 0 to the right, ±π behind. */
  relBearing: number;
  distance: number;
  /** 0 (no interest) to 1 (an alert). */
  strength: number;
  /** He can see or hear the gull now. */
  sees: boolean;
  /** He is taking an interest now: his suspicion is rising. */
  noticing: boolean;
  /** 'routine', 'suspicious', 'alert'… (GUARD_STATE_NAMES). */
  state: string;
  civilian: boolean;
}

/** A sound someone made, for the view to draw as a ring while it is fresh. */
export interface Noise {
  at: V3;
  radius: number;
  kind: NoiseKind;
  /** Seconds since it was made. */
  age: number;
}

export interface MissionStats {
  food: { kind: ItemKind; name: string; points: number; bonus: number; bonusName: string; how: 'eaten' | 'stashed'; pantry: number }[];
  drops: number;
  hits: number;
  guardHits: number;
  teaHits: number;
  targetHits: Record<string, number>;
  longDrops: number;
  spotted: number;
  tumbles: number;
  knocked: number;
  carryingSeen: boolean;
  theftDiscovered: boolean;
  cleanEscape: boolean;
  itemsSetDown: number;
  tagged: number;
  nearMisses: number;
  recoveredByGuard: number;
  flockHits: number;
  /** Hits by target (a guard's id, 'tea:<guard>', a marcher's id): repeats on one target are worth less. */
  hitsByTarget: Record<string, number>;
  /** First hits on a target from a long way up. */
  longFirstHits: number;
  /** Hits on the people watching, and on their tea. */
  watcherHits: number;
  /** Times a soldier wondered about the gull (the question mark). */
  questions: number;
  /** Times a civilian shouted at it. */
  shouts: number;
  /** Long calls given. */
  calls: number;
  /** The highest the alert ladder went (0 calm … 3 alarmed). */
  alertPeak: number;
}

/** Hovering: in the air and slower than this (m/s), no more than this far above a cordon's top (m). */
const HOVER_SPEED = 6;
const HOVER_ABOVE = 9;
/** Sitting about counts as loitering this near a cordon's middle, or a soldier on duty (m). */
const LOITER_NEAR_ZONE = 14;
const LOITER_NEAR_GUARD = 12;
const GRAB_RANGE_GROUND = 1.5;
const GRAB_RANGE_AIR = 2.6;
const PROMPT_RANGE = 4.5;

export type GradeBand = [number, string, string];

export abstract class Mission implements GullHost, GuardHost {
  id = 'm0';
  title = 'Mission';
  parTime = 300;
  readonly gull = new Gull();
  readonly rng: Rng;
  guards: Guard[] = [];
  items: Item[] = [];
  perches: Perch[] = [];
  drops: DropPoint[] = [];
  targets: PoopTarget[] = [];
  objectives: Objective[] = [];
  /** Cordons: a gull inside one is noteworthy to any guard who sees it. `label` is what it guards ("the table"). */
  restricted: { e: number; n: number; h: number; radius: number; height: number; label?: string }[] = [];
  props: Prop[] = [];
  npcs: Npc[] = [];
  /** Soldiers on parade (Mission 2). */
  marchers: Marcher[] = [];
  /** The Bomber Wing (Mission 2). */
  allies: AllyGull[] = [];
  /** The town's other gulls: the flock moves them, the view draws whatever is in `ambient` (the same birds). */
  readonly flock: AmbientFlock;
  ambient: AmbientGull[];
  /** The garrison's memory of the gull: calm, suspicious, searching, alarmed (alert.ts). */
  readonly alert = new AlertLadder();
  /** How much Scrumpy stands out from the other gulls now, 0 to 1, and the main reason as a short phrase. */
  conspicuousness = 0;
  conspicuousReason = JUST_A_GULL;
  /** Everyone who might take an interest, with bearing and strength: for the HUD's who-is-noticing-me. */
  noticers: Noticer[] = [];
  /** Sounds made in the last second or two (a shout, a whistle, a long call). */
  noises: Noise[] = [];
  /** How far off the gull's wings can be heard now (m): 0 on a glide. */
  noiseRadius = 0;
  /** Gulls near Scrumpy doing what Scrumpy is doing. */
  company = 0;
  /** Seconds Scrumpy has sat alone near something guarded. */
  loiter = 0;
  outcome: 'complete' | 'compromised' = 'complete';
  /** The mission's stealth script, if it has one. */
  director: StealthDirector | undefined;
  /** A clock from the fiction, if the mission has one: the HUD may show `deadlineLeft`. */
  deadline: Deadline | undefined;
  /** The most a payload can earn in this operation (scoring.ts). */
  ordnanceCap = ORDNANCE_CAP;
  poops: Poop[] = [];
  thrown: Thrown[] = [];
  events: MissionEvent[] = [];
  running = false;
  completed = false;
  /** Set once the review has been sent. */
  finished = false;
  elapsed = 0;
  tension = 0;
  beak: Item | undefined;
  stats: MissionStats = {
    food: [],
    drops: 0,
    hits: 0,
    guardHits: 0,
    teaHits: 0,
    targetHits: {},
    longDrops: 0,
    spotted: 0,
    tumbles: 0,
    knocked: 0,
    carryingSeen: false,
    theftDiscovered: false,
    cleanEscape: true,
    itemsSetDown: 0,
    tagged: 0,
    nearMisses: 0,
    recoveredByGuard: 0,
    flockHits: 0,
    hitsByTarget: {},
    longFirstHits: 0,
    watcherHits: 0,
    questions: 0,
    shouts: 0,
    calls: 0,
    alertPeak: 0,
  };

  private grabBuffer = 0;
  private lastSetDown: Item | undefined;
  private setDownTimer = 0;
  private eatingItem: Item | undefined;
  private readonly tagProgress = new Map<Guard, number>();
  private readonly said = new Set<string>();
  private finishTimer = -1;
  private tensionHold = 0;
  private readonly timers: { t: number; fn: () => void }[] = [];
  private itemSeq = 0;
  private callHeat = 0;
  private callCooldown = 0;
  private thievingTimer = 0;
  private topHandled = false;

  constructor(
    readonly world: World,
    seed = 1967,
  ) {
    this.rng = new Rng(seed);
    this.flock = new AmbientFlock(seed);
    this.ambient = this.flock.gulls;
  }

  /** Build the mission (call once, after construction). */
  init(): this {
    this.setup();
    return this;
  }

  // ------------------------------------------------------------------ hooks for concrete missions

  protected abstract setup(): void;
  protected onStart(): void {}
  protected tick(_dt: number): void {}
  protected onItemGrabbed(_it: Item): void {}
  protected onItemDelivered(_it: Item, _d: DropPoint): void {}
  protected onFoodSecured(_it: Item, _how: string): void {}
  protected onTargetHit(_t: PoopTarget, _p: Poop): void {}
  protected onSplat(_at: V3): void {}
  protected onTagged(_g: Guard): void {}
  protected onPerchedHook(_p: Perch): void {}
  /** G: signal (Mission 2's flock). True if it did something; otherwise the gull gives a long call. */
  protected onSignal(): boolean {
    return false;
  }
  /** The alert ladder moved from `prev` to `level`: change the level to match. */
  protected onAlertLevel(level: AlertLevelId, prev: AlertLevelId): void {
    this.director?.onAlertLevel?.(level, prev);
  }
  /** The alert ladder reached the top (once). */
  protected onAlertTop(): void {
    this.director?.onAlertTop?.();
  }
  /** A covered item had its weight knocked off. */
  protected onItemUncovered(it: Item): void {
    this.director?.onItemUncovered?.(it);
  }

  /** Seconds until the mission's clock runs out, or undefined if it has none. */
  get deadlineLeft(): number | undefined {
    return this.deadline ? Math.max(this.deadline.at - this.elapsed, 0) : undefined;
  }
  protected resultLines(): [string, number][] {
    return [];
  }
  protected remarks(): string[] {
    return [];
  }
  /** True once the operation's main goal is achieved (gates the stealth, escape and time bonuses). */
  primaryDone(): boolean {
    return this.completed;
  }
  debriefText(): string {
    return '';
  }
  gradeBands(): GradeBand[] {
    return [
      [1450, 'A+', 'Distinguished Gull Cross'],
      [1250, 'A', 'Exemplary'],
      [850, 'B', 'Satisfactory'],
      [550, 'C', 'Adequate, with Reservations'],
      [0, 'D', 'Under Review'],
    ];
  }

  // ------------------------------------------------------------------ construction helpers

  spawnGull(pos: V3, yaw: number, profile?: Partial<GullProfile>): void {
    this.gull.controlsEnabled = false;
    if (profile) this.gull.setProfile(profile);
    this.gull.spawn(pos, yaw);
  }

  addPerch(id: string, pos: V3, name: string, hint = ''): Perch {
    const p: Perch = { id, name, hint, pos: { ...pos } };
    this.perches.push(p);
    return p;
  }

  addItem(kind: ItemKind, pos: V3, yaw = 0, label = ''): Item {
    const it = new Item(`${kind}-${++this.itemSeq}`, kind, pos, yaw, label);
    this.items.push(it);
    return it;
  }

  addDrop(id: string, pos: V3, label: string, accepts: DropPoint['accepts'], style: DropPoint['style'], radius = 2.4): DropPoint {
    const d: DropPoint = { id, label, accepts, pos: { ...pos }, radius, style, deposited: [] };
    this.drops.push(d);
    return d;
  }

  addGuard(g: Guard): Guard {
    this.guards.push(g);
    g.place();
    this.targets.push({ kind: 'guard', radius: 0.62, pos: () => v3(g.pos.e, g.pos.n, g.pos.h + 1.72), guard: g, owner: g });
    this.targets.push({ kind: 'guard', radius: 0.45, pos: () => v3(g.pos.e, g.pos.n, g.pos.h + 1.25), guard: g, owner: g });
    return g;
  }

  addTarget(t: PoopTarget): PoopTarget {
    this.targets.push(t);
    return t;
  }

  addProp(p: Prop): Prop {
    this.props.push(p);
    if (p.solids) for (const s of p.solids) this.world.addSolid(s.solid);
    return p;
  }

  /** A box solid (centre, half sizes along its own axes, yaw from east anticlockwise as world.ts). */
  box(e: number, n: number, yaw: number, hx: number, hy: number, h0: number, h1: number, tag?: string): Solid {
    return { kind: 'box', e, n, yaw, hx, hy, h0, h1, tag };
  }

  cyl(e: number, n: number, r: number, h0: number, h1: number, tag?: string): Solid {
    return { kind: 'cyl', e, n, r, h0, h1, tag };
  }

  // ------------------------------------------------------------------ objectives and messages

  addObjective(id: string, text: string, target?: Objective['target'], optional = false, state: ObjectiveState = 'active'): void {
    this.objectives.push({ id, text, target, optional, state });
  }

  objective(id: string): Objective | undefined {
    return this.objectives.find((o) => o.id === id);
  }

  objectiveState(id: string): ObjectiveState | '' {
    return this.objective(id)?.state ?? '';
  }

  setObjective(id: string, state: ObjectiveState, text?: string): void {
    const o = this.objective(id);
    if (!o) return;
    o.state = state;
    if (text) o.text = text;
  }

  completeObjective(id: string): void {
    const o = this.objective(id);
    if (!o || o.state === 'done') return;
    o.state = 'done';
    this.sfx('objective', undefined, -3);
    this.toast(`Done: ${o.text.split('[')[0]!.split('(')[0]!.trim()}`, 'good');
  }

  setObjectiveTarget(id: string, target: Objective['target']): void {
    const o = this.objective(id);
    if (o) o.target = target;
  }

  /** Where the first active, non-optional objective with a target is (for the HUD marker). */
  currentTarget(): V3 | undefined {
    for (const o of this.objectives) {
      if (o.state !== 'active' || o.optional || !o.target) continue;
      const t = typeof o.target === 'function' ? o.target() : o.target;
      if (t) return t;
    }
    return undefined;
  }

  say(speaker: string, text: string, dur = 5): void {
    this.events.push({ type: 'radio', speaker, text, dur });
  }

  sayOnce(key: string, speaker: string, text: string, dur = 5): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.say(speaker, text, dur);
  }

  hasSaid(key: string): boolean {
    return this.said.has(key);
  }

  toast(text: string, tone: Tone = 'info'): void {
    this.events.push({ type: 'toast', text, tone });
  }

  banner(text: string, tone: Tone, dur = 2): void {
    this.events.push({ type: 'banner', text, tone, dur });
  }

  sfx(name: string, at?: V3, gain?: number, rate?: number): void {
    this.events.push({ type: 'sfx', name, at, gain, rate });
  }

  sound(name: string, at?: V3, gain?: number): void {
    this.sfx(name, at, gain);
  }

  music(name: string): void {
    this.events.push({ type: 'music', name });
  }

  /** Run `fn` after `t` seconds of mission time (while running). */
  after(t: number, fn: () => void): void {
    this.timers.push({ t, fn });
  }

  // ------------------------------------------------------------------ main loop

  start(): void {
    this.running = true;
    this.gull.controlsEnabled = true;
    this.events.push({ type: 'loop', name: 'water', on: true, gain: -17 });
    this.onStart();
  }

  /** One fixed step. `poop` is the poop button held. */
  step(dt: number, c: GullControls, poop = false): void {
    this.updateFloating();
    this.gull.step(dt, c, this.world, this);
    this.flock.update(dt);
    if (!this.running) {
      this.stepItems(dt);
      return;
    }
    this.elapsed += dt;
    if (poop) this.gull.poop(this);
    // A long call, if the flight model reports one of its own (G also gives one: see signal).
    const called = this.gull.events as { longCall?: boolean; call?: boolean };
    if (called.longCall || called.call) this.longCall();
    this.setDownTimer = Math.max(this.setDownTimer - dt, 0);
    if (this.grabBuffer > 0) {
      this.grabBuffer -= dt;
      if (!this.beak) {
        const it = this.findGrabbable();
        if (it) {
          this.grab(it);
          this.grabBuffer = 0;
        }
      }
    }
    if (this.eatingItem && this.gull.eatingTimer <= 0) this.finishEating();
    for (const g of this.guards) g.update(dt);
    this.stepItems(dt);
    this.stepPoops(dt);
    this.stepThrown(dt);
    this.updateTagging(dt);
    this.updateTension(dt);
    this.updateStealth(dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i]!;
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        if (this.running) tm.fn();
      }
    }
    for (const n of this.npcs) {
      if (n.speech) {
        n.speech.t -= dt;
        if (n.speech.t <= 0) n.speech = undefined;
      }
    }
    this.director?.tick?.(dt);
    this.tick(dt);
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.finish();
    }
  }

  /** Floating props and their solids and perches follow the tide. */
  protected updateFloating(): void {
    const wl = this.world.waterLevel;
    for (const p of this.props) {
      if (p.float === undefined) continue;
      const h = wl + p.float;
      const dh = h - p.pos.h;
      if (Math.abs(dh) < 1e-4) continue;
      p.pos.h = h;
      for (const s of p.solids ?? []) {
        s.solid.h0 = h + s.dh0;
        s.solid.h1 = h + s.dh1;
      }
      for (const per of this.perches) if (per.id.startsWith(`${p.id}:`)) per.pos.h += dh;
      for (const d of this.drops) if (d.id.startsWith(`${p.id}:`)) d.pos.h += dh;
      for (const it of this.items) if (it.state === ItemState.Placed && it.id.startsWith(`${p.id}:`)) it.pos.h += dh;
    }
  }

  /** Where the gull holds a thing: just ahead of and below its eye. */
  beakPosition(): { pos: V3; yaw: number } {
    const g = this.gull;
    const f = g.flatDir();
    return { pos: v3(g.pos.e + f.e * 0.28, g.pos.n + f.n * 0.28, g.pos.h - (g.isAirborne() ? 0.12 : 0.02)), yaw: g.yaw };
  }

  private stepItems(dt: number): void {
    for (const it of this.items) {
      if (it.state === ItemState.Held) it.step(dt, this.world, this.beakPosition());
      else if (it.state === ItemState.CarriedByGuard) {
        const g = this.guards.find((x) => x.carrying === it);
        it.step(dt, this.world, g ? { pos: g.handPosition(), yaw: g.bodyYaw } : undefined);
      } else it.step(dt, this.world);
    }
  }

  private updateTension(dt: number): void {
    let t = 0;
    for (const g of this.guards) {
      if (g.civilian) continue;
      if (g.state === GuardState.Alert) t = 2;
      else if ((g.state === GuardState.Search || g.state === GuardState.Suspicious || g.state === GuardState.Investigate) && t < 1) t = 1;
    }
    if (t === 2) this.tensionHold = 6;
    else {
      this.tensionHold = Math.max(this.tensionHold - dt, 0);
      if (this.tensionHold > 0) t = 2;
    }
    if (t !== this.tension) {
      this.tension = t;
      this.music(t === 2 ? 'chase' : 'mission');
    }
  }

  private updateTagging(dt: number): void {
    const g = this.gull;
    if (!g.scouting) {
      this.tagProgress.clear();
      return;
    }
    const eye = g.eye();
    const fwd = g.lookDir();
    for (const gd of this.guards) {
      if (gd.tagged) continue;
      const head = gd.headPosition();
      const to = v3(head.e - eye.e, head.n - eye.n, head.h - eye.h);
      const d = Math.hypot(to.e, to.n, to.h);
      const ang = (Math.acos(Math.max(-1, Math.min(1, (to.e * fwd.e + to.n * fwd.n + to.h * fwd.h) / Math.max(d, 1e-6)))) * 180) / Math.PI;
      if (d > 170 || ang > 6 + 40 / Math.max(d, 1)) {
        this.tagProgress.delete(gd);
        continue;
      }
      if (!this.lineOfSight(eye, head)) continue;
      const p = (this.tagProgress.get(gd) ?? 0) + dt / 0.45;
      this.tagProgress.set(gd, p);
      if (p >= 1) {
        gd.tagged = true;
        this.stats.tagged++;
        this.sfx('tag', undefined, -2);
        this.toast(`TAGGED: ${gd.name}`, 'info');
        this.onTagged(gd);
      }
    }
  }

  tagProgressOf(g: Guard): number {
    return this.tagProgress.get(g) ?? 0;
  }

  // ------------------------------------------------------------------ beak slot

  /** The item a press of E would take: in range, preferring what is in front, never the thing just set down. */
  findGrabbable(): Item | undefined {
    const g = this.gull;
    const range = g.isAirborne() ? GRAB_RANGE_AIR : GRAB_RANGE_GROUND;
    let best: Item | undefined;
    let bs = Infinity;
    const p = g.pos;
    const f = g.flatDir();
    for (const it of this.items) {
      if (!it.isGrabbable()) continue;
      if (it === this.lastSetDown && this.setDownTimer > 0) continue;
      const d = dist(it.pos, p);
      if (d > range) continue;
      const fl = Math.hypot(it.pos.e - p.e, it.pos.n - p.n);
      const facing = fl > 0.05 ? ((it.pos.e - p.e) * f.e + (it.pos.n - p.n) * f.n) / fl : 1;
      const score = d - facing * 0.6;
      if (score < bs) {
        bs = score;
        best = it;
      }
    }
    return best;
  }

  nearestItem(maxDist: number): Item | undefined {
    let best: Item | undefined;
    let bd = maxDist;
    for (const it of this.items) {
      if (!it.isGrabbable()) continue;
      const d = dist(this.gull.pos, it.pos);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  accepts(d: DropPoint, it: Item): boolean {
    return d.accepts.includes(it.kind) || (it.isFood && d.accepts.includes('food'));
  }

  /** A drop point that would take the item from here: hovering above it counts (the gull lets go). */
  dropInRange(it: Item, slack = 1): DropPoint | undefined {
    const gp = this.gull.pos;
    for (const d of this.drops) {
      if (!this.accepts(d, it)) continue;
      const horiz = dist2d(gp, d.pos);
      const dy = gp.h - d.pos.h;
      if (horiz < d.radius * slack && dy > -1.5 && dy < (d.radius + 2.5) * slack) return d;
    }
    return undefined;
  }

  /** E: snatch, set down, deliver. */
  interact(): void {
    if (!this.running || this.eatingItem) return;
    const it = this.beak;
    if (it) {
      const dp = this.dropInRange(it);
      if (dp) {
        this.deliver(it, dp);
        return;
      }
      const near = this.dropInRange(it, 2.2);
      if (near && it.isMission) {
        this.toast(`Closer — right over ${near.label}`, 'warn');
        return;
      }
      this.putDown(it);
      return;
    }
    const g = this.findGrabbable();
    if (g) this.grab(g);
    else this.grabBuffer = 0.45;
  }

  private grab(it: Item): void {
    if (this.beak) return;
    if (it.covered) {
      // Something has been put on it: the first pull only knocks that off, and it does not fall quietly.
      it.covered = false;
      this.sfx('bonk', it.pos, -2, 1.5);
      this.toast(`Knocked the weight off the ${it.name.toLowerCase()}. Again, to take it.`, 'warn');
      this.emitNoise(it.pos, 14, 'clatter');
      this.onItemUncovered(it);
      return;
    }
    if (it.watched) this.thievingTimer = 6;
    const wasLoose = it.state === ItemState.Loose;
    it.hold();
    this.beak = it;
    this.sfx('grab', undefined, -2);
    if (it.isFood) this.toast(`Snatched: ${it.name}`, 'food');
    else this.toast(`${wasLoose ? 'Recovered' : 'Got it'}: ${it.name}`, 'good');
    this.onItemGrabbed(it);
  }

  private putDown(it: Item): void {
    this.beak = undefined;
    it.drop(scale(this.gull.vel, 0.5));
    this.lastSetDown = it;
    this.setDownTimer = 1.5;
    if (it.isMission) this.stats.itemsSetDown++;
    this.sfx('grab', undefined, -6, 0.8);
    this.toast(`Set down: ${it.name}`, 'info');
  }

  private deliver(it: Item, d: DropPoint): void {
    this.beak = undefined;
    it.deliverTo(v3(d.pos.e + (d.deposited.length % 3) * 0.08 - 0.08, d.pos.n, d.pos.h + 0.1 + d.deposited.length * 0.03));
    d.deposited.push(it);
    if (it.isFood) {
      this.sfx('gulp', undefined, -4, 1.3);
      this.awardFood(it, 'stashed');
    } else {
      this.sfx('deliver', undefined, -1);
      if (this.guardTension() >= 2) this.stats.cleanEscape = false;
      this.onItemDelivered(it, d);
    }
  }

  /** F: eat what is in the beak. */
  eat(): void {
    if (!this.running || this.eatingItem) return;
    const it = this.beak;
    if (!it) {
      this.toast('Nothing in your beak.', 'info');
      return;
    }
    if (it.isMission) {
      this.sayOnce(`eat_paper_${it.kind}`, 'Mother', `Do NOT eat the ${it.name.toLowerCase()}, Scrumpy.`, 3);
      return;
    }
    this.eatingItem = it;
    this.gull.eatingTimer = 0.9;
    this.sfx('gulp', undefined, -2);
  }

  get eating(): boolean {
    return !!this.eatingItem;
  }

  private finishEating(): void {
    const it = this.eatingItem!;
    this.eatingItem = undefined;
    if (this.beak === it) this.beak = undefined;
    it.consume();
    this.gull.refillPayload();
    this.awardFood(it, 'eaten');
  }

  private awardFood(it: Item, how: 'eaten' | 'stashed'): void {
    const pantry = how === 'stashed' ? Math.round(it.food * 0.5) : 0;
    this.stats.food.push({ kind: it.kind, name: it.name, points: it.food, bonus: it.bonus, bonusName: it.bonusName, how, pantry });
    this.toast(`+${it.food} FOOD — ${it.name} ${how}`, 'food');
    if (it.bonus > 0) this.toast(`+${it.bonus} ${it.bonusName.toUpperCase()}!`, 'food');
    if (pantry > 0) this.toast(`+${pantry} RESISTANCE PANTRY`, 'food');
    this.onFoodSecured(it, how);
  }

  foodTotal(): number {
    return this.stats.food.reduce((a, f) => a + f.points + f.bonus + f.pantry, 0);
  }

  /** Knocked by a guard or a thrown cap: tumble and drop what you carry. */
  knockGull(_from: V3, dir: V3, strength: number): void {
    this.gull.knock(dir, strength);
    this.stats.knocked++;
    const it = this.beak;
    if (it) {
      this.beak = undefined;
      if (this.eatingItem === it) this.eatingItem = undefined;
      const l = Math.hypot(dir.e, dir.n, dir.h) || 1;
      it.drop(v3((dir.e / l) * 2, (dir.n / l) * 2, (dir.h / l) * 2 + 2));
      this.toast(`Dropped: ${it.name}`, 'bad');
      if (it.isMission) this.say('Mother', 'You’ve dropped it! Get it back before he does.', 4);
    }
  }

  spawnThrown(_g: Guard, from: V3): void {
    const g = this.gull;
    const spd = 15;
    const t = dist(from, g.pos) / spd;
    const aim = add(g.pos, scale(g.vel, t * 0.6));
    const tt = Math.max(t, 0.1);
    const vel = v3((aim.e - from.e) / tt, (aim.n - from.n) / tt, (aim.h - from.h) / tt + 0.5 * 9.8 * t);
    this.thrown.push({ pos: { ...from }, vel, life: 3, spin: 0, landed: false });
  }

  private stepThrown(dt: number): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        this.thrown.splice(i, 1);
        continue;
      }
      if (t.landed) continue;
      const from = t.pos;
      t.vel.h -= 9.8 * dt;
      const to = add(from, scale(t.vel, dt));
      t.spin += 14 * dt;
      const cp = closestOnSegment(this.gull.pos, from, to);
      if (dist(cp, this.gull.pos) < 0.75 && this.gull.mode !== Mode.Tumble) {
        this.thrown.splice(i, 1);
        this.sfx('bonk', this.gull.pos, 2, 0.8);
        this.knockGull(from, t.vel, 5);
        this.sayOnce('cap_hit', 'Mother', 'He threw his cap at you! Low and slow is how they get you — climb away.', 4.5);
        continue;
      }
      const hit = this.world.raycast(from, to);
      if (hit) {
        t.pos = hit.point;
        t.landed = true;
        t.life = Math.min(t.life, 4);
        continue;
      }
      t.pos = to;
    }
  }

  // ------------------------------------------------------------------ poop

  spawnPoop(pos: V3, vel: V3, fromFlock = false): void {
    this.poops.push({ pos: { ...pos }, vel: { ...vel }, releaseH: pos.h, fromFlock, life: 6 });
    if (!fromFlock) this.stats.drops++;
  }

  private stepPoops(dt: number): void {
    for (let i = this.poops.length - 1; i >= 0; i--) {
      const p = this.poops[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.poops.splice(i, 1);
        continue;
      }
      const from = p.pos;
      const nv = add(p.vel, v3(0, 0, -POOP_GRAVITY * dt));
      const to = add(from, scale(add(p.vel, nv), 0.5 * dt));
      p.vel = nv;
      const target = this.poopTargetOnSegment(from, to);
      if (target) {
        this.poops.splice(i, 1);
        this.onPoopHit(p, target, to);
        continue;
      }
      const hit = this.world.raycast(from, to);
      if (hit) {
        this.poops.splice(i, 1);
        this.onPoopSplat(p, hit.point, hit.normal, hit.water);
        continue;
      }
      p.pos = to;
    }
  }

  poopTargetOnSegment(from: V3, to: V3): PoopTarget | undefined {
    return this.poopTargetAt(from, to, 0)?.target;
  }

  /**
   * The first target a drop moving from `from` to `to` would hit `lead` seconds from now: a moving target is tested
   * where it will be by then.
   */
  poopTargetAt(from: V3, to: V3, lead: number): { target: PoopTarget; pos: V3 } | undefined {
    for (const t of this.targets) {
      if (t.active && !t.active()) continue;
      let c = t.pos();
      if (lead > 0 && t.vel) c = add(c, scale(t.vel(), lead));
      if (dist(closestOnSegment(c, from, to), c) <= t.radius) return { target: t, pos: c };
    }
    return undefined;
  }

  /** Where a drop released now would land, and whether that is on a target: the HUD's marker. */
  dropPrediction(): { point: V3; onTarget: boolean } | undefined {
    return this.gull.predictDrop(this.world, (a, b, t) => this.poopTargetAt(a, b, t)?.pos);
  }

  /** What a hit on this target is counted against: repeats on one target are worth less each time. */
  targetKey(t: PoopTarget): string {
    if (t.kind === 'guard' && t.guard) return t.guard.id;
    if (t.kind === 'tea') return `tea:${t.guard?.id ?? ''}`;
    return (t.owner as { id?: string } | undefined)?.id ?? t.kind;
  }

  private onPoopHit(p: Poop, t: PoopTarget, at: V3): void {
    if (p.fromFlock) this.stats.flockHits++;
    else {
      this.stats.hits++;
      this.stats.targetHits[t.kind] = (this.stats.targetHits[t.kind] ?? 0) + 1;
      const key = this.targetKey(t);
      const n = (this.stats.hitsByTarget[key] = (this.stats.hitsByTarget[key] ?? 0) + 1);
      const fall = p.releaseH - at.h;
      if (fall > 15) {
        this.stats.longDrops++;
        if (n === 1) this.stats.longFirstHits++;
        this.toast(`LONG DROP (${Math.floor(fall)} m)`, 'good');
      }
    }
    this.sfx('splat', at, 2, 0.9 + this.rng.next() * 0.2);
    this.events.push({ type: 'splat', at, normal: v3(0, 0, 1), size: 0.55, guard: t.guard?.id });
    if (t.kind === 'guard' && t.guard) {
      if (!p.fromFlock) {
        this.stats.guardHits++;
        this.stats.watcherHits++;
        this.toast(`DIRECT HIT — ${t.guard.name.toUpperCase()}`, 'good');
      }
      t.guard.onPooped('uniform', !p.fromFlock);
    } else if (t.kind === 'tea') {
      if (!p.fromFlock) {
        this.stats.teaHits++;
        this.stats.watcherHits++;
        this.toast('TEA COMPROMISED', 'good');
      }
      this.sfx('tea', at, 0);
      if (t.guard) t.guard.onPooped('tea', !p.fromFlock);
    }
    this.onTargetHit(t, p);
  }

  private onPoopSplat(p: Poop, at: V3, normal: V3, water: boolean): void {
    this.sfx(water ? 'plop' : 'splat', at, -4, 0.9 + this.rng.next() * 0.3);
    if (!water) this.events.push({ type: 'splat', at, normal, size: 0.4 });
    for (const g of this.guards) {
      if (dist(g.pos, at) < 3.2) {
        if (!p.fromFlock) this.stats.nearMisses++;
        g.onNearMiss(at);
      }
    }
    this.onSplat(at);
  }

  // ------------------------------------------------------------------ perception rules shared by all guards

  lineOfSight(a: V3, b: V3): boolean {
    return this.world.lineOfSight(a, b);
  }

  /**
   * How interesting the gull is to a guard right now (0 = just a gull): its conspicuousness as he would judge it, on
   * the guards' scale (papers 1.4). Below BENEATH_NOTICE he does not give it a thought.
   */
  noteworthiness(g: Guard, d: number): number {
    if (g.civilian) return this.civilianInterest(g, d);
    const c = this.conspicuousnessFor(g, d).value;
    return c < BENEATH_NOTICE ? 0 : c * NOTE_PER_CONSPICUOUS;
  }

  /** A civilian minds her own goods and nothing else: a gull at them, or away with them, or under her feet. */
  private civilianInterest(g: Guard, d: number): number {
    const hers = g.guardedItem;
    if (hers && this.beak === hers) return 1.2;
    if (hers && hers.state === ItemState.Placed && dist(this.gull.pos, hers.pos) < 2.2) return 0.75;
    return d < 2.2 ? 0.42 : 0;
  }

  /** How conspicuous the gull is to this guard, `d` metres off: the general facts, and how he is placed. */
  conspicuousnessFor(g: Guard, d: number): Conspicuousness {
    return conspicuousness(this.gullFacts(g, d));
  }

  /** What the gull is doing, as plain facts for conspicuous.ts; with a guard, as he would judge it. */
  gullFacts(guard?: Guard, d = Infinity): GullFacts {
    const gull = this.gull;
    const gp = gull.pos;
    const it = this.beak;
    const airborne = gull.isAirborne();
    let inCordon = false;
    let hovering = false;
    let zoneLabel = 'the table';
    for (const z of this.restricted) {
      const flat = dist2d(gp, z);
      const top = z.h + z.height;
      if (flat < z.radius && gp.h < top) {
        inCordon = true;
        zoneLabel = z.label ?? zoneLabel;
      } else if (!inCordon && gull.mode === Mode.Air && gull.speed() < HOVER_SPEED && flat < z.radius + 2 && gp.h >= top && gp.h < top + HOVER_ABOVE) {
        hovering = true;
        zoneLabel = z.label ?? zoneLabel;
      }
    }
    let thieving = this.thievingTimer > 0;
    if (!thieving) for (const f of this.items) if (f.watched && f.state === ItemState.Placed && dist(gp, f.pos) < 2.2) thieving = true;
    let staring = false;
    if (guard && gull.scouting && d < STARE_DIST) {
      const head = guard.headPosition();
      const eye = gull.eye();
      const look = gull.lookDir();
      const l = Math.max(dist(head, eye), 1e-6);
      staring = ((head.e - eye.e) * look.e + (head.n - eye.n) * look.n + (head.h - eye.h) * look.h) / l > Math.cos((10 * Math.PI) / 180);
    }
    return {
      papers: !!it?.isMission,
      inCordon,
      hovering,
      zoneLabel,
      airborne,
      settled: !airborne && gull.speed() < 0.6,
      speed: gull.speed(),
      loiter: this.loiter,
      thieving,
      food: !!it?.isFood,
      calling: this.callHeat,
      company: this.company,
      guardDist: guard ? d : undefined,
      staring,
      guardLabel: guard?.label,
    };
  }

  /** Soldiers on duty: the people the alert ladder and the stealth score are about. */
  soldiers(): Guard[] {
    return this.guards.filter((g) => !g.civilian);
  }

  guardTension(): number {
    return this.guards.some((g) => !g.civilian && (g.state === GuardState.Alert || g.state === GuardState.Search)) ? 2 : 0;
  }

  /** Is the gull near something a soldier is there to guard: a cordon, or the man himself? */
  private nearGuarded(): boolean {
    const gp = this.gull.pos;
    for (const z of this.restricted) if (Math.hypot(gp.e - z.e, gp.n - z.n, gp.h - (z.h + 1)) < LOITER_NEAR_ZONE) return true;
    for (const g of this.guards) if (!g.civilian && !g.offDuty && dist(gp, g.pos) < LOITER_NEAR_GUARD) return true;
    return false;
  }

  /** Each step: the gull's cover and conspicuousness, who is noticing, sounds, and the alert ladder. */
  private updateStealth(dt: number): void {
    const gull = this.gull;
    const airborne = gull.isAirborne();
    this.company = this.flock.companyOf(gull.pos, airborne);
    const settled = !airborne && gull.speed() < 0.6;
    if (settled && this.company === 0 && this.nearGuarded()) this.loiter += dt;
    else this.loiter = Math.max(this.loiter - 4 * dt, 0);
    this.callHeat = Math.max(this.callHeat - dt / 4, 0);
    this.callCooldown = Math.max(this.callCooldown - dt, 0);
    this.thievingTimer = Math.max(this.thievingTimer - dt, 0);
    this.noiseRadius = FLAP_HEARING * gullNoise(gull);
    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i]!;
      n.age += dt;
      if (n.age > 1.6) this.noises.splice(i, 1);
    }
    // For the HUD: as the soldier who would think worst of it sees it, or as nobody does.
    let worst = conspicuousness(this.gullFacts());
    const view = gull.yaw;
    const noticers: Noticer[] = [];
    let stirred = false;
    for (const g of this.guards) {
      const d = dist(g.headPosition(), gull.eye());
      if (!g.civilian && !g.offDuty && d < 40) {
        const c = this.conspicuousnessFor(g, d);
        if (c.value > worst.value) worst = c;
      }
      const st = g.state;
      const roused = st === GuardState.Suspicious || st === GuardState.Investigate || st === GuardState.Alert || st === GuardState.Search;
      if (!g.civilian && (roused || g.noticing)) stirred = true;
      if (d > 120) continue;
      const bearing = Math.atan2(g.pos.e - gull.pos.e, g.pos.n - gull.pos.n);
      const rel = Math.atan2(Math.sin(bearing - view), Math.cos(bearing - view));
      const strength = roused || g.noticing ? Math.max(g.suspicion / 100, g.noticing ? 0.08 : 0) : 0;
      noticers.push({ id: g.id, name: g.name, bearing, relBearing: rel, distance: d, strength: Math.min(strength, 1), sees: g.seesGull, noticing: g.noticing, state: g.stateName, civilian: g.civilian });
    }
    this.noticers = noticers;
    this.conspicuousness = worst.value;
    this.conspicuousReason = worst.reason;
    const prev = this.alert.level;
    const now = this.alert.update(dt, stirred);
    if (now !== prev) this.alertChanged(prev, now);
  }

  /** A word for the conspicuousness now: 'just a gull', 'odd', 'conspicuous' or 'very conspicuous'. */
  get conspicuousLevel(): string {
    return conspicuousLevel(this.conspicuousness);
  }

  /** The guards who are taking an interest now, strongest first. */
  noticing(): Noticer[] {
    return this.noticers.filter((n) => n.strength > 0).sort((a, b) => b.strength - a.strength);
  }

  // ------------------------------------------------------------------ the alert ladder, and sounds

  /** An incident for the alert ladder. */
  raiseAlert(kind: AlertIncident, add: number): void {
    const prev = this.alert.level;
    const now = this.alert.raise(kind, add, this.elapsed);
    if (now !== prev) this.alertChanged(prev, now);
    if (this.alert.toppedOut && !this.topHandled) {
      this.topHandled = true;
      this.onAlertTop();
    }
  }

  private alertChanged(prev: AlertLevelId, now: AlertLevelId): void {
    this.stats.alertPeak = this.alert.peak;
    for (const g of this.guards) if (!g.civilian) g.vigilance = now;
    if (now > prev) {
      this.banner(`ALERT: ${ALERT_LEVEL_NAMES[now].toUpperCase()}`, now >= 2 ? 'bad' : 'warn', 2.2);
      this.sfx('alert', undefined, -8);
    } else this.toast(`Alert: ${ALERT_LEVEL_NAMES[now]}`, 'info');
    this.onAlertLevel(now, prev);
  }

  /**
   * Someone made a sound at `at` that carries `radius` metres: every guard in earshot (but not `source`) hears it
   * (Guard.hearNoise). Returns how many it reached.
   */
  emitNoise(at: V3, radius: number, kind: NoiseKind, source?: Guard): number {
    this.noises.push({ at: { ...at }, radius, kind, age: 0 });
    let heard = 0;
    for (const g of this.guards) {
      if (g === source || dist(g.pos, at) > radius) continue;
      if (g.hearNoise(at, kind)) heard++;
    }
    return heard;
  }

  /**
   * The gull's long call: head back, the whole harbour hears it. Gulls nearby answer, and the flighty ones go up;
   * soldiers in earshot look up at the caller, and their round waits while they do. It turns heads, and it costs: for
   * a few seconds the caller is the most noticeable gull in Dartmouth.
   */
  longCall(): void {
    if (!this.running || this.callCooldown > 0) return;
    this.callCooldown = 1.2;
    this.stats.calls++;
    this.callHeat = 1;
    this.sfx('squawk', undefined, -2, 0.95 + ((this.stats.calls * 7) % 15) / 100);
    this.flock.answerCall(this.gull.pos, 40);
    if (this.emitNoise(this.gull.pos, 25, 'call') > 0) this.raiseAlert('call', HEAT.call);
  }

  // ------------------------------------------------------------------ guard callbacks

  onGuardAlert(g: Guard): void {
    if (g.civilian) {
      // She has no whistle; she has lungs. The nearest soldier comes to see what the matter is.
      this.stats.shouts++;
      this.sfx('huh', g.headPosition(), 4, 0.7);
      this.raiseAlert('shout', HEAT.shout);
      this.emitNoise(g.headPosition(), 32, 'shout', g);
      return;
    }
    this.stats.spotted++;
    this.banner('SPOTTED', 'bad', 2);
    this.sfx('alert', undefined, -4);
    if (this.beak?.isMission) {
      this.stats.carryingSeen = true;
      this.stats.cleanEscape = false;
    }
    if (this.stats.spotted === 1) this.say('Mother', `${g.name} has seen you! Break line of sight — over the rooftops — and he’ll search where he last saw you.`, 5.5);
    this.raiseAlert('spotted', HEAT.spotted);
    // His whistle carries: the next man is on edge, and looks.
    this.emitNoise(g.headPosition(), 32, 'whistle', g);
  }

  onGuardState(g: Guard, prev: GuardStateId, now: GuardStateId): void {
    if (g.civilian) return;
    if (prev === GuardState.Alert && now === GuardState.Search) {
      this.banner('LINE OF SIGHT BROKEN', 'warn', 2);
      this.sfx('lost', undefined, -4);
      this.sayOnce('lost_1', 'Mother', 'He’s lost you. He’ll search where he last saw you, then go back to his routine.', 5);
    } else if (prev === GuardState.Search && now === GuardState.Return) this.toast(`${g.name} gave up the search`, 'good');
    else if (now === GuardState.Suspicious && (prev === GuardState.Routine || prev === GuardState.Return || prev === GuardState.Distracted)) {
      this.banner('SUSPICIOUS', 'warn', 1.2);
      this.stats.questions++;
      this.raiseAlert('question', HEAT.question);
    }
  }

  onTheftDiscovered(g: Guard): void {
    const first = !this.stats.theftDiscovered;
    this.stats.theftDiscovered = true;
    for (const o of this.guards) if (!o.civilian && o.guardedItem === g.guardedItem) o.discoveredTheft = true;
    if (!first) return;
    this.banner('THEFT DISCOVERED', 'warn', 2.5);
    this.say('Mother', `${g.name} has noticed it’s gone. He’ll be jumpy for a while — any gull near him will draw his eye.`, 5);
    this.raiseAlert('theft', HEAT.theft);
  }

  onItemRecovered(_g: Guard): void {
    this.stats.recoveredByGuard++;
    this.say('Mother', 'He’s put it back where it was. Regroup, and try again.', 4);
    this.raiseAlert('recovered', HEAT.recovered);
  }

  onGuardHit(g: Guard, n: number, kind: string): void {
    if (g.civilian) return;
    if (kind === 'tea' && n === 1) this.raiseAlert('tea', HEAT.tea);
    else this.raiseAlert('hit', HEAT.hit[Math.min(n, HEAT.hit.length) - 1]!);
    if (n === 2) this.sayOnce('hit_twice', 'Mother', 'Once is bad luck. Twice is a pattern, and he has noticed.', 4);
    else if (n === 3) this.sayOnce('hit_thrice', 'Mother', 'Three times is a hobby, Scrumpy. He knows it is you.', 4);
  }

  // ------------------------------------------------------------------ gull callbacks (GullHost)

  findPerch(from: V3, look: V3, maxDist: number, maxAngleDeg: number): Perch | undefined {
    let best: Perch | undefined;
    let bs = Infinity;
    for (const p of this.perches) {
      const to = v3(p.pos.e - from.e, p.pos.n - from.n, p.pos.h - from.h);
      const d = Math.hypot(to.e, to.n, to.h);
      if (d > maxDist || d < 0.2) continue;
      const ang = (Math.acos(Math.max(-1, Math.min(1, (to.e * look.e + to.n * look.n + to.h * look.h) / d))) * 180) / Math.PI;
      if (ang > maxAngleDeg) continue;
      if (!this.world.lineOfSight(from, v3(p.pos.e, p.pos.n, p.pos.h + 0.35))) continue;
      const score = ang + d * 0.8;
      if (score < bs) {
        bs = score;
        best = p;
      }
    }
    return best;
  }

  perchAt(pos: V3): Perch | undefined {
    return this.perches.find((p) => dist(p.pos, pos) < 1.6);
  }

  onLanded(_water: boolean): void {}

  onPerched(p: Perch): void {
    this.toast(`Perched: ${p.name}`, 'info');
    this.onPerchedHook(p);
  }

  onTookOff(): void {}

  onTumbled(impact: number): void {
    this.stats.tumbles++;
    const it = this.beak;
    if (impact > DROP_IMPACT && it) {
      this.beak = undefined;
      if (this.eatingItem === it) this.eatingItem = undefined;
      it.drop(v3(0, 0, 2));
      this.toast(`Crashed! Dropped: ${it.name}`, 'bad');
    } else if (this.stats.tumbles === 1) this.say('Mother', 'Steady. Brake with S before you touch down, or hold R and let the wings do the work.', 4.5);
  }

  onPayloadEmpty(): void {
    this.toast('Payload empty — eat something to reload', 'warn');
  }

  onOutOfBounds(): void {
    this.say('Mother', 'That’s outside the operational area, Scrumpy. Come back to the harbour.', 3.5);
  }

  /** G: signal. */
  /**
   * A press of one of the player's actions (actions.ts, kind 'press'). The input layer sends every press here, so a
   * mission can answer a new action by overriding onPress without the application knowing about it.
   */
  press(action: ActionId): void {
    switch (action) {
      case 'interact':
        this.interact();
        break;
      case 'eat':
        this.eat();
        break;
      case 'signal':
        this.signal();
        break;
      default:
        if (this.running) this.onPress(action);
    }
  }

  protected onPress(_action: ActionId): void {}

  signal(): void {
    if (!this.running) return;
    if (!this.onSignal()) this.longCall();
  }

  // ------------------------------------------------------------------ HUD support

  prompt(): string {
    if (!this.running) return '';
    if (this.eatingItem) return 'Eating…';
    const it = this.beak;
    if (it) {
      const dp = this.dropInRange(it);
      if (dp) return `[E] ${it.isFood ? 'Stash' : 'Deliver'}: ${dp.label}`;
      const near = this.nearestItem(PROMPT_RANGE);
      if (near?.isFood && it.isMission) return `Beak full — [E] set down the ${it.name.toLowerCase()} to take the ${near.name.toLowerCase()}`;
      if (it.isFood) return `[F] Eat ${it.name.toLowerCase()}   [E] Set down   (or stash it at the nest)`;
      return `[E] Set down ${it.name.toLowerCase()}`;
    }
    const g = this.findGrabbable();
    if (g) return `[E] Snatch ${g.name.toLowerCase()}`;
    const n = this.nearestItem(PROMPT_RANGE);
    if (n) return `${n.name} nearby — get closer and press [E]`;
    if (this.gull.isPerched() && this.gull.perch?.hint) return `${this.gull.perch.name} — ${this.gull.perch.hint}`;
    return '';
  }

  /** The running score: food, and hits with repeats on one target discounted. Kept for whoever wants it; not a HUD must. */
  liveScore(): number {
    let hits = 0;
    for (const n of Object.values(this.stats.hitsByTarget)) hits += hitsOnTarget(n);
    return this.foodTotal() + Math.min(hits, this.ordnanceCap);
  }

  // ------------------------------------------------------------------ completion and review

  completeMission(delay = 2.5): void {
    if (this.completed) return;
    this.completed = true;
    this.finishTimer = delay;
  }

  /**
   * The operation is lost: what Section G wanted has gone, and the review will say Compromised and offer another go.
   * Nobody is hurt; Mother is disappointed.
   */
  compromise(delay = 4): void {
    if (this.completed) return;
    this.outcome = 'compromised';
    this.banner('COMPROMISED', 'bad', 3);
    this.sfx('lost', undefined, -2);
    this.completeMission(delay);
  }

  /** How the job was done, for the review (scoring.ts). */
  approach(): Approach {
    return approachOf({ spotted: this.stats.spotted, questions: this.stats.questions, watcherHits: this.stats.watcherHits });
  }

  private finish(): void {
    this.running = false;
    this.finished = true;
    this.gull.controlsEnabled = false;
    this.events.push({ type: 'loop', name: 'water', on: false });
    this.events.push({ type: 'finished', results: this.computeResults() });
  }

  computeResults(): Results {
    const lines: [string, number][] = [...this.resultLines()];
    for (const f of this.stats.food) {
      lines.push([`Food: ${f.name} (${f.how})`, f.points]);
      if (f.bonus > 0) lines.push([`   ${f.bonusName}`, f.bonus]);
      if (f.pantry > 0) lines.push(['   Resistance pantry contribution', f.pantry]);
    }
    const { drops, hits } = this.stats;
    if (drops > 0) {
      const ord = ordnanceScore(this.stats, this.ordnanceCap);
      const sum = ord.hitPoints + ord.accuracyBonus + ord.longPoints;
      lines.push([`Accuracy: ${hits} of ${drops} drops on target (${Math.round((hits / drops) * 100)}%)`, ord.hitPoints + ord.accuracyBonus]);
      if (ord.repeats > 0) lines.push([`   Repeat hits on one target (${ord.repeats}): worth less each time`, 0]);
      if (ord.longPoints > 0) lines.push(['   Long-range drops', ord.longPoints]);
      if (ord.capped) lines.push(['   Over the allowance for one operation', ord.total - sum]);
    }
    const compromised = this.outcome === 'compromised';
    const done = this.primaryDone() && !compromised;
    const sp = this.stats.spotted;
    if (compromised) lines.push(['Operation compromised: stealth, escape and time bonuses withheld', 0]);
    else if (!done) lines.push(['Stealth, escape and time bonuses: operation incomplete', 0]);
    else if (sp === 0) lines.push(['Stealth: never spotted', STEALTH_POINTS.unseen]);
    else if (sp === 1) lines.push(['Stealth: spotted once', STEALTH_POINTS.once]);
    else lines.push([`Stealth: spotted ${sp} times`, 0]);
    if (done && this.stats.cleanEscape) lines.push(['Clean escape: never seen with the goods', CLEAN_ESCAPE_POINTS]);
    else if (done) lines.push(['Clean escape: seen with the goods', 0]);
    const approach = done ? this.approach() : undefined;
    if (approach) lines.push([`Approach: ${approach.title}. ${approach.citation}`, approach.points]);
    if (this.stats.tagged > 0) lines.push([`Reconnaissance: ${this.stats.tagged} tagged`, 50 * this.stats.tagged]);
    if (done) {
      const tb = this.elapsed <= this.parTime ? 150 : this.elapsed <= this.parTime * 1.5 ? 75 : 0;
      lines.push([`Time ${fmtTime(this.elapsed)} (par ${fmtTime(this.parTime)})`, tb]);
    }
    const total = lines.reduce((a, l) => a + l[1], 0);
    let grade = 'D';
    let gradeTitle = 'Under Review';
    for (const [min, g, t] of this.gradeBands()) {
      if (total >= min) {
        grade = g;
        gradeTitle = t;
        break;
      }
    }
    if (compromised) {
      grade = '—';
      gradeTitle = 'Compromised';
    }
    return {
      missionId: this.id,
      title: this.title,
      lines,
      total,
      grade,
      gradeTitle,
      remarks: compromised ? [...this.baseRemarks(), ...(this.director?.compromisedRemarks?.() ?? [])] : [...this.baseRemarks(), ...this.remarks()],
      time: this.elapsed,
      stats: JSON.parse(JSON.stringify(this.stats)) as MissionStats,
      debrief: compromised ? (this.director?.compromisedDebrief?.() ?? this.debriefText()) : this.debriefText(),
      outcome: this.outcome,
      approach,
      alertPeak: this.alert.peakName,
    };
  }

  private baseRemarks(): string[] {
    const r: string[] = [];
    const s = this.stats;
    if (this.outcome === 'compromised') r.push('The operation is recorded as Compromised. The operative is recorded as present, uninjured and unrepentant.');
    else if (s.spotted === 0 && s.questions === 0) r.push('The operative was at all times indistinguishable from an ordinary gull. The Committee can offer no higher praise.');
    else if (s.spotted === 0) r.push('The operative was never identified, though a gull was thought of, once or twice, in a tone the Committee does not care for.');
    else if (s.spotted >= 3) r.push(`The operative was observed on ${s.spotted} occasions. The Committee reminds all ranks that the ‘S’ in ‘Section G’ does not stand for ‘Seen’.`);
    const chips = s.food.filter((f) => f.kind === 'chip').length;
    const pasties = s.food.filter((f) => f.kind === 'pasty').length;
    if (pasties > 0) r.push('The pasty was, by all accounts, excellent.');
    if (chips >= 3) r.push(`${chips} chips were requisitioned. Quartermaster queries whether all were strictly operational.`);
    else if (chips > 0) r.push('One chip was requisitioned in accordance with Standing Order 4 (Morale).');
    if (!s.food.length) r.push('No food was secured. The operative is reminded that lunch is not optional.');
    if (s.teaHits > 0) r.push(`${s.teaHits} mug(s) of tea, Soviet issue, were lost in the course of operations. No regret is recorded.`);
    if (s.tumbles >= 3) r.push('Landings were described by an observer as ‘enthusiastic’. Further practice is recommended.');
    if (s.knocked > 0) r.push(`The operative was struck by enemy headwear ${s.knocked} time(s). A claim for injury will not be entertained.`);
    return r;
  }

  /** Drain the queued events. */
  takeEvents(): MissionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function fmtTime(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
}
