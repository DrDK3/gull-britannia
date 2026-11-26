/**
 * The people: the garrison, its officers, and the town's civilians, as characters.
 *
 * Every person is one merged, vertex-coloured geometry on a twenty-bone rig (rig.ts), and all the people of a mission
 * are one skinned mesh: one draw call in every pass, however many march. Natural adult proportions (a reference
 * figure of 1.75 m, scaled to each person's height), with hands, and a face drawn to read at ten metres: heavy brows,
 * eyes, a moustache where there is one.
 *
 * The uniform is a 1960s summer field uniform with nothing real on it: a khaki tunic worn outside the breeches under
 * a leather belt, boots, a side cap for the ranks and a peaked cap for officers, plain coloured shoulder boards. The
 * badge is invented: a brass lozenge with a teal pip.
 *
 * Model frame: forward −z, up +y, right +x; the feet are at the origin.
 */
import * as THREE from 'three';
import { PAL } from './palette';
import { RigBatch, RigBuilder, RigDef, RigPose, rigMaterial, type BatchSlot, type RigGeometry, type Skin, type SkinOut } from './rig';
import { ball, box, flip, mirrorX, place, post, slab, tube, type Ring } from './shapes';

export type FigBone =
  | 'pelvis' | 'spine' | 'chest' | 'neck' | 'head' | 'hat'
  | 'armL' | 'foreL' | 'handL' | 'propL'
  | 'armR' | 'foreR' | 'handR' | 'propR'
  | 'legL' | 'shinL' | 'footL'
  | 'legR' | 'shinR' | 'footR';

/** The reference figure's height (m): a look's `height` scales the whole model from this. */
const REF = 1.75;
const SHOULDER = [0.2, 1.44, 0.005] as const;
const ELBOW = [0.216, 1.165, 0.01] as const;
const WRIST = [0.222, 0.915, 0] as const;
const GRIP = [0.222, 0.84, -0.02] as const;
const HIP = [0.095, 0.93, 0] as const;
const KNEE = [0.097, 0.5, 0.005] as const;
const ANKLE = [0.097, 0.085, 0.01] as const;
const mirrored = (p: readonly [number, number, number]): [number, number, number] => [-p[0], p[1], p[2]];

export const FIG_RIG = new RigDef<FigBone>([
  { name: 'pelvis', at: [0, 0.96, 0] },
  { name: 'spine', parent: 'pelvis', at: [0, 1.08, 0.01] },
  { name: 'chest', parent: 'spine', at: [0, 1.27, 0.01] },
  { name: 'neck', parent: 'chest', at: [0, 1.49, 0.005] },
  { name: 'head', parent: 'neck', at: [0, 1.555, 0] },
  { name: 'hat', parent: 'head', at: [0, 1.7, 0] },
  { name: 'armL', parent: 'chest', at: mirrored(SHOULDER) },
  { name: 'foreL', parent: 'armL', at: mirrored(ELBOW) },
  { name: 'handL', parent: 'foreL', at: mirrored(WRIST) },
  { name: 'propL', parent: 'handL', at: mirrored(GRIP) },
  { name: 'armR', parent: 'chest', at: [...SHOULDER] },
  { name: 'foreR', parent: 'armR', at: [...ELBOW] },
  { name: 'handR', parent: 'foreR', at: [...WRIST] },
  { name: 'propR', parent: 'handR', at: [...GRIP] },
  { name: 'legL', parent: 'pelvis', at: mirrored(HIP) },
  { name: 'shinL', parent: 'legL', at: mirrored(KNEE) },
  { name: 'footL', parent: 'shinL', at: mirrored(ANKLE) },
  { name: 'legR', parent: 'pelvis', at: [...HIP] },
  { name: 'shinR', parent: 'legR', at: [...KNEE] },
  { name: 'footR', parent: 'shinR', at: [...ANKLE] },
]);

// ------------------------------------------------------------------ what a person looks like

export type Coat = 'tunic' | 'greatcoat' | 'jacket' | 'whites' | 'blouse';
export type Legs = 'breeches' | 'trousers' | 'skirt' | 'longskirt';
export type Hat = 'sidecap' | 'peaked' | 'flat' | 'toque' | 'scarf' | 'none';

export interface FigureLook {
  id: string;
  /** Height (m), and build: girth and shoulders as multiples of the reference, belly 0 (flat) to 1 (over the belt). */
  height: number;
  girth: number;
  shoulders: number;
  belly: number;
  coat: Coat;
  legs: Legs;
  hat: Hat;
  coatColour: number;
  coatDark: number;
  legColour: number;
  /** Shoulder boards and collar tabs (uniforms). */
  boards?: number;
  band?: number;
  skin: number;
  hair: number;
  /** The face: brows from −1 (raised, mild) to 1 (drawn down, fierce); a moustache, 0 none, 1 clipped, 2 grand. */
  brows: number;
  moustache: 0 | 1 | 2;
  /** How wide the head is (1 as the reference; a round face is wider). */
  face?: number;
  glasses?: boolean;
  bun?: boolean;
  /** Rolled to the elbow. */
  rolledSleeves?: boolean;
  /** Kit and things carried. */
  rifle?: boolean;
  crossStrap?: boolean;
  /** Rows of plain coloured ribbon bars on the chest. */
  ribbons?: number;
  chevron?: boolean;
  satchel?: boolean;
  goggles?: boolean;
  apron?: boolean;
  /** In the right hand (shown when asked, the mug; the others always). */
  right?: 'mug' | 'towel' | 'ladle';
  /** In the left hand. */
  left?: 'clipboard' | 'newspaper';
}

const SOLDIER: FigureLook = {
  id: 'soldier',
  height: 1.74,
  girth: 1,
  shoulders: 1,
  belly: 0,
  coat: 'tunic',
  legs: 'breeches',
  hat: 'sidecap',
  coatColour: PAL.khaki,
  coatDark: PAL.khakiDark,
  legColour: PAL.breeches,
  boards: PAL.boardPrivate,
  skin: PAL.skin,
  hair: PAL.hairBrown,
  brows: 0,
  moustache: 0,
  right: 'mug',
};
const OFFICER: FigureLook = { ...SOLDIER, id: 'officer', hat: 'peaked', legColour: PAL.breechesBlue, boards: PAL.boardOfficer, band: PAL.red, crossStrap: true, hair: PAL.hairDark, brows: 0.4, right: undefined };
const CIVILIAN: FigureLook = {
  id: 'civilian',
  height: 1.7,
  girth: 0.94,
  shoulders: 0.95,
  belly: 0.15,
  coat: 'jacket',
  legs: 'trousers',
  hat: 'flat',
  coatColour: PAL.tweed,
  coatDark: 0x55472f,
  legColour: PAL.suit,
  skin: PAL.skinPale,
  hair: PAL.hairGrey,
  brows: -0.4,
  moustache: 1,
};

