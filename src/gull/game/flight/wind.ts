/**
 * The air the gull flies in: a wind field over the town's height grid. Deterministic and DOM-free: the same place and
 * time always give the same wind.
 *
 * What a player can learn from it:
 *  - The wind blows from one quarter all day (the operation's conditions), stronger with height, a little gusty.
 *  - Behind anything taller than you (downwind of it) the air is slack: the lee.
 *  - Where the ground or a wall rises in the wind's path, the air goes up it: ridge lift on the windward side of a
 *    hill, a roof or a quay wall, strongest close to the face and just above the edge.
 *  - Where the ground falls away downwind, it comes down again: sink in the lee.
 *
 * `at(e, n, h)` returns the air's velocity (m/s; h is the vertical part, up positive).
 */
import type { V3 } from '../world';

export interface WindSpec {
  /** Mean speed at 10 m above open ground (m/s). */
  speed: number;
  /** Where it blows from (degrees true: 270 is a westerly). */
  fromDeg: number;
  /** Gustiness: the fraction by which the speed swells and lulls (0 = steady). */
  gust?: number;
  /** Seed for the gusts. */
  seed?: number;
}

export const KNOT = 0.514444;

/** The wind of an operation's day (MissionConditions has these fields). */
export function windOf(c: { windKn: number; windFromDeg: number }, seed = 1967, gust = 0.12): WindSpec {
  return { speed: c.windKn * KNOT, fromDeg: c.windFromDeg, gust, seed };
}

/** How the speed grows with height above the surface: a power law over rough ground, 1 at 10 m. */
const PROFILE_EXP = 0.22;
const PROFILE_Z0 = 0.5;
const PROFILE_MAX = 1.5;
/** Distances upwind at which something taller than the point shelters it (m). */
const UPWIND = [3, 6, 10, 16, 24, 36, 54, 80, 120, 180, 270];
/** The lee reaches about this many times the obstacle's height above the point. */
const LEE_REACH = 7;
/** How much of the wind is left deep in the lee. */
const LEE_FLOOR = 0.2;
/**
 * Slope scales: the baseline over which the surface's slope is taken (m), the height over which its lift fades (m),
 * and how much of the slope-following flow there is going up and coming down (1 = the air follows the surface
 * exactly). Small things leak; and the lee of a steep hill is a slack wake, not a waterfall, so sink is the weaker.
 */
const SCALES: readonly (readonly [number, number, number, number])[] = [
  [3, 5, 0.6, 0.5],
  [9, 14, 0.75, 0.45],
  [27, 40, 0.85, 0.35],
  [81, 110, 0.85, 0.25],
];
/** The steepest slope the air follows (a wall counts as this). */
const SLOPE_MAX = 0.65;

export class WindField {
  /** Seconds since the wind was set: the gusts move with it. */
  time = 0;
  readonly spec: Required<WindSpec>;
  /** Unit vector of the direction the wind blows towards. */
  readonly toE: number;
  readonly toN: number;

  /** `surface` is the top of whatever stands at (e, n): scenery or water (m ODN). */
  constructor(
    private readonly surface: (e: number, n: number) => number,
    spec: WindSpec,
  ) {
    this.spec = { speed: Math.max(0, spec.speed), fromDeg: spec.fromDeg, gust: Math.max(0, spec.gust ?? 0.12), seed: spec.seed ?? 1967 };
    const to = ((spec.fromDeg + 180) * Math.PI) / 180;
    this.toE = Math.sin(to);
    this.toN = Math.cos(to);
  }

  /** The air's velocity at a point, `ahead` seconds from now (m/s). */
  at(e: number, n: number, h: number, ahead = 0): V3 {
    const U = this.spec.speed;
    if (U <= 0) return { e: 0, n: 0, h: 0 };
    const ue = this.toE;
    const un = this.toN;
    const surf = this.surface;
    const zs = surf(e, n);
    const z = Math.max(h - zs, 0);
    const profile = Math.min(PROFILE_MAX, Math.pow((z + PROFILE_Z0) / (10 + PROFILE_Z0), PROFILE_EXP));

    // The lee: anything upwind that stands above this point takes the wind off it, out to several times its height.
    let shelter = 0;
    for (const d of UPWIND) {
      const x = surf(e - ue * d, n - un * d) - h;
      if (x <= 0) continue;
      const s = Math.min(1, x / 1.5) * Math.max(0, 1 - d / (LEE_REACH * x + 4));
      if (s > shelter) shelter = s;
    }
    // Hard up against a wall on its windward side the air has nowhere to go but up.
    let blocked = 0;
    for (const d of [1.5, 4]) {
      const x = surf(e + ue * d, n + un * d) - h;
      if (x > 0.5) blocked = Math.max(blocked, Math.min(1, x / 2) * (1 - d / 6));
    }

    // Lift and sink: the air follows the surface. Each scale of slope lifts the air above it for about its own
    // height, so a wall matters within a few metres and a hillside for a hundred.
    let lift = 0;
    let finer = 0;
    let finerFade = 0;
    let finerUp = 0;
    let finerDown = 0;
    const band = (slope: number, fade: number, up: number, down: number) => slope * fade * (slope >= 0 ? up : down);
    for (let i = 0; i < SCALES.length; i++) {
      const [L, H, up, down] = SCALES[i]!;
      const a = surf(e + ue * L, n + un * L);
      const b = surf(e - ue * L, n - un * L);
      const s = Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, (a - b) / (2 * L)));
      const fade = Math.exp(-Math.max(0, h - Math.max(a, b, zs)) / H);
      // Each scale carries the part of the slope the next one up does not see.
      if (i > 0) lift += band(finer - s, finerFade, finerUp, finerDown);
      finer = s;
      finerFade = fade;
      finerUp = up;
      finerDown = down;
    }
    lift += band(finer, finerFade, finerUp, finerDown);

    // Gusts: a swell and lull that drifts downwind, and a few degrees of veer.
    const t = this.time + ahead;
    let gust = 1;
    let veer = 0;
    const G = this.spec.gust;
    if (G > 0) {
      const ge = e - ue * U * t;
      const gn = n - un * U * t;
      const seed = this.spec.seed;
      gust = 1 + G * (0.65 * noise3(ge / 90, gn / 90, t / 9, seed) + 0.35 * noise3(ge / 31, gn / 31, t / 3.7, seed + 17));
      veer = G * 0.6 * noise3(ge / 140, gn / 140, t / 13, seed + 41);
    }

    const flat = U * profile * gust * (1 - (1 - LEE_FLOOR) * shelter) * (1 - 0.6 * blocked);
    const up = U * profile * gust * (1 - (lift >= 0 ? 0.5 : 0.9) * shelter) * lift;
    const c = Math.cos(veer);
    const s = Math.sin(veer);
    return { e: flat * (ue * c + un * s), n: flat * (un * c - ue * s), h: up };
  }
}

/** A lattice hash to [0, 1): deterministic, no state. */
function hash3(i: number, j: number, k: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [−1, 1]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const u = fade(x - i);
  const v = fade(y - j);
  const w = fade(z - k);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (di: number, dj: number, dk: number) => hash3(i + di, j + dj, k + dk, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}
