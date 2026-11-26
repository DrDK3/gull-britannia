/**
 * The herring gull: its shape and how it moves.
 *
 * An adult Larus argentatus in summer: white head, neck, body and tail; pale silver-grey mantle and upperwing with a
 * white trailing edge; black outer primaries with white mirrors and tips; a yellow bill with the red gonys spot; a
 * pale eye in a yellow ring; pink legs and webbed feet. About 0.6 m long and 1.45 m across the wings, as the bird.
 * Proportions are a little toy-like on purpose (the head, bill and eye are a size up) so that it reads at a distance.
 *
 * The wing is a real one: upper arm, forearm, hand and the outer primaries are separate segments, with every flight
 * feather a blade of its own, so it flexes at the wrist on the upstroke, tucks to a W in a dive and folds away on
 * landing. Standing, a second, folded wing lies along the flank (the neat grey shape with black tips crossed over the
 * tail); the two swap during the quarter of a second it takes to open or close.
 *
 * Model frame: forward −z, up +y, right +x; the origin is the middle of the body. One merged geometry, one draw call.
 */
import * as THREE from 'three';
import { PAL } from './palette';
import { RigBuilder, RigDef, type RigGeometry, type RigPose } from './rig';
import { ball, mirrorX, place, slab, tube, type Ring } from './shapes';

export type GullBone =
  | 'body' | 'neck' | 'head' | 'jaw' | 'tail' | 'tailL' | 'tailR'
  | 'humL' | 'foreL' | 'handL' | 'tipL' | 'foldL'
  | 'humR' | 'foreR' | 'handR' | 'tipR' | 'foldR'
  | 'legL' | 'shankL' | 'footL' | 'legR' | 'shankR' | 'footR';

// Joints (right side; the left mirrors them).
const SHOULDER = [0.05, 0.04, -0.05] as const;
const ELBOW = [0.17, 0.042, -0.04] as const;
const WRIST = [0.37, 0.042, -0.07] as const;
const MIDHAND = [0.54, 0.04, -0.012] as const;
const HIP = [0.032, -0.05, 0.03] as const;
const HOCK = [0.032, -0.1, 0.044] as const;
const ANKLE = [0.032, -0.164, 0.032] as const;
/** The soles, below the middle of the body, standing at rest. */
const SOLE_Y = -0.17;
/** Between the mandibles, near the tip: where something carried is gripped. */
export const BILL_GRIP = [0, 0.02, -0.318] as const;

/** The bill: the upper mandible with its hooked tip; the lower, deepest at the gonys angle. */
const BILL_UPPER: Ring[] = [
  [-0.255, 0.0145, 0.0135, 0, 0.0215, 0.001],
  [-0.285, 0.0132, 0.0128, 0, 0.0215, 0.001],
  [-0.308, 0.0112, 0.0114, 0, 0.0212, 0.001],
  [-0.325, 0.008, 0.0088, 0, 0.0192, 0.002],
  [-0.336, 0.003, 0.0045, 0, 0.0145, 0.0035],
];
const BILL_LOWER: Ring[] = [
  [-0.252, 0.0135, 0.001, 0, 0.0205, 0.0085],
  [-0.28, 0.012, 0.001, 0, 0.0205, 0.0098],
  [-0.302, 0.0105, 0.001, 0, 0.0205, 0.0122],
  [-0.318, 0.0075, 0.001, 0, 0.0205, 0.0078],
  [-0.328, 0.0027, 0.001, 0, 0.0195, 0.0032],
];

/** The nostril: a dark slit on each side of the upper mandible. */
const nostril = (x: number, y: number, z: number) => Math.abs(x) > 0.0085 && y > 0.022 && y < 0.03 && z < -0.268 && z > -0.288;

const side = (p: readonly [number, number, number], s: number): [number, number, number] => [p[0] * s, p[1], p[2]];

export const GULL_RIG = new RigDef<GullBone>([
  { name: 'body', at: [0, 0, 0] },
  { name: 'neck', parent: 'body', at: [0, 0.012, -0.1] },
  { name: 'head', parent: 'neck', at: [0, 0.03, -0.185] },
  { name: 'jaw', parent: 'head', at: [0, 0.02, -0.25] },
  { name: 'tail', parent: 'body', at: [0, 0.004, 0.165] },
  { name: 'tailL', parent: 'tail', at: [0, 0.004, 0.17] },
  { name: 'tailR', parent: 'tail', at: [0, 0.004, 0.17] },
  { name: 'humL', parent: 'body', at: side(SHOULDER, -1) },
  { name: 'foreL', parent: 'humL', at: side(ELBOW, -1) },
  { name: 'handL', parent: 'foreL', at: side(WRIST, -1) },
  { name: 'tipL', parent: 'handL', at: side(MIDHAND, -1) },
  { name: 'foldL', parent: 'body', at: [-0.06, 0.03, 0] },
  { name: 'humR', parent: 'body', at: side(SHOULDER, 1) },
  { name: 'foreR', parent: 'humR', at: side(ELBOW, 1) },
  { name: 'handR', parent: 'foreR', at: side(WRIST, 1) },
  { name: 'tipR', parent: 'handR', at: side(MIDHAND, 1) },
  { name: 'foldR', parent: 'body', at: [0.06, 0.03, 0] },
  { name: 'legL', parent: 'body', at: side(HIP, -1) },
  { name: 'shankL', parent: 'legL', at: side(HOCK, -1) },
  { name: 'footL', parent: 'shankL', at: side(ANKLE, -1) },
  { name: 'legR', parent: 'body', at: side(HIP, 1) },
  { name: 'shankR', parent: 'legR', at: side(HOCK, 1) },
  { name: 'footR', parent: 'shankR', at: side(ANKLE, 1) },
]);

// ------------------------------------------------------------------ the wing's plan