/** The cast. Anyone not named here is drawn by their style. */
export const LOOKS: Record<string, FigureLook> = {
  soldier: SOLDIER,
  soldier2: { ...SOLDIER, id: 'soldier2', height: 1.8, girth: 0.93, hair: PAL.hairFair, skin: PAL.skinPale, brows: -0.2 },
  soldier3: { ...SOLDIER, id: 'soldier3', height: 1.69, girth: 1.06, hair: PAL.hairDark, skin: PAL.skinRuddy, brows: 0.3, moustache: 1 },
  marcher: { ...SOLDIER, id: 'marcher', rifle: true, right: undefined },
  marcher2: { ...SOLDIER, id: 'marcher2', height: 1.79, girth: 0.94, hair: PAL.hairFair, skin: PAL.skinPale, rifle: true, right: undefined },
  marcher3: { ...SOLDIER, id: 'marcher3', height: 1.7, girth: 1.05, hair: PAL.hairDark, skin: PAL.skinRuddy, moustache: 1, rifle: true, right: undefined },
  officer: OFFICER,
  civilian: CIVILIAN,
  sailor: { ...CIVILIAN, id: 'sailor', coatColour: PAL.jersey, coatDark: 0x1b2438, legColour: 0x2a3140, hair: PAL.hairDark, moustache: 0, brows: 0.2 },
  // Pte Borovsky: stout, mild, and never far from his enamel mug.
  borovsky: { ...SOLDIER, id: 'borovsky', height: 1.69, girth: 1.3, shoulders: 1.08, belly: 1, skin: PAL.skinRuddy, hair: PAL.hairDark, brows: -0.7, moustache: 1, face: 1.1 },
  // Cpl. Dunayev: long, lean and unimpressed; a rifle on his back and a stripe on his sleeve.
  corporal: { ...SOLDIER, id: 'corporal', height: 1.86, girth: 0.9, shoulders: 0.98, hair: PAL.hairDark, skin: PAL.skin, brows: 0.6, moustache: 0, face: 0.94, rifle: true, chevron: true },
  // Lt Voronova: tall, straight-backed, her clipboard held to her chest.
  voronova: { ...OFFICER, id: 'voronova', height: 1.8, girth: 0.84, shoulders: 0.9, legs: 'skirt', hair: PAL.hairFair, skin: PAL.skinPale, brows: 0.7, crossStrap: false, bun: true, face: 0.95, left: 'clipboard' },
  // Col Grushkov: a barrel of a man behind a moustache, with too many ribbons.
  grushkov: { ...OFFICER, id: 'grushkov', height: 1.71, girth: 1.24, shoulders: 1.1, belly: 0.75, skin: PAL.skinRuddy, hair: PAL.hairDark, brows: 1, moustache: 2, face: 1.08, ribbons: 6 },
  // The visiting Marshal: a greatcoat, even in June.
  general: { ...OFFICER, id: 'general', height: 1.7, girth: 1.3, shoulders: 1.12, belly: 0.6, coat: 'greatcoat', coatColour: PAL.greatcoat, coatDark: PAL.greatcoatDark, skin: PAL.skinPale, hair: PAL.hairGrey, brows: 0.8, moustache: 2, face: 1.06, ribbons: 3, crossStrap: false },
  // The Clerk: a civilian at his lunch behind a newspaper.
  clerk: { ...CIVILIAN, id: 'clerk', glasses: true, left: 'newspaper' },
  cook: { ...CIVILIAN, id: 'cook', height: 1.72, girth: 1.22, shoulders: 1.05, belly: 0.8, coat: 'whites', hat: 'toque', coatColour: PAL.whites, coatDark: 0xdad7cc, legColour: 0x3c3d45, skin: PAL.skinRuddy, hair: PAL.hairDark, brows: 0.2, moustache: 2, apron: true, rolledSleeves: true, right: 'ladle' },
  // The courier: a despatch rider, goggles pushed up on his cap, the satchel the dispatch lives in.
  courier: { ...SOLDIER, id: 'courier', height: 1.77, girth: 0.97, hair: PAL.hairFair, brows: 0.1, satchel: true, goggles: true, right: undefined },
  // Mrs Pascoe, the baker: apron, rolled sleeves, a tea towel, and no patience with gulls.
  baker: { ...CIVILIAN, id: 'baker', height: 1.62, girth: 1.2, shoulders: 0.92, belly: 0.55, coat: 'blouse', legs: 'longskirt', hat: 'scarf', coatColour: 0x6f8bb0, coatDark: 0x587499, legColour: 0x4a5f80, skin: PAL.skin, hair: PAL.hairGrey, brows: 0.5, moustache: 0, apron: true, rolledSleeves: true, right: 'towel', face: 1.04 },
};

/** The look for a person of the game: by name if they have one of their own, else by style (varied a little by id). */
export function lookFor(id: string, style: string): FigureLook {
  const named = LOOKS[id];
  if (named) return named;
  if (id.startsWith('marcher')) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return LOOKS[['marcher', 'marcher2', 'marcher3'][h % 3]!]!;
  }
  if (style === 'soldier') {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return LOOKS[['soldier', 'soldier2', 'soldier3'][h % 3]!]!;
  }
  return LOOKS[style] ?? SOLDIER;
}

/** How far above the cap's place (the hat bone) its top is (reference metres): where something lands on it. */
export function capTop(look: FigureLook): number {
  switch (look.hat) {
    case 'peaked':
      return 0.14;
    case 'toque':
      return 0.25;
    case 'none':
      return 0.08;
    default:
      return 0.095;
  }
}

// ------------------------------------------------------------------ building one

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** A skin down a limb: `top` above the first joint, blending across each joint (at ± half) to the bone below it. */
function skinY(b: RigBuilder<FigBone>, top: FigBone, joints: readonly { at: number; half: number; below: FigBone }[]): Skin {
  const I = b.def.index;
  return (_x, y, _z, out) => {
    let above = I[top];
    for (const j of joints) {
      const below = I[j.below];
      if (y > j.at + j.half) {
        out.a = out.b = above;
        out.w = 0;
        return;
      }
      if (y > j.at - j.half) {
        out.a = above;
        out.b = below;
        out.w = smooth((j.at + j.half - y) / (2 * j.half));
        return;
      }
      above = below;
    }
    out.a = out.b = above;
    out.w = 0;
  };
}

const GEOMETRY = new Map<string, RigGeometry<FigBone>>();

/** A person's geometry, built once for each look. */
export function figureGeometry(look: FigureLook): RigGeometry<FigBone> {
  let g = GEOMETRY.get(look.id);
  if (!g) {
    g = buildFigure(look);
    GEOMETRY.set(look.id, g);
  }
  return g;
}

