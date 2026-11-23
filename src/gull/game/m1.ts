/**
 * Mission 1 — A Chip Off the Old Block, on the real Bayard's Cove.
 *
 * Learn to fly and perch, steal lunch, snatch the courier's dispatch from under Private Borovsky's nose outside the
 * Custom House on Bayard's Cove, and deliver it to the lobster pot aboard the Dorothy May in the Boat Float.
 *
 * Two approaches:
 * - Unseen (timing): wait on the Custom House gutter or roof, out of a calm sentry's eyeline, until his routine takes
 *   him to the river wall or down towards the fort. Then drop, snatch and leave over the roofs.
 * - Distraction: from the quay lamp or the Brixham Lass's mast, poop on the sentry (he goes to the pump to scrub his
 *   tunic) or in his tea (he goes up the lane to the field kitchen for a refill). Either way the table is left
 *   unwatched.
 *
 * Positions are SailSim's local metres (e east, n north of the RDYC); heights are m ODN, read from the world where
 * they stand on the town (roofs, quay) so they match the picture.
 */
import { Guard, GuardState } from './guard';
import type { Perch } from './gull';
import type { Item } from './items';
import { Mission, type DropPoint, type Npc, type PoopTarget, type Prop } from './mission';
import { v3, type World } from './world';

const PI = Math.PI;
/** Compass yaws (north is 0). */
const EAST = PI / 2;
const SOUTH = PI;
const WEST = -PI / 2;

/** Where things are (e, n). Heights come from the world. */
export const M1 = {
  nest: { e: -330, n: 298 },
  stationRoof: { e: -277, n: 372 },
  churchRoof: { e: -396, n: 346 },
  customGutter: { e: -322.4, n: 59 },
  customRidge: { e: -326, n: 60 },
  coveLamp: { e: -309.2, n: 63.5 },
  brixham: { e: -297.5, n: 52, yaw: 0.12 },
  fortParapet: { e: -290, n: -8.2 },
  table: { e: -318.4, n: 58.2 },
  post: { e: -314.2, n: 56.6 },
  barrel: { e: -315.2, n: 54.2 },
  river: { e: -309.6, n: 66.5 },
  fortEnd: { e: -302.5, n: 31 },
  pump: { e: -319.6, n: 74.5 },
  kitchen: { e: -331.5, n: 77.5 },
  laneFoot: { e: -317.5, n: 71.5 },
  sill: { e: -312.75, n: 40.2 },
  bench: { e: -276.4, n: 310 },
  dorothy: { e: -318, n: 392, yaw: 0.05 },
  sentryArea: { eMin: -335, eMax: -299, nMin: 22, nMax: 90 },
};

export class Mission1 extends Mission {
  sentry!: Guard;
  dispatch!: Item;
  pasty!: Item;
  chips: Item[] = [];
  pot!: DropPoint;
  stash!: DropPoint;
  stationPerch!: Perch;
  gutterPerch!: Perch;
  lampPerch!: Perch;
  clerk!: Npc;
  cook!: Npc;
  mug!: Prop;
  mugTarget!: PoopTarget;
  private teaSpilled = false;
  private hintTimer = 0;
  lunchDone = false;
  delivered = false;
  private distractionSaid = '';

  constructor(world: World, seed = 1967) {
    super(world, seed);
  }

  /** Ground and roof heights. */
  private g(p: { e: number; n: number }): number {
    return this.world.groundAt(p.e, p.n);
  }

  private top(p: { e: number; n: number }): number {
    return this.world.cellTop(p.e, p.n);
  }

