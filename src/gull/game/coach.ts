/**
 * The coach: decides what to teach the player right now, one verb at a time, from the gull's and the mission's state.
 * Deterministic and DOM-free: it is stepped with the mission and says the same thing for the same flight.
 *
 * A lesson is one instruction ("Hold {flap} to take off.") that stays up until the player has done the thing, and then
 * goes for good. The interface shows the coach's prompt in its one prompt slot, with the current binding's label in
 * place of each `{action}` (actions.ts). When no lesson applies the coach passes on a reminder (afloat, stalling) or
 * the mission's own prompt (Mission.prompt: "{interact} Snatch the chip"), so there is one prompt at a time and it
 * comes from one place.
 *
 * How a mission teaches something: list its lessons in LESSONS below under the mission's id, or give the mission
 * object a `lessons` field (interface Teaches). Lessons are tried in order:
 *  - a lesson whose `done` is already true is ticked off without being shown;
 *  - the first one not done and whose `when` holds is shown, until its `done` is true;
 *  - a lesson that is not `optional` holds back the ones after it; an optional one is passed over while its `when`
 *    does not hold (it comes back when it does).
 * Write the text as one short sentence about one verb, naming actions as `{action}` and never a key.
 */
import { ACTION_IDS, actionsIn, defaultLabel, type ActionId } from './actions';
import { Mode } from './gull';
import type { Mission } from './mission';

/** What the player has been doing since the lesson on show went up. Times in seconds. */
export interface CoachSense {
  /** How long the lesson has been showing. */
  shown: number;
  /** How far the view has turned (rad, yaw and pitch together). */
  turned: number;
  /** Time spent flapping, braking (or gliding in to land) and scouting. */
  flapped: number;
  braked: number;
  scouted: number;
  /** Time in the air. */
  airborne: number;
  /** Time with the current objective's marker held near the middle of the view. */
  onMarker: number;
}

export interface Lesson {
  id: string;
  /** One instruction about one verb, with `{action}` tokens. */
  text: string | ((m: Mission) => string);
  /** Said instead once `patience` seconds have passed without success (default: the same text, marked as a nudge). */
  nudge?: string;
  /** Seconds before the nudge (default 20). */
  patience?: number;
  /** Shown only while this holds (default: as soon as the lessons before it are done). */
  when?: (m: Mission) => boolean;
  /** The player has done it. */
  done: (m: Mission, s: CoachSense) => boolean;
  /** Later lessons do not wait for this one. */
  optional?: boolean;
  /** Taught in the air: on the ground or afloat the coach asks for a take-off first. */
  air?: boolean;
}

/** A standing hint for a fix the player keeps needing (afloat, stalling). Shown the first `times` times it applies. */
export interface Reminder {
  id: string;
  text: string;
  when: (m: Mission) => boolean;
  /** Seconds the condition must hold before the hint appears. */
  after: number;
  times: number;
}

/** A mission that brings its own lessons. */
export interface Teaches {
  lessons: Lesson[];
}

export interface CoachPrompt {
  /** The lesson's or reminder's id, or 'action' for the mission's own prompt. */
  id: string;
  /** Text with `{action}` tokens. */
  text: string;
  kind: 'lesson' | 'reminder' | 'action';
  /** The lesson has been up for a while without success: the interface draws attention to it. */
  nudged: boolean;
  /** The actions the text names, in order. */
  actions: ActionId[];
}

/** The action each default key stands for: "E" → interact, "Space" → flap. */
const BY_KEY: Record<string, ActionId> = {};
for (const id of ACTION_IDS) BY_KEY[defaultLabel(id)] ??= id;

/**
 * Text that still names a default key, rewritten to name the action: "[E] Snatch chip" → "{interact} Snatch chip",
 * "Brake with S" → "Brake with {back}". The base mission (mission.ts) has a few such strings left; everything it sends
 * to the screen passes through here, so a remapped key or a gamepad is labelled correctly all the same. Text already
 * written with `{action}` tokens comes back unchanged.
 */