function buildFigure(L: FigureLook): RigGeometry<FigBone> {
  const b = new RigBuilder(FIG_RIG);
  const G = L.girth;
  const SH = L.shoulders;
  const B = L.belly;
  const uniform = L.coat === 'tunic' || L.coat === 'greatcoat';
  const woman = L.coat === 'blouse' || L.legs === 'skirt';
  const torsoSkin = skinY(b, 'chest', [
    { at: 1.265, half: 0.07, below: 'spine' },
    { at: 1.07, half: 0.06, below: 'pelvis' },
  ]);
  /** Below the waist a coat's skirts follow the legs as well as the hips, more so lower down and further out. */
  const skirtSkin = (reach: number): Skin => {
    const I = FIG_RIG.index;
    return (x, y, z, out: SkinOut) => {
      if (y > 1.0) {
        torsoSkin(x, y, z, out);
        return;
      }
      out.a = I.pelvis;
      out.b = x < 0 ? I.legL : I.legR;
      out.w = smooth((1.0 - y) / reach) * 0.92 * smooth(Math.abs(x) / 0.05);
    };
  };

  // ---------------------------------------------------------------- legs and feet
  const Gl = 1 + (G - 1) * 0.55;
  for (const s of [-1, 1] as const) {
    const left = s < 0;
    const leg = left ? 'legL' : 'legR';
    const shin = left ? 'shinL' : 'shinR';
    const foot = left ? 'footL' : 'footR';
    const fit = <T extends THREE.BufferGeometry>(g: T): T => (left ? mirrorX(g) : g);
    const legSkin = skinY(b, leg, [
      { at: 0.51, half: 0.055, below: shin },
      { at: 0.1, half: 0.035, below: foot },
    ]);
    const boots = L.legs === 'breeches' || L.legs === 'skirt';
    if (L.legs === 'breeches') {
      // Breeches: full in the thigh, close at the knee, into the boot.
      const rings: Ring[] = [
        [0.995, 0.03, 0.035, 0.085, 0],
        [0.97, 0.086 * Gl, 0.098 * Gl, 0.087, 0],
        [0.84, 0.1 * Gl, 0.105 * Gl, 0.104, 0],
        [0.7, 0.09 * Gl, 0.096 * Gl, 0.105, 0],
        [0.58, 0.066, 0.07, 0.099, 0.002],
        [0.5, 0.056, 0.061, 0.097, 0.005],
        [0.45, 0.054, 0.058, 0.097, 0.008],
      ];
      b.add(fit(tube('y', rings, { seg: 8, sq: 2.3 })), L.legColour, legSkin);
      // An officer's stripe down the outer seam, in blue breeches.
      if (L.legColour === PAL.breechesBlue) b.add(fit(place(box(0.008, 0.36, 0.03), 0.2 * Gl, 0.75, 0, 0, 0, 0.14)), PAL.facing, leg, { flat: true });
    } else if (L.legs === 'trousers') {
      const rings: Ring[] = [
        [0.995, 0.03, 0.035, 0.085, 0],
        [0.97, 0.085 * Gl, 0.096 * Gl, 0.088, 0],
        [0.76, 0.083 * Gl, 0.09 * Gl, 0.095, 0],
        [0.5, 0.068, 0.074, 0.097, 0.004],
        [0.28, 0.063, 0.069, 0.097, 0.008],
        [0.085, 0.062, 0.07, 0.097, 0.004],
      ];
      b.add(fit(tube('y', rings, { seg: 8, sq: 2.4, open: 'end' })), L.legColour, legSkin);
    } else {
      // Under a skirt: the leg itself.
      const rings: Ring[] = [
        [0.97, 0.07, 0.076, 0.09, 0],
        [0.75, 0.066, 0.072, 0.094, 0],
        [0.5, 0.05, 0.054, 0.097, 0.004],
        [0.34, 0.052, 0.058, 0.097, 0.016],
        [0.12, 0.036, 0.04, 0.097, 0.008],
      ];
      // (Under a uniform skirt the leg is the skirt's colour above the boot, so that a long stride does not show.)
      b.add(fit(tube('y', rings, { seg: 7, open: 'end' })), boots ? L.legColour : 0xc9a58c, legSkin);
    }
    if (boots) {
      // Tall black boots.
      const shaft: Ring[] = [
        [0.475, 0.061, 0.066, 0.097, 0.008],
        [0.3, 0.057, 0.063, 0.097, 0.013],
        [0.15, 0.047, 0.053, 0.097, 0.012],
        [0.07, 0.046, 0.056, 0.097, 0.008],
      ];
      b.add(fit(tube('y', shaft, { seg: 8, open: 'end' })), PAL.boot, legSkin, { paint: (_x, y) => (y > 0.455 ? PAL.bootShine : undefined) });
    }
    const sole: Ring[] = boots
      ? [
          [0.09, 0.036, 0.04, 0.097, 0.04, 0.04],
          [0.04, 0.047, 0.055, 0.097, 0.055, 0.055],
          [-0.05, 0.051, 0.047, 0.097, 0.047, 0.047],
          [-0.13, 0.05, 0.035, 0.097, 0.036, 0.036],
          [-0.185, 0.041, 0.025, 0.097, 0.027, 0.027],
          [-0.207, 0.02, 0.013, 0.097, 0.016, 0.016],
        ]
      : [
          [0.085, 0.034, 0.036, 0.097, 0.036, 0.036],
          [0.03, 0.044, 0.046, 0.097, 0.046, 0.046],
          [-0.06, 0.047, 0.038, 0.097, 0.039, 0.039],
          [-0.14, 0.044, 0.028, 0.097, 0.029, 0.029],
          [-0.185, 0.026, 0.016, 0.097, 0.018, 0.018],
        ];
    b.add(fit(tube('z', sole, { seg: 8, sq: 2.6 })), boots ? PAL.boot : PAL.shoe, foot);
  }

  // ---------------------------------------------------------------- the coat
  const hem = L.coat === 'greatcoat' ? 0.36 : L.coat === 'jacket' ? 0.83 : L.coat === 'blouse' ? 0.98 : 0.86;
  const bust = woman ? 0.014 : 0;
  const torso: Ring[] = [];
  if (L.coat === 'greatcoat') torso.push([0.36, 0.225 * G, 0.165 * G, 0, 0.004], [0.6, 0.208 * G, 0.152 * G, 0, 0.002]);
  if (hem < 0.9) torso.push([Math.max(hem, 0.83), 0.182 * G, 0.13 * G + B * 0.012, 0, -B * 0.01]);
  torso.push(
    [0.95, 0.172 * G, 0.125 * G + B * 0.022, 0, -B * 0.018],
    [1.03, 0.152 * G + B * 0.012, 0.107 * G + B * 0.04, 0, -B * 0.032],
    [1.1, 0.157 * G + B * 0.01, 0.111 * G + B * 0.038, 0, -B * 0.03],
    [1.2, 0.171 * (G * 0.6 + SH * 0.4), 0.117 * G + B * 0.02 + bust, 0, -B * 0.014 - bust],
    [1.31, 0.187 * SH, 0.122 * (G * 0.5 + 0.5) + bust * 1.5, 0, -0.004 - bust * 1.5],
    [1.41, 0.2 * SH, 0.108 * (G * 0.4 + 0.6), 0, 0.004],
    [1.46, 0.165 * SH, 0.088, 0, 0.006],
    [1.497, 0.066, 0.064, 0, 0.006],
  );
  const coatSkin = L.coat === 'greatcoat' ? skirtSkin(0.5) : skirtSkin(0.16);
  b.add(tube('y', torso, { seg: 12, sq: 2.6, open: 'start' }), L.coatColour, coatSkin);
  /** The coat's cross-section at a height: half width, half depth, and where its middle is. */
  const at = (y: number): { rx: number; rz: number; cz: number } => {
    let i = 1;
    while (i < torso.length - 1 && torso[i]![0] < y) i++;
    const p = torso[i - 1]!;
    const q = torso[i]!;
    const f = Math.max(0, Math.min(1, (y - p[0]) / (q[0] - p[0])));
    return { rx: p[1] + (q[1] - p[1]) * f, rz: p[2] + (q[2] - p[2]) * f, cz: p[4]! + (q[4]! - p[4]!) * f };
  };
  /** Where the coat's front is at (x, y): it is a rounded box, so it falls away towards the sides. */
  const frontAt = (x: number, y: number) => {
    const c = at(y);
    const k = Math.min(0.999, Math.abs(x) / c.rx);
    return c.cz - c.rz * Math.pow(1 - Math.pow(k, 2.6), 1 / 2.6);
  };
  const frontZ = (y: number) => frontAt(0, y);
  /** Something small worn on the chest: a box set on the coat's front. */
  const worn = (colour: number, w: number, h: number, x: number, y: number, bone: FigBone | Skin = torsoSkin, d = 0.012, proud = 0) => {
    b.add(box(w, h, d, x, y, frontAt(x, y) - proud), colour, bone, { flat: true });
  };

  if (L.coat === 'jacket') {
    // A shirt front and a tie between two lapels.
    worn(PAL.shirt, 0.07, 0.21, 0, 1.385, torsoSkin, 0.01, 0.001);
    worn(PAL.tie, 0.024, 0.19, 0, 1.375, torsoSkin, 0.012, 0.004);
    b.add(box(0.05, 0.02, 0.014, 0, 1.478, frontZ(1.46) + 0.012), PAL.tie, 'neck', { flat: true });
    for (const s of [-1, 1]) b.add(place(box(0.036, 0.25, 0.014), s * 0.052, 1.375, frontAt(0.05, 1.375) - 0.004, 0, 0, s * 0.2), L.coatDark, torsoSkin, { flat: true });
  }
  if (L.coat === 'greatcoat') {
    // Wide lapels faced in red.
    for (const s of [-1, 1]) b.add(place(box(0.07, 0.24, 0.014), s * 0.05, 1.37, frontAt(0.05, 1.37) - 0.005, 0, 0, s * 0.3), PAL.facing, torsoSkin, { flat: true });
  }
  if (uniform || L.coat === 'whites') {
    // The belt, and its buckle.
    const by = 1.035;
    const belt: Ring[] = [by - 0.028, by + 0.028].map((y) => {
      const c = at(y);
      return [y, c.rx + 0.005, c.rz + 0.005, 0, c.cz] as const;
    });
    if (uniform) {
      b.add(tube('y', belt, { seg: 12, sq: 2.6, open: 'both' }), PAL.belt, torsoSkin);
      worn(PAL.brass, 0.05, 0.05, 0, by, torsoSkin, 0.014, 0.008);
    }
  }
  if (uniform) {
    // A stand collar with coloured tabs, shoulder boards, pocket flaps, brass buttons.
    b.add(tube('y', [[1.47, 0.068, 0.066, 0, 0.006], [1.522, 0.058, 0.059, 0, 0.004]], { seg: 10, open: 'both' }), L.coatColour, 'neck', {
      paint: (x, _y, z) => (z < -0.035 && Math.abs(x) > 0.008 && Math.abs(x) < 0.045 ? (L.boards ?? PAL.tab) : undefined),
    });
    for (const s of [-1, 1]) b.add(place(box(0.115, 0.014, 0.058), s * 0.15 * SH, 1.468, 0.006, 0, 0, -s * 0.2), L.boards ?? PAL.boardPrivate, 'chest', { flat: true });
    if (L.coat === 'tunic') {
      for (const s of [-1, 1]) worn(L.coatDark, 0.09, 0.016, s * 0.088 * SH, 1.345);
      for (const y of [1.44, 1.36, 1.28]) b.add(ball(0.0085, 0, y, frontZ(y) - 0.002, 1, 1, 0.6, 6), PAL.brass, torsoSkin);
    } else {
      // The greatcoat: two rows of buttons, a deep collar.
      for (const y of [1.2, 1.08, 0.94, 0.8]) for (const s of [-1, 1]) b.add(ball(0.013, s * 0.062, y, frontZ(y) - 0.003, 1, 1, 0.6, 6), PAL.brass, coatSkin);
      b.add(tube('y', [[1.44, 0.13 * SH, 0.095, 0, 0.012], [1.5, 0.085, 0.08, 0, 0.014], [1.54, 0.074, 0.074, 0, 0.018]], { seg: 10, open: 'both', sq: 2.4 }), L.coatDark, 'chest', {
        paint: (_x, _y, z) => (z < -0.02 ? PAL.facing : undefined),
      });
    }
    // The badge on the left breast pocket's flap is nobody's: a brass lozenge.
    if (L.chevron) {
      // A stripe on the sleeve, not on the shoulder.
      for (const r of [-0.5, 0.5]) b.add(place(box(0.006, 0.016, 0.06), -0.268, 1.31, 0.005, r, 0, 0), PAL.gold, 'armL', { flat: true });
    }
    if (L.ribbons) {
      // Ribbon bars in rows: plain colours, and more of them than is decent.
      const rows = L.ribbons;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 4; c++) worn(PAL.ribbons[(r * 3 + c * 5) % PAL.ribbons.length]!, 0.026, 0.012, -0.04 * SH - c * 0.029, 1.405 - r * 0.016, torsoSkin, 0.01, 0.004);
        if (rows > 4 && r < rows - 2) for (let c = 0; c < 3; c++) worn(PAL.ribbons[(r * 7 + c * 3 + 2) % PAL.ribbons.length]!, 0.026, 0.012, 0.045 * SH + c * 0.029, 1.405 - r * 0.016, torsoSkin, 0.01, 0.004);
      }
      if (L.coat === 'greatcoat') b.add(ball(0.03, 0.08, 1.3, frontZ(1.3) - 0.004, 1, 1, 0.35, 8), PAL.gold, torsoSkin);
    }
    if (L.crossStrap) {
      // An officer's cross strap, right shoulder to left hip.
      b.add(place(box(0.032, 0.5, 0.012), 0.012, 1.25, frontZ(1.25) - 0.004, 0.06, 0, -0.62), PAL.belt, torsoSkin, { flat: true });
    }
  }
  if (L.coat === 'whites') {
    for (const y of [1.36, 1.26, 1.16]) for (const s of [-1, 1]) b.add(ball(0.01, s * 0.05, y, frontZ(y) - 0.002, 1, 1, 0.6, 6), 0xcfccc0, torsoSkin);
    b.add(tube('y', [[1.455, 0.075, 0.07, 0, 0.004], [1.5, 0.064, 0.064, 0, 0.004]], { seg: 8, open: 'both' }), PAL.facing, 'neck');
  }
  if (L.coat === 'blouse') {
    b.add(tube('y', [[1.455, 0.08, 0.072, 0, 0.004], [1.495, 0.066, 0.064, 0, 0.004]], { seg: 8, open: 'both' }), PAL.shirt, 'neck');
  }
  if (L.legs === 'skirt' || L.legs === 'longskirt') {
    const low = L.legs === 'skirt' ? 0.5 : 0.3;
    const rings: Ring[] = [
      [low, (L.legs === 'skirt' ? 0.19 : 0.25) * G, (L.legs === 'skirt' ? 0.14 : 0.19) * G, 0, 0.004],
      [(low + 1.0) / 2, 0.2 * G, 0.15 * G, 0, 0.002],
      [0.93, 0.176 * G, 0.13 * G + B * 0.02, 0, -B * 0.014],
      [1.02, 0.15 * G + B * 0.012, 0.106 * G + B * 0.038, 0, -B * 0.03],
    ];
    b.add(tube('y', rings, { seg: 12, sq: 2.3, open: 'both' }), L.legColour, skirtSkin(L.legs === 'skirt' ? 0.5 : 0.75));
  }
  if (L.apron) {
    // An apron: a skirt of it, a waistband, a bib, lying on the front of whatever is under it.
    const low = L.legs === 'longskirt' ? 0.36 : 0.56;
    const w = 0.15 * G;
    const under = (x: number, y: number) => {
      if (y >= 0.98 || L.legs !== 'longskirt') return frontAt(x, Math.max(y, hem + 0.001));
      // The long skirt's own front (its rings are in the block above).
      const f = (y - 0.3) / 0.7;
      const rx = (0.25 - 0.08 * f) * G;
      const rz = (0.19 - 0.06 * f) * G + B * 0.02 * f;
      return 0.004 - rz * Math.pow(1 - Math.pow(Math.min(0.999, Math.abs(x) / rx), 2.3), 1 / 2.3);
    };
    const sheet = (ys: number[], half: (y: number) => number) => {
      const pts: number[] = [];
      const idx: number[] = [];
      const cols = 5;
      ys.forEach((y, r) => {
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * 2 * half(y);
          pts.push(x, y, under(x, y) - 0.009);
        }
        if (r === 0) return;
        for (let c = 0; c < cols - 1; c++) {
          const p0 = (r - 1) * cols + c;
          const p1 = r * cols + c;
          idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    b.add(sheet([low, 0.5, 0.64, 0.8, 0.95, 1.035], (y) => w * (1.05 + (1.0 - Math.min(1, y)) * 0.3)), PAL.apron, skirtSkin(0.7));
    b.add(sheet([1.035, 1.12, 1.22, 1.33], () => w * 0.62), PAL.apron, torsoSkin);
    b.add(sheet([1.02, 1.05], () => w * 1.12), 0xe2ded2, torsoSkin);
  }

  // ---------------------------------------------------------------- arms and hands
  for (const s of [-1, 1] as const) {
    const left = s < 0;
    const arm = left ? 'armL' : 'armR';
    const fore = left ? 'foreL' : 'foreR';
    const handBone = left ? 'handL' : 'handR';
    const fit = <T extends THREE.BufferGeometry>(g: T): T => (left ? mirrorX(g) : g);
    const armSkin = skinY(b, arm, [{ at: 1.165, half: 0.045, below: fore }]);
    const ax = (SH - 1) * 0.19;
    const fat = 1 + (G - 1) * 0.5;
    const rings: Ring[] = [
      [1.482, 0.03, 0.036, 0.196 + ax, 0.005],
      [1.445, 0.055 * fat, 0.061 * fat, 0.208 + ax, 0.005],
      [1.32, 0.051 * fat, 0.056 * fat, 0.214 + ax, 0.006],
      [1.2, 0.046 * fat, 0.05 * fat, 0.217 + ax, 0.008],
      [1.14, 0.044 * fat, 0.048 * fat, 0.218 + ax, 0.01],
      [1.02, 0.042, 0.045, 0.221 + ax, 0.006],
      [0.93, 0.039, 0.043, 0.222 + ax, 0.002],
      [0.905, 0.036, 0.04, 0.222 + ax, 0],
    ];
    b.add(fit(tube('y', rings, { seg: 8, sq: 2.2 })), L.coatColour, armSkin, {
      paint: (_x, y) => (L.rolledSleeves && y < 1.1 ? L.skin : L.coat === 'greatcoat' && y < 0.99 ? L.coatDark : undefined),
    });
    if (L.rolledSleeves) b.add(fit(tube('y', [[1.085, 0.05 * fat, 0.054 * fat, 0.219 + ax, 0.01], [1.125, 0.05 * fat, 0.054 * fat, 0.218 + ax, 0.01]], { seg: 8 })), L.coatDark, fore);
    // A hand: the palm towards the thigh, fingers a little curled, the thumb forward.
    const hx = 0.222 + ax;
    const palm: Ring[] = [
      [0.918, 0.022, 0.03, hx, 0],
      [0.87, 0.02, 0.046, hx, -0.004],
      [0.81, 0.019, 0.045, hx, -0.006],
      [0.765, 0.015, 0.038, hx + 0.003, -0.012],
      [0.738, 0.008, 0.022, hx + 0.006, -0.018],
    ];
    const skinOrGlove = L.goggles ? 0x5a4630 : L.skin;
    b.add(fit(tube('y', palm, { seg: 7 })), skinOrGlove, handBone);
    b.add(fit(tube('y', [[0.892, 0.012, 0.014, hx - 0.004, -0.04], [0.85, 0.011, 0.013, hx - 0.008, -0.058], [0.818, 0.007, 0.009, hx - 0.01, -0.066]], { seg: 5 })), skinOrGlove, handBone);
  }

  // ---------------------------------------------------------------- neck and head
  const F = L.face ?? 1;
  b.add(tube('y', [[1.465, 0.052, 0.054, 0, 0.008], [1.52, 0.047, 0.05, 0, 0.005], [1.565, 0.046, 0.05, 0, 0.004]], { seg: 8, open: 'both' }), L.skin, skinY(b, 'head', [{ at: 1.535, half: 0.02, below: 'neck' }, { at: 1.485, half: 0.015, below: 'chest' }]));
  const skull: Ring[] = [
    [1.53, 0.03 * F, 0.034, 0, -0.024],
    [1.558, 0.064 * F, 0.07, 0, -0.012],
    [1.6, 0.078 * F, 0.086, 0, -0.006],
    [1.645, 0.084 * F, 0.094, 0, 0],
    [1.69, 0.085 * F, 0.097, 0, 0.002],
    [1.73, 0.079 * F, 0.092, 0, 0.004],
    [1.762, 0.056 * F, 0.066, 0, 0.006],
    [1.777, 0.02, 0.025, 0, 0.006],
  ];
  b.add(tube('y', skull, { seg: 12, sq: 2.3, smooth: 1 }), L.skin, 'head', {
    paint: (_x, y, z) => ((y > 1.708 && (z > -0.035 || y > 1.748)) || (z > 0.04 && y > 1.6) ? L.hair : undefined),
  });
  // The face. Everything on it is a size up, and dark on light, so that it carries.
  const fz = -0.094;
  b.add(place(box(0.03, 0.05, 0.036), 0, 1.638, fz - 0.012, -0.3), PAL.skinShade, 'head', { flat: true });
  for (const s of [-1, 1]) {
    const ex = s * 0.036 * F;
    b.add(ball(0.017, ex, 1.667, fz + 0.006, 1.15, 0.72, 0.5, 6), PAL.eyeWhite, 'head');
    b.add(ball(0.0095, ex, 1.666, fz - 0.002, 1, 1, 0.6, 6), PAL.pupil, 'head');
    // Brows: thick, and angled by temperament.
    b.add(place(box(0.046 * F, 0.013, 0.016), ex, 1.694 + Math.max(0, -L.brows) * 0.006, fz - 0.002, 0, 0, s * L.brows * 0.34), L.hair === PAL.hairGrey ? 0x8d8c86 : L.hair === PAL.hairFair ? 0x7a5f36 : PAL.hairDark, 'head', { flat: true });
    b.add(ball(0.024, s * 0.087 * F, 1.652, 0.006, 0.42, 1, 0.72, 6), L.skin, 'head');
  }
  b.add(box(0.04, 0.009, 0.01, 0, 1.588, fz + 0.004), PAL.lip, 'head', { flat: true });
  if (L.moustache === 1) b.add(box(0.058, 0.016, 0.018, 0, 1.607, fz - 0.004), L.hair, 'head', { flat: true });
  if (L.moustache === 2) {
    // A grand moustache: it comes round the corners of the mouth.
    b.add(box(0.075, 0.024, 0.024, 0, 1.607, fz - 0.007), L.hair, 'head', { flat: true });
    for (const s of [-1, 1]) b.add(place(box(0.04, 0.02, 0.022), s * 0.05, 1.596, fz - 0.002, 0, 0, s * 0.6), L.hair, 'head', { flat: true });
  }
  if (L.glasses) {
    for (const s of [-1, 1]) b.add(place(new THREE.TorusGeometry(0.023, 0.0035, 4, 10), s * 0.036, 1.667, fz - 0.008), PAL.ink, 'head');
    b.add(box(0.03, 0.005, 0.005, 0, 1.672, fz - 0.008), PAL.ink, 'head');
  }
  if (L.bun) b.add(ball(0.046, 0, 1.635, 0.108, 1, 0.9, 0.8, 8), L.hair, 'head');
  if (woman) b.add(ball(0.09, 0, 1.69, 0.03, 1.02 * F, 0.85, 1, 8), L.hair, 'head');

  // ---------------------------------------------------------------- hats
  const badge = (x: number, y: number, z: number) => {
    b.add(place(box(0.024, 0.024, 0.008), x, y, z, 0, 0, Math.PI / 4), PAL.brass, 'hat', { flat: true });
    b.add(place(box(0.009, 0.009, 0.01), x, y, z - 0.002, 0, 0, Math.PI / 4), PAL.badgePip, 'hat', { flat: true });
  };
  if (L.hat === 'sidecap') {
    // A side cap: a folded boat of cloth, worn a little to the right and forward.
    const cap: Ring[] = [
      [-0.135, 0.012, 0.024, 0, 1.766, 0.024],
      [-0.095, 0.074 * F, 0.052, 0, 1.775, 0.042],
      [-0.01, 0.094 * F, 0.062, 0, 1.78, 0.05],
      [0.075, 0.084 * F, 0.055, 0, 1.776, 0.046],
      [0.135, 0.014, 0.026, 0, 1.766, 0.026],
    ];
    const g = tube('z', cap, { seg: 8, sq: 1.5, smooth: 1 });
    place(g, 0, -1.74, 0);
    place(g, 0.008, 1.738, 0.004, -0.06, 0, -0.1);
    b.add(g, L.coatColour, 'hat', { paint: (_x, y) => (y < 1.75 ? L.coatDark : undefined) });
    badge(0.012, 1.77, -0.128);
    if (L.goggles) {
      // A despatch rider's goggles, pushed up.
      for (const s of [-1, 1]) b.add(ball(0.026, s * 0.034, 1.742, -0.094, 1, 0.8, 0.5, 8), 0x2c2d31, 'hat');
      b.add(tube('y', [[1.73, 0.092, 0.1, 0, 0.004], [1.752, 0.092, 0.1, 0, 0.004]], { seg: 10, open: 'both' }), PAL.belt, 'hat');
    }
  } else if (L.hat === 'peaked') {
    // A peaked cap: coloured band, a wide crown rising at the front, a black peak.
    b.add(tube('y', [[1.722, 0.09 * F, 0.101, 0, 0.004], [1.768, 0.092 * F, 0.103, 0, 0.004]], { seg: 12, open: 'both' }), L.band ?? PAL.red, 'hat');
    const crown = tube('y', [[1.764, 0.094, 0.104, 0, 0.004], [1.8, 0.142, 0.148, 0, 0.002], [1.822, 0.134, 0.14, 0, 0.002], [1.832, 0.06, 0.065, 0, 0.002]], { seg: 12 });
    place(crown, 0, -1.764, 0);
    place(crown, 0, 1.764, 0, 0.13);
    b.add(crown, L.coatColour, 'hat');
    const peak: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -1.25 + (2.5 * i) / 8;
      peak.push([Math.sin(a) * 0.092, -Math.cos(a) * 0.1 + 0.004]);
    }
    for (let i = 8; i >= 0; i--) {
      const a = -1.25 + (2.5 * i) / 8;
      peak.push([Math.sin(a) * 0.118, -Math.cos(a) * 0.168 + 0.012]);
    }
    const pk = slab(peak, 0.008);
    place(pk, 0, 0, 0.1);
    place(pk, 0, 1.728, -0.1, -0.3);
    b.add(pk, 0x141416, 'hat');
    b.add(box(0.15 * F, 0.008, 0.008, 0, 1.732, -0.1), PAL.gold, 'hat', { flat: true });
    badge(0, 1.752, -0.103);
  } else if (L.hat === 'flat') {
    b.add(ball(0.1, 0, 1.752, -0.004, 1.02 * F, 0.36, 1.16, 10), PAL.flatCap, 'hat');
    b.add(place(slab([[-0.07, 0], [0.07, 0], [0.058, -0.06], [0, -0.076], [-0.058, -0.06]], 0.01), 0, 1.728, -0.085, -0.18), 0x40382e, 'hat');
  } else if (L.hat === 'toque') {
    b.add(tube('y', [[1.722, 0.088, 0.098, 0, 0.004], [1.84, 0.09, 0.098, 0, 0.004], [1.87, 0.118, 0.124, 0, 0.004], [1.92, 0.108, 0.114, 0, 0.004], [1.945, 0.05, 0.054, 0, 0.004]], { seg: 10 }), PAL.whites, 'hat');
  } else if (L.hat === 'scarf') {
    // A headscarf, knotted at the nape.
    b.add(ball(0.101, 0, 1.702, 0.02, 0.98 * F, 0.86, 1.06, 10), 0xb4553d, 'hat', { paint: (_x, y, z) => (z < -0.045 && y < 1.74 ? 0xd9c7a0 : undefined) });
    b.add(ball(0.034, 0, 1.6, 0.112, 1, 0.8, 0.7, 6), 0xb4553d, 'hat');
  }

  // ---------------------------------------------------------------- kit
  if (L.rifle) {
    // A rifle slung muzzle up behind the right shoulder, its sling across the chest.
    const back = at(1.3).cz + at(1.3).rz + 0.03;
    const sling = (g: THREE.BufferGeometry) => place(g, 0.15, 1.22, back, 0.05, 0, -0.1);
    b.add(sling(box(0.05, 0.3, 0.09, 0, -0.33, 0.012)), PAL.rifleWood, 'chest', { flat: true });
    b.add(sling(box(0.042, 0.5, 0.052, 0, 0.05, 0)), PAL.rifleWood, 'chest', { flat: true });
    b.add(sling(post(0.013, 0.011, 0.28, 0.6, 0, -0.006, 6)), PAL.rifleSteel, 'chest');
    b.add(place(box(0.03, 0.62, 0.01), 0.05, 1.22, frontZ(1.22) - 0.006, 0.08, 0, 0.42), PAL.belt, torsoSkin, { flat: true });
  }
  if (L.satchel) {
    // The despatch case on its strap: where the dispatch goes.
    b.add(place(box(0.09, 0.2, 0.26), -0.215 * G, 0.94, 0.02, 0, 0, 0.06), 0x6b4a2c, 'pelvis', { flat: true });
    b.add(place(box(0.095, 0.085, 0.265), -0.217 * G, 1.0, 0.02, 0, 0, 0.06), 0x5a3d24, 'pelvis', { flat: true });
    b.add(place(box(0.03, 0.56, 0.012), -0.01, 1.24, frontZ(1.24) - 0.005, 0.06, 0, 0.7), 0x5a3d24, torsoSkin, { flat: true });
  }
  if (L.right === 'mug') {
    // An enamel mug, white with a blue rim, tea in it.
    const [gx, gy, gz] = GRIP;
    b.add(post(0.04, 0.044, gy - 0.045, gy + 0.045, gx, gz - 0.05, 10), PAL.enamel, 'propR', { paint: (_x, y, _z, _nx, ny) => (ny > 0.9 ? PAL.tea : y > gy + 0.032 ? PAL.enamelRim : undefined) });
    b.add(new THREE.TorusGeometry(0.026, 0.007, 4, 8, Math.PI).rotateZ(-Math.PI / 2).rotateY(-Math.PI / 2).translate(gx, gy, gz - 0.006), PAL.enamel, 'propR');
  } else if (L.right === 'towel') {
    // A tea towel, gripped by a corner.
    const [gx, gy, gz] = GRIP;
    const g = new THREE.PlaneGeometry(0.3, 0.46, 3, 12);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 9 + p.getX(i) * 5) * 0.018);
    g.computeVertexNormals();
    const back = flip(g.clone());
    for (const side of [g, back]) b.add(place(side, gx + 0.02, gy - 0.2, gz - 0.02, 0, Math.PI / 2 + 0.25, 0), 0xf3f0e6, 'propR', { paint: (_x, y) => (y < gy - 0.33 && y > gy - 0.375 ? PAL.red : undefined) });
  } else if (L.right === 'ladle') {
    const [gx, gy, gz] = GRIP;
    b.add(post(0.008, 0.008, gy - 0.4, gy + 0.05, gx, gz - 0.015, 5), PAL.steel, 'propR');
    b.add(ball(0.045, gx, gy - 0.41, gz - 0.035, 1, 0.6, 1, 8), PAL.steel, 'propR');
  }
  if (L.left === 'clipboard') {
    // A clipboard: board, a sheet, the clip.
    const [gx, gy, gz] = GRIP;
    const x = -gx - 0.012;
    b.add(box(0.012, 0.33, 0.235, x, gy - 0.07, gz - 0.01), 0x6d5334, 'propL', { flat: true });
    b.add(box(0.006, 0.29, 0.205, x - 0.008, gy - 0.085, gz - 0.01), PAL.paper, 'propL', { flat: true });
    b.add(box(0.012, 0.03, 0.09, x - 0.01, gy + 0.075, gz - 0.01), PAL.steel, 'propL', { flat: true });
    for (let i = 0; i < 5; i++) b.add(box(0.003, 0.006, 0.15, x - 0.012, gy + 0.02 - i * 0.04, gz - 0.01), PAL.ink, 'propL', { flat: true });
  } else if (L.left === 'newspaper') {
    // A newspaper, open: two pages meeting in a shallow fold, held up between the hands.
    const [gx, gy, gz] = GRIP;
    for (const s of [0, 1]) {
      const page = new THREE.BoxGeometry(0.25, 0.38, 0.006, 1, 16, 1);
      place(page, 0.125, 0, 0, 0, s ? -0.22 : 0.22, 0);
      if (s) place(page, 0.245, 0, -0.027);
      b.add(place(page, -gx - 0.02, gy + 0.02, gz - 0.02), PAL.newsprint, 'propL', {
        flat: true,
        // Lines of print, a masthead, margins.
        paint: (_x, y, _z, _nx, _ny, nz) => {
          if (Math.abs(nz) < 0.8) return undefined;
          const row = Math.floor((y - (gy + 0.02) + 0.19) / (0.38 / 16));
          return row >= 13 && row < 15 ? PAL.ink : row < 12 && row > 0 && row % 2 === 1 ? 0x8d8a80 : undefined;
        },
      });
    }
  }
  return b.build();
}

