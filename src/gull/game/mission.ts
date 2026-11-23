/**
 * A mission: objectives, scoring, the beak slot, poop resolution, guard callbacks, scouting and tagging, and the
 * performance review. Concrete missions override the `setup`, `onStart`, `tick` and `on*` hooks.
 *
 * Everything that the view or the sound needs to hear about (Mother on the radio, a toast, a banner, a sound, a splat)
 * is queued in `events` for the controller to drain each frame. DOM-free.
 */
import { DROP_IMPACT, Gull, Mode, POOP_GRAVITY, type GullControls, type GullHost, type GullProfile, type Perch } from './gull';
import { Guard, GuardState, type GuardHost, type GuardStateId } from './guard';
import { Item, ItemState, type ItemKind } from './items';
import type { AllyGull, Marcher } from './parade';
import { Rng } from './rng';
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
}

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
  restricted: { e: number; n: number; h: number; radius: number; height: number }[] = [];
  props: Prop[] = [];
  npcs: Npc[] = [];
  /** Soldiers on parade (Mission 2). */
  marchers: Marcher[] = [];
  /** The Bomber Wing (Mission 2). */
  allies: AllyGull[] = [];
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

  constructor(
    readonly world: World,
    seed = 1967,
  ) {
    this.rng = new Rng(seed);
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
  /** G: signal (Mission 2's flock). True if it did something. */
  protected onSignal(): boolean {
    return false;
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
      [1150, 'A', 'Exemplary'],
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
    if (!this.running) {
      this.stepItems(dt);
      return;
    }
    this.elapsed += dt;
    if (poop) this.gull.poop(this);
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

  private onPoopHit(p: Poop, t: PoopTarget, at: V3): void {
    if (p.fromFlock) this.stats.flockHits++;
    else {
      this.stats.hits++;
      this.stats.targetHits[t.kind] = (this.stats.targetHits[t.kind] ?? 0) + 1;
      const fall = p.releaseH - at.h;
      if (fall > 15) {
        this.stats.longDrops++;
        this.toast(`LONG DROP (${Math.floor(fall)} m)`, 'good');
      }
    }
    this.sfx('splat', at, 2, 0.9 + this.rng.next() * 0.2);
    this.events.push({ type: 'splat', at, normal: v3(0, 0, 1), size: 0.55, guard: t.guard?.id });
    if (t.kind === 'guard' && t.guard) {
      if (!p.fromFlock) {
        this.stats.guardHits++;
        this.toast(`DIRECT HIT — ${t.guard.name.toUpperCase()}`, 'good');
      }
      t.guard.onPooped('uniform');
    } else if (t.kind === 'tea') {
      if (!p.fromFlock) {
        this.stats.teaHits++;
        this.toast('TEA COMPROMISED', 'good');
      }
      this.sfx('tea', at, 0);
      if (t.guard) t.guard.onPooped('tea');
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

  /** How interesting the gull is to a guard right now (0 = just a gull). */
  noteworthiness(_g: Guard, d: number): number {
    const gull = this.gull;
    let n = 0;
    const it = this.beak;
    if (it?.isMission) n = 1.4;
    const gp = gull.pos;
    for (const z of this.restricted) if (dist2d(gp, z) < z.radius && gp.h < z.h + z.height) n = Math.max(n, 1);
    if (d < 4.5) n = Math.max(n, 0.8);
    else if (d < 9 && gull.speed() > 13) n = Math.max(n, 0.5);
    if (gull.isPerched() && !it?.isMission && d > 4.5) n *= 0.5;
    return n;
  }

  guardTension(): number {
    return this.guards.some((g) => g.state === GuardState.Alert || g.state === GuardState.Search) ? 2 : 0;
  }

  // ------------------------------------------------------------------ guard callbacks

  onGuardAlert(g: Guard): void {
    this.stats.spotted++;
    this.banner('SPOTTED', 'bad', 2);
    this.sfx('alert', undefined, -4);
    if (this.beak?.isMission) {
      this.stats.carryingSeen = true;
      this.stats.cleanEscape = false;
    }
    if (this.stats.spotted === 1) this.say('Mother', `${g.name} has seen you! Break line of sight — over the rooftops — and he’ll search where he last saw you.`, 5.5);
  }

  onGuardState(g: Guard, prev: GuardStateId, now: GuardStateId): void {
    if (prev === GuardState.Alert && now === GuardState.Search) {
      this.banner('LINE OF SIGHT BROKEN', 'warn', 2);
      this.sfx('lost', undefined, -4);
      this.sayOnce('lost_1', 'Mother', 'He’s lost you. He’ll search where he last saw you, then go back to his routine.', 5);
    } else if (prev === GuardState.Search && now === GuardState.Return) this.toast(`${g.name} gave up the search`, 'good');
    else if (now === GuardState.Suspicious && (prev === GuardState.Routine || prev === GuardState.Return)) this.banner('SUSPICIOUS', 'warn', 1.2);
  }

  onTheftDiscovered(g: Guard): void {
    this.stats.theftDiscovered = true;
    this.banner('THEFT DISCOVERED', 'warn', 2.5);
    this.say('Mother', `${g.name} has noticed it’s gone. He’ll be jumpy for a while — any gull near him will draw his eye.`, 5);
  }

  onItemRecovered(_g: Guard): void {
    this.stats.recoveredByGuard++;
    this.say('Mother', 'He’s put it back where it was. Regroup, and try again.', 4);
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
  signal(): void {
    if (!this.running) return;
    if (!this.onSignal()) this.sfx('squawk', undefined, -2, 0.95 + this.rng.next() * 0.15);
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

  liveScore(): number {
    return this.foodTotal() + this.stats.hits * 40;
  }

  // ------------------------------------------------------------------ completion and review

  completeMission(delay = 2.5): void {
    if (this.completed) return;
    this.completed = true;
    this.finishTimer = delay;
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
      const acc = hits / drops;
      let pts = hits * 40;
      if (hits >= 2 && acc >= 0.75) pts += 100;
      lines.push([`Accuracy: ${hits} of ${drops} drops on target (${Math.round(acc * 100)}%)`, pts]);
      if (this.stats.longDrops > 0) lines.push(['   Long-range drops', this.stats.longDrops * 25]);
    }
    const done = this.primaryDone();
    const sp = this.stats.spotted;
    if (!done) lines.push(['Stealth, escape and time bonuses: operation incomplete', 0]);
    else if (sp === 0) lines.push(['Stealth: never spotted', 300]);
    else if (sp === 1) lines.push(['Stealth: spotted once', 120]);
    else lines.push([`Stealth: spotted ${sp} times`, 0]);
    if (done && this.stats.cleanEscape) lines.push(['Clean escape: never seen with the goods', 200]);
    else if (done) lines.push(['Clean escape: seen with the goods', 0]);
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
    return {
      missionId: this.id,
      title: this.title,
      lines,
      total,
      grade,
      gradeTitle,
      remarks: [...this.baseRemarks(), ...this.remarks()],
      time: this.elapsed,
      stats: JSON.parse(JSON.stringify(this.stats)) as MissionStats,
      debrief: this.debriefText(),
    };
  }

  private baseRemarks(): string[] {
    const r: string[] = [];
    const s = this.stats;
    if (s.spotted === 0) r.push('The operative was at all times indistinguishable from an ordinary gull. The Committee can offer no higher praise.');
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
