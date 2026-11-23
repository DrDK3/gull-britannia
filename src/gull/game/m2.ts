/**
 * Mission 2 — The Inspection, on the real South Embankment.
 *
 * Colonel Grushkov reviews the garrison from a stand on the Embankment promenade. The Inspection Order (with the
 * submarine's berthing orders) lies on the lectern, watched by his adjutant, Lt Voronova.
 *
 * Scout from the rooftops, signal the Bomber Wing from the Royal Castle Hotel roof, lead a mass strike on the
 * formation as it passes the stand, and in the chaos take the Order to the Dorothy May in the Boat Float.
 *
 * The player flies as Bomber lead: bigger payload, a little heavier to turn.
 */
import { Guard, GuardState } from './guard';
import type { GullProfile, Perch } from './gull';
import type { Item } from './items';
import { Mission, type DropPoint, type Npc, type PoopTarget } from './mission';
import { AllyGull, AllyState, MarchState, Marcher } from './parade';
import { v3, type V3, type World } from './world';

const PI = Math.PI;
const WEST = -PI / 2;

export const BOMBER_PROFILE: Partial<GullProfile> = {
  name: 'Bomber lead',
  maxPayload: 6,
  payloadRegen: 11,
  turnRate: 2.6,
  bankYawRate: 1.45,
  flapThrust: 6.1,
  maxSpeed: 30,
  poopCooldown: 0.28,
};

/** The stand on the promenade, facing west across the Embankment road. */
export const M2 = {
  stand: { e: -280.3, n: 306, w: 4, l: 12, deck: 1.6 },
  lectern: { e: -281.75, n: 306 },
  voronova: { e: -280.95, n: 305.1 },
  grushkov: { e: -279.9, n: 308.2 },
  general: { e: -279.9, n: 303.6 },
  refreshments: { e: -279.1, n: 301.2 },
  kulik: { e: -283.4, n: 318.5 },
  osipov: { e: -283.4, n: 293.5 },
  /** The parade marches up and down the Embankment road. */
  paradeE: -289.2,
  routeSouth: 262,
  routeNorth: 350,
  zoneSouth: 288,
  zoneNorth: 322,
  speed: 1.3,
  chaosArea: { eMin: -296, eMax: -283.6, nMin: 258, nMax: 354 },
  roost: { e: -372, n: 390 },
  spawn: { e: -396, n: 346 },
  stationRoof: { e: -277, n: 372 },
  pile: { e: -266.5, n: 305 },
  dorothy: { e: -318, n: 392, yaw: 0.05 },
};

export const HITS_TO_BREAK = 4;
export const CHAOS_TIME = 32;

export class Mission2 extends Mission {
  voronova!: Guard;
  kulik!: Guard;
  osipov!: Guard;
  grushkov!: Npc;
  general!: Npc;
  document!: Item;
  pot!: DropPoint;
  roostPerch!: Perch;
  deckTop = 0;
  anchorN = M2.routeNorth - 8;
  dir = -1;
  private turnTimer = 0;
  private hitTimes: number[] = [];
  chaosTimer = 0;
  brokenCount = 0;
  private flockOut = false;
  private releaseTime = -100;
  delivered = false;
  private speechT = 0;
  private theftAnnounced = false;
  private passHits = 0;
  private poseTimers = new Map<Npc, { t: number; then: string }>();
  private reformTimer = 0;

  constructor(world: World, seed = 1967) {
    super(world, seed);
  }

  private top(p: { e: number; n: number }): number {
    return this.world.cellTop(p.e, p.n);
  }