  protected setup(): void {
    this.id = 'm1';
    this.title = 'A Chip Off the Old Block';
    this.parTime = 300;
    const W = this.world;
    const wl = W.waterLevel;

    // The nest, on a flat roof above the South Embankment, looking north to the station.
    const nest = v3(M1.nest.e, M1.nest.n, this.top(M1.nest));
    this.spawnGull(v3(nest.e, nest.n, nest.h + 0.35), Math.atan2(M1.stationRoof.e - nest.e, M1.stationRoof.n - nest.n));
    this.addProp({ id: 'nest', kind: 'nest', pos: nest, yaw: 0 });

    // Perches.
    this.addPerch('nest', nest, 'The Nest', 'Resistance stash. Bring food here and press [E].');
    this.stationPerch = this.addPerch('station', v3(M1.stationRoof.e, M1.stationRoof.n, this.top(M1.stationRoof)), 'Station roof', 'Bayard’s Cove lies south along the river. Hold right mouse to scout.');
    this.addPerch('church', v3(M1.churchRoof.e, M1.churchRoof.n, this.top(M1.churchRoof)), 'St Saviour’s roof', 'The old town at a glance.');
    this.gutterPerch = this.addPerch('gutter', v3(M1.customGutter.e, M1.customGutter.n, this.top(M1.customGutter)), 'Custom House gutter', 'Right above the dispatch. A calm sentry never looks this high.');
    this.addPerch('ridge', v3(M1.customRidge.e, M1.customRidge.n, this.top(M1.customRidge)), 'Custom House roof', 'Watch his routine from here.');
    this.addPerch('fort', this.world.highestNear(M1.fortParapet.e, M1.fortParapet.n, 1.5), 'Fort parapet', 'The fort end of his patrol.');

    // The quay lamp: a cast-iron post with a lantern, on the quay's edge.
    const lampBase = this.g(M1.coveLamp);
    this.addProp({ id: 'lamp', kind: 'lamp', pos: v3(M1.coveLamp.e, M1.coveLamp.n, lampBase), yaw: 0, solids: [{ solid: this.cyl(M1.coveLamp.e, M1.coveLamp.n, 0.12, lampBase, lampBase + 3.9), dh0: 0, dh1: 3.9 }] });
    this.lampPerch = this.addPerch('lamp', v3(M1.coveLamp.e, M1.coveLamp.n, lampBase + 4.25), 'Quay lamp', 'Clear line to the sentry and his tea.');

    // The Brixham Lass, a Brixham trawler moored off the cove: her mast is a perch nobody looks at.
    const bx = M1.brixham;
    this.addProp({
      id: 'brixham',
      kind: 'trawler',
      pos: v3(bx.e, bx.n, wl),
      yaw: bx.yaw,
      float: 0,
      data: { name: 'BRIXHAM LASS', colour: 0x2f4a6b },
      solids: [
        { solid: this.box(bx.e, bx.n, -bx.yaw, 1.6, 4.6, wl - 0.8, wl + 1.0), dh0: -0.8, dh1: 1.0 },
        { solid: this.cyl(bx.e + Math.sin(bx.yaw) * 1.2, bx.n + Math.cos(bx.yaw) * 1.2, 0.1, wl + 1.0, wl + 7.4), dh0: 1.0, dh1: 7.4 },
      ],
    });
    this.addPerch('brixham:mast', v3(bx.e + Math.sin(bx.yaw) * 1.2, bx.n + Math.cos(bx.yaw) * 1.2, wl + 7.5), 'Mast of the Brixham Lass', 'Out on the water. Nobody looks at a gull on a mast.');

    // The Dorothy May in the Boat Float, the lobster pot on her afterdeck.
    const dm = M1.dorothy;
    const deck = 0.95;
    this.addProp({
      id: 'dorothy',
      kind: 'crabber',
      pos: v3(dm.e, dm.n, wl),
      yaw: dm.yaw,
      float: 0,
      data: { name: 'DOROTHY MAY', colour: 0x7a2424 },
      solids: [
        { solid: this.box(dm.e, dm.n, -dm.yaw, 1.7, 5, wl - 0.8, wl + deck), dh0: -0.8, dh1: deck },
        { solid: this.box(dm.e + Math.sin(dm.yaw) * 1.5, dm.n + Math.cos(dm.yaw) * 1.5, -dm.yaw, 0.9, 1.0, wl + deck, wl + deck + 1.9), dh0: deck, dh1: deck + 1.9 },
      ],
    });
    const potAt = v3(dm.e - Math.sin(dm.yaw) * 3, dm.n - Math.cos(dm.yaw) * 3, wl + deck);
    this.addProp({ id: 'dorothy:pot', kind: 'lobster_pot', pos: potAt, yaw: dm.yaw, float: deck });
    this.addPerch('dorothy:wheelhouse', v3(dm.e + Math.sin(dm.yaw) * 1.5, dm.n + Math.cos(dm.yaw) * 1.5, wl + deck + 1.9), 'Dorothy May’s wheelhouse', 'The drop. The pot is on her afterdeck.');

    // Drop points.
    this.stash = this.addDrop('stash', v3(nest.e, nest.n, nest.h + 0.05), 'the nest stash', ['food'], 'nest', 1.8);
    this.pot = this.addDrop('dorothy:pot', v3(potAt.e, potAt.n, potAt.h + 0.3), 'the lobster pot on the Dorothy May', ['dispatch'], 'lobster_pot', 2.6);

    // Lunch: the clerk's chips on the Embankment bench; a pasty cooling on the bakery's windowsill in the cove.
    const bench = M1.bench;
    const bh = this.g(bench);
    this.addProp({ id: 'bench', kind: 'bench', pos: v3(bench.e, bench.n, bh), yaw: EAST, solids: [{ solid: this.box(bench.e, bench.n, 0, 0.3, 0.9, bh, bh + 0.48), dh0: 0, dh1: 0.48 }] });
    this.clerk = { id: 'clerk', style: 'civilian', pos: v3(bench.e - 0.05, bench.n + 0.35, bh), yaw: EAST, anim: 'sit', headYaw: 0, headPitch: 0, phase: 0, moving: false };
    this.npcs.push(this.clerk);
    this.addProp({ id: 'chip-paper', kind: 'newspaper', pos: v3(bench.e, bench.n - 0.45, bh + 0.49), yaw: 0.2 });
    for (let i = 0; i < 4; i++) this.chips.push(this.addItem('chip', v3(bench.e - 0.05 + (i % 2) * 0.12, bench.n - 0.5 + Math.floor(i / 2) * 0.14, bh + 0.51), this.rng.next() * 2 * PI, 'the clerk’s chips'));
    const sill = M1.sill;
    const sh = this.g(sill) + 1.02;
    this.addProp({ id: 'sill', kind: 'sill', pos: v3(sill.e, sill.n, sh), yaw: EAST, solids: [{ solid: this.box(sill.e, sill.n, 0, 0.2, 0.55, sh - 0.08, sh), dh0: -0.08, dh1: 0 }] });
    this.pasty = this.addItem('pasty', v3(sill.e, sill.n, sh), 0.4, 'the bakery windowsill');
    this.addItem('crust', v3(-289.5, 250, this.g({ e: -289.5, n: 250 }) + 0.02), 0.2);
    this.addItem('crust', v3(-306, 102, this.g({ e: -306, n: 102 }) + 0.02), 1.0);
    this.addItem('fishhead', v3(-281.5, 331, this.g({ e: -281.5, n: 331 }) + 0.02), 0.5);

    // The courier's table outside the Custom House, the dispatch on it.
    const tb = M1.table;
    const th = this.g(tb);
    this.addProp({ id: 'table', kind: 'table', pos: v3(tb.e, tb.n, th), yaw: 0, solids: [{ solid: this.box(tb.e, tb.n, 0, 0.45, 0.65, th, th + 0.78), dh0: 0, dh1: 0.78 }] });
    this.addProp({ id: 'chair', kind: 'chair', pos: v3(tb.e - 0.75, tb.n, th), yaw: EAST });
    this.dispatch = this.addItem('dispatch', v3(tb.e, tb.n + 0.1, th + 0.79), 0.1, 'the courier’s table');
    this.restricted.push({ e: tb.e, n: tb.n, h: th, radius: 6, height: 4.5 });

    // The pump at the north end of the cove, and the field kitchen up the lane.
    const pump = M1.pump;
    const ph = this.g(pump);
    this.addProp({ id: 'pump', kind: 'pump', pos: v3(pump.e, pump.n, ph), yaw: EAST, solids: [{ solid: this.cyl(pump.e, pump.n, 0.18, ph, ph + 1.45), dh0: 0, dh1: 1.45 }] });
    const k = M1.kitchen;
    const kh = this.g(k);
    this.addProp({ id: 'kitchen', kind: 'field_kitchen', pos: v3(k.e, k.n, kh), yaw: EAST, solids: [{ solid: this.box(k.e, k.n, 0, 0.8, 1.1, kh, kh + 1.5), dh0: 0, dh1: 1.5 }] });
    this.cook = { id: 'cook', style: 'cook', pos: v3(k.e - 1.4, k.n + 0.2, kh), yaw: EAST, anim: 'stir', headYaw: 0, headPitch: 0, phase: 0, moving: false };
    this.npcs.push(this.cook);

    // Private Borovsky.
    const s = new Guard('borovsky', 'Pte. Borovsky', this, this.rng);
    s.routineText = 'post · tea · river · fort';
    s.area = M1.sentryArea;
    s.routine = [
      { ...M1.post, yaw: WEST, wait: 8, anim: 'idle', say: 'All quiet. As ordered.' },
      { e: M1.post.e - 0.3, n: M1.post.n - 1.3, yaw: -2.4, wait: 4.5, anim: 'sip', say: 'Ahh. Tea.' },
      { ...M1.river, yaw: EAST, wait: 9, anim: 'idle', say: 'Boats. Water. More boats.' },
      { ...M1.fortEnd, yaw: SOUTH + 0.25, wait: 9, anim: 'idle', say: 'Beautiful. Like Odessa, but wetter.' },
    ];
    s.postStep = 0;
    s.distractions = {
      uniform: [
        { anim: 'outrage', wait: 2.2, say: 'My tunic! My BEST tunic!' },
        { e: M1.pump.e + 0.9, n: M1.pump.n - 0.3, speed: 1.5, yaw: WEST, anim: 'scrub', wait: 11, busy: true, say: 'Scrub. Scrub. Disgraceful bird.' },
        { anim: 'idle', wait: 1.6, say: '…It is still there. It is STILL THERE.' },
      ],
      tea: [
        { anim: 'outrage', wait: 2, say: 'My TEA! It went in my TEA!' },
        { ...M1.laneFoot, speed: 1.45 },
        { e: M1.kitchen.e + 1.2, n: M1.kitchen.n - 0.6, speed: 1.2, yaw: WEST, anim: 'idle', wait: 7.5, busy: true, say: 'Comrade Cook! More tea. A gull has… never mind.' },
        { anim: 'sip', yaw: WEST, wait: 3, busy: true, say: 'Better.' },
      ],
    };
    this.sentry = this.addGuard(s);
    s.guardedItem = this.dispatch;

    // His tea, on the barrel by his post: a small but tempting target.
    const br = M1.barrel;
    const bh2 = this.g(br);
    this.addProp({ id: 'barrel', kind: 'barrel', pos: v3(br.e, br.n, bh2), yaw: 0, solids: [{ solid: this.cyl(br.e, br.n, 0.32, bh2, bh2 + 0.9), dh0: 0, dh1: 0.9 }] });
    this.mug = this.addProp({ id: 'mug', kind: 'mug', pos: v3(br.e, br.n, bh2 + 0.9), yaw: 0, data: { spilled: false } });
    this.mugTarget = this.addTarget({ kind: 'tea', radius: 0.6, pos: () => this.mug.pos, guard: s, active: () => this.mug.visible !== false && !this.teaSpilled });

    // Objectives.
    this.addObjective('takeoff', 'Take off from the nest [Space]');
    this.addObjective('perch', 'Land on the station roof (hold R to glide in)', this.stationPerch.pos, false, 'hidden');
    this.addObjective('scout', 'Optional: hold right mouse and tag the sentry on Bayard’s Cove', undefined, true, 'hidden');
    this.addObjective('lunch', 'Lunch: snatch a chip or the pasty, then eat it [F] or stash it at the nest', undefined, false, 'hidden');
    this.addObjective('dispatch', 'Steal the courier’s dispatch from the table outside the Custom House', () => this.dispatch.pos, false, 'hidden');
    this.addObjective('deliver', 'Deliver the dispatch to the lobster pot aboard the Dorothy May', this.pot.pos, false, 'hidden');
  }