/** Leading edge (z) and chord at a distance x out along the open wing. */
const PLAN: readonly (readonly [x: number, le: number, chord: number])[] = [
  [0.04, -0.092, 0.16],
  [0.17, -0.1, 0.172],
  [0.27, -0.114, 0.166],
  [0.37, -0.127, 0.16],
  [0.43, -0.112, 0.15],
  [0.49, -0.088, 0.13],
];
function plan(x: number): { le: number; chord: number } {
  let i = 1;
  while (i < PLAN.length - 1 && PLAN[i]![0] < x) i++;
  const a = PLAN[i - 1]!;
  const b = PLAN[i]!;
  const f = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
  return { le: a[1] + (b[1] - a[1]) * f, chord: a[2] + (b[2] - a[2]) * f };
}

/** Where the ten primaries end, innermost first: the hand's trailing edge round to the wingtip. */
const PRIMARY_TIPS: readonly (readonly [number, number])[] = [
  [0.425, 0.046],
  [0.468, 0.056],
  [0.512, 0.067],
  [0.556, 0.078],
  [0.598, 0.087],
  [0.638, 0.093],
  [0.674, 0.096],
  [0.704, 0.094],
  [0.726, 0.086],
  [0.74, 0.07],
];

type Band = readonly [to: number, colour: number];
const G = PAL.mantle;
const K = PAL.primary;
const W = PAL.gullWhite;
/** Each primary's colours along its length, root to tip, innermost first. */
const PRIMARY_BANDS: readonly (readonly Band[])[] = [
  [[0.86, G], [1, W]],
  [[0.86, G], [1, W]],
  [[0.87, G], [1, W]],
  [[0.88, G], [1, W]],
  [[0.76, G], [0.9, K], [1, W]],
  [[0.62, G], [0.91, K], [1, W]],
  [[0.5, G], [0.92, K], [1, W]],
  [[0.4, G], [0.93, K], [1, W]],
  [[0.3, G], [0.7, K], [0.81, W], [0.94, K], [1, W]],
  [[0.2, K], [0.64, K], [0.83, W], [0.95, K], [1, W]],
];
const SECONDARY_BANDS: readonly Band[] = [[0.88, G], [1, W]];

const COL = new THREE.Color();
const under = (c: number) => (c === G ? PAL.wingUnder : c === K ? 0x3a3d45 : c);

/**
 * One flight feather: root at the origin, lying along +z, top up. A shallow ridge down the middle catches the light.
 * `bands` colours it along its length; the underside is paler.
 */