  protected setup(): void {
    this.id = 'm2';
    this.title = 'The Inspection';
    this.parTime = 360;
    const W = this.world;
    const wl = W.waterLevel;
    const S = M2.stand;
    const ground = W.groundAt(S.e, S.n);
    const deck = ground + S.deck;
    this.deckTop = deck;

    // The reviewing stand: deck, steps, canopy on four posts, lectern, refreshment table.
    const yaw = 0;
    this.addProp({
      id: 'stand',
      kind: 'stand',
      pos: v3(S.e, S.n, ground),
      yaw,
      data: { w: S.w, l: S.l, deck: S.deck },
      solids: [
        { solid: this.box(S.e, S.n, 0, S.w / 2, S.l / 2, ground, deck), dh0: 0, dh1: S.deck },
        { solid: this.box(S.e, S.n, 0, S.w / 2 + 0.3, S.l / 2 + 0.3, deck + 3.0, deck + 3.16), dh0: S.deck + 3, dh1: S.deck + 3.16 },
        ...[-1, 1].flatMap((a) => [-1, 1].map((b) => ({ solid: this.cyl(S.e + a * (S.w / 2 - 0.2), S.n + b * (S.l / 2 - 0.2), 0.09, deck, deck + 3), dh0: S.deck, dh1: S.deck + 3 }))),
        { solid: this.box(M2.lectern.e, M2.lectern.n, 0, 0.3, 0.4, deck, deck + 1.13), dh0: S.deck, dh1: S.deck + 1.13 },
        { solid: this.box(M2.refreshments.e, M2.refreshments.n, 0, 0.5, 0.7, deck, deck + 0.84), dh0: S.deck, dh1: S.deck + 0.84 },
      ],
    });
    this.addProp({ id: 'lectern', kind: 'lectern', pos: v3(M2.lectern.e, M2.lectern.n, deck), yaw: -PI / 2 });
    this.addProp({ id: 'refreshments', kind: 'refreshments', pos: v3(M2.refreshments.e, M2.refreshments.n, deck), yaw: 0 });
    this.spawnGull(v3(M2.spawn.e, M2.spawn.n, this.top(M2.spawn) + 0.35), Math.atan2(S.e - M2.spawn.e, S.n - M2.spawn.n), BOMBER_PROFILE);

    // Perches.
    this.addPerch('church', v3(M2.spawn.e, M2.spawn.n, this.top(M2.spawn)), 'St Saviour’s roof', 'The stand is east, on the Embankment. Hold right mouse to scout.');
    this.roostPerch = this.addPerch('roost', v3(M2.roost.e, M2.roost.n, this.top(M2.roost)), 'Royal Castle Hotel roof', 'The Bomber Wing’s roost. Press G to signal.');
    this.addPerch('station', v3(M2.stationRoof.e, M2.stationRoof.n, this.top(M2.stationRoof)), 'Station roof', 'Close to the parade route.');
    this.addPerch('canopy', v3(S.e, S.n, deck + 3.16), 'Stand canopy', 'Directly over the lectern. Very bold.');
    // A mooring pile in the river behind the stand: a clear view of the lectern, and nobody on parade looks that way.
    const pile = M2.pile;
    const pileTop = 4.6;
    this.addProp({ id: 'pile', kind: 'pile', pos: v3(pile.e, pile.n, W.cellTop(pile.e, pile.n)), yaw: 0, data: { top: pileTop }, solids: [{ solid: this.cyl(pile.e, pile.n, 0.22, -6, pileTop), dh0: 0, dh1: 0 }] });
    this.addPerch('pile', v3(pile.e, pile.n, pileTop), 'Mooring pile', 'Behind the stand, across the water. Scout Voronova from here.');

    // The Dorothy May in the Boat Float, again.
    const dm = M2.dorothy;
    const deckH = 0.95;
    this.addProp({
      id: 'dorothy',
      kind: 'crabber',
      pos: v3(dm.e, dm.n, wl),
      yaw: dm.yaw,
      float: 0,
      data: { name: 'DOROTHY MAY', colour: 0x7a2424 },
      solids: [
        { solid: this.box(dm.e, dm.n, -dm.yaw, 1.7, 5, wl - 0.8, wl + deckH), dh0: -0.8, dh1: deckH },
        { solid: this.box(dm.e + Math.sin(dm.yaw) * 1.5, dm.n + Math.cos(dm.yaw) * 1.5, -dm.yaw, 0.9, 1.0, wl + deckH, wl + deckH + 1.9), dh0: deckH, dh1: deckH + 1.9 },
      ],
    });
    const potAt = v3(dm.e - Math.sin(dm.yaw) * 3, dm.n - Math.cos(dm.yaw) * 3, wl + deckH);
    this.addProp({ id: 'dorothy:pot', kind: 'lobster_pot', pos: potAt, yaw: dm.yaw, float: deckH });
    this.addPerch('dorothy:wheelhouse', v3(dm.e + Math.sin(dm.yaw) * 1.5, dm.n + Math.cos(dm.yaw) * 1.5, wl + deckH + 1.9), 'Dorothy May’s wheelhouse', 'The drop. The pot is on her afterdeck.');
    this.pot = this.addDrop('dorothy:pot', v3(potAt.e, potAt.n, potAt.h + 0.3), 'the lobster pot on the Dorothy May', ['document'], 'lobster_pot', 2.6);

    // The Order on the lectern; refreshments for the visiting Marshal.
    this.document = this.addItem('document', v3(M2.lectern.e, M2.lectern.n, deck + 1.17), PI / 2, 'the lectern');
    this.restricted.push({ e: M2.lectern.e, n: M2.lectern.n, h: deck, radius: 4.5, height: 4 });
    this.addItem('bun', v3(M2.refreshments.e - 0.1, M2.refreshments.n - 0.3, deck + 0.86), 0, 'the refreshment table');
    this.addItem('bun', v3(M2.refreshments.e + 0.15, M2.refreshments.n + 0.2, deck + 0.86), 0, 'the refreshment table');
    this.addItem('crust', v3(-281.5, 331, W.groundAt(-281.5, 331) + 0.02), 0.3);

    // Officers on the stand.
    this.grushkov = { id: 'grushkov', style: 'officer', pos: v3(M2.grushkov.e, M2.grushkov.n, deck), yaw: WEST, anim: 'attention', headYaw: 0, headPitch: 0, phase: 0, moving: false };
    this.general = { id: 'general', style: 'officer', pos: v3(M2.general.e, M2.general.n, deck), yaw: WEST, anim: 'attention', headYaw: 0, headPitch: 0, phase: 0, moving: false };
    this.npcs.push(this.grushkov, this.general);

    // Lt Voronova at the lectern.
    const v = new Guard('voronova', 'Lt Voronova', this, this.rng);
    v.style = 'officer';
    v.routineText = 'adjutant · guards the Order';
    v.viewRange = 28;
    v.fovDeg = 120;
    v.canThrow = false;
    v.groundOverride = () => deck;
    v.area = { eMin: S.e - S.w / 2 + 0.3, eMax: S.e + S.w / 2 - 0.3, nMin: S.n - S.l / 2 + 0.4, nMax: S.n + S.l / 2 - 0.4 };
    v.routine = [
      { ...M2.voronova, yaw: WEST, wait: 9, anim: 'idle' },
      { ...M2.voronova, yaw: -2.36, wait: 4, anim: 'read' },
      { ...M2.voronova, yaw: -0.94, wait: 5, anim: 'idle' },
    ];
    v.lines = {
      suspicious: ['Comrade gull. I see you.', 'Hm. That one is watching us.', 'Stay where you are, bird.'],
      alert: ['Guards! That gull!', 'Seize it! The gull!', 'It is THAT gull!'],
      search: ['It went over there.', 'Search the roofs.', 'Find it.'],
      return: ['…Carry on.', 'As you were.', 'Nothing. For now.'],
      lost: ['Gone again.', 'Clever bird.'],
      theft: ['The Order! The ORDER is gone!', 'Colonel — the Inspection Order!'],
      recover: ['Who dropped this?', 'Papers belong on the lectern.'],
    };
    this.voronova = this.addGuard(v);
    v.guardedItem = this.document;
    this.kulik = this.standSentry('kulik', 'Pte. Kulik', M2.kulik, 0, WEST);
    this.osipov = this.standSentry('osipov', 'Pte. Osipov', M2.osipov, PI, PI / 2);

    // The parade: twelve men, three files, four ranks.
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const slot = { x: (c - 1) * 1.6, y: r * 1.8 };
        const n = this.anchorN - this.dir * slot.y;
        const mm = new Marcher(`marcher-${r}-${c}`, slot, v3(M2.paradeE + slot.x, n, W.groundAt(M2.paradeE + slot.x, n)), this.rng, (e, nn) => W.groundAt(e, nn));
        this.marchers.push(mm);
        this.addTarget({ kind: 'soldier', radius: 0.72, pos: () => v3(mm.pos.e, mm.pos.n, mm.pos.h + 1.7), owner: mm });
        this.addTarget({ kind: 'soldier', radius: 0.5, pos: () => v3(mm.pos.e, mm.pos.n, mm.pos.h + 1.2), owner: mm });
      }
    }
    this.updateParade(0);
    for (const mm of this.marchers) mm.pos = { ...mm.target };

    // The Bomber Wing, waiting on the hotel roof: a tight box matched to the parade's 1.6 m files and 1.8 m ranks, so
    // flying along the column puts every wingman over another soldier.
    const names = ['Gristle', 'Mrs Wimbush', 'Old Nelson', 'The Padre'];
    const slots = [
      { x: -1.6, y: -0.3, z: 1.8 },
      { x: 1.6, y: -0.3, z: 1.8 },
      { x: -1.6, y: -0.6, z: 3.6 },
      { x: 1.6, y: -0.6, z: 3.6 },
    ];
    const ro = M2.roost;
    [-4.4, -3.1, 1.8, 3.1].forEach((dn, i) => {
      const at = { e: ro.e, n: ro.n + dn };
      this.allies.push(new AllyGull(names[i]!, v3(at.e, at.n, this.top(at) + 0.25), slots[i]!, this.rng));
    });

    this.addObjective('scout', 'Scout the stand: hold right mouse and tag Lt Voronova at the lectern (a mooring pile behind the stand has a clear view)', v3(M2.voronova.e, M2.voronova.n, deck + 1.7));
    this.addObjective('signal', 'Signal the Bomber Wing from the Royal Castle Hotel roof [G]', this.roostPerch.pos, false, 'hidden');
    this.addObjective('strike', 'Lead the flock over the formation as it passes the stand — release with Q', () => this.anchor(), false, 'hidden');
    this.addObjective('document', 'Take the Inspection Order from the lectern', () => this.document.pos, false, 'hidden');
    this.addObjective('deliver', 'Deliver the Order to the lobster pot on the Dorothy May', this.pot.pos, false, 'hidden');
    this.addObjective('bun', 'Optional: liberate a saffron bun from the refreshment table', undefined, true);
  }

  private standSentry(id: string, name: string, at: { e: number; n: number }, yaw1: number, yaw2: number): Guard {
    const g = new Guard(id, name, this, this.rng);
    g.routineText = 'stand guard';
    g.viewRange = 22;
    g.area = { eMin: -296, eMax: -273, nMin: 262, nMax: 352 };
    g.routine = [
      { ...at, yaw: yaw1, wait: 7, anim: 'idle' },
      { ...at, yaw: yaw2, wait: 4, anim: 'idle' },
    ];
    return this.addGuard(g);
  }

  /** The head of the column (game coordinates). */
  anchor(): V3 {
    return v3(M2.paradeE, this.anchorN, this.world.groundAt(M2.paradeE, this.anchorN));
  }

  inZone(): boolean {
    return this.anchorN > M2.zoneSouth && this.anchorN < M2.zoneNorth;
  }

  private say2(n: Npc, text: string, t = 3.5): void {
    n.speech = { text, t };
  }

  private pose2(n: Npc, anim: string, t?: number, then = 'attention'): void {
    n.anim = anim;
    if (t) this.poseTimers.set(n, { t, then });
    else this.poseTimers.delete(n);
  }

  protected override onStart(): void {
    this.music('mission');
    this.say('Mother', 'Bomber lead, Mother. You’re on St Saviour’s roof. The reviewing stand is east of here, on the Embankment by the river. Scout it first — there’s a mooring pile in the river behind it with a clear view of the lectern.', 7);
    this.say2(this.grushkov, 'Magnificent. The finest garrison in Devon.');
  }

  protected override tick(dt: number): void {
    this.updateParade(dt);
    this.updateChaos(dt);
    this.speechT += dt;
    for (const mm of this.marchers) mm.update(dt, M2.chaosArea);
    for (const a of this.allies) a.update(dt, this.gull, (p, v) => this.spawnPoop(p, v, true));
    for (const [n, p] of this.poseTimers) {
      p.t -= dt;
      if (p.t <= 0) {
        n.anim = p.then;
        this.poseTimers.delete(n);
      }
    }
    for (const n of this.npcs) n.phase += dt;
    if (this.reformTimer > 0) {
      this.reformTimer -= dt;
      if (this.reformTimer <= 0) for (const mm of this.marchers) if (mm.state === MarchState.Reform) mm.state = MarchState.March;
    }
    // Strike: enough hits on the formation, close together, in front of the stand.
    const now = this.elapsed;
    while (this.hitTimes.length && now - this.hitTimes[0]! > 4) this.hitTimes.shift();
    if (this.chaosTimer <= 0 && this.hitTimes.length >= HITS_TO_BREAK) {
      this.hitTimes = [];
      if (this.inZone()) this.breakFormation();
      else this.formationHolds(true);
    }
    // The flock breaks off after its pass.
    if (this.flockOut && this.releaseTime > 0 && now - this.releaseTime > 3) {
      this.flockOut = false;
      for (const a of this.allies) a.breakOff(this.anchor());
      if (this.chaosTimer <= 0) {
        if (this.passHits === 0 && this.objectiveState('strike') === 'active') {
          this.say('Mother', 'The Wing dropped on nothing in particular. They’re going home to reload — signal again from the roost, and bring them over the parade.', 6);
          this.setObjective('signal', 'active', 'Signal the Bomber Wing again from the hotel roof [G]');
        } else this.formationHolds(false);
      }
    }
    if (this.objectiveState('bun') === 'active' && this.stats.food.some((f) => f.kind === 'bun')) this.completeObjective('bun');
    // Theft discovered: the Commandant loses what composure he had.
    if (this.voronova.discoveredTheft && !this.theftAnnounced) {
      this.theftAnnounced = true;
      this.say2(this.grushkov, 'The ORDER! A GULL has the ORDER!', 4);
      this.pose2(this.grushkov, 'outrage', 6);
    }
    if (this.delivered && !this.completed) {
      this.say('Mother', 'The Order is aboard the Dorothy May. The skipper sends his compliments. Bring the Wing home, Bomber lead.', 5);
      this.completeMission(3);
    }
  }

  updateParade(dt: number): void {
    if (this.chaosTimer > 0) return;
    if (this.turnTimer > 0) {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) this.dir = -this.dir;
    } else {
      this.anchorN += this.dir * M2.speed * dt;
      if (this.anchorN > M2.routeNorth || this.anchorN < M2.routeSouth) {
        this.anchorN = Math.max(M2.routeSouth, Math.min(M2.routeNorth, this.anchorN));
        this.turnTimer = 3;
      }
    }
    const heading = this.dir > 0 ? 0 : PI;
    const fe = Math.sin(heading);
    const fn = Math.cos(heading);
    for (const mm of this.marchers) {
      // Files across (right of the heading), ranks behind.
      const e = M2.paradeE + fn * mm.slot.x - fe * mm.slot.y;
      const n = this.anchorN - fe * mm.slot.x - fn * mm.slot.y;
      mm.target = v3(e, n, 0);
      mm.heading = heading;
      if (mm.state === MarchState.March || mm.state === MarchState.Halt) mm.state = this.turnTimer > 0 ? MarchState.Halt : MarchState.March;
    }
    if (this.inZone() && this.grushkov.anim === 'attention') {
      this.pose2(this.grushkov, 'salute', 4);
      this.pose2(this.general, 'salute', 3);
    }
  }

  private updateChaos(dt: number): void {
    if (this.chaosTimer <= 0) return;
    this.chaosTimer -= dt;
    if (this.speechT > 4.5) {
      this.speechT = 0;
      this.say2(this.grushkov, this.rng.pick(['WHO AUTHORISED THE GULLS?!', 'This will be in my report. MY report!', 'Stop them! No — do not shoot, it is a PARADE!', 'Marshal, I assure you, this is not typical!', 'Somebody fetch a NET!']));
    }
    if (this.chaosTimer <= 0) {
      for (const mm of this.marchers) mm.reform();
      this.pose2(this.grushkov, 'attention');
      this.pose2(this.general, 'attention');
      this.say2(this.grushkov, 'Re-form! RE-FORM! As if nothing happened!');
      this.reformTimer = 6;
    }
  }

  private breakFormation(): void {
    this.brokenCount++;
    this.chaosTimer = CHAOS_TIME;
    this.banner('FORMATION BROKEN', 'good', 2.5);
    this.sfx('flock', undefined, -2);
    const c = this.anchor();
    for (const mm of this.marchers) mm.startChaos(c, M2.chaosArea);
    this.say2(this.grushkov, 'WHO AUTHORISED THE GULLS?!', 4);
    this.pose2(this.grushkov, 'outrage', 6, 'flail');
    this.pose2(this.general, 'shoo', 8);
    this.speechT = 0;
    const S = M2.stand;
    this.voronova.distractions['chaos'] = [
      { e: S.e - 0.6, n: S.n + S.l / 2 - 1.2, speed: 1.6, yaw: -0.6, anim: 'point', wait: 13, busy: true, say: 'Back in line! BACK IN LINE!' },
      { anim: 'point', yaw: -0.9, wait: 9, busy: true, say: 'Form up! FORM UP!' },
    ];
    this.voronova.startDistraction('chaos');
    for (const g of [this.kulik, this.osipov]) {
      g.distractions['chaos'] = [{ e: c.e + this.rng.range(-3, 3), n: c.n + this.rng.range(-4, 4), speed: 2.3, anim: 'shoo', wait: 20, busy: true, say: 'Shoo! SHOO!' }];
      g.startDistraction('chaos');
    }
    if (this.objectiveState('strike') === 'active') {
      this.completeObjective('strike');
      if (this.objectiveState('document') === 'hidden') this.setObjective('document', 'active');
      this.say('Mother', 'The formation’s broken! Voronova has left the lectern — take the Order, now!', 6);
    }
  }

  private formationHolds(solo: boolean): void {
    if (this.objectiveState('strike') !== 'active') return;
    this.say2(this.grushkov, 'Steady! Eyes FRONT! It is only birds!');
    for (const g of [this.voronova, this.kulik, this.osipov]) g.alarmTimer = Math.max(g.alarmTimer, 15);
    if (solo) this.say('Mother', 'Good hits, but not in front of the stand — the formation held. Time it for when they pass the Commandant.', 5.5);
    else this.say('Mother', 'The formation held. The Wing is going back to reload — signal again from the roost, and drop as they pass the stand.', 6);
    if (this.objectiveState('signal') === 'done') this.setObjective('signal', 'active', 'Signal the Bomber Wing again from the hotel roof [G]');
  }

  protected override onSignal(): boolean {
    const g = this.gull;
    if (Math.hypot(g.pos.e - this.roostPerch.pos.e, g.pos.n - this.roostPerch.pos.n, g.pos.h - this.roostPerch.pos.h) > 26) {
      this.toast('The Wing roosts on the Royal Castle Hotel — signal from there', 'warn');
      this.sfx('squawk', undefined, -2);
      return true;
    }
    const ready = this.allies.filter((a) => a.isReady());
    if (!ready.length) {
      this.toast('The Wing is still reloading', 'warn');
      this.sfx('squawk', undefined, -2);
      return true;
    }
    for (const a of ready) a.scramble();
    this.flockOut = true;
    this.releaseTime = -100;
    this.sfx('flock', undefined, 0);
    this.toast(`BOMBER WING: ${ready.length} gulls on your wing`, 'good');
    if (this.objectiveState('signal') !== 'done') {
      this.completeObjective('signal');
      if (this.objectiveState('strike') === 'hidden') this.setObjective('strike', 'active');
      this.say('Mother', 'The Wing is with you, in a tight box. Fly along the column, not across it, and release as they pass the stand — they drop when you drop.', 7);
    }
    return true;
  }

  override spawnPoop(pos: V3, vel: V3, fromFlock = false): void {
    super.spawnPoop(pos, vel, fromFlock);
    if (!fromFlock && this.flockOut) {
      if (this.releaseTime < 0) this.passHits = 0;
      this.releaseTime = this.elapsed;
      let i = 0;
      for (const a of this.allies) {
        if (a.state === AllyState.Follow) {
          a.release(0.05 + i * 0.07);
          i++;
        }
      }
    }
  }

  protected override onTargetHit(t: PoopTarget): void {
    if (t.kind === 'soldier') {
      (t.owner as Marcher).onHit();
      this.hitTimes.push(this.elapsed);
      this.passHits++;
    }
  }

  protected override onTagged(g: Guard): void {
    if (g === this.voronova && this.objectiveState('scout') === 'active') {
      this.completeObjective('scout');
      this.setObjective('signal', 'active');
      this.say('Mother', 'Voronova. She’ll not leave that lectern unless something truly dreadful happens to the parade. The Wing is on the Royal Castle Hotel roof, across the Boat Float — signal them with G.', 7);
    }
  }

  protected override onItemGrabbed(it: Item): void {
    if (it === this.document && this.objectiveState('document') !== 'done') {
      this.completeObjective('document');
      this.setObjective('deliver', 'active');
      if (this.objectiveState('strike') === 'active') this.setObjective('strike', 'done');
      this.say('Mother', 'You have the Order! To the Boat Float, Bomber lead — the Dorothy May. Stay over the rooftops.', 6);
    }
  }

  protected override onItemDelivered(it: Item): void {
    if (it === this.document) {
      this.delivered = true;
      this.completeObjective('deliver');
    }
  }

  override primaryDone(): boolean {
    return this.delivered;
  }

  protected override resultLines(): [string, number][] {
    const fh = this.stats.flockHits;
    return [
      ['Formation broken before the Marshal', this.brokenCount > 0 ? 400 : 0],
      ['Inspection Order delivered to the Dorothy May', this.delivered ? 500 : 0],
      [`Bomber Wing: ${fh} hits on the parade`, fh * 15],
    ];
  }

  override gradeBands(): [number, string, string][] {
    return [
      [1650, 'A+', 'Distinguished Gull Cross (with Bar)'],
      [1300, 'A', 'Exemplary'],
      [950, 'B', 'Satisfactory'],
      [650, 'C', 'Adequate, with Reservations'],
      [0, 'D', 'Under Review'],
    ];
  }

  protected override remarks(): string[] {
    const r: string[] = [];
    if (this.brokenCount > 0) {
      r.push('The Marshal’s greatcoat has been forwarded to Moscow for analysis.');
      r.push('Colonel Grushkov has requested ‘anti-gull measures’. Section G is not aware of any that work.');
    }
    if (this.brokenCount > 1) r.push(`The formation was broken ${this.brokenCount} times. The Committee notes this exceeds requirements, and approves.`);
    if (this.stats.flockHits >= 12) r.push('Mrs Wimbush asks that her contribution be recorded. It is so recorded.');
    return r;
  }

  override debriefText(): string {
    return 'DEBRIEF — The Inspection Order confirms it: S-197 berths at Sandquay for forty-eight hours of resupply, forward hatch open while stores go aboard. And on Saturday the Kommandatura begins Operation PRIBOI, a sweep of every Resistance hideout along the Dart. Grushkov has doubled the patrols and closed the shops on the Embankment. He has also ordered nets.';
  }

  // ------------------------------------------------------------------ test helpers

  setParade(n: number, dir: 1 | -1): void {
    this.anchorN = n;
    this.dir = dir;
    this.turnTimer = 0;
    this.updateParade(0);
    for (const mm of this.marchers) mm.pos = { ...mm.target, h: this.world.groundAt(mm.target.e, mm.target.n) };
  }

  snapFlock(): void {
    for (const a of this.allies) if (a.state === AllyState.Follow) a.snapTo(this.gull);
  }

  get guardsBusy(): boolean {
    return this.voronova.state === GuardState.Distracted;
  }
}