  protected override onStart(): void {
    this.music('mission');
    this.say('Mother', 'Morning, Scrumpy. Mother here. You’re on the nest. Space to take off when ready.', 6);
  }

  protected override tick(dt: number): void {
    this.hintTimer += dt;
    const g = this.gull;
    if (this.objectiveState('takeoff') === 'active' && g.isAirborne() && g.timeInMode > 0.3) {
      this.completeObjective('takeoff');
      this.setObjective('perch', 'active');
      this.stationPerch.highlight = true;
      this.say('Mother', 'W to flap, look where you want to go. Shift to dive, S to brake. Now land on the station roof by the Boat Float — hold R near it and the wings will do the rest.', 8);
    }
    if (this.objectiveState('perch') === 'active' && this.hintTimer > 40) this.sayOnce('perch_hint', 'Mother', 'The station is the little building on the Embankment, north of you by the Boat Float — follow the marker. Brake with S, or hold R.', 6);
    // The tea mug: in hand while he sips, spilled after a hit, refilled when he is back.
    const s = this.sentry;
    const sipping = s.anim === 'sip' && s.state === GuardState.Routine;
    this.mug.visible = !sipping;
    if (this.teaSpilled && s.state !== GuardState.Distracted) {
      this.teaSpilled = false;
      this.mug.data = { spilled: false };
    }
    // The lunch objective points at the nearest prize, or home with food in the beak.
    if (this.objectiveState('lunch') === 'active') {
      if (this.beak?.isFood) this.setObjectiveTarget('lunch', this.stash.pos);
      else {
        let best: Item | undefined;
        let bd = Infinity;
        for (const it of this.items) {
          if (!it.isFood || !it.isGrabbable() || it.bonus <= 0) continue;
          const d = Math.hypot(it.pos.e - g.pos.e, it.pos.n - g.pos.n, it.pos.h - g.pos.h);
          if (d < bd) {
            bd = d;
            best = it;
          }
        }
        this.setObjectiveTarget('lunch', best ? best.pos : undefined);
      }
    }
    // Narrate the distraction window once per kind.
    if (s.state === GuardState.Distracted) {
      const k = s.distractionKind();
      if (k !== this.distractionSaid) {
        this.distractionSaid = k;
        if (k === 'tea') this.say('Mother', 'Ha! Into the tea. He’s off up the lane for a refill — the table’s unwatched. Go!', 5);
        else if (k === 'uniform') this.say('Mother', 'Direct hit. He’s gone to scrub his tunic at the pump. The table’s yours.', 5);
      }
    } else this.distractionSaid = '';
    // The beak-slot dilemma.
    if (this.beak?.isMission && this.objectiveState('lunch') === 'active') {
      const food = this.nearestItem(6);
      if (food?.isFood) this.sayOnce('dilemma', 'Mother', 'One beak, Scrumpy. Set the dispatch down if you must — but somewhere he won’t find it — or come back for lunch later.', 6.5);
    }
    // The clerk eats; the cook stirs.
    this.clerk.phase += dt;
    if (this.clerk.anim === 'flail' && (this.clerk.speech?.t ?? 0) <= 0.4) this.clerk.anim = 'sit';
    this.cook.phase += dt;
    if (this.delivered && this.lunchDone && !this.completed) {
      this.say('Mother', 'Dispatch received and lunch accounted for. Come home, Scrumpy. Splendid work.', 5);
      this.completeMission(3);
    }
  }