// ------------------------------------------------------------------ animation

export interface FigurePose {
  anim: string;
  /** Walk cycle (rad). */
  phase: number;
  moving: boolean;
  running: boolean;
  time: number;
  /** Where the head is turned: right of the body's heading, and above level (rad). */
  headYaw: number;
  headPitch: number;
  /** The mug is in his hand (a soldier at his tea). */
  mug?: boolean;
  capOff?: boolean;
}

/** What a person remembers between frames. */
export interface FigureState {
  seed: number;
  anim: string;
  moving: boolean;
  running: boolean;
  /** Seconds since the pose last changed kind: joints ease into the new one. */
  since: number;
  seated: boolean;
  started: boolean;
  q: THREE.Quaternion[];
  lift: THREE.Vector3;
  mug: number;
  cap: number;
}

export function newFigureState(seed = 0): FigureState {
  const q: THREE.Quaternion[] = [];
  for (let i = 0; i < FIG_RIG.count; i++) q.push(new THREE.Quaternion());
  return { seed, anim: '', moving: false, running: false, since: 9, seated: false, started: false, q, lift: new THREE.Vector3(), mug: 0, cap: 1 };
}

const ARM = ['armL', 'armR'] as const;
const FORE = ['foreL', 'foreR'] as const;
const HAND = ['handL', 'handR'] as const;
const LEG = ['legL', 'legR'] as const;
const SHIN = ['shinL', 'shinR'] as const;
const FOOT = ['footL', 'footR'] as const;
type P = RigPose<FigBone>;
const sgn = (i: number) => (i === 0 ? -1 : 1);
/** Upper arm: raised forward, out to the side, turned inward (rad). */
const arm = (p: P, i: number, raise: number, out = 0.07, twist = 0) => p.rot(ARM[i]!, raise, sgn(i) * twist, sgn(i) * out, 'XZY');
/** Forearm: bent at the elbow; `side` folds it in the plane the arm is held out in (a salute). */
const fore = (p: P, i: number, flex: number, side = 0) => p.rot(FORE[i]!, flex, 0, sgn(i) * side, 'ZXY');
const hand = (p: P, i: number, bend: number, twist = 0, side = 0) => p.rot(HAND[i]!, bend, sgn(i) * twist, sgn(i) * side, 'ZXY');
const leg = (p: P, i: number, swing: number, out = 0.02, turn = 0) => p.rot(LEG[i]!, swing, sgn(i) * turn, sgn(i) * out, 'ZXY');
const shin = (p: P, i: number, bend: number) => p.rot(SHIN[i]!, -bend, 0, 0);
const foot = (p: P, i: number, toesUp: number) => p.rot(FOOT[i]!, toesUp, 0, 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a));

