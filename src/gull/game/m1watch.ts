/**
 * Mission 1's stealth script: everyone on Bayard's Cove who is not Private Borovsky, and the clock.
 *
 * - The courier is a person. He is at lunch by the field kitchen up the lane, where a gull can see him, and he is
 *   back at his table at half past one (COURIER_BACK seconds into the operation). If the dispatch is on the table
 *   when he gets there, it goes into his satchel and the operation is Compromised. If the alert ladder reaches the
 *   top first, he is sent for and comes at a run.
 * - Mrs Pascoe, the baker, minds the pasty on her sill: at her door for a while, at her oven for a while. A gull at
 *   the pasty in her sight is shouted at, and the shout brings the sentry. That is why the pasty is riskier than the
 *   chips.
 * - Corporal Dunayev drinks his tea by the kitchen, off duty, until the alert ladder reaches "searching". Then he is
 *   the second watcher, at the foot of the lane, with a rhythm of his own.
 * - Each rung of the ladder changes the level: suspicious, the sentry looks higher and checks the sky; searching,
 *   the corporal is posted; alarmed, the sentry weighs the dispatch down with a mug (the first pull only knocks it
 *   off, with a clatter); at the top, the courier is called back.
 * - The cove's gulls: loafers on the Custom House roof, circlers over the water, beggars at the clerk's bench, a
 *   squabble near the nest, two working the wake of a boat in the river.
 *
 * It lives beside m1.ts so that the mission file keeps to its places, its lesson and its text. DOM-free.
 */
import { AlertLevel, type AlertLevelId } from './alert';
import { WakeTrack } from './ambient';
import { Guard, GuardState, type RoutineStep } from './guard';
import { ItemState, type Item } from './items';
import type { M1 } from './m1';
import type { Mission, Npc, Prop, StealthDirector } from './mission';
import { v3, type V3 } from './world';

const PI = Math.PI;
const EAST = PI / 2;
const WEST = -PI / 2;

/** When the courier is back at his table: 13.30 by St Saviour's clock, ten minutes after the operation starts. */
export const COURIER_BACK = 600;
/** How long before that Mother gives her warning (s). */
export const COURIER_WARNING = 120;
const COURIER_WALK = 1.6;
const COURIER_RUN = 3.3;

export type CourierPhase = 'lunch' | 'returning' | 'at_table' | 'leaving';

/** What the mission must hold for this script (Mission 1 does). */
export interface M1Stage extends Mission {
  sentry: Guard;
  dispatch: Item;
  pasty: Item;
}

export class M1Watch implements StealthDirector {
  baker!: Guard;
  corporal!: Guard;
  courier!: Npc;
  courierPhase: CourierPhase = 'lunch';
  /** He was sent for (the alert ladder reached the top) rather than coming back on his own clock. */
  courierRecalled = false;
  /** The mug the sentry puts on the dispatch at "alarmed". */
  weight!: Prop;
  wake!: WakeTrack;
  /** The corporal has been posted (the ladder reached "searching"). */
  posted = false;
  /** The sentry has been told to cover the dispatch (the ladder reached "alarmed"), and has done it. */
  coverOrdered = false;
  covered = false;

  private path: { e: number; n: number }[] = [];
  private leaveTimer = 0;
  private warned = false;
  private readonly ground: number;

  constructor(
    private readonly m: M1Stage,
    private readonly at: typeof M1,
  ) {
    this.ground = m.world.groundAt(at.table.e, at.table.n);
    this.setup();
  }

  private g(p: { e: number; n: number }): number {
    return this.m.world.groundAt(p.e, p.n);
  }

  // ------------------------------------------------------------------ the cast