  protected override onPerchedHook(p: Perch): void {
    if (p === this.stationPerch && this.objectiveState('perch') === 'active') {
      this.completeObjective('perch');
      this.stationPerch.highlight = false;
      this.setObjective('scout', 'active');
      this.setObjective('lunch', 'active');
      this.setObjective('dispatch', 'active');
      this.say('Mother', 'Good landing. Bayard’s Cove is south along the river, past the ferry slip. Hold right mouse to scout and tag the sentry, so we can see what he sees.', 7);
      this.after(9, () => this.say('Mother', 'Section G regulations: no operative works on an empty stomach. The clerk on the Embankment bench has chips. The bakery in the cove has a pasty cooling on its sill — tastier, riskier.', 8));
    } else if (p === this.gutterPerch) this.sayOnce('gutter', 'Mother', 'Lovely spot. A calm sentry won’t look up this high — but a suspicious one will. Wait for his back.', 5);
    else if (p === this.lampPerch) this.sayOnce('lamp', 'Mother', 'From here you can see his tea on the barrel. He is very attached to that tea.', 5);
  }

  protected override onTagged(g: Guard): void {
    if (g === this.sentry) {
      this.completeObjective('scout');
      this.say('Mother', 'Private Borovsky. Creature of habit: post, tea, river, fort, and round again. Note when his back is turned. Note also: he loves his tea.', 7);
    }
  }