const I = FIG_RIG.index;
const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
const EU = new THREE.Euler();
const HAND_CHAIN_R = [I.pelvis, I.spine, I.chest, I.armR, I.foreR, I.handR];
const HAND_CHAIN_L = [I.pelvis, I.spine, I.chest, I.armL, I.foreL, I.handL];

/** Make a held thing keep an orientation of its own (in the person's frame) whatever the arm is doing. */
function holdLevel(p: P, chain: readonly number[], prop: number, rx: number, ry: number, rz: number, order: THREE.EulerOrder = 'YXZ'): void {
  QA.identity();
  for (const i of chain) QA.multiply(p.q[i]!);
  QB.setFromEuler(EU.set(rx, ry, rz, order));
  p.q[prop]!.copy(QA.invert().multiply(QB));
}

/** Standing: weight on one leg and then the other, breathing, arms loose. */
function stand(p: P, t: number, seed: number, stiff: number): void {
  const sway = Math.sin(t * 0.55 + seed * 6) * (1 - stiff);
  const breath = Math.sin(t * 1.6 + seed * 3);
  p.move('pelvis', sway * 0.02, -Math.abs(sway) * 0.006, 0);
  p.rot('pelvis', 0, 0, -sway * 0.035);
  p.rot('spine', 0.02 - stiff * 0.02, 0, sway * 0.03);
  p.rot('chest', -0.03 + breath * 0.012 + stiff * 0.07, 0, sway * 0.018);
  for (let i = 0; i < 2; i++) {
    const off = Math.max(0, -sgn(i) * sway);
    leg(p, i, off * 0.1, 0.03 + sway * sgn(i) * 0.02 - stiff * 0.015, 0.1 - stiff * 0.02);
    shin(p, i, off * 0.2);
    foot(p, i, off * 0.1);
    arm(p, i, 0.05 + breath * 0.01 - stiff * 0.08, 0.075 - stiff * 0.04, 0.15);
    fore(p, i, 0.2 - stiff * 0.17);
    hand(p, i, 0.12);
  }
}