  private setup(): void {
    const m = this.m;
    const P = this.at;
    const W = m.world;

    // Mrs Pascoe: at her door beside the sill, then in at the oven, and round again.
    const sill = P.sill;
    const door = { e: sill.e + 0.6, n: sill.n + 1.9 };
    const oven = { e: door.e - 3.5, n: door.n };
    const doorH = this.g(door);
    const b = new Guard('baker', 'Mrs Pascoe', m, m.rng);
    b.civilian = true;
    b.style = 'civilian';
    b.label = 'the baker';
    b.viewRange = 10;
    b.fovDeg = 110;
    b.walkSpeed = 1.4;
    b.runSpeed = 3;
    b.canThrow = false;
    b.groundOverride = () => doorH;
    b.area = { eMin: door.e - 0.6, eMax: door.e + 2.6, nMin: sill.n - 2.2, nMax: door.n + 2 };
    b.routine = [
      { ...door, yaw: 2.4, wait: 6, anim: 'idle', label: 'at her door', watch: true, say: 'Cooling nicely.' },
      { ...oven, yaw: WEST, wait: 7, anim: 'idle', label: 'at the oven', tell: { before: 1.5, say: 'Now. Those pasties.' } },
    ];
    b.routineText = b.routineLabels().join(' · ');
    b.lines = {
      suspicious: ['Shoo!', 'Get away from that sill.', 'I can see you, bird.'],
      alert: ['THIEF! My pasty!', 'Private! That gull has my pasty!', 'Stop that bird!'],
      search: ['Where did it go?', 'It went over the roofs.'],
      return: ['Gulls. Worse than the soldiers.', 'Every day. Every single day.'],
      lost: ['Gone. And my pasty with it.'],
    };
    this.baker = m.addGuard(b);
    b.guardedItem = m.pasty;
    m.pasty.watched = true;

    // Corporal Dunayev: off duty by the field kitchen until he is wanted.
    const k = P.kitchen;
    const rest = { e: k.e + 2.6, n: k.n + 1.8 };
    const c = new Guard('corporal', 'Cpl. Dunayev', m, m.rng);
    c.label = 'the corporal';
    c.viewRange = 18;
    c.fovDeg = 100;
    c.offDuty = true;
    c.area = P.sentryArea;
    c.routine = [{ ...rest, yaw: Math.atan2(k.e - rest.e, k.n - rest.n), wait: 8, anim: 'sip', label: 'off duty, with tea' }];
    c.routineText = c.routineLabels().join(' · ');
    this.corporal = m.addGuard(c);

    // The courier, at his lunch beside the kitchen.
    const seat = { e: k.e + 0.4, n: k.n + 2.4 };
    this.courier = { id: 'courier', style: 'soldier', pos: v3(seat.e, seat.n, this.g(seat)), yaw: Math.atan2(k.e - seat.e, k.n - seat.n), anim: 'sit', headYaw: 0, headPitch: 0, phase: 0, moving: false };
    m.npcs.push(this.courier);
    m.deadline = { label: 'Courier back from lunch', clock: '13.30', at: COURIER_BACK };

    // The mug that will sit on the dispatch, if it comes to that.
    const d = m.dispatch.home.pos;
    this.weight = m.addProp({ id: 'paperweight', kind: 'mug', pos: v3(d.e, d.n, d.h + 0.01), yaw: 0.6, visible: false, data: { spilled: false } });

    // The cove's other gulls.
    const f = m.flock;
    const top = (e: number, n: number) => v3(e, n, W.cellTop(e, n));
    const gutter = P.customGutter;
    const chimney = P.customChimney;
    // Two on the Custom House roof, who stay put: the company that makes a gull on that roof nobody at all.
    f.addLoafer(top(gutter.e - 2.4, gutter.n + 1.6), EAST, true);
    f.addLoafer(top(chimney.e - 0.5, chimney.n + 3.2), 2.2, true);
    const fort = W.highestNear(P.fortParapet.e + 2.5, P.fortParapet.n + 2, 1.5);
    f.addLoafer(fort, 0.4);
    const wl = W.waterLevel;
    f.addCircler(v3(-296, 58, wl + 24), 13, true);
    f.addCircler(v3(-292, 44, wl + 31), 17, false);
    f.addCircler(v3(P.dorothy.e, P.dorothy.n, wl + 26), 15, true);
    const bench = P.bench;
    const walk = (e: number, n: number) => W.groundAt(e, n);
    f.addBeggar(v3(bench.e - 1.6, bench.n, this.g(bench)), 3.2, walk);
    f.addBeggar(v3(bench.e - 1.6, bench.n, this.g(bench)), 3.2, walk);
    f.addSquabble(top(P.nest.e + 15, P.nest.n - 2), 0.3);
    // A crabber working up and down the river off the Embankment, and the two gulls that work her wake.
    this.wake = new WakeTrack(v3(-255, 110, wl), v3(-250, 335, wl), 2.2, 0.35);
    f.addFollower(() => this.wake);
    f.addFollower(() => this.wake);
  }

  /** The corporal's beat once he is posted at the foot of the lane: the table, the river, the roofs, the pump. */
  private watchRoutine(): RoutineStep[] {
    const L = this.at.laneFoot;
    const T = this.at.table;
    const toTable = Math.atan2(T.e - L.e, T.n - L.n);
    return [
      { ...L, yaw: toTable, wait: 6, anim: 'idle', label: 'watches the table', watch: true },
      { ...L, yaw: EAST, wait: 5, anim: 'idle', label: 'the river', tell: { before: 1.3, say: 'Hm.' } },
      { ...L, yaw: toTable, wait: 3, anim: 'look_up', label: 'the roofs', watch: true },
      { e: L.e - 2, n: L.n + 2, yaw: 0, wait: 4, anim: 'idle', label: 'the pump', tell: { before: 1.3, say: 'Still nothing.' } },
    ];
  }