  protected override onItemGrabbed(it: Item): void {
    if (it.kind === 'chip') {
      this.clerk.anim = 'flail';
      this.clerk.speech = { text: this.rng.pick(['Hey! Bird! Those are STATE chips!', 'Shoo! Shoo, you hooligan!', 'My lunch! My only joy!', 'Every day. Every single day.']), t: 3 };
      this.sfx('huh', this.clerk.pos, 0, 0.8);
    }
    if (it === this.dispatch && this.objectiveState('dispatch') === 'active') {
      this.completeObjective('dispatch');
      this.setObjective('deliver', 'active');
      this.say('Mother', 'You have it! Now to the Boat Float — the lobster pot on the Dorothy May. Stay high, stay ordinary.', 6);
    }
    if (it === this.pasty) this.sayOnce('pasty', 'Mother', 'The pasty! Bold. Eat it with F, or take it home to the nest for the pantry.', 4.5);
  }

  protected override onFoodSecured(): void {
    if (!this.lunchDone) {
      this.lunchDone = true;
      this.completeObjective('lunch');
      if (!this.delivered) this.say('Mother', 'Morale restored. Now: the dispatch.', 3.5);
    }
  }

  protected override onItemDelivered(it: Item): void {
    if (it === this.dispatch) {
      this.delivered = true;
      this.completeObjective('deliver');
      if (!this.lunchDone) this.say('Mother', 'Dispatch received. Now — lunch. Regulations, I’m afraid.', 5);
    }
  }