/** Legs, hips and arm swing for a walk (`run` 0…1 turns it into a run). */
function gait(p: P, phase: number, run: number, armSwing: number): void {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const amp = mix(0.46, 0.85, run);
  p.move('pelvis', -s * 0.012, mix(0.022, 0.05, run) * Math.abs(c) - mix(0.03, 0.06, run), 0);
  p.rot('pelvis', -mix(0.03, 0.1, run), -s * 0.1, s * 0.03, 'YXZ');
  p.rot('spine', -mix(0.03, 0.14, run), 0, -s * 0.02);
  p.rot('chest', -mix(0.02, 0.1, run), s * 0.16, 0, 'YXZ');
  for (let i = 0; i < 2; i++) {
    const k = i === 0 ? 1 : -1;
    const sw = k * s;
    // The knee bends as the leg comes through, and a little as it takes the weight.
    const through = Math.max(0, k * Math.cos(phase + 0.5));
    leg(p, i, sw * amp + mix(0.06, 0.2, run), 0.02, 0.05);
    shin(p, i, 0.1 + through * mix(0.85, 1.5, run) + Math.max(0, sw) * 0.1);
    foot(p, i, Math.max(0, sw) * 0.28 - Math.max(0, -sw) * 0.3 * (1 - through));
    arm(p, i, (-sw * mix(0.42, 0.85, run) + 0.05 + run * 0.15) * armSwing, 0.08, 0.2);
    fore(p, i, mix(0.28, 1.45, run) + Math.max(0, -sw) * 0.25 * armSwing);
    hand(p, i, 0.2);
  }
}