  // ------------------------------------------------------------------ the alert ladder changes the level

  onAlertLevel(level: AlertLevelId, prev: AlertLevelId): void {
    const m = this.m;
    if (level <= prev) return;
    if (level >= AlertLevel.Suspicious) m.sayOnce('alert_1', 'Mother', 'They are wondering about gulls. He will look higher now, and check the sky before he moves.', 5.5);
    if (level >= AlertLevel.Searching && !this.posted) {
      this.posted = true;
      const c = this.corporal;
      c.offDuty = false;
      c.guardedItem = m.dispatch;
      c.vigilance = level;
      c.say('Coming, coming.', 2.5);
      c.setRoutine(this.watchRoutine());
      m.say('Mother', 'They have called out the corporal. Two pairs of eyes on that table. Wait for both to turn.', 5.5);
    }
    if (level >= AlertLevel.Alarmed && !this.coverOrdered) {
      this.coverOrdered = true;
      m.say('Mother', 'He means to weigh the dispatch down with his mug. The first pull will only knock it off, and not quietly.', 6);
    }
  }

  onAlertTop(): void {
    if (this.courierPhase !== 'lunch') return;
    this.courierRecalled = true;
    this.m.say('Mother', 'They have sent for the courier. If the dispatch is on that table when he arrives, it leaves with him.', 6);
    this.startReturn(COURIER_RUN);
  }

  onItemUncovered(it: Item): void {
    if (it !== this.m.dispatch) return;
    this.covered = false;
    const d = it.pos;
    this.weight.pos = v3(d.e + 0.35, d.n - 0.2, d.h);
    this.weight.data = { spilled: true };
  }

  // ------------------------------------------------------------------ each step

  tick(dt: number): void {
    const m = this.m;
    this.wake.update(dt, m.world.waterLevel);
    this.tickCover();
    this.tickCourier(dt);
    this.courier.phase += dt * (this.courier.moving ? 5.8 : 1);
    if (this.courier.anim === 'outrage' && !this.courier.speech) this.courier.anim = 'idle';
  }

  /** Once ordered to, the sentry covers the dispatch the next time he is calm and it is on the table. */
  private tickCover(): void {
    const m = this.m;
    const s = m.sentry;
    const d = m.dispatch;
    this.weight.visible = d.covered || (this.weight.data?.['spilled'] === true && this.coverOrdered);
    if (d.covered) this.weight.pos = v3(d.pos.e, d.pos.n, d.pos.h + 0.01);
    if (!this.coverOrdered || this.covered || d.covered || d.state !== ItemState.Placed) return;
    if (s.state !== GuardState.Routine && s.state !== GuardState.Return) return;
    this.covered = true;
    const T = d.home.pos;
    s.distractions['cover'] = [
      {
        e: T.e + 0.95,
        n: T.n - 0.15,
        speed: 1.3,
        yaw: WEST,
        anim: 'idle',
        wait: 1.6,
        say: 'Nobody touches the dispatch.',
        then: () => {
          if (d.state === ItemState.Placed) {
            d.covered = true;
            this.weight.data = { spilled: false };
          } else this.covered = false;
        },
      },
    ];
    s.startDistraction('cover');
  }

  /** Seconds until the courier is at his table (0 once he is). */
  get courierEta(): number {
    const m = this.m;
    if (this.courierPhase === 'lunch') return Math.max(COURIER_BACK - m.elapsed, 0);
    if (this.courierPhase !== 'returning') return 0;
    let d = 0;
    let from: { e: number; n: number } = this.courier.pos;
    for (const p of this.path) {
      d += Math.hypot(p.e - from.e, p.n - from.n);
      from = p;
    }
    return d / (this.courierRecalled ? COURIER_RUN : COURIER_WALK);
  }

  /** Where he stands at the table: its north side, facing it. */
  private tableStand(): { e: number; n: number } {
    const T = this.m.dispatch.home.pos;
    return { e: T.e + 0.1, n: T.n + 1.05 };
  }

  private walkTime(): number {
    const c = this.courier.pos;
    const L = this.at.laneFoot;
    const T = this.tableStand();
    return (Math.hypot(L.e - c.e, L.n - c.n) + Math.hypot(T.e - L.e, T.n - L.n)) / COURIER_WALK;
  }

  private startReturn(speed: number): void {
    const m = this.m;
    this.courierPhase = 'returning';
    this.path = [this.at.laneFoot, this.tableStand()];
    this.courier.anim = 'idle';
    this.courier.speech = { text: speed > COURIER_WALK ? 'My dispatch!' : 'Back to work.', t: 3 };
    if (m.deadline) m.deadline.at = Math.min(m.deadline.at, m.elapsed + this.courierEta);
  }