  protected override onTargetHit(t: PoopTarget): void {
    if (t === this.mugTarget) {
      this.teaSpilled = true;
      this.mug.data = { spilled: true };
    }
  }

  /** Tests: skip the flying lesson (objectives as if perched on the station). */
  skipTutorial(): void {
    this.completeObjective('takeoff');
    this.setObjective('perch', 'active');
    this.onPerchedHook(this.stationPerch);
  }

  override primaryDone(): boolean {
    return this.delivered;
  }

  protected override resultLines(): [string, number][] {
    return [['Dispatch delivered to the Dorothy May', this.delivered ? 500 : 0]];
  }

  protected override remarks(): string[] {
    const r: string[] = [];
    if (this.stats.guardHits > 0) r.push('Private Borovsky’s tunic has been submitted to the laundry under protest.');
    if (this.stats.theftDiscovered) r.push('The theft was discovered on site. The sentry’s report describes ‘a large, insolent gull’. Section G considers this accurate.');
    else r.push('The theft went unnoticed at the scene. The sentry’s report lists ‘nothing unusual, apart from the gulls’.');
    if (this.stats.itemsSetDown > 0) r.push(`The dispatch was set down in the field on ${this.stats.itemsSetDown} occasion(s). This is noted without comment.`);
    return r;
  }

  override debriefText(): string {
    return 'DEBRIEF — The dispatch is a resupply manifest for the harbour. One line stands out: berth reserved at Sandquay for ‘S-197’, a submarine, arriving within the week. The Commandant will review the garrison on the Embankment beforehand, and the berthing orders will be on his lectern. Section G is assembling a flock.';
  }
}