/**
 * Pose a person. Fills `pose` (the caller solves and writes it); `st` carries the easing between poses.
 * Allocation-free.
 */
export function poseFigure(pose: P, st: FigureState, f: FigurePose, look: FigureLook, dt: number): void {
  pose.reset();
  const first = !st.started;
  st.started = true;
  if (f.anim !== st.anim || f.moving !== st.moving || f.running !== st.running) {
    st.anim = f.anim;
    st.moving = f.moving;
    st.running = f.running;
    st.since = first ? 9 : 0;
  }
  st.since += dt;
  const t = f.time;
  const seed = st.seed;
  const since = st.since;
  const anim = f.anim;
  if (anim === 'sit') st.seated = true;
  else if (!(anim === 'flail' && !f.moving)) st.seated = false;
  let headYaw = f.headYaw;
  let headPitch = Math.max(-0.5, Math.min(0.7, f.headPitch)) * 0.85;
  let headRoll = 0;
  const rifle = look.rifle === true;

  // ---- the base: sitting, walking, running or standing
  if (st.seated) {
    pose.move('pelvis', 0, -0.375, 0.03);
    pose.rot('spine', -0.04, 0, 0);
    pose.rot('chest', -0.06, 0, 0);
    for (let i = 0; i < 2; i++) {
      leg(pose, i, 1.47, 0.09, 0.02);
      shin(pose, i, 1.5 + Math.sin(t * 0.4 + i) * 0.03);
      foot(pose, i, 0.03);
      arm(pose, i, 0.35, 0.1, 0.3);
      fore(pose, i, 0.95);
    }
  } else if (f.moving && anim !== 'march') gait(pose, f.phase, f.running ? 1 : 0, 1);
  else stand(pose, t, seed, anim === 'attention' || anim === 'salute' || anim === 'march' ? 1 : 0);

  // ---- what he is doing
  switch (anim) {
    case 'idle':
      if (!f.moving) headYaw += Math.sin(t * 0.37 + seed * 9) * 0.16;
      break;
    case 'attention':
      headPitch += 0.05;
      break;
    case 'march': {
      // A parade step: the leg swung straight and high, the free arm across the chest.
      const s = Math.sin(f.phase);
      const c = Math.cos(f.phase);
      pose.move('pelvis', 0, 0.018 * Math.abs(c) - 0.01, 0);
      pose.rot('chest', 0.06, s * 0.07, 0, 'YXZ');
      for (let i = 0; i < 2; i++) {
        const sw = (i === 0 ? 1 : -1) * s;
        leg(pose, i, 0.1 + Math.max(0, sw) * 0.68 - Math.max(0, -sw) * 0.36, 0.015, 0.02);
        shin(pose, i, 0.04 + Math.max(0, -sw) * Math.max(0, (i === 0 ? 1 : -1) * c) * 0.5);
        foot(pose, i, -Math.max(0, sw) * 0.4);
        if (i === 1 && rifle) continue;
        arm(pose, i, Math.max(0, -sw) * 0.5 - Math.max(0, sw) * 0.55, 0.04, 0.2 + Math.max(0, -sw) * 0.8);
        fore(pose, i, 0.06 + Math.max(0, -sw) * 1.3);
        hand(pose, i, 0);
      }
      headPitch += 0.06;
      break;
    }
    case 'salute':
      arm(pose, 1, 0.3, 1.3, 0.1);
      fore(pose, 1, 0.1, 2.5);
      hand(pose, 1, 0, 0, 0.1);
      headPitch += 0.05;
      break;
    case 'sip': {
      const tip = Math.max(0, Math.sin(t * 0.8)) * 0.14;
      arm(pose, 1, 0.9, 0.12, 0.42);
      fore(pose, 1, 2.0 + tip);
      hand(pose, 1, 0.1);
      arm(pose, 0, 0.12, 0.32, 0.9);
      fore(pose, 0, 1.25);
      headPitch += 0.06 + tip * 0.9;
      break;
    }
    case 'outrage': {
      // Both fists at the sky, and off the ground with it.
      const hop = Math.max(0, Math.sin(t * 9));
      pose.move('pelvis', 0, hop * 0.07 - 0.02, 0);
      pose.rot('spine', 0.12, 0, 0);
      pose.rot('chest', 0.1, 0, 0);
      for (let i = 0; i < 2; i++) {
        arm(pose, i, 2.7 + Math.sin(t * 14 + i * 1.7) * 0.28, 0.42, 0);
        fore(pose, i, 0.55 + Math.cos(t * 14 + i) * 0.3);
        hand(pose, i, 1.2);
        shin(pose, i, 0.25 * (1 - hop));
        leg(pose, i, 0.12 * (1 - hop), 0.06);
      }
      headPitch += 0.4;
      break;
    }
    case 'scrub': {
      // Bent over the pump, scrubbing at his chest.
      pose.move('pelvis', 0, -0.05, 0.03);
      pose.rot('spine', -0.42, 0, 0);
      pose.rot('chest', -0.22, 0, 0);
      for (let i = 0; i < 2; i++) {
        leg(pose, i, 0.3, 0.05);
        shin(pose, i, 0.42);
        foot(pose, i, 0.1);
      }
      arm(pose, 1, 0.78, 0.05, 1.05);
      fore(pose, 1, 1.85 + Math.sin(t * 10) * 0.22);
      arm(pose, 0, 0.5, 0.1, 0.6);
      fore(pose, 0, 1.6);
      headPitch -= 0.45;
      break;
    }
    case 'shoo': {
      pose.rot('spine', -0.1, 0, 0);
      arm(pose, 1, 1.5 + Math.sin(t * 16) * 0.5, 0.3, 0);
      fore(pose, 1, 0.55 + Math.cos(t * 16) * 0.4);
      hand(pose, 1, Math.sin(t * 16 + 1) * 0.5);
      arm(pose, 0, 1.1 + Math.cos(t * 15) * 0.45, 0.25, 0);
      fore(pose, 0, 0.65 + Math.sin(t * 15) * 0.3);
      headPitch += 0.25;
      break;
    }
    case 'flail': {
      if (f.moving && f.running) {
        // Running for it, arms anywhere.
        for (let i = 0; i < 2; i++) {
          arm(pose, i, 2.6 + Math.sin(t * 15 + i * 2) * 0.45, 0.5 + Math.cos(t * 11 + i) * 0.2, 0);
          fore(pose, i, 0.5 + Math.cos(t * 13 + i) * 0.35);
        }
        headPitch += 0.25;
      } else if (st.seated) {
        for (let i = 0; i < 2; i++) {
          arm(pose, i, 2.5 + Math.sin(t * 15 + i * 2) * 0.5, 0.5, 0);
          fore(pose, i, 0.5 + Math.cos(t * 14 + i) * 0.4);
        }
        pose.rot('chest', 0.15, 0, Math.sin(t * 7) * 0.08);
        headPitch += 0.35;
      } else {
        // Hit, and keeping his place: ducked, with his arms over his cap.
        pose.rot('spine', -0.22, 0, 0);
        pose.rot('chest', -0.16, 0, 0);
        for (let i = 0; i < 2; i++) {
          arm(pose, i, 2.3 + Math.sin(t * 12 + i) * 0.12, 0.5, 0.4);
          fore(pose, i, 1.75);
          if (!f.moving) shin(pose, i, 0.3);
        }
        headPitch -= 0.3;
      }
      break;
    }
    case 'look_up':
      // A hand to shade his eyes.
      pose.rot('spine', 0.07, 0, 0);
      arm(pose, 1, 0.5, 1.2, 0.2);
      fore(pose, 1, 0.25, 2.25);
      hand(pose, 1, 0, 0, 0.3);
      headPitch = 0.55;
      break;
    case 'look_around': {
      const turn = Math.sin(t * 1.3);
      pose.rot('chest', -0.03, -turn * 0.3, 0, 'YXZ');
      for (let i = 0; i < 2; i++) {
        arm(pose, i, 0.1, 0.22, 0.1);
        fore(pose, i, 0.45);
        shin(pose, i, 0.1);
      }
      headYaw = turn * 0.75;
      headPitch = 0.22;
      break;
    }
    case 'point':
      pose.rot('spine', -0.1, 0, 0);
      arm(pose, 1, 1.45 + Math.sin(t * 8) * 0.07, 0.06, 0);
      fore(pose, 1, 0.08);
      hand(pose, 1, 0);
      if (look.left !== 'clipboard') {
        // The other fist on his hip.
        arm(pose, 0, -0.15, 0.62, -0.3);
        fore(pose, 0, 1.35, 0);
      }
      break;
    case 'throw': {
      // Wound up, and then through.
      const wind = 1 - sstep(0.05, 0.3, since);
      pose.rot('spine', mix(-0.2, 0.1, wind), 0, 0);
      pose.rot('chest', 0, mix(0.4, -0.45, wind), 0, 'YXZ');
      arm(pose, 1, mix(1.05, 3.0, wind), 0.3, 0);
      fore(pose, 1, mix(0.25, 1.5, wind));
      arm(pose, 0, mix(-0.3, 0.9, wind), 0.2, 0);
      leg(pose, 0, 0.3, 0.03);
      shin(pose, 0, 0.25);
      leg(pose, 1, -0.2, 0.03);
      break;
    }
    case 'read':
      arm(pose, 1, 0.62, 0.05, 0.85);
      fore(pose, 1, 1.5 + Math.sin(t * 2.2) * 0.07);
      headPitch -= 0.38;
      break;
    case 'sit':
      if (look.left === 'newspaper') {
        // Behind his paper; now and then a hand goes down for a chip.
        const chip = (t % 7) < 2.2 ? bumpy((t % 7) / 2.2) : 0;
        for (let i = 0; i < 2; i++) {
          arm(pose, i, 0.82, 0.02, 0.12);
          fore(pose, i, 1.05);
        }
        arm(pose, 1, mix(0.82, 1.15, chip), 0.02, mix(0.12, 0.55, chip));
        fore(pose, 1, mix(1.05, 2.15, chip));
        headPitch -= 0.16;
      } else {
        // At his lunch: a spoon going up and down.
        const bite = bumpy(((t + seed) % 3.2) / 3.2);
        arm(pose, 1, mix(0.5, 1.0, bite), 0.08, 0.45);
        fore(pose, 1, mix(1.2, 2.1, bite));
        arm(pose, 0, 0.42, 0.05, 0.5);
        fore(pose, 0, 1.25);
        headPitch -= 0.2 - bite * 0.1;
      }
      break;
    case 'stir': {
      pose.rot('spine', -0.16, 0, 0);
      arm(pose, 1, 0.95 + Math.cos(t * 3) * 0.1, 0.02 + Math.sin(t * 3) * 0.16, 0.2);
      fore(pose, 1, 0.8 + Math.sin(t * 3) * 0.08);
      arm(pose, 0, 0.45, 0.12, 0.3);
      fore(pose, 0, 0.95);
      headPitch -= 0.28;
      break;
    }
    case 'stretch': {
      // The tell: a long stretch, arms up and out, back arched, up on his toes. Then he will turn.
      const up = sstep(0, 0.45, since);
      const twist = Math.sin(since * 2.6) * 0.1 * up;
      pose.move('pelvis', 0, up * 0.03, 0);
      pose.rot('spine', up * 0.12, 0, 0);
      pose.rot('chest', up * 0.2, twist, 0, 'YXZ');
      for (let i = 0; i < 2; i++) {
        arm(pose, i, mix(0.05, 2.75, up), mix(0.07, 0.85, up), 0);
        fore(pose, i, mix(0.2, 0.55, up) - Math.sin(since * 2.2) * 0.12 * up);
        hand(pose, i, 1.0 * up);
        foot(pose, i, -up * 0.3);
        leg(pose, i, 0, 0.04);
        shin(pose, i, 0);
      }
      headPitch += up * 0.3;
      headRoll = twist * 0.8;
      break;
    }
    default:
      break;
  }

  // ---- what he has in his hands
  if (rifle && (anim === 'march' || anim === 'attention' || anim === 'idle' || anim === 'salute') && !f.running) {
    // On parade the right hand is on the sling at the chest.
    if (anim !== 'salute') {
      arm(pose, 1, 0.12, 0.1, 0.95);
      fore(pose, 1, 1.75);
      hand(pose, 1, 1.3, 1.4);
    }
  }
  if (look.left === 'clipboard') {
    if (anim === 'read') {
      arm(pose, 0, 0.58, 0.02, 0.45);
      fore(pose, 0, 1.42);
      holdLevel(pose, HAND_CHAIN_L, I.propL, -0.8, Math.PI / 2, 0, 'XYZ');
    } else if (anim !== 'flail' && anim !== 'outrage' && anim !== 'shoo' && !f.running) {
      // Held to her chest.
      arm(pose, 0, 0.2, 0.06, 1.15);
      fore(pose, 0, 1.72);
      hand(pose, 0, 0.2);
      holdLevel(pose, HAND_CHAIN_L, I.propL, 0.12, Math.PI / 2 - 0.25, 0, 'XYZ');
    }
  }
  if (look.left === 'newspaper' && anim === 'sit') holdLevel(pose, HAND_CHAIN_L, I.propL, -0.32, 0, 0, 'XYZ');

  // ---- the head
  pose.rot('neck', headPitch * 0.35, -headYaw * 0.4, 0, 'YXZ');
  pose.rot('head', headPitch * 0.65, -headYaw * 0.6, headRoll, 'YXZ');

  // ---- ease into a new pose, joint by joint (a quarter of a second), then follow it exactly
  if (first) {
    for (let i = 0; i < FIG_RIG.count; i++) st.q[i]!.copy(pose.q[i]!);
    st.lift.copy(pose.t[I.pelvis]!);
  } else {
    const k = since >= 0.35 ? 1 : 1 - Math.exp(-dt * (7 + 90 * smooth(since / 0.35)));
    for (let i = 0; i < FIG_RIG.count; i++) {
      if (k < 1) pose.q[i]!.copy(st.q[i]!.slerp(pose.q[i]!, k));
      else st.q[i]!.copy(pose.q[i]!);
    }
    pose.t[I.pelvis]!.copy(st.lift.lerp(pose.t[I.pelvis]!, k));
  }

  // ---- things that appear and go: the mug in his hand, the cap on his head
  const ease = first ? 1 : 1 - Math.exp(-dt * 14);
  st.mug += ((f.mug ? 1 : 0) - st.mug) * ease;
  st.cap += ((f.capOff ? 0 : 1) - st.cap) * ease;
  if (look.right === 'mug') {
    pose.scale('propR', Math.max(0.0001, st.mug));
    // Upright, however the arm is held; tipped to his lips as he drinks.
    if (st.mug > 0.01) holdLevel(pose, HAND_CHAIN_R, I.propR, anim === 'sip' ? 0.25 + Math.max(0, Math.sin(t * 0.8)) * 0.5 : 0, 0.4, 0);
  }
  pose.scale('hat', Math.max(0.0001, st.cap));
}