function feather(len: number, width: number, bands: readonly Band[], fine: boolean): THREE.BufferGeometry {
  const us = new Set<number>([0, 0.8, 1]);
  if (fine) us.add(0.93);
  for (const b of bands) us.add(b[0]);
  const st = [...us].sort((a, b) => a - b);
  const w = (u: number) => width * (0.72 + 0.28 * Math.min(1, u / 0.25)) * (u <= 0.8 ? 1 : u <= 0.93 ? 1 - ((u - 0.8) / 0.13) * 0.25 : 0.75 - ((u - 0.93) / 0.07) * 0.45);
  const ridge = (u: number) => width * 0.09 * (1 - u * 0.7);
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], colour: number) => {
    pos.push(...a, ...b, ...c);
    COL.setHex(colour, THREE.SRGBColorSpace);
    for (let i = 0; i < 3; i++) col.push(COL.r, COL.g, COL.b);
  };
  for (let i = 0; i < st.length - 1; i++) {
    const u0 = st[i]!;
    const u1 = st[i + 1]!;
    const mid = (u0 + u1) / 2;
    const c = (bands.find((b) => mid <= b[0]) ?? bands[bands.length - 1]!)[1];
    const l0 = [-w(u0) / 2, 0, u0 * len];
    const r0 = [w(u0) / 2, 0, u0 * len];
    const m0 = [0, ridge(u0), u0 * len];
    const l1 = [-w(u1) / 2, 0, u1 * len];
    const r1 = [w(u1) / 2, 0, u1 * len];
    const m1 = [0, ridge(u1), u1 * len];
    // Top: two facets either side of the ridge. Bottom: flat.
    tri(l0, l1, m0, c);
    tri(m0, l1, m1, c);
    tri(m0, m1, r0, c);
    tri(r0, m1, r1, c);
    tri(l0, r0, l1, under(c));
    tri(r0, r1, l1, under(c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export type GullDetail = 'hero' | 'flock';

/** Build the gull. 'hero' is the player's (finer feathers, a thin dark rim); 'flock' is for the others. */
export function buildGullGeometry(detail: GullDetail = 'hero'): RigGeometry<GullBone> {
  const b = new RigBuilder(GULL_RIG);
  const hero = detail === 'hero';
  const seg = hero ? 14 : 10;

  // ---------------------------------------------------------------- body
  const BODY: Ring[] = [
    [-0.138, 0.03, 0.03, 0, 0.012],
    [-0.105, 0.054, 0.05, 0, 0.008, 0.056],
    [-0.055, 0.076, 0.064, 0, 0.004, 0.076],
    [0, 0.082, 0.066, 0, 0.004, 0.08],
    [0.06, 0.076, 0.06, 0, 0.004, 0.07],
    [0.12, 0.06, 0.047, 0, 0.004, 0.052],
    [0.17, 0.041, 0.031, 0, 0.005, 0.033],
    [0.21, 0.023, 0.017, 0, 0.006, 0.016],
    [0.228, 0.006, 0.005, 0, 0.006],
  ];
  b.add(tube('z', BODY, { seg, smooth: hero ? 2 : 1 }), PAL.gullWhite, 'body', {
    paint: (_x, _y, z, _nx, ny) => (ny > 0.42 && z > -0.092 && z < 0.128 ? PAL.mantle : undefined),
  });

  // ---------------------------------------------------------------- neck and head
  const NECK: Ring[] = [
    [-0.075, 0.05, 0.048, 0, 0.008, 0.052],
    [-0.11, 0.046, 0.044, 0, 0.012, 0.047],
    [-0.15, 0.038, 0.037, 0, 0.022, 0.038],
    [-0.19, 0.034, 0.033, 0, 0.032],
  ];
  const neckSkin = (() => {
    const lower = b.along('body', 'neck', 'z', -0.075, -0.125);
    const upper = b.along('neck', 'head', 'z', -0.145, -0.195);
    return (x: number, y: number, z: number, out: Parameters<typeof lower>[3]) => (z > -0.135 ? lower(x, y, z, out) : upper(x, y, z, out));
  })();
  b.add(tube('z', NECK, { seg, smooth: 1, open: 'both' }), PAL.gullWhite, neckSkin);
  const HEAD: Ring[] = [
    [-0.158, 0.026, 0.026, 0, 0.03],
    [-0.185, 0.039, 0.038, 0, 0.036],
    [-0.214, 0.043, 0.041, 0, 0.041],
    [-0.24, 0.037, 0.034, 0, 0.039],
    [-0.258, 0.024, 0.022, 0, 0.033],
    [-0.268, 0.012, 0.012, 0, 0.03],
  ];
  b.add(tube('z', HEAD, { seg, smooth: hero ? 2 : 1 }), PAL.gullWhite, 'head');

  // Bill: the upper mandible with its hooked tip, on the head; the lower, deepest at the gonys, on the jaw.
  b.add(tube('z', BILL_UPPER, { seg: 8, smooth: 1 }), PAL.bill, 'head', {
    paint: (x, y, z, _nx, ny) => (ny < -0.8 ? PAL.mouth : z < -0.323 ? PAL.billPale : nostril(x, y, z) ? PAL.nostril : undefined),
  });
  b.add(tube('z', BILL_LOWER, { seg: 8, smooth: 1 }), PAL.bill, 'jaw', {
    paint: (_x, y, z, _nx, ny) => (ny > 0.8 ? PAL.mouth : z < -0.29 && z > -0.315 && y < 0.019 ? PAL.gonys : undefined),
  });
  // Eyes: a pale iris in a yellow-orange ring, a small dark pupil. A size up from life, to read.
  for (const s of [-1, 1]) {
    const ex = s * 0.0362;
    b.add(ball(0.0098, ex, 0.047, -0.226, 0.42, 1, 1, 8), PAL.orbital, 'head', { noOutline: true });
    b.add(ball(0.0078, ex + s * 0.0022, 0.047, -0.226, 0.42, 1, 1, 8), PAL.iris, 'head', { noOutline: true });
    b.add(ball(0.0042, ex + s * 0.0042, 0.047, -0.2265, 0.42, 1, 1, 6), PAL.pupil, 'head', { noOutline: true });
  }

  // ---------------------------------------------------------------- tail
  const tailRoot: [number, number] = [0, 0.168];
  for (let k = -3; k <= 3; k++) {
    const len = 0.142 - Math.abs(k) * 0.005;
    const f = feather(len, 0.042, [[1, PAL.gullWhite]], hero);
    place(f, 0, 0, 0, 0, 0, k * 0.03);
    place(f, tailRoot[0] + k * 0.008, 0.006 - Math.abs(k) * 0.0012, tailRoot[1], 0, k * 0.085, 0);
    const wgt = Math.abs(k) / 3;
    b.add(f, null, k === 0 ? 'tail' : b.mix('tail', k < 0 ? 'tailL' : 'tailR', () => wgt), { noOutline: true });
  }

  // ---------------------------------------------------------------- wings
  for (const s of [-1, 1] as const) {
    const L = s < 0;
    const hum = L ? 'humL' : 'humR';
    const fore = L ? 'foreL' : 'foreR';
    const hand = L ? 'handL' : 'handR';
    const tip = L ? 'tipL' : 'tipR';
    const elbowBlend = b.along(hum, fore, 'x', s * 0.135, s * 0.205);
    const wristBlend = b.along(fore, hand, 'x', s * 0.34, s * 0.4);
    const tipBlend = b.along(hand, tip, 'x', s * 0.5, s * 0.62);
    const wingSkin = (x: number, y: number, z: number, out: Parameters<typeof elbowBlend>[3]) => {
      const ax = Math.abs(x);
      if (ax < 0.27) elbowBlend(x, y, z, out);
      else if (ax < 0.45) wristBlend(x, y, z, out);
      else tipBlend(x, y, z, out);
    };
    const fit = <T extends THREE.BufferGeometry>(g: T): T => (L ? mirrorX(g) : g);

    // The coverts: a cambered panel over the bones, thick at the leading edge.
    const rings: Ring[] = [];
    const xs = [0.04, 0.1, 0.17, 0.23, 0.3, 0.37, 0.43, 0.49, 0.545, 0.595];
    for (const x of xs) {
      const { le, chord } = plan(Math.min(x, 0.49));
      const out = Math.max(0, (x - 0.43) / 0.165);
      const half = chord * 0.3 * (1 - out * 0.86);
      const thick = (0.0165 - x * 0.016) * (1 - out * 0.5);
      const front = x <= 0.49 ? le : -0.088 + (x - 0.49) * 0.5;
      rings.push([x, half, thick, front + half, SHOULDER[1] + 0.002, thick * 0.55]);
    }
    b.add(fit(tube('x', rings, { seg: hero ? 10 : 8 })), PAL.mantle, wingSkin, {
      noOutline: true,
      paint: (x, _y, z, _nx, ny) => {
        const ax = Math.abs(x);
        if (ny < -0.25) return ax > 0.5 ? 0x4a4d55 : PAL.wingUnder;
        if (ax > 0.53) return PAL.primary;
        const { le } = plan(Math.min(ax, 0.49));
        return z < le + 0.01 && ax < 0.47 ? PAL.gullWhite : undefined;
      },
    });

    // Secondaries and tertials: along the arm, pointing aft, white-tipped (the wing's white trailing edge).
    const nSec = 10;
    for (let i = 0; i < nSec; i++) {
      const x = 0.062 + (0.3 * i) / (nSec - 1);
      const { le, chord } = plan(x);
      const rootZ = le + chord * 0.4;
      const drift = 0.006 + 0.022 * (i / (nSec - 1));
      const tipZ = plan(x + drift).le + plan(x + drift).chord;
      const len = Math.hypot(drift, tipZ - rootZ);
      const f = feather(len, 0.048, SECONDARY_BANDS, hero);
      place(f, 0, 0, 0, 0, 0, -0.06);
      place(f, x, SHOULDER[1] - 0.001 + (i % 2) * 0.0012, rootZ, 0, Math.atan2(drift, tipZ - rootZ), 0);
      b.add(fit(f), null, wingSkin, { noOutline: true });
    }
    // Primaries: fanning from the short hand, the outer five black with white mirrors and tips.
    for (let j = 0; j < 10; j++) {
      const u = j / 9;
      const rx = 0.386 + 0.108 * u;
      const rz = plan(Math.min(rx, 0.49)).le + 0.04 - 0.012 * u;
      const [tx, tz] = PRIMARY_TIPS[j]!;
      const len = Math.hypot(tx - rx, tz - rz);
      const f = feather(len, 0.046 - 0.008 * u, PRIMARY_BANDS[j]!, hero);
      place(f, 0, 0, 0, 0, 0, -0.07);
      place(f, rx, SHOULDER[1] - 0.002 - j * 0.0007, rz, 0, Math.atan2(tx - rx, tz - rz), 0);
      b.add(fit(f), null, wingSkin, { noOutline: true });
    }

    // The folded wing, for standing: grey along the flank, then the black primaries with their white spots,
    // reaching past the tail.
    const FOLD_KEYS: Ring[] = [
      [-0.088, 0.008, 0.022, 0.05, 0.03],
      [-0.045, 0.015, 0.05, 0.073, 0.02],
      [0.02, 0.016, 0.057, 0.079, 0.017],
      [0.09, 0.014, 0.05, 0.066, 0.02],
      [0.15, 0.011, 0.037, 0.045, 0.026],
      [0.21, 0.008, 0.025, 0.027, 0.03],
      [0.27, 0.006, 0.016, 0.014, 0.031],
      [0.312, 0.003, 0.007, 0.008 + (L ? 0.004 : 0), 0.03 + (L ? 0.006 : 0)],
    ];
    // Cut where the colours change (the white tertial crescent, each white primary tip), so the bands are crisp.
    const cuts = [-0.088, -0.045, 0.02, 0.07, 0.118, 0.136, 0.16, 0.178, 0.194, 0.216, 0.232, 0.252, 0.268, 0.287, 0.301, 0.312];
    const FOLD: Ring[] = cuts.map((z) => {
      let i = 1;
      while (i < FOLD_KEYS.length - 1 && FOLD_KEYS[i]![0] < z) i++;
      const p0 = FOLD_KEYS[i - 1]!;
      const p1 = FOLD_KEYS[i]!;
      const f = (z - p0[0]) / (p1[0] - p0[0]);
      return [z, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f, p0[3]! + (p1[3]! - p0[3]!) * f, p0[4]! + (p1[4]! - p0[4]!) * f] as const;
    });
    b.add(fit(tube('z', FOLD, { seg: 8 })), PAL.mantle, L ? 'foldL' : 'foldR', {
      paint: (_x, y, z, _nx, ny) => {
        if (z < 0.118) return y < -0.012 && z > -0.03 ? PAL.mantleEdge : undefined;
        if (z < 0.136) return PAL.gullWhite;
        // The white tips of the folded primaries: small marks along the upper edge of the black.
        const spot = (z > 0.178 && z < 0.194) || (z > 0.216 && z < 0.232) || (z > 0.252 && z < 0.268) || (z > 0.287 && z < 0.301);
        return spot && ny > 0.35 ? PAL.gullWhite : PAL.primary;
      },
    });

    // Legs: a feathered thigh, the pink shank, and a webbed foot.
    const leg = L ? 'legL' : 'legR';
    const shank = L ? 'shankL' : 'shankR';
    const foot = L ? 'footL' : 'footR';
    b.add(fit(tube('y', [[-0.045, 0.02, 0.022, HIP[0], HIP[2]], [-0.075, 0.016, 0.018, HIP[0], 0.038], [-0.1, 0.008, 0.009, HOCK[0], HOCK[2]]], { seg: 6 })), PAL.gullWhite, leg);
    b.add(fit(tube('y', [[-0.094, 0.0068, 0.0075, HOCK[0], HOCK[2]], [-0.13, 0.0052, 0.0058, HOCK[0], 0.039], [-0.166, 0.006, 0.0065, ANKLE[0], ANKLE[2]]], { seg: 6 })), PAL.leg, shank);
    const web = slab([[0, 0.012], [0.011, 0.004], [0.036, -0.047], [0.021, -0.046], [0, -0.066], [-0.021, -0.046], [-0.036, -0.047], [-0.011, 0.004]], 0.005);
    b.add(fit(place(web, ANKLE[0], SOLE_Y + 0.0035, ANKLE[2])), PAL.web, foot);
    for (const [tx, tz] of [[0.033, -0.047], [0, -0.066], [-0.033, -0.047]] as const) {
      b.add(fit(tube('z', [[tz, 0.0028, 0.0026, tx, 0], [tz * 0.5, 0.0042, 0.004, tx * 0.5, 0], [0.004, 0.005, 0.0048, 0, 0]], { seg: 5 }).translate(ANKLE[0], SOLE_Y + 0.005, ANKLE[2])), PAL.leg, foot, { noOutline: true });
    }
  }

  if (hero) b.outline(0.003, PAL.outline);
  return b.build();
}

// ------------------------------------------------------------------ the bill alone (first person)

/** The bill as the gull itself sees it, along −z from the origin at its base. One small mesh. */
export function buildViewBill(): THREE.BufferGeometry {
  const def = new RigDef<'bill'>([{ name: 'bill', at: [0, 0, 0] }]);
  const b = new RigBuilder(def);
  const z0 = 0.255;
  b.add(tube('z', BILL_UPPER, { seg: 10, smooth: 2 }).translate(0, -0.0215, z0), PAL.bill, 'bill', { paint: (x, y, z) => (z < -0.058 ? PAL.billPale : nostril(x, y + 0.0215, z - z0) ? PAL.nostril : undefined) });
  b.add(tube('z', BILL_LOWER, { seg: 10, smooth: 2 }).translate(0, -0.0215, z0), PAL.bill, 'bill', {
    paint: (_x, y, z) => (z < -0.035 && z > -0.06 && y < -0.003 ? PAL.gonys : undefined),
  });
  const r = b.build();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(r.color, 3));
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  return g;
}

// ------------------------------------------------------------------ animation

export type GullIdle = 'look' | 'shuffle' | 'preen' | 'stretch';

export interface GullAnim {
  /** Seconds, for the idle motions. */
  time: number;
  airborne: boolean;
  /** Flap phase (cycles); the fraction is where the beat is. */
  flapPhase: number;
  flapping: boolean;
  braking: boolean;
  diving: boolean;
  tumbling: boolean;
  /** 0 standing still … 1 walking at full pace. */
  walk: number;
  walkPhase: number;
  /** On the water: legs hidden, body lower. */
  floating: boolean;
  /** Turn rate (rad/s): the body banks into turns. */
  yawRate: number;
  speed: number;
  /** Bank (rad, positive = right wing down) when the flight model has its own; otherwise it follows the turn rate. */
  roll?: number;
  /** Where the gull is looking: right of the way its body points, and above the horizon (rad). */
  lookYaw?: number;
  lookPitch?: number;
  /** The long call: head thrown back, bill wide. */
  calling?: boolean;
  /** Swallowing something. */
  eating?: boolean;
  /** Busy with the player (looking, scouting): no preening or stretching by the clock. */
  attentive?: boolean;
  /** Play this stand-still idle now, `idleT` (0…1) of the way through; otherwise idles come and go by the clock. */
  idle?: GullIdle;
  idleT?: number;
}

/** What a gull remembers between frames (everything eased), one per gull drawn. */
export interface GullState {
  seed: number;
  clock: number;
  air: number;
  spread: number;
  flap: number;
  brake: number;
  dive: number;
  tumble: number;
  float: number;
  walk: number;
  bank: number;
  pitch: number;
  legs: number;
  fan: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  call: number;
  callT: number;
  eat: number;
  stretch: number;
  preen: number;
  started: boolean;
}

export function newGullState(seed = 0): GullState {
  return { seed, clock: seed * 7.3, air: 0, spread: 0, flap: 0, brake: 0, dive: 0, tumble: 0, float: 0, walk: 0, bank: 0, pitch: 0, legs: 1, fan: 0, headYaw: 0, headPitch: 0, headRoll: 0, call: 0, callT: 0, eat: 0, stretch: 0, preen: 0, started: false };
}

const I_BODY = GULL_RIG.index.body;
const I_NECK = GULL_RIG.index.neck;
const I_HEAD = GULL_RIG.index.head;
const QD = new THREE.Quaternion();
const QN = new THREE.Quaternion();
const EU = new THREE.Euler();
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 over [0, 1], flat-topped: rises in `edge`, holds, falls in `edge`. */
const bump = (t: number, edge = 0.2) => sstep(0, edge, t) * (1 - sstep(1 - edge, 1, t));
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const TAU = Math.PI * 2;

/** Arm elevation through one beat (−1 bottom … +1 top): a slower, harder downstroke, a quicker recovery. */
function beat(phase: number): number {
  // The old model was at the top at a quarter of the cycle; keep the game's phase meaning that.
  const p = phase - 0.25 - Math.floor(phase - 0.25);
  const DOWN = 0.56;
  return p < DOWN ? Math.cos((p / DOWN) * Math.PI) : -Math.cos(((p - DOWN) / (1 - DOWN)) * Math.PI);
}
/** How far through the upstroke (0 outside it, a bump within): the wrist flexes and the hand trails. */
function recovery(phase: number): number {
  const p = phase - 0.25 - Math.floor(phase - 0.25);
  const DOWN = 0.56;
  return p < DOWN ? 0 : Math.sin(((p - DOWN) / (1 - DOWN)) * Math.PI);
}

/**
 * Pose a gull. `pitch` is the flight path's (rad, up positive). Fills `pose` (the caller solves and writes it);
 * `state` carries the easing from frame to frame. Allocation-free.
 */
export function poseGull(pose: RigPose<GullBone>, st: GullState, a: GullAnim, pitch: number, dt: number): void {
  pose.reset();
  const first = !st.started;
  st.started = true;
  const ease = (rate: number) => (first ? 1 : 1 - Math.exp(-rate * dt));
  st.clock += dt;
  const t = st.clock;
  const flying = a.airborne && !a.tumbling;

  // ---- eased amounts
  st.air += ((a.airborne ? 1 : 0) - st.air) * ease(10);
  st.tumble += ((a.tumbling ? 1 : 0) - st.tumble) * ease(12);
  st.float += ((a.floating ? 1 : 0) - st.float) * ease(6);
  st.walk += ((a.airborne ? 0 : a.walk) - st.walk) * ease(10);
  st.brake += ((flying && a.braking ? 1 : 0) - st.brake) * ease(7);
  st.dive += ((flying && a.diving ? 1 : 0) - st.dive) * ease(7);
  st.flap += ((flying && a.flapping ? 1 : 0) - st.flap) * ease(a.flapping ? 16 : 6);
  st.call += ((a.calling ? 1 : 0) - st.call) * ease(a.calling ? 9 : 5);
  if (a.calling) st.callT += dt;
  else if (st.call < 0.02) st.callT = 0;
  st.eat += ((a.eating ? 1 : 0) - st.eat) * ease(10);

  // ---- idles: by the clock, or as asked
  const still = !a.airborne && a.walk < 0.08 && !a.calling && !a.eating;
  const cycle = 26;
  const ct = (t + st.seed * 11) % cycle;
  let preenT = -1;
  let stretchT = -1;
  let shuffleT = -1;
  if (a.idle) {
    const it = a.idleT ?? 0.5;
    if (a.idle === 'preen') preenT = it;
    else if (a.idle === 'stretch') stretchT = it;
    else if (a.idle === 'shuffle') shuffleT = it;
  } else if (still && !a.attentive) {
    if (ct > 8 && ct < 9.6) shuffleT = (ct - 8) / 1.6;
    if (ct > 14 && ct < 17.6) preenT = (ct - 14) / 3.6;
    if (!a.floating && ct > 21.5 && ct < 24.3 && Math.floor((t + st.seed * 11) / cycle) % 2 === 0) stretchT = (ct - 21.5) / 2.8;
  }
  const preenWant = preenT >= 0 ? bump(preenT, 0.18) : 0;
  const stretchWant = stretchT >= 0 ? bump(stretchT, 0.25) : 0;
  st.preen += (preenWant - st.preen) * ease(14);
  st.stretch += (stretchWant - st.stretch) * ease(14);
  const preenSide = hash(Math.floor((t + st.seed * 11) / cycle) + st.seed) < 0.5 ? -1 : 1;

  // ---- wings open or closed
  const spreadWant = a.airborne ? 1 : 0;
  st.spread += (spreadWant - st.spread) * ease(a.airborne ? 13 : 9);
  const open = Math.max(st.spread, st.stretch * 0.92);

  // ---- body attitude
  const wantPitch = flying ? clamp(pitch * 0.8, -0.9, 0.6) + st.brake * 0.42 - st.dive * 0.1 : a.tumbling ? 0 : a.floating ? 0.07 : 0.2 - st.walk * 0.1;
  st.pitch += (wantPitch - st.pitch) * ease(10);
  // Positive roll is right wing down, which is a negative turn about the model's z.
  const wantBank = flying ? clamp(a.roll !== undefined ? -a.roll : -a.yawRate * 0.28, -0.9, 0.9) : 0;
  st.bank += (wantBank - st.bank) * ease(10);
  const up = beat(a.flapPhase);
  const rec = recovery(a.flapPhase);
  const upLag = beat(a.flapPhase - 0.1);
  const upLag2 = beat(a.flapPhase - 0.19);
  let bodyPitch = st.pitch;
  let bodyRoll = st.bank;
  let bodyY = 0;
  let bodyX = 0;
  if (st.tumble > 0.01) {
    bodyPitch += st.tumble * (t * 9);
    bodyRoll += st.tumble * Math.sin(t * 13) * 0.8;
  }
  // The body rides the beat: down as the wings come up, lifted on the downstroke.
  bodyY -= st.flap * st.air * up * 0.014;
  const ground = (1 - st.air) * (1 - st.float);
  const walkCycle = a.walkPhase * TAU;
  if (ground > 0.01) {
    // Stand on the feet: keep the soles where they were as the body tips up.
    const hipY = HIP[1] * Math.cos(bodyPitch) - HIP[2] * Math.sin(bodyPitch);
    bodyY += ground * (HIP[1] - hipY + 0.022);
    bodyY += ground * st.walk * Math.abs(Math.sin(walkCycle)) * 0.008;
    bodyRoll += ground * st.walk * Math.sin(walkCycle) * 0.07;
    if (shuffleT >= 0) {
      const sh = bump(shuffleT, 0.3);
      bodyX += sh * Math.sin(shuffleT * TAU * 2) * 0.012;
      bodyRoll += sh * Math.sin(shuffleT * TAU * 2) * 0.06;
    }
  }
  if (st.float > 0.01) {
    bodyY += st.float * (-0.02 + Math.sin(t * 1.7 + st.seed) * 0.006);
    bodyRoll += st.float * Math.sin(t * 1.1 + st.seed * 3) * 0.035;
    bodyPitch += st.float * Math.sin(t * 0.9 + st.seed * 5) * 0.025;
  }
  bodyPitch += st.call * (-0.16 + sstep(0.25, 0.7, st.callT) * 0.3);
  bodyPitch -= st.stretch * 0.08;
  pose.rot('body', bodyPitch, 0, bodyRoll, 'YXZ');
  pose.move('body', bodyX, bodyY, 0);

  // ---- wings
  const glideDihedral = 0.15 + st.brake * 0.28;
  const speedSweep = clamp((a.speed - 14) * 0.012, 0, 0.16);
  // Braking: short quick back-beats, the wings cupped.
  const flutter = st.brake * Math.sin(t * 34) * 0.16;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const hum = i === 0 ? 'humL' : 'humR';
    const fore = i === 0 ? 'foreL' : 'foreR';
    const hand = i === 0 ? 'handL' : 'handR';
    const tip = i === 0 ? 'tipL' : 'tipR';
    const fold = i === 0 ? 'foldL' : 'foldR';
    // Into a turn the inner wing draws in a little.
    const inner = clamp(-st.bank * s, 0, 1) * 0.35;
    // Open, in the air.
    let raise = glideDihedral * (1 - st.flap * 0.5) + st.flap * up * 0.6 + flutter;
    let sweep = 0.04 + speedSweep + st.dive * 0.42 - st.brake * 0.22 + st.flap * rec * 0.12 + inner * 0.2;
    let twist = st.brake * 0.3 - st.flap * up * 0.05 * 0 + st.flap * (rec * 0.22 - (1 - rec) * 0.08);
    let elbow = st.dive * 0.95 + st.flap * rec * 0.42 + inner * 0.25 - st.brake * 0.08;
    let wrist = st.dive * 1.35 + st.flap * rec * 0.72 + speedSweep * 1.2 + inner * 0.3 - st.brake * 0.1;
    let handDroop = 0.24 - st.brake * 0.3 + st.flap * ((up - upLag) * 0.75 - 0.06) + st.dive * 0.05;
    let tipFlex = 0.07 + st.brake * 0.16 + st.flap * (upLag - upLag2) * -1.1;
    if (st.tumble > 0.01) {
      raise = mix(raise, 0.5 + Math.sin(t * 17 + s) * 0.7, st.tumble);
      elbow = mix(elbow, 0.7 + Math.sin(t * 11 + s * 2) * 0.4, st.tumble);
      wrist = mix(wrist, 0.8 + Math.cos(t * 13 + s) * 0.5, st.tumble);
    }
    if (st.stretch > 0.01) {
      // A stretch on the perch: both wings lifted high over the back, half flexed.
      raise = mix(raise, 0.95, st.stretch);
      elbow = mix(elbow, 1.05, st.stretch);
      wrist = mix(wrist, 1.25, st.stretch);
      sweep = mix(sweep, 0.3, st.stretch);
      handDroop = mix(handDroop, -0.1, st.stretch);
      twist = mix(twist, 0.1, st.stretch);
      tipFlex = mix(tipFlex, 0.05, st.stretch);
    }
    // Closed: the Z-fold (upper arm back, forearm forward, hand back along it).
    const o = sstep(0, 1, open);
    raise = mix(-0.32, raise, o);
    sweep = mix(1.12, sweep, o);
    elbow = mix(2.5, elbow, o);
    wrist = mix(2.75, wrist, o);
    twist = mix(0, twist, o);
    pose.rot(hum, twist, -s * sweep, s * raise, 'ZYX');
    pose.rot(fore, 0, s * elbow, 0);
    pose.rot(hand, twist * 0.5, -s * wrist, -s * handDroop * o, 'YZX');
    pose.rot(tip, 0, -s * 0.05, s * tipFlex * o, 'YZX');
    // The open wing shrinks away as it closes; the folded one takes its place.
    const flight = sstep(0.04, 0.3, open);
    pose.scale(hum, Math.max(flight, 0.0001));
    const folded = 1 - sstep(0.12, 0.34, open);
    pose.scale(fold, Math.max(folded, 0.0001));
    // The folded wing droops a little on the water and lifts off the back for a preen on its side.
    pose.rot(fold, 0, s * (st.preen * (preenSide === s ? 0.16 : 0)), s * (st.preen * (preenSide === s ? 0.1 : 0) - st.call * 0.12));
  }

  // ---- tail
  const fanWant = flying ? 0.08 + st.brake * 0.62 + Math.abs(st.bank) * 0.25 : a.tumbling ? 0.5 : 0.0;
  st.fan += (fanWant - st.fan) * ease(9);
  const wag = still && ct > 17.6 && ct < 18.3 ? Math.sin((ct - 17.6) * 40) * 0.25 * bump((ct - 17.6) / 0.7, 0.3) : 0;
  pose.rot('tail', st.brake * 0.36 - st.dive * 0.05 + st.float * -0.12 + ground * -0.06 + st.flap * upLag * 0.03, wag + (flying ? -a.yawRate * 0.05 : 0), -st.bank * 0.12);
  pose.rot('tailL', 0, -st.fan, 0);
  pose.rot('tailR', 0, st.fan, 0);

  // ---- legs
  const legsWant = a.airborne ? (a.braking && !a.tumbling ? 0.85 : a.tumbling ? 0.6 : 0) : 1;
  st.legs += (legsWant - st.legs) * ease(a.airborne ? 8 : 16);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const leg = i === 0 ? 'legL' : 'legR';
    const shank = i === 0 ? 'shankL' : 'shankR';
    const foot = i === 0 ? 'footL' : 'footR';
    const ph = walkCycle + (i === 0 ? 0 : Math.PI);
    let swing = Math.sin(ph) * 0.55 * st.walk;
    let lift = Math.max(0, Math.cos(ph)) * 0.9 * st.walk;
    if (shuffleT >= 0) lift += bump(shuffleT, 0.3) * Math.max(0, Math.sin(shuffleT * TAU * 2 + (i === 0 ? 0 : Math.PI))) * 0.5;
    if (st.tumble > 0.01) swing += st.tumble * Math.sin(t * 15 + i * 2) * 0.6;
    // Down: upright whatever the body's pitch. Tucked: trailing aft under the tail.
    const down = -bodyPitch * (1 - st.air) + swing + st.air * (0.55 - st.pitch * 0.5);
    const legRot = mix(-1.72, down, st.legs);
    const shankRot = mix(0.04, lift - st.air * 0.35, st.legs);
    const flat = st.air > 0.5 ? mix(-0.05, 0.25, st.legs) : -(swing + lift);
    pose.rot(leg, legRot, 0, s * 0.02);
    pose.move(leg, -s * 0.008 * (1 - st.legs), 0.014 * (1 - st.legs), 0);
    pose.rot(shank, shankRot, 0, 0);
    pose.rot(foot, flat, 0, 0);
    // Toes closed when tucked; and nothing shows below the waterline.
    const toes = mix(0.4, 1, st.legs);
    const drawnIn = mix(0.7, 1, st.legs);
    pose.scale(foot, toes * drawnIn, drawnIn, drawnIn);
    if (st.float > 0.5) pose.scale(leg, 0.0001);
  }

  // ---- neck and head
  // Looking about: quick turns to a new place every couple of seconds, as birds do.
  let lookYaw = a.lookYaw ?? 0;
  // Where the head points above the horizon: as told, else mostly level whatever the body is doing.
  let lookPitch = a.lookPitch ?? (flying ? st.pitch * 0.4 : 0);
  let lookRoll = 0;
  if (still && a.lookYaw === undefined) {
    const k = Math.floor((t + st.seed * 3) / 2.3);
    const r = hash(k + st.seed * 17);
    lookYaw += r < 0.3 ? 0 : (hash(k * 3 + 1 + st.seed) - 0.5) * 2.1;
    lookPitch += (hash(k * 5 + 2 + st.seed) - 0.55) * 0.35;
    lookRoll = hash(k * 7 + 3 + st.seed) < 0.22 ? (hash(k * 9 + st.seed) - 0.5) * 0.7 : 0;
  }
  if (flying) {
    // Into the turn.
    if (a.lookYaw === undefined) lookYaw += clamp(a.yawRate * 0.22, -0.7, 0.7);
  }
  lookYaw = clamp(lookYaw, -1.5, 1.5);
  lookPitch = clamp(lookPitch, -1.1, 0.9);
  st.headYaw += (lookYaw - st.headYaw) * ease(still ? 13 : 9);
  st.headPitch += (lookPitch - st.headPitch) * ease(still ? 13 : 9);
  st.headRoll += (lookRoll - st.headRoll) * ease(11);
  let neckPitch = ground * 0.82 + st.float * 0.62 - st.dive * 0.05 + st.brake * 0.12;
  // Standing, the neck is drawn up; on the wing it is drawn in.
  const neckLong = (ground + st.float) * 0.03;
  // Where the head points, in the frame of the gull's heading (not its body's): right of ahead, above level, tilt.
  // Set this way it stays level with the horizon however the body pitches and banks.
  let wantYaw = st.headYaw;
  let headAim = st.headPitch;
  let wantRoll = st.headRoll + (flying ? st.bank * 0.15 : 0);
  let neckYaw = wantYaw * 0.4;
  let neckZ = 0;
  let jaw = 0;
  // Walking: the head thrusts forward and then holds as the body catches up.
  if (st.walk > 0.02) {
    const saw = (a.walkPhase * 2) % 1;
    neckZ += st.walk * ground * (sstep(0, 0.22, saw) * (1 - saw) - 0.35) * 0.03;
    headAim += st.walk * ground * Math.sin(saw * TAU) * 0.04;
  }
  if (st.eat > 0.01) {
    // Down to it, then a toss back and a swallow.
    const e = (t * 1.35) % 1;
    const dip = sstep(0, 0.3, e) * (1 - sstep(0.42, 0.62, e));
    const toss = sstep(0.5, 0.72, e) * (1 - sstep(0.85, 1, e));
    neckPitch += st.eat * (-dip * 0.75 + toss * 0.35);
    headAim += st.eat * (-dip * 1.1 + toss * 0.75);
    jaw += st.eat * (dip * 0.25 + toss * (0.3 + Math.sin(t * 30) * 0.12));
  }
  if (st.call > 0.01) {
    // The long call: bow, then the head thrown up and back, bill wide, a cry on each beat.
    // (On the wing the head only lifts: it has to see where it is going.)
    const bow = (1 - sstep(0.2, 0.55, st.callT)) * (1 - st.air);
    const thrown = sstep(0.3, 0.75, st.callT) * (1 - st.air * 0.65);
    neckPitch += st.call * (-bow * 0.5 + thrown * 0.55);
    headAim += st.call * (-bow * 0.8 + thrown * 1.15);
    jaw += st.call * (0.18 + thrown * (0.38 + Math.max(0, Math.sin(st.callT * TAU * 3.6)) * 0.22));
    wantYaw *= 1 - st.call;
    neckYaw *= 1 - st.call;
  }
  if (st.preen > 0.01) {
    // Round over the shoulder and down into the feathers, nibbling.
    const p = st.preen;
    wantYaw = mix(wantYaw, preenSide * 2.5, p);
    neckYaw = mix(neckYaw, preenSide * 1.3, p);
    neckPitch += p * 0.12;
    headAim = mix(headAim, -0.72 + Math.sin(t * 21) * 0.07, p);
    wantRoll = mix(wantRoll, preenSide * 0.25, p);
    jaw += p * (0.06 + Math.max(0, Math.sin(t * 21)) * 0.08);
  }
  if (st.tumble > 0.01) jaw += st.tumble * 0.3;
  pose.rot('neck', neckPitch, -neckYaw, 0, 'YXZ');
  pose.move('neck', 0, 0, neckZ);
  const head = pose.q[I_HEAD]!;
  QD.setFromEuler(EU.set(headAim, -wantYaw, wantRoll, 'YXZ'));
  QN.multiplyQuaternions(pose.q[I_BODY]!, pose.q[I_NECK]!);
  head.copy(QN).invert().multiply(QD);
  // Tumbling, it goes with the body.
  if (st.tumble > 0.01) head.slerp(QD.setFromEuler(EU.set(-neckPitch, 0, 0, 'XYZ')), st.tumble);
  pose.move('head', 0, neckLong * 0.25, -neckLong);
  pose.rot('jaw', -Math.max(0, jaw), 0, 0);
}
