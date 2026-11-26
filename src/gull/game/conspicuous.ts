/**
 * "Just a gull", as a number.
 *
 * Conspicuousness runs from 0 (a gull doing what gulls do, where gulls do it) to 1 (a gull with the garrison's
 * papers in its beak). It compares what Scrumpy is doing with what the other gulls are doing: loafing on a ridge
 * among loafers is nothing; sitting alone above the dispatch for a minute is odd; hovering over the table is
 * conspicuous; carrying papers is very conspicuous. A guard's suspicion gains with it (Mission.noteworthiness), and
 * the HUD shows the value and the main reason as a short phrase.
 *
 * This file is the rule alone, as a pure function of plain facts, so it can be tested and read in one place. The
 * mission gathers the facts (mission.ts, `gullFacts`). DOM-free.
 */

export interface GullFacts {
  /** Mission papers in the beak. */
  papers: boolean;
  /** Inside a restricted zone (the cordon round the table, the lectern's deck). */
  inCordon: boolean;
  /** In the air, slow, low over a restricted zone. */
  hovering: boolean;
  /** What the zone guards, for the phrase: "the table". */
  zoneLabel: string;
  airborne: boolean;
  /** On its feet and still (perched, or standing about). */
  settled: boolean;
  /** Speed (m/s). */
  speed: number;
  /** Seconds settled alone near something guarded. */
  loiter: number;
  /** At someone's food, or just away with it. */
  thieving: boolean;
  /** Food in the beak (any). */
  food: boolean;
  /** How recently it gave a long call: 1 just now, falling to 0. */
  calling: number;
  /** Gulls nearby doing the same thing (on their feet beside it, or in the air around it). */
  company: number;
  /** The guard who is judging, if one is: how far off he is (m), and whether the gull is scouting him. */
  guardDist?: number;
  staring?: boolean;
  /** What to call him in the phrase: "the sentry". */
  guardLabel?: string;
}

export interface Conspicuousness {
  /** 0 to 1. */
  value: number;
  /** The main reason, as a short phrase. */
  reason: string;
}

/** The value of each thing a gull can be caught doing. Multiply by NOTE_PER_CONSPICUOUS for a guard's interest. */
export const CONSPICUOUS = {
  papers: 1,
  cordon: 0.72,
  underNose: 0.57,
  hovering: 0.45,
  buzzing: 0.36,
  thieving: 0.3,
  staring: 0.3,
  calling: 0.3,
  /** Loitering alone builds from nothing to this. */
  loiterMax: 0.3,
  flying: 0.06,
  onFoot: 0.03,
} as const;

/** A guard's interest (Guard's "noteworthiness") per unit of conspicuousness: papers are worth 1.4. */
export const NOTE_PER_CONSPICUOUS = 1.4;
/** Below this a guard does not give the gull a thought. */
export const BENEATH_NOTICE = 0.15;
/** Loitering alone starts to look odd after this long (s), and is as odd as it gets after LOITER_FULL. */
export const LOITER_AFTER = 15;
export const LOITER_FULL = 45;
/** How near a guard is "under his nose" (m), and how near and how fast is "buzzing" him. */
export const NOSE_DIST = 4.5;
export const BUZZ_DIST = 9;
export const BUZZ_SPEED = 13;
/** How near a gull must be to a guard for staring at him (scouting) to be rude (m). */
export const STARE_DIST = 15;

export const JUST_A_GULL = 'just a gull';

export function conspicuousness(f: GullFacts): Conspicuousness {
  const who = f.guardLabel ?? 'the sentry';
  const among = f.company > 0;
  let value: number = f.airborne ? CONSPICUOUS.flying : CONSPICUOUS.onFoot;
  let reason = JUST_A_GULL;
  const take = (v: number, why: string) => {
    if (v > value) {
      value = v;
      reason = why;
    }
  };
  // Being one of several gulls doing the same thing is the whole disguise.
  if (among) {
    value = 0;
    reason = f.airborne ? 'flying with the gulls' : f.settled ? 'loafing among gulls' : 'one of the flock';
  }
  // Odd behaviour: other gulls nearby take the edge off it, or all of it.
  if (!among && f.settled && f.loiter > LOITER_AFTER) take(CONSPICUOUS.loiterMax * Math.min((f.loiter - LOITER_AFTER) / (LOITER_FULL - LOITER_AFTER), 1), 'loitering alone');
  if (f.calling > 0) take(CONSPICUOUS.calling * f.calling * (among ? 0.5 : 1), 'making a racket');
  if (f.staring && f.guardDist !== undefined && f.guardDist < STARE_DIST) take(CONSPICUOUS.staring, `staring at ${who}`);
  if (f.thieving) take(CONSPICUOUS.thieving, 'thieving');
  if (f.guardDist !== undefined && f.guardDist < BUZZ_DIST && f.speed > BUZZ_SPEED) take(CONSPICUOUS.buzzing, `buzzing ${who}`);
  if (f.hovering) take(CONSPICUOUS.hovering * (among ? 0.6 : 1), among ? `hovering over ${f.zoneLabel}` : `hovering alone over ${f.zoneLabel}`);
  // Offences: no company excuses these.
  if (f.guardDist !== undefined && f.guardDist < NOSE_DIST) take(CONSPICUOUS.underNose, `under the nose of ${who}`);
  // A gull sitting quietly in the cordon, at a distance, is half as interesting as one flapping about in it.
  if (f.inCordon) take(CONSPICUOUS.cordon * (f.settled && (f.guardDist ?? Infinity) > NOSE_DIST ? 0.5 : 1), 'inside the cordon');
  if (f.papers) take(CONSPICUOUS.papers, 'carrying papers');
  return { value: Math.min(value, 1), reason };
}

/** A word for the HUD's indicator. */
export function conspicuousLevel(value: number): 'just a gull' | 'odd' | 'conspicuous' | 'very conspicuous' {
  if (value >= 0.8) return 'very conspicuous';
  if (value >= 0.4) return 'conspicuous';
  if (value >= BENEATH_NOTICE) return 'odd';
  return 'just a gull';
}