/** 0 → 1 → 0 over [0, 1]. */
const bumpy = (x: number) => smooth(x / 0.3) * (1 - smooth((x - 0.7) / 0.3));

// ------------------------------------------------------------------ a mission's people

const UP = new THREE.Vector3(0, 1, 0);

/** One person of a cast. */
export class Figure {
  private readonly state: FigureState;
  /** Where the right hand is (in the cast's frame), after `pose`: for what he carries. */
  readonly hand = new THREE.Vector3();
  /** Where the cap sits and how it is turned (in the cast's frame), after `pose`: for what lands on it. */
  readonly hatMatrix = new THREE.Matrix4();
  private shown = false;

  constructor(
    private readonly cast: Cast,
    private readonly slot: BatchSlot,
    readonly look: FigureLook,
    seed: number,
  ) {
    this.state = newFigureState(seed);
  }

  /** Place and pose: feet at `pos` (in the frame of the cast's mesh), compass heading. */
  pose(pos: THREE.Vector3, yaw: number, p: FigurePose, dt: number): void {
    const c = this.cast;
    poseFigure(c.rig, this.state, p, this.look, dt);
    const k = this.look.height / REF;
    c.root.compose(pos, c.q.setFromAxisAngle(UP, -yaw), c.s.set(k, k, k));
    c.rig.solve(c.root);
    c.rig.write(c.batch.matrices, this.slot.bone);
    c.rig.point('handR', GRIP[0], GRIP[1], GRIP[2], this.hand);
    this.hatMatrix.copy(c.rig.world[I.hat]!);
    this.shown = true;
  }

  hide(): void {
    if (!this.shown) return;
    this.cast.batch.hide(this.slot);
    this.shown = false;
  }
}

/** All the people of a mission as one skinned mesh: one draw call a pass, whoever and however many they are. */
export class Cast {
  readonly mesh: THREE.SkinnedMesh;
  readonly figures: Figure[] = [];
  readonly batch: RigBatch;
  readonly rig = new RigPose(FIG_RIG);
  readonly root = new THREE.Matrix4();
  readonly q = new THREE.Quaternion();
  readonly s = new THREE.Vector3();

  constructor(looks: readonly FigureLook[]) {
    this.batch = new RigBatch(
      looks.map((look) => ({ geo: figureGeometry(look), copies: 1 })),
      rigMaterial(),
      'people',
    );
    this.mesh = this.batch.mesh;
    this.mesh.visible = looks.length > 0;
    looks.forEach((look, i) => this.figures.push(new Figure(this, this.batch.slots[i]!, look, 0.17 + i * 0.618)));
  }

  /** After posing: send the poses to the GPU. */
  commit(): void {
    this.batch.commit();
  }

  dispose(): void {
    this.batch.dispose();
  }
}
