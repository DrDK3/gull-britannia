/**
 * How an operation is marked.
 *
 * The old sum paid 40 points for every hit, for ever, so the best-paid way to play a stealth game was to stand over
 * a man who was already scrubbing his tunic and do it again. Now:
 *
 * - Hits on the same target are worth less each time (40, 20, 10, then nothing), and everything a gull can earn with
 *   its payload (hits, long drops, accuracy) is capped for the operation.
 * - How the job was done is marked as an approach, and the quiet ones are worth more than the cap on mischief:
 *   Ghost (unseen, unsuspected, no hits on the people watching) beats Saboteur (unseen, with a diversion) and Shadow
 *   (unseen, but questions were asked), which beat Hooligan (seen).
 *
 * So an unseen run always outscores a run that bombs its way through, whatever else the two have in common.
 * DOM-free.
 */

/** Points for the first, second and third hit on one target. Later hits score nothing. */
export const HIT_POINTS = [40, 20, 10] as const;
/** A first hit from a long way up, and how many of them count. */
export const LONG_DROP_POINTS = 25;
export const LONG_DROPS_COUNTED = 2;
/** For putting three drops in four on target, on at least two different targets. */
export const ACCURACY_BONUS = 50;
/** The most a payload can earn in an operation, unless the mission says otherwise. */
export const ORDNANCE_CAP = 200;

export const STEALTH_POINTS = { unseen: 300, once: 100 } as const;
export const CLEAN_ESCAPE_POINTS = 200;

export type ApproachId = 'ghost' | 'saboteur' | 'shadow' | 'hooligan';

export interface Approach {
  id: ApproachId;
  title: string;
  /** What the review says about it. */
  citation: string;
  points: number;
}

export const APPROACHES: Record<ApproachId, Approach> = {
  ghost: { id: 'ghost', title: 'Ghost', citation: 'No question was ever raised', points: 400 },
  saboteur: { id: 'saboteur', title: 'Saboteur', citation: 'Unseen, with a diversion', points: 150 },
  shadow: { id: 'shadow', title: 'Shadow', citation: 'Unseen, though questions were asked', points: 150 },
  hooligan: { id: 'hooligan', title: 'Hooligan', citation: 'Seen, and not forgotten', points: 0 },
};

/** Points for the `n`th hit on one target (n from 1). */
export function hitPoints(n: number): number {
  return HIT_POINTS[n - 1] ?? 0;
}

/** Points for `count` hits on one target. */
export function hitsOnTarget(count: number): number {
  let p = 0;
  for (let n = 1; n <= count; n++) p += hitPoints(n);
  return p;
}

export interface OrdnanceInput {
  drops: number;
  hits: number;
  /** Hits by target (a guard's id, 'tea:…', a marcher's id). */
  hitsByTarget: Record<string, number>;
  /** First hits on a target that fell a long way. */
  longFirstHits: number;
}

export interface OrdnanceScore {
  /** What the hits are worth, repeats discounted. */
  hitPoints: number;
  /** Hits that scored less than a first hit, or nothing. */
  repeats: number;
  longPoints: number;
  accuracyBonus: number;
  /** The sum, held to the cap. */
  total: number;
  capped: boolean;
}

export function ordnanceScore(s: OrdnanceInput, cap = ORDNANCE_CAP): OrdnanceScore {
  let hp = 0;
  let repeats = 0;
  let targets = 0;
  for (const n of Object.values(s.hitsByTarget)) {
    hp += hitsOnTarget(n);
    repeats += Math.max(n - 1, 0);
    if (n > 0) targets++;
  }
  const longPoints = Math.min(s.longFirstHits, LONG_DROPS_COUNTED) * LONG_DROP_POINTS;
  const accuracyBonus = s.drops > 0 && targets >= 2 && s.hits / s.drops >= 0.75 ? ACCURACY_BONUS : 0;
  const sum = hp + longPoints + accuracyBonus;
  return { hitPoints: hp, repeats, longPoints, accuracyBonus, total: Math.min(sum, cap), capped: sum > cap };
}

export interface ApproachInput {
  /** Times a soldier was sure (the exclamation mark). */
  spotted: number;
  /** Times a soldier wondered (the question mark). */
  questions: number;
  /** Deliberate hits on the people watching, or on their tea. */
  watcherHits: number;
}

/** How the job was done. Only an operation that achieved its aim has an approach worth points. */
export function approachOf(s: ApproachInput): Approach {
  if (s.spotted > 0) return APPROACHES.hooligan;
  if (s.watcherHits > 0) return APPROACHES.saboteur;
  if (s.questions > 0) return APPROACHES.shadow;
  return APPROACHES.ghost;
}