  private tickCourier(dt: number): void {
    const m = this.m;
    const c = this.courier;
    const d = m.dispatch;
    c.moving = false;
    switch (this.courierPhase) {
      case 'lunch': {
        const left = COURIER_BACK - m.elapsed;
        if (!this.warned && left <= COURIER_WARNING) {
          this.warned = true;
          c.speech = { text: 'The bill, Comrade Cook.', t: 3.5 };
          // Only worth saying while there is still a dispatch to lose.
          if (d.state === ItemState.Placed) m.say('Mother', 'The courier has asked for his bill. Two minutes, Scrumpy, and that dispatch is back in his satchel.', 6);
        }
        if (left <= this.walkTime()) {
          if (d.state === ItemState.Placed) m.say('Mother', 'He is walking back down the lane. Now, or not at all.', 4.5);
          this.startReturn(COURIER_WALK);
        }
        break;
      }
      case 'returning': {
        const to = this.path[0];
        if (!to) {
          this.courierPhase = 'at_table';
          break;
        }
        const speed = this.courierRecalled ? COURIER_RUN : COURIER_WALK;
        const de = to.e - c.pos.e;
        const dn = to.n - c.pos.n;
        const dist = Math.hypot(de, dn);
        if (dist < 0.15) this.path.shift();
        else {
          const s = Math.min(dist, speed * dt);
          c.pos.e += (de / dist) * s;
          c.pos.n += (dn / dist) * s;
          c.pos.h = this.g(c.pos);
          c.yaw = Math.atan2(de, dn);
          c.moving = true;
        }
        break;
      }
      case 'at_table': {
        const T = d.home.pos;
        c.yaw = Math.atan2(T.e - c.pos.e, T.n - c.pos.n);
        if (d.state === ItemState.Placed) {
          // There it is. Into the satchel, and away to the ferry.
          d.take();
          this.courierPhase = 'leaving';
          this.leaveTimer = 0;
          this.path = [this.at.laneFoot, { e: this.at.pump.e + 1.5, n: this.at.pump.n + 14 }];
          c.speech = { text: 'One dispatch. Present and correct.', t: 3.5 };
          m.say('Mother', 'He has it. That is that. Come home, Scrumpy. We shall discuss it when you have eaten.', 5.5);
          m.compromise(4.5);
        } else if (d.state !== ItemState.CarriedByGuard && !m.stats.theftDiscovered) {
          // Gone, and nobody has told him. He tells everybody.
          c.speech = { text: 'Where is my dispatch? BOROVSKY!', t: 4 };
          c.anim = 'outrage';
          m.emitNoise(v3(c.pos.e, c.pos.n, c.pos.h + 1.6), 30, 'shout');
          m.onTheftDiscovered(m.sentry);
          m.sentry.alarmTimer = Math.max(m.sentry.alarmTimer, 35);
        }
        break;
      }
      case 'leaving': {
        this.leaveTimer += dt;
        d.pos = v3(c.pos.e + Math.sin(c.yaw) * 0.2, c.pos.n + Math.cos(c.yaw) * 0.2, c.pos.h + 1.0);
        const to = this.path[0];
        if (!to || this.leaveTimer < 1.2) break;
        const de = to.e - c.pos.e;
        const dn = to.n - c.pos.n;
        const dist = Math.hypot(de, dn);
        if (dist < 0.15) this.path.shift();
        else {
          const s = Math.min(dist, COURIER_WALK * dt);
          c.pos.e += (de / dist) * s;
          c.pos.n += (dn / dist) * s;
          c.pos.h = this.g(c.pos);
          c.yaw = Math.atan2(de, dn);
          c.moving = true;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ the review, when it went wrong

  compromisedDebrief(): string {
    return this.courierRecalled
      ? 'DEBRIEF. The garrison sent for the courier, and the courier came. The dispatch left Bayard’s Cove in his satchel at a run. Section G has learned what was in it: nothing, because nobody read it. Mother has asked the Committee for a second attempt. The Committee has asked what became of the first.'
      : 'DEBRIEF. The courier finished his lunch, as couriers do, and collected his dispatch at half past one. It has gone up the river with him. Section G notes that the operative was given ten minutes and a table with nobody at it for a good part of them. Mother has asked for a second attempt, and for a watch.';
  }

  compromisedRemarks(): string[] {
    const r: string[] = [];
    r.push(this.courierRecalled ? 'The alarm was raised to its fullest extent. The Committee could hear it from here.' : 'The dispatch was not taken. The courier’s lunch was, by all accounts, unhurried.');
    r.push('No blame attaches to the gull. A good deal attaches to the operative.');
    return r;
  }

  /** Where a held thing sits in the courier's hand (the view may ask). */
  satchel(): V3 {
    const c = this.courier;
    return v3(c.pos.e, c.pos.n, c.pos.h + 1.0);
  }
}