export function tokenise(text: string): string {
  return text
    .replace(/\[([A-Za-z]+)\]/g, (whole, key: string) => (BY_KEY[key] ? `{${BY_KEY[key]}}` : whole))
    .replace(/\b(with|hold|press|tap|hit) ([A-Z])\b(?![’'-])/g, (whole, verb: string, key: string) => (BY_KEY[key] ? `${verb} {${BY_KEY[key]}}` : whole));
}

const ZERO: CoachSense = { shown: 0, turned: 0, flapped: 0, braked: 0, scouted: 0, airborne: 0, onMarker: 0 };
const RELAUNCH = 'Hold {flap} to take off.';
/** Half-angle of "ahead" for the steering lesson (rad). */
const AHEAD = 0.26;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function flatDistanceToPerch(m: Mission, id: string): number {
  const p = m.perches.find((x) => x.id === id);
  return p ? Math.hypot(p.pos.e - m.gull.pos.e, p.pos.n - m.gull.pos.n) : Infinity;
}

/** A guard the gull could tag from here: untagged, in range and in plain sight. */
function guardInSight(m: Mission, id: string, range: number): boolean {
  const gd = m.guards.find((x) => x.id === id);
  if (!gd || gd.tagged) return false;
  const eye = m.gull.eye();
  const head = gd.headPosition();
  if (Math.hypot(head.e - eye.e, head.n - eye.n, head.h - eye.h) > range) return false;
  return m.lineOfSight(eye, head);
}

/**
 * The lessons of each operation. Mission 1 is the flying school: take off, steer, land, look and scout, snatch.
 * Mission 2 adds its own verbs: signal, and release with the Wing.
 */
export const LESSONS: Record<string, Lesson[]> = {
  m1: [
    {
      id: 'takeoff',
      text: 'Hold {flap} to take off.',
      nudge: 'Hold {flap} down. The gull does the rest.',
      patience: 12,
      done: (m) => m.objectiveState('takeoff') === 'done',
    },
    {
      id: 'steer',
      air: true,
      text: '{look} steers. Look around, then face the yellow marker.',
      nudge: '{look} steers. The yellow marker is the station roof: face it.',
      // The gull starts out facing the marker: the lesson is to have turned the view and brought it back.
      done: (_m, s) => s.turned > 0.5 && s.onMarker > 0.4,
    },
    {
      id: 'flap',
      air: true,
      text: 'Hold {forward} to flap towards it. Let go to glide.',
      done: (m, s) => s.flapped > 1 && m.gull.airSpeed > 10.5,
    },
    {
      id: 'land',
      air: true,
      text: (m) => (flatDistanceToPerch(m, 'station') < 60 ? 'Hold {land} and look at the roof to land.' : 'Fly to the yellow marker: the station roof.'),
      nudge: 'Close to the roof, hold {land} and look at it. The wings do the rest.',
      patience: 45,
      done: (m) => m.objectiveState('perch') === 'done',
    },
    {
      id: 'look',
      optional: true,
      when: (m) => m.gull.isPerched(),
      text: 'Hold {scout} for a closer look.',
      done: (m, s) => s.scouted > 0.6 || m.stats.tagged > 0,
    },
    {
      id: 'tag',
      optional: true,
      when: (m) => guardInSight(m, 'borovsky', 120) && (m.gull.isPerched() || m.gull.scouting),
      text: 'Keep {scout} on the sentry until he is tagged.',
      done: (m) => m.objectiveState('scout') === 'done',
    },
    {
      id: 'snatch',
      optional: true,
      when: (m) => !m.beak && !!m.nearestItem(12),
      text: 'Get beak-close to it, then {interact} to snatch.',
      done: (m) => !!m.beak || m.stats.food.length > 0,
    },
  ],
  m2: [
    {
      id: 'tag',
      optional: true,
      when: (m) => m.objectiveState('scout') === 'active' && guardInSight(m, 'voronova', 170),
      text: 'Keep {scout} on Lt Voronova until she is tagged.',
      done: (m) => m.objectiveState('scout') === 'done',
    },
    {
      id: 'signal',
      optional: true,
      when: (m) => m.objectiveState('signal') === 'active' && m.gull.perch?.id === 'roost',
      text: '{signal} calls the Wing.',
      done: (m) => m.objectiveState('signal') === 'done',
    },
    {
      id: 'strike',
      optional: true,
      when: (m) => m.objectiveState('strike') === 'active' && m.gull.isAirborne(),
      text: 'Fly along the column. {poop} releases, and the Wing drops when you do.',
      done: (m) => m.stats.drops > 0 || m.objectiveState('strike') === 'done',
    },
  ],
};

export const REMINDERS: Reminder[] = [
  { id: 'afloat', text: 'Gulls float. Hold {flap} to take off from the water.', when: (m) => m.gull.mode === Mode.Water, after: 2.5, times: 2 },
  {
    id: 'stall',
    text: 'Sinking. Hold {forward} to flap.',
    when: (m) => m.gull.mode === Mode.Air && m.gull.airSpeed < m.gull.profile.stallSpeed && !m.gull.braking && !m.gull.flapping,
    after: 1.5,
    times: 2,
  },
];

function lessonsOf(m: Mission): Lesson[] {
  const own = (m as Partial<Teaches>).lessons;
  return own ?? LESSONS[m.id] ?? [];
}

export class Coach {
  readonly lessons: Lesson[];
  private readonly doneIds = new Set<string>();
  private current: Lesson | undefined;
  private sense: CoachSense = { ...ZERO };
  private prevYaw = 0;
  private prevPitch = 0;
  /** How long the gull has been down while an in-air lesson is on show. */
  private grounded = 0;
  private readonly reminderT = new Map<string, number>();
  private readonly reminderCount = new Map<string, number>();
  private reminder: Reminder | undefined;

  constructor(
    readonly mission: Mission,
    lessons: Lesson[] = lessonsOf(mission),
    readonly reminders: Reminder[] = REMINDERS,
  ) {
    this.lessons = lessons;
    this.prevYaw = mission.gull.yaw;
    this.prevPitch = mission.gull.pitch;
  }

  /** Lessons learned so far, in the order they were ticked off. */
  learned(): string[] {
    return [...this.doneIds];
  }

  /** The lesson on show, if any (its id). */
  lessonId(): string | undefined {
    return this.current?.id;
  }

  /** "I have flown before": tick off every lesson. */
  skipAll(): void {
    for (const l of this.lessons) this.doneIds.add(l.id);
    this.current = undefined;
  }

  /** One fixed step, after the mission's. */
  step(dt: number): void {
    const m = this.mission;
    const g = m.gull;
    const dYaw = Math.abs(wrap(g.yaw - this.prevYaw));
    const dPitch = Math.abs(g.pitch - this.prevPitch);
    this.prevYaw = g.yaw;
    this.prevPitch = g.pitch;
    if (!m.running) {
      this.current = undefined;
      this.reminder = undefined;
      return;
    }
    const s = this.sense;
    if (this.current) {
      s.shown += dt;
      s.turned += dYaw + dPitch;
      if (g.mode === Mode.Air && g.flapping) s.flapped += dt;
      if (g.mode === Mode.Air && g.braking) s.braked += dt;
      if (g.scouting) s.scouted += dt;
      if (g.isAirborne()) s.airborne += dt;
      if (this.markerAhead()) s.onMarker += dt;
      else s.onMarker = 0;
    }
    this.choose();
    const down = g.mode === Mode.Ground || g.mode === Mode.Water;
    this.grounded = this.current?.air && down ? this.grounded + dt : 0;
    this.stepReminders(dt);
  }

  private markerAhead(): boolean {
    const m = this.mission;
    const t = m.currentTarget();
    if (!t) return false;
    const eye = m.gull.eye();
    const flat = Math.hypot(t.e - eye.e, t.n - eye.n);
    if (flat < 1) return true;
    const yawOff = Math.abs(wrap(Math.atan2(t.e - eye.e, t.n - eye.n) - m.gull.yaw));
    const pitchOff = Math.abs(Math.atan2(t.h - eye.h, flat) - m.gull.pitch);
    return yawOff < AHEAD && pitchOff < AHEAD * 1.6;
  }

  private choose(): void {
    const m = this.mission;
    // A lesson the player has got past by other means takes the ones before it with it (the tutorial skipped, say).
    let past = -1;
    this.lessons.forEach((l, i) => {
      if (!l.optional && !this.doneIds.has(l.id) && l !== this.current && l.done(m, ZERO)) past = i;
    });
    for (let i = 0; i <= past; i++) {
      const l = this.lessons[i]!;
      if (!l.optional || l.done(m, ZERO)) this.doneIds.add(l.id);
    }
    let next: Lesson | undefined;
    for (const l of this.lessons) {
      if (this.doneIds.has(l.id)) continue;
      if (l.done(m, l === this.current ? this.sense : ZERO)) {
        this.doneIds.add(l.id);
        continue;
      }
      if (!l.when || l.when(m)) {
        next = l;
        break;
      }
      if (!l.optional) break;
    }
    if (next !== this.current) {
      this.current = next;
      this.sense = { ...ZERO };
      this.grounded = 0;
    }
  }

  private stepReminders(dt: number): void {
    const m = this.mission;
    let showing: Reminder | undefined;
    for (const r of this.reminders) {
      const count = this.reminderCount.get(r.id) ?? 0;
      if (count >= r.times) continue;
      if (r.when(m)) {
        const t = (this.reminderT.get(r.id) ?? 0) + dt;
        this.reminderT.set(r.id, t);
        if (t >= r.after && !showing) showing = r;
      } else {
        // Shown and then put right: that is one of its times used.
        if ((this.reminderT.get(r.id) ?? 0) >= r.after) this.reminderCount.set(r.id, count + 1);
        this.reminderT.set(r.id, 0);
      }
    }
    this.reminder = showing;
  }

  /** What to show in the prompt slot now. */
  prompt(): CoachPrompt | undefined {
    const m = this.mission;
    if (!m.running) return undefined;
    const l = this.current;
    if (l) {
      if (l.air && this.grounded > 0.8) return this.make('relaunch', m.gull.mode === Mode.Water ? 'Hold {flap} to take off from the water.' : RELAUNCH, 'lesson', false);
      const nudged = this.sense.shown > (l.patience ?? 20);
      const text = nudged && l.nudge ? l.nudge : typeof l.text === 'function' ? l.text(m) : l.text;
      return this.make(l.id, text, 'lesson', nudged);
    }
    // The mission's own prompt is about what is in reach right now: it comes before a general reminder.
    const own = tokenise(m.prompt());
    if (own) return this.make('action', own, 'action', false);
    if (this.reminder) return this.make(this.reminder.id, this.reminder.text, 'reminder', false);
    return undefined;
  }

  private make(id: string, text: string, kind: CoachPrompt['kind'], nudged: boolean): CoachPrompt {
    return { id, text, kind, nudged, actions: actionsIn(text) };
  }
}
