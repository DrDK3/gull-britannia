/**
 * The mission's alert ladder: calm → suspicious → searching → alarmed.
 *
 * A guard's suspicion is his own and fades; the ladder is the garrison's memory. Every incident (a question mark, a
 * sighting, a hit that was plainly no accident, a theft found out, a shout) adds heat, and each rung the heat reaches
 * changes the level for the rest of the operation: the mission answers `onAlertLevel` with a sentry who looks up more,
 * a second watcher, papers that are covered. At the top the operation is in real danger (Mission 1: the courier is
 * sent for).
 *
 * Heat cools when nothing is happening, but never by more than one rung below the highest it has reached: the world
 * forgives a little, and remembers the rest. DOM-free and deterministic.
 */

export const AlertLevel = { Calm: 0, Suspicious: 1, Searching: 2, Alarmed: 3 } as const;
export type AlertLevelId = (typeof AlertLevel)[keyof typeof AlertLevel];
export const ALERT_LEVEL_NAMES = ['calm', 'suspicious', 'searching', 'alarmed'] as const;

/** Heat at which each rung starts, and the top of the ladder. */
export const ALERT_RUNGS = [0, 20, 50, 80] as const;
export const ALERT_TOP = 100;

/** What each kind of incident adds. */
export const HEAT = {
  /** A soldier wonders about the gull: the question mark. */
  question: 20,
  /** A soldier is sure: the exclamation mark. */
  spotted: 30,
  /** The papers are found to be gone. */
  theft: 30,
  /** Papers found lying about and put back. */
  recovered: 20,
  /** A first hit on a man (bad luck), a second (a question), a third and later (he knows). */
  hit: [10, 20, 10],
  /** A first hit on his tea. */
  tea: 5,
  /** A civilian shouts at a gull. */
  shout: 10,
  /** A long call that a soldier heard. */
  call: 4,
} as const;

export type AlertIncident = keyof typeof HEAT | 'script';

export interface AlertRecord {
  /** Mission time (s). */
  t: number;
  kind: AlertIncident;
  add: number;
  /** Heat after it. */
  heat: number;
}

/** Seconds of quiet before the heat starts to cool, and how fast it cools (per second). */
const COOL_AFTER = 15;
const COOL_RATE = 1;

export class AlertLadder {
  /** 0 to 100. */
  heat = 0;
  level: AlertLevelId = AlertLevel.Calm;
  /** The highest rung reached. */
  peak: AlertLevelId = AlertLevel.Calm;
  /** The heat reached the top: latched. */
  toppedOut = false;
  /** Seconds since the last incident or the last time a guard was stirred up. */
  quiet = 0;
  /** Seconds spent on each rung. */
  readonly seconds = [0, 0, 0, 0];
  /** Every incident, in order: for the review, and for tests. */
  readonly log: AlertRecord[] = [];

  get name(): string {
    return ALERT_LEVEL_NAMES[this.level];
  }

  get peakName(): string {
    return ALERT_LEVEL_NAMES[this.peak];
  }

  /** How far up the current rung the heat is, 0 to 1: a meter between two rungs. */
  get progress(): number {
    const lo = ALERT_RUNGS[this.level];
    const hi = this.level < 3 ? ALERT_RUNGS[this.level + 1]! : ALERT_TOP;
    return Math.max(0, Math.min(1, (this.heat - lo) / (hi - lo)));
  }

  /** The heat below which it will not cool: one rung under the peak. */
  get floor(): number {
    return ALERT_RUNGS[Math.max(this.peak - 1, 0)]!;
  }

  /** An incident. Returns the level after it. */
  raise(kind: AlertIncident, add: number, t = 0): AlertLevelId {
    if (add <= 0) return this.level;
    this.heat = Math.min(this.heat + add, ALERT_TOP);
    this.quiet = 0;
    this.log.push({ t, kind, add, heat: this.heat });
    if (this.heat >= ALERT_TOP) this.toppedOut = true;
    return this.settle();
  }

  /** One step. `stirred`: a guard is suspicious, alert or searching now, so nothing cools. Returns the level. */
  update(dt: number, stirred: boolean): AlertLevelId {
    this.seconds[this.level]! += dt;
    if (stirred) this.quiet = 0;
    else this.quiet += dt;
    if (this.quiet > COOL_AFTER && this.heat > this.floor) this.heat = Math.max(this.heat - COOL_RATE * dt, this.floor);
    return this.settle();
  }

  private settle(): AlertLevelId {
    let l: AlertLevelId = AlertLevel.Calm;
    if (this.heat >= ALERT_RUNGS[3]) l = AlertLevel.Alarmed;
    else if (this.heat >= ALERT_RUNGS[2]) l = AlertLevel.Searching;
    else if (this.heat >= ALERT_RUNGS[1]) l = AlertLevel.Suspicious;
    this.level = l;
    if (l > this.peak) this.peak = l;
    return l;
  }
}
