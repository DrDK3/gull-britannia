/**
 * Draws a mission (src/gull/game/mission.ts) in the 3D scene: its props, items, guards and other people, the guards'
 * vision cones once tagged, falling poop, thrown caps, splats, and markers for the objective and highlighted perches.
 * Rebuilt for each mission; `sync` runs every frame.
 */
import * as THREE from 'three';
import { GuardState, type Guard } from '../game/guard';
import { ItemState, type Item, type ItemKind } from '../game/items';
import type { Mission, MissionEvent, Npc, Prop } from '../game/mission';
import type { V3 } from '../game/world';
import { disposeObject, shared, sharedAll } from '../../render/dispose';
import { Figure, type FigureStyle } from './figures';
import { GullFlock, PLAYER_BILL, type GullAnim } from './gullModel';
import { AllyState, type Marcher } from '../game/parade';

type ToScene = (e: number, n: number, h: number, out?: THREE.Vector3) => THREE.Vector3;

const M = (color: number, rough = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const MAT = sharedAll({
  wood: M(0x7a5a3a),
  darkWood: M(0x4a3626),
  iron: M(0x2b2d30, 0.5, { metalness: 0.4 }),
  enamel: M(0xe9e7df, 0.35),
  tea: M(0x6b3d1c, 0.2),
  paper: M(0xe8e1cc),
  manila: M(0xcfb27a),
  wax: M(0x9c1a16, 0.4),
  red: M(0xa3261b),
  slate: M(0x56606a),
  canvas: M(0x8c8a6c),
  olive: M(0x5d6040),
  rope: M(0xb59a68),
  white: M(0xf2f1ea),
  poop: M(0xf4f3ea, 0.35),
  straw: M(0xb79b5c, 0.9),
  chip: M(0xe9c46a, 0.6),
  pasty: M(0xc98d43, 0.7),
  crust: M(0xa8763a, 0.8),
  fish: M(0x9aa6b0, 0.3, { metalness: 0.3 }),
  glass: M(0xfff2b8, 0.2, { emissive: 0x403010 }),
  hullWhite: M(0xe9e6dc, 0.6),
  bottom: M(0x6b2a22, 0.7),
});

const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

/** A wooden boat hull along −z (bow), beam `b`, length `l`, freeboard `f` above the waterline. */
function hull(l: number, b: number, f: number, colour: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -l / 2);
  shape.quadraticCurveTo(b / 2, -l / 2 + l * 0.18, b / 2, -l / 2 + l * 0.42);
  shape.lineTo(b / 2 * 0.92, l / 2);
  shape.lineTo(-b / 2 * 0.92, l / 2);
  shape.lineTo(-b / 2, -l / 2 + l * 0.42);
  shape.quadraticCurveTo(-b / 2, -l / 2 + l * 0.18, 0, -l / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: f + 0.6, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, f, 0);
  add(g, geo, M(colour, 0.6));
  const deck = new THREE.ShapeGeometry(shape);
  deck.rotateX(Math.PI / 2);
  add(g, deck, MAT.wood, 0, f - 0.12);
  // Rubbing strake and boot-top.
  const strake = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  strake.rotateX(Math.PI / 2);
  add(g, strake, MAT.hullWhite, 0, f + 0.04).scale.set(1.02, 1, 1.01);
  const boot = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  boot.rotateX(Math.PI / 2);
  add(g, boot, MAT.bottom, 0, 0.06).scale.set(1.01, 1, 1.005);
  return g;
}

/** The town's other gulls (Mission.ambient) drawn at once; more than this are not drawn. */
const AMBIENT_MAX = 16;
/** Beyond this (m from the camera) another gull is a speck: not posed, not drawn. */
const FLOCK_RANGE = 450;
/** How far ahead of the grip a carried thing's middle is (m at full size), so that the bill holds it by an edge. */
const GRIP_AHEAD: Partial<Record<ItemKind, number>> = { dispatch: 0.06, document: 0.075, pasty: 0.04, bun: 0.03, fishhead: 0.03 };
/** Scratch for posing the flock: one object, rewritten for each gull. */
const FLOCK_ANIM: GullAnim = { time: 0, airborne: false, flapPhase: 0, flapping: false, braking: false, diving: false, tumbling: false, walk: 0, walkPhase: 0, floating: false, yawRate: 0, speed: 0 };
const STEP_HZ = 60;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** One flattened blob of a splat; four make a splat. Shared by every mission view. */
const SPLAT_GEO = shared(new THREE.SphereGeometry(1, 8, 4));
const SPLAT_BLOBS = 400;

function buildProp(p: Prop): THREE.Object3D {
  const g = new THREE.Group();
  switch (p.kind) {
    case 'nest': {
      const ring = new THREE.TorusGeometry(0.42, 0.13, 6, 14);
      ring.rotateX(Math.PI / 2);
      add(g, ring, MAT.straw, 0, 0.1);
      add(g, new THREE.CylinderGeometry(0.4, 0.35, 0.06, 12), MAT.straw, 0, 0.04);
      // A couple of tins and a crust: the Resistance pantry.
      add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), MAT.iron, 0.18, 0.1, 0.05);
      break;
    }
    case 'lamp': {
      add(g, new THREE.CylinderGeometry(0.14, 0.2, 0.5, 8), MAT.iron, 0, 0.25);
      add(g, new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), MAT.iron, 0, 2.2);
      add(g, new THREE.BoxGeometry(0.34, 0.42, 0.34), MAT.glass, 0, 4.05);
      add(g, new THREE.ConeGeometry(0.3, 0.22, 4), MAT.iron, 0, 4.37).rotation.y = Math.PI / 4;
      add(g, new THREE.BoxGeometry(0.5, 0.04, 0.04), MAT.iron, 0, 3.6);
      break;
    }
    case 'trawler':
    case 'crabber': {
      const big = p.kind === 'trawler';
      const l = big ? 9.4 : 10;
      const colour = (p.data?.colour as number) ?? 0x2f4a6b;
      g.add(hull(l, big ? 3.3 : 3.4, big ? 1.0 : 0.95, colour));
      // Wheelhouse forward of midships, mast ahead of it.
      const wh = add(g, new THREE.BoxGeometry(1.8, 1.9, 2.0), MAT.hullWhite, 0, (big ? 1.0 : 0.95) + 0.95, -1.5);
      wh.material = MAT.hullWhite;
      add(g, new THREE.BoxGeometry(1.95, 0.08, 2.15), MAT.slate, 0, (big ? 1.0 : 0.95) + 1.94, -1.5);
      for (const x of [-0.91, 0.91]) add(g, new THREE.BoxGeometry(0.02, 0.5, 1.2), MAT.glass, x, (big ? 1.0 : 0.95) + 1.4, -1.5, false);
      const mastZ = big ? -1.2 : -3.2;
      add(g, new THREE.CylinderGeometry(0.06, 0.09, big ? 6.6 : 4.5, 8), MAT.wood, 0, (big ? 1.0 : 0.95) + (big ? 3.3 : 2.25), mastZ);
      if (big) {
        // A furled mizzen and a gallows: a Brixham boat.
        add(g, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), MAT.wood, 0, 1.0 + 1.6, 3.4);
        add(g, new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), MAT.canvas, 0, 1.0 + 1.9, 3.4).rotation.x = Math.PI / 2;
      }
      // Her name across the transom.
      const name = String(p.data?.name ?? '');
      if (name) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 48;
        const x = c.getContext('2d')!;
        x.fillStyle = '#' + colour.toString(16).padStart(6, '0');
        x.fillRect(0, 0, 256, 48);
        x.fillStyle = '#f2efe4';
        x.font = 'bold 30px Georgia, serif';
        x.textAlign = 'center';
        x.fillText(name, 128, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
        plate.position.set(0, (big ? 1.0 : 0.95) - 0.25, l / 2 + 0.02);
        g.add(plate);
      }
      break;
    }
    case 'lobster_pot': {
      const base = add(g, new THREE.BoxGeometry(0.75, 0.06, 0.55), MAT.darkWood, 0, 0.03);
      void base;
      const arch = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10, 1, true, 0, Math.PI);
      arch.rotateZ(Math.PI / 2);
      const a = add(g, arch, new THREE.MeshStandardMaterial({ color: 0x3d5a4a, roughness: 0.8, wireframe: true }), 0, 0.06);
      a.rotation.x = 0;
      add(g, new THREE.TorusGeometry(0.1, 0.02, 4, 10), MAT.rope, 0, 0.32, 0).rotation.y = Math.PI / 2;
      break;
    }
    case 'bench': {
      add(g, new THREE.BoxGeometry(0.45, 0.05, 1.8), MAT.wood, 0, 0.46);
      add(g, new THREE.BoxGeometry(0.05, 0.45, 1.8), MAT.wood, -0.24, 0.72);
      for (const z of [-0.8, 0.8]) add(g, new THREE.BoxGeometry(0.5, 0.46, 0.06), MAT.iron, 0, 0.23, z);
      break;
    }
    case 'newspaper':
      add(g, new THREE.BoxGeometry(0.42, 0.01, 0.38), MAT.paper, 0, 0.005, 0, false);
      break;
    case 'sill':
      add(g, new THREE.BoxGeometry(0.42, 0.08, 1.1), MAT.white, 0, -0.04);
      break;
    case 'table': {
      add(g, new THREE.BoxGeometry(0.95, 0.05, 1.35), MAT.wood, 0, 0.755);
      for (const x of [-0.4, 0.4]) for (const z of [-0.6, 0.6]) add(g, new THREE.BoxGeometry(0.05, 0.73, 0.05), MAT.darkWood, x, 0.365, z);
      // A tin of pens and an ashtray: an office out of doors.
      add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), MAT.iron, 0.3, 0.83, -0.45);
      break;
    }
    case 'chair': {
      add(g, new THREE.BoxGeometry(0.42, 0.04, 0.42), MAT.wood, 0, 0.45);
      add(g, new THREE.BoxGeometry(0.04, 0.5, 0.42), MAT.wood, -0.2, 0.72);
      for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) add(g, new THREE.BoxGeometry(0.035, 0.45, 0.035), MAT.darkWood, x, 0.225, z);
      break;
    }
    case 'pump': {
      add(g, new THREE.CylinderGeometry(0.16, 0.2, 1.2, 10), M(0x2e4a3b, 0.5), 0, 0.6);
      add(g, new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0x2e4a3b, 0.5), 0, 1.2);
      add(g, new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6), M(0x2e4a3b, 0.5), 0, 0.85, -0.25).rotation.x = Math.PI / 2.4;
      add(g, new THREE.BoxGeometry(0.04, 0.04, 0.7), MAT.iron, 0, 1.25, 0.3).rotation.x = -0.4;
      add(g, new THREE.BoxGeometry(0.5, 0.15, 0.35), M(0x7d7a72), 0, 0.075, -0.4);
      break;
    }
    case 'field_kitchen': {
      add(g, new THREE.BoxGeometry(1.5, 0.9, 2.1), MAT.olive, 0, 0.75);
      add(g, new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), MAT.olive, 0, 1.3, -0.3).rotation.x = Math.PI / 2;
      add(g, new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), MAT.iron, 0.4, 2.0, 0.6);
      for (const z of [-0.8, 0.8]) for (const x of [-0.78, 0.78]) add(g, new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), MAT.iron, x, 0.32, z).rotation.z = Math.PI / 2;
      add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.25, 10), MAT.enamel, -0.4, 1.33, 0.7);
      break;
    }
    case 'barrel': {
      add(g, new THREE.CylinderGeometry(0.29, 0.29, 0.9, 12), M(0x6e4b2c), 0, 0.45);
      for (const y of [0.15, 0.75]) add(g, new THREE.TorusGeometry(0.3, 0.015, 4, 16), MAT.iron, 0, y).rotation.x = Math.PI / 2;
      break;
    }
    case 'mug': {
      const mug = add(g, new THREE.CylinderGeometry(0.06, 0.055, 0.12, 12), MAT.enamel, 0, 0.06);
      add(mug, new THREE.CylinderGeometry(0.052, 0.052, 0.01, 12), MAT.tea, 0, 0.05, 0, false);
      add(mug, new THREE.TorusGeometry(0.03, 0.008, 4, 8), MAT.enamel, 0.065, 0).rotation.y = Math.PI / 2;
      mug.name = 'mug';
      break;
    }
    case 'stand': {
      const w = (p.data?.w as number) ?? 4;
      const l = (p.data?.l as number) ?? 12;
      const deck = (p.data?.deck as number) ?? 1.6;
      // Deck on trestles, skirted in red, a canopy on four posts, steps at the north end.
      add(g, new THREE.BoxGeometry(w, 0.12, l), MAT.wood, 0, deck - 0.06);
      const skirt = add(g, new THREE.BoxGeometry(0.04, deck - 0.12, l), MAT.red, -w / 2 - 0.02, (deck - 0.12) / 2);
      void skirt;
      add(g, new THREE.BoxGeometry(w, deck - 0.12, 0.04), MAT.red, 0, (deck - 0.12) / 2, -l / 2 - 0.02);
      add(g, new THREE.BoxGeometry(w, deck - 0.12, 0.04), MAT.red, 0, (deck - 0.12) / 2, l / 2 + 0.02);
      for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(1.4, (deck / 4) * (i + 1), 0.4), MAT.darkWood, w / 2 - 0.9, ((deck / 4) * (i + 1)) / 2, -l / 2 - 0.2 - (3 - i) * 0.4);
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-l / 2 + 0.2, l / 2 - 0.2]) add(g, new THREE.CylinderGeometry(0.08, 0.08, 3, 8), MAT.darkWood, x, deck + 1.5, z);
      add(g, new THREE.BoxGeometry(w + 0.6, 0.16, l + 0.6), MAT.canvas, 0, deck + 3.08);
      const banner = (text: string, width: number, height: number, bg: string, fg: string) => {
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 96;
        const x = c.getContext('2d')!;
        x.fillStyle = bg;
        x.fillRect(0, 0, 1024, 96);
        x.fillStyle = fg;
        x.font = 'bold 54px Georgia, serif';
        x.textAlign = 'center';
        x.fillText(text, 512, 66);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      };
      // Facing the road (west, −x here: the prop is not turned).
      const b1 = banner('INSPECTION OF THE DARTMOUTH GARRISON', l, 0.5, '#9c1f17', '#f4e6a1');
      b1.rotation.y = -Math.PI / 2;
      b1.position.set(-w / 2 - 0.32, deck + 2.75, 0);
      g.add(b1);
      const b2 = banner('СЛАВА СОВЕТСКОЙ АРМИИ!', l * 0.8, 0.45, '#9c1f17', '#f4e6a1');
      b2.rotation.y = -Math.PI / 2;
      b2.position.set(-w / 2 - 0.05, deck * 0.55, 0);
      g.add(b2);
      // Lectern and refreshments are placed by the mission (game coordinates): see the 'lectern' and 'urn' parts below.
      break;
    }
    case 'lectern': {
      add(g, new THREE.BoxGeometry(0.5, 1.05, 0.6), MAT.darkWood, 0, 0.525);
      add(g, new THREE.BoxGeometry(0.62, 0.05, 0.8), M(0x9a7550), 0, 1.11).rotation.x = -0.12;
      add(g, new THREE.BoxGeometry(0.3, 0.3, 0.02), MAT.red, 0, 0.7, -0.31);
      break;
    }
    case 'pile': {
      // From the bed to its top (absolute height in data.top; the prop stands on the bed).
      const top = (p.data?.top as number) ?? 4.6;
      const len = Math.max(1, top - p.pos.h);
      add(g, new THREE.CylinderGeometry(0.2, 0.24, len, 10), M(0x4b3a2a, 0.9), 0, len / 2);
      add(g, new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10), MAT.iron, 0, len - 0.25);
      break;
    }
    case 'refreshments': {
      add(g, new THREE.BoxGeometry(1.0, 0.84, 1.4), MAT.white, 0, 0.42);
      add(g, new THREE.CylinderGeometry(0.16, 0.18, 0.42, 12), M(0xb8b8b0, 0.3, { metalness: 0.6 }), 0.1, 1.05, -0.45);
      add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), MAT.enamel, -0.1, 0.85, 0.2);
      break;
    }
    default:
      add(g, new THREE.BoxGeometry(0.5, 0.5, 0.5), MAT.red, 0, 0.25);
  }
  return g;
}

function buildItem(kind: ItemKind): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'chip':
      add(g, new THREE.BoxGeometry(0.11, 0.025, 0.025), MAT.chip, 0, 0.0125, 0, false).rotation.set(0, 0.3, 0.08);
      break;
    case 'pasty': {
      const p = add(g, new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.pasty, 0, 0, 0, false);
      p.scale.set(1, 0.55, 0.62);
      add(g, new THREE.BoxGeometry(0.19, 0.022, 0.02), M(0xa8702e), 0, 0.055, 0, false);
      break;
    }
    case 'crust':
      add(g, new THREE.BoxGeometry(0.09, 0.03, 0.06), MAT.crust, 0, 0.015, 0, false).rotation.y = 0.5;
      break;
    case 'bun':
      add(g, new THREE.SphereGeometry(0.06, 10, 6), MAT.pasty, 0, 0.03, 0, false).scale.y = 0.65;
      break;
    case 'fishhead':
      add(g, new THREE.ConeGeometry(0.04, 0.11, 6), MAT.fish, 0, 0.03, 0, false).rotation.z = Math.PI / 2;
      break;
    case 'dispatch':
      add(g, new THREE.BoxGeometry(0.24, 0.012, 0.16), MAT.manila, 0, 0.006, 0, false);
      add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10), MAT.wax, 0, 0.014, 0, false);
      add(g, new THREE.BoxGeometry(0.24, 0.013, 0.02), MAT.red, 0, 0.0065, -0.055, false);
      break;
    case 'document':
      add(g, new THREE.BoxGeometry(0.26, 0.022, 0.19), M(0x5c6b7a), 0, 0.011, 0, false);
      add(g, new THREE.BoxGeometry(0.05, 0.024, 0.05), MAT.red, 0, 0.012, 0, false).rotation.y = Math.PI / 4;
      add(g, new THREE.BoxGeometry(0.012, 0.025, 0.19), MAT.canvas, 0.08, 0.012, 0, false);
      break;
  }
  return g;
}

function coneMesh(range: number, fovDeg: number): THREE.Mesh {
  const segs = 20;
  const half = ((fovDeg / 2) * Math.PI) / 180;
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = -half + (2 * half * i) / segs;
    const a1 = -half + (2 * half * (i + 1)) / segs;
    pos.push(0, 0, 0, Math.sin(a0) * range, 0, -Math.cos(a0) * range, Math.sin(a1) * range, 0, -Math.cos(a1) * range);
    col.push(0.5, 0.5, 0.5, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.renderOrder = 4;
  return m;
}

const CONE_COLOURS: Record<number, number> = {
  [GuardState.Routine]: 0xffffff,
  [GuardState.Return]: 0xffffff,
  [GuardState.Suspicious]: 0xffd633,
  [GuardState.Investigate]: 0xffd633,
  [GuardState.Alert]: 0xff3326,
  [GuardState.Search]: 0xff8c26,
  [GuardState.Distracted]: 0x8cb3ff,
  [GuardState.Recover]: 0xffd633,
};

export class MissionView {
  readonly group = new THREE.Group();
  private readonly props = new Map<Prop, THREE.Object3D>();
  private readonly items = new Map<Item, { obj: THREE.Object3D; glint?: THREE.Mesh }>();
  private readonly figures = new Map<Guard | Npc, Figure>();
  private readonly marchFigs = new Map<Marcher, Figure>();
  /** The Bomber Wing (the first slots) and the town's other gulls, one draw call for all of them. */
  private readonly flock: GullFlock;
  private readonly ambientSlot = new Map<string, number>();
  private readonly ambientSeen = new Set<string>();
  private readonly ambientFree: number[] = [];
  private readonly walkPhase: Float32Array;
  /** Where each standing ambient gull was when its footing was last worked out (e, n, h), and the answer. */
  private readonly footing: Float64Array;
  private readonly afloat: Uint8Array;
  private readonly sv = new THREE.Vector3();
  private readonly cones = new Map<Guard, THREE.Mesh>();
  private readonly poops: THREE.Mesh[] = [];
  private readonly caps: THREE.Object3D[] = [];
  /** Splats on people's caps (small meshes that move with them). */
  private readonly hatSplats: THREE.Object3D[] = [];
  /** Splats on the ground and roofs: one instanced mesh, four blobs a splat, in metres above datum. */
  private readonly splatMesh: THREE.InstancedMesh;
  private readonly splatHolder = new THREE.Group();
  private splatNext = 0;
  private readonly marker: THREE.Mesh;
  private readonly perchRings: THREE.Mesh[] = [];
  private readonly poopGeo = new THREE.SphereGeometry(0.07, 8, 4);
  private readonly capGeo: THREE.Object3D;
  private t = 0;
  /** Where each moving thing was before the last game step, to draw between steps. */
  private readonly prev = new WeakMap<object, { e: number; n: number; h: number; yaw: number }>();

  constructor(readonly mission: Mission, private readonly toScene: ToScene) {
    this.group.name = 'mission';
    for (const p of mission.props) {
      const o = buildProp(p);
      this.props.set(p, o);
      this.group.add(o);
    }
    for (const it of mission.items) {
      const obj = buildItem(it.kind);
      let glint: THREE.Mesh | undefined;
      if (it.isMission) {
        glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85 }));
        this.group.add(glint);
      }
      this.items.set(it, { obj, glint });
      this.group.add(obj);
    }
    for (const g of mission.guards) {
      const f = new Figure(g.style as FigureStyle);
      this.figures.set(g, f);
      this.group.add(f.root);
      const cone = coneMesh(g.viewRange, g.fovDeg);
      cone.visible = false;
      this.cones.set(g, cone);
      this.group.add(cone);
    }
    for (const n of mission.npcs) {
      const f = new Figure(n.style as FigureStyle);
      this.figures.set(n, f);
      this.group.add(f.root);
    }
    for (const mm of mission.marchers) {
      const f = new Figure('soldier', { rifle: true });
      this.marchFigs.set(mm, f);
      this.group.add(f.root);
    }
    const wing = mission.allies.length;
    this.flock = new GullFlock(wing + AMBIENT_MAX);
    this.group.add(this.flock.mesh);
    for (let i = AMBIENT_MAX - 1; i >= 0; i--) this.ambientFree.push(wing + i);
    this.walkPhase = new Float32Array(wing + AMBIENT_MAX);
    this.footing = new Float64Array((wing + AMBIENT_MAX) * 4).fill(NaN);
    this.afloat = new Uint8Array(wing + AMBIENT_MAX);
    this.splatMesh = new THREE.InstancedMesh(SPLAT_GEO, MAT.poop, SPLAT_BLOBS);
    this.splatMesh.count = 0;
    this.splatMesh.frustumCulled = false;
    this.splatMesh.name = 'splats';
    this.splatHolder.add(this.splatMesh);
    this.group.add(this.splatHolder);
    const cap = new THREE.Group();
    add(cap, new THREE.CylinderGeometry(0.17, 0.13, 0.07, 12), M(0x6f6b45));
    add(cap, new THREE.CylinderGeometry(0.135, 0.135, 0.04, 12), MAT.red, 0, -0.045);
    this.capGeo = cap;
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.8, depthTest: false }));
    this.marker.renderOrder = 9;
    this.marker.scale.y = 1.6;
    this.group.add(this.marker);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.perchRings.push(r);
      this.group.add(r);
    }
  }

  /** Splats arrive as mission events. */
  onEvent(e: MissionEvent): void {
    if (e.type !== 'splat') return;
    const r0 = e.size;
    const guard = e.guard ? this.mission.guards.find((g) => g.id === e.guard) : undefined;
    const fig = guard ? this.figures.get(guard) : undefined;
    if (fig) {
      const s = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const r = r0 * (i === 0 ? 0.35 : 0.12 + Math.random() * 0.1);
        const m = new THREE.Mesh(SPLAT_GEO, MAT.poop);
        m.scale.set(r, r * 0.18, r);
        if (i > 0) {
          const a = Math.random() * Math.PI * 2;
          const d = r0 * (0.3 + Math.random() * 0.25);
          m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
        }
        s.add(m);
      }
      fig.hat.add(s);
      s.position.set((Math.random() - 0.5) * 0.08, 0.07, (Math.random() - 0.5) * 0.08);
      s.scale.setScalar(0.5);
      this.hatSplats.push(s);
      if (this.hatSplats.length > 24) this.hatSplats.shift()!.removeFromParent();
      return;
    }
    // On the surface hit: four flattened blobs, written into the instanced mesh (the oldest are overwritten).
    const n = new THREE.Vector3(e.normal.e, e.normal.h, -e.normal.n).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const centre = new THREE.Vector3(e.at.e + e.normal.e * 0.03, e.at.h + e.normal.h * 0.03, -(e.at.n + e.normal.n * 0.03));
    const mtx = new THREE.Matrix4();
    const off = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const r = r0 * (i === 0 ? 0.35 : 0.12 + Math.random() * 0.1);
      off.set(0, 0, 0);
      if (i > 0) {
        const a = Math.random() * Math.PI * 2;
        const d = r0 * (0.3 + Math.random() * 0.25);
        off.set(Math.cos(a) * d, 0, Math.sin(a) * d).applyQuaternion(q);
      }
      mtx.compose(off.add(centre), q, new THREE.Vector3(r, r * 0.18, r));
      this.splatMesh.setMatrixAt(this.splatNext % SPLAT_BLOBS, mtx);
      this.splatNext++;
    }
    this.splatMesh.count = Math.min(this.splatNext, SPLAT_BLOBS);
    this.splatMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Show everything this view can ever draw (vision cones, markers, glints) so the renderer can compile their
   * shaders ahead of time; call the function it returns to put things back.
   */
  revealForWarmUp(): () => void {
    const hidden: THREE.Object3D[] = [];
    this.group.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const count = this.splatMesh.count;
    this.splatMesh.count = Math.max(1, count);
    return () => {
      for (const o of hidden) o.visible = false;
      this.splatMesh.count = count;
    };
  }

  /** Remember where everything is, just before a game step (the controller calls this). */
  snapshot(): void {
    const m = this.mission;
    const keep = (o: { pos: V3 }, yaw = 0) => {
      const p = this.prev.get(o);
      if (p) {
        p.e = o.pos.e;
        p.n = o.pos.n;
        p.h = o.pos.h;
        p.yaw = yaw;
      } else this.prev.set(o, { e: o.pos.e, n: o.pos.n, h: o.pos.h, yaw });
    };
    for (const g of m.guards) keep(g, g.bodyYaw);
    for (const n of m.npcs) keep(n, n.yaw);
    for (const mm of m.marchers) keep(mm, mm.yaw);
    for (const a of m.allies) keep(a, a.yaw);
    for (const a of m.ambient) keep(a, a.yaw);
    for (const p of m.poops) keep(p);
    for (const t of m.thrown) keep(t);
    for (const it of m.items) if (it.state === ItemState.Loose) keep(it, it.yaw);
  }

  /** A thing's position `alpha` of the way from before the last step to now (scene coordinates). */
  private at(o: { pos: V3 }, alpha: number, out = new THREE.Vector3(), lift = 0): THREE.Vector3 {
    const p = this.prev.get(o);
    if (!p || alpha >= 1) return this.toScene(o.pos.e, o.pos.n, o.pos.h + lift, out);
    return this.toScene(p.e + (o.pos.e - p.e) * alpha, p.n + (o.pos.n - p.n) * alpha, p.h + (o.pos.h - p.h) * alpha + lift, out);
  }

  private yawAt(o: object, yaw: number, alpha: number): number {
    const p = this.prev.get(o);
    if (!p || alpha >= 1) return yaw;
    return p.yaw + Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * alpha;
  }

  /** Where a guard's or a person's head is drawn now, in game coordinates (for the HUD's labels). */
  headOf(o: { pos: V3 }, alpha: number, lift: number): V3 {
    const p = this.prev.get(o);
    const a = !p || alpha >= 1 ? 1 : alpha;
    const q = p ?? { e: o.pos.e, n: o.pos.n, h: o.pos.h };
    return { e: q.e + (o.pos.e - q.e) * a, n: q.n + (o.pos.n - q.n) * a, h: q.h + (o.pos.h - q.h) * a + lift };
  }

  /**
   * Bring the scene up to date with the mission, `alpha` of the way from the previous game step to the latest one.
   * `bill` is where the gull's bill is drawn (what it carries hangs there); `camera` is for the glints' fade.
   */
  sync(dt: number, camera: THREE.Camera, alpha = 1, bill?: { pos: THREE.Vector3; yaw: number }): void {
    this.t += dt;
    const m = this.mission;
    const v = new THREE.Vector3();
    PLAYER_BILL.holding = !!m.beak;
    for (const [p, o] of this.props) {
      this.toScene(p.pos.e, p.pos.n, p.pos.h, o.position);
      o.rotation.y = -p.yaw;
      o.visible = p.visible !== false;
      if (p.kind === 'mug') {
        const mug = o.getObjectByName('mug');
        if (mug) mug.rotation.z = p.data?.spilled ? Math.PI / 2 : 0;
      }
    }
    for (const [it, { obj, glint }] of this.items) {
      const shown = it.state !== ItemState.Consumed;
      obj.visible = shown;
      if (!shown) {
        if (glint) glint.visible = false;
        continue;
      }
      if (it.state === ItemState.Held && bill) {
        // In the bill, exactly where the gull's bill is drawn this frame: gripped by its near edge, so its middle is a
        // little ahead along the bill.
        // The bill points where the head does, which leads the view's heading in a turn.
        const ahead = (GRIP_AHEAD[it.kind] ?? 0) * it.heldScale;
        const by = PLAYER_BILL.yaw;
        const bp = PLAYER_BILL.pitch;
        const flat = Math.cos(bp) * ahead;
        obj.position.set(bill.pos.x + Math.sin(by) * flat, bill.pos.y + Math.sin(bp) * ahead, bill.pos.z - Math.cos(by) * flat);
        obj.rotation.set(0, -by + Math.PI / 2, bp, 'YZX');
      } else if (it.state === ItemState.CarriedByGuard) {
        const g = m.guards.find((x) => x.carrying === it);
        const f = g && this.figures.get(g);
        if (f) {
          f.handR.updateWorldMatrix(true, false);
          obj.position.setFromMatrixPosition(f.handR.matrixWorld);
        } else this.toScene(it.pos.e, it.pos.n, it.pos.h, obj.position);
        obj.rotation.set(0, -it.yaw, 0);
      } else {
        this.at(it, it.state === ItemState.Loose ? alpha : 1, obj.position);
        obj.rotation.set(0, -it.yaw, 0);
      }
      obj.scale.setScalar(it.state === ItemState.Held ? it.heldScale : 1);
      if (glint) {
        const near = camera.position.distanceTo(obj.position) < 60;
        glint.visible = near && (it.state === ItemState.Placed || it.state === ItemState.Loose);
        glint.position.copy(obj.position).add(v.set(0, 0.3 + Math.sin(this.t * 3) * 0.05, 0));
        glint.rotation.y = this.t * 2;
      }
    }
    for (const [who, f] of this.figures) {
      const isGuard = 'routine' in who;
      const pos = this.at(who, alpha);
      if (isGuard) {
        const g = who as Guard;
        f.pose(pos, this.yawAt(g, g.bodyYaw, alpha), { anim: g.anim, phase: g.phase, moving: g.moving, running: g.runningNow, time: g.time, headYaw: g.headYaw, headPitch: g.headPitch });
        f.mug.visible = g.mugInHand;
        const cone = this.cones.get(g)!;
        const near = camera.position.distanceTo(pos) < 140;
        cone.visible = g.tagged && near;
        if (cone.visible) {
          cone.position.copy(pos).add(v.set(0, 0.08, 0));
          cone.rotation.y = -(this.yawAt(g, g.bodyYaw, alpha) + g.headYaw);
          (cone.material as THREE.MeshBasicMaterial).color.set(CONE_COLOURS[g.state] ?? 0xffffff);
          const r = g.viewRange * (g.alarmTimer > 0 ? 1.25 : 1);
          cone.scale.setScalar(r / g.viewRange);
        }
      } else {
        const n = who as Npc;
        f.pose(pos, this.yawAt(n, n.yaw, alpha), { anim: n.anim, phase: n.phase, moving: n.moving, running: false, time: n.phase, headYaw: n.headYaw, headPitch: n.headPitch });
      }
    }
    for (const [mm, f] of this.marchFigs) {
      f.pose(this.at(mm, alpha), this.yawAt(mm, mm.yaw, alpha), { anim: mm.anim, phase: mm.phase, moving: mm.moving, running: mm.running, time: this.t + mm.slot.x, headYaw: 0, headPitch: 0 });
      f.hat.visible = !mm.capOff;
    }
    this.syncFlock(dt, camera, alpha);
    // Falling poop.
    while (this.poops.length < m.poops.length) {
      const p = new THREE.Mesh(this.poopGeo, MAT.poop);
      this.poops.push(p);
      this.group.add(p);
    }
    this.poops.forEach((mesh, i) => {
      const p = m.poops[i];
      mesh.visible = !!p;
      if (p) {
        this.at(p, alpha, mesh.position);
        mesh.scale.set(1, 1 + Math.min(Math.hypot(p.vel.e, p.vel.n, p.vel.h) * 0.05, 0.8), 1);
      }
    });
    // Thrown caps.
    while (this.caps.length < m.thrown.length) {
      const c = this.capGeo.clone();
      this.caps.push(c);
      this.group.add(c);
    }
    this.caps.forEach((c, i) => {
      const t = m.thrown[i];
      c.visible = !!t;
      if (t) {
        this.at(t, t.landed ? 1 : alpha, c.position);
        c.rotation.set(t.landed ? 0 : Math.sin(t.life * 9) * 0.4, t.spin, 0);
      }
    });
    // The splat mesh is in metres above datum; the scene's zero is the water.
    this.splatHolder.position.y = this.toScene(0, 0, 0, v).y;
    // The objective's marker and highlighted perches.
    const target = m.running ? m.currentTarget() : undefined;
    this.marker.visible = !!target;
    if (target) {
      this.toScene(target.e, target.n, target.h + 2.2 + Math.sin(this.t * 2.5) * 0.25, this.marker.position);
      this.marker.rotation.y = this.t * 1.5;
      const d = camera.position.distanceTo(this.marker.position);
      const k = Math.max(0.35, d / 30);
      this.marker.scale.set(k, k * 1.6, k);
      this.marker.visible = d > 6;
      (this.marker.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, (d - 6) / 20 + 0.25);
    }
    const hl = m.perches.filter((p) => p.highlight);
    this.perchRings.forEach((r, i) => {
      const p = hl[i];
      r.visible = !!p;
      if (p) {
        this.toScene(p.pos.e, p.pos.n, p.pos.h + 0.05, r.position);
        const s = 1 + 0.15 * Math.sin(this.t * 4);
        r.scale.setScalar(s);
      }
    });
  }

  /** Turn rate (rad/s) and speed (m/s) of something from its last two steps; zero when it has no history. */
  private motion(o: { pos: V3 }, yaw: number): { yawRate: number; speed: number; flat: number; climb: number } {
    const p = this.prev.get(o);
    const out = this.motionOut;
    if (!p) {
      out.yawRate = out.speed = out.flat = out.climb = 0;
      return out;
    }
    out.yawRate = wrapAngle(yaw - p.yaw) * STEP_HZ;
    out.flat = Math.hypot(o.pos.e - p.e, o.pos.n - p.n) * STEP_HZ;
    out.climb = (o.pos.h - p.h) * STEP_HZ;
    out.speed = Math.hypot(out.flat, out.climb);
    return out;
  }

  private readonly motionOut = { yawRate: 0, speed: 0, flat: 0, climb: 0 };

  /** The Bomber Wing and the town's other gulls: one mesh, posed here. */
  private syncFlock(dt: number, camera: THREE.Camera, alpha: number): void {
    const m = this.mission;
    const flock = this.flock;
    const a = FLOCK_ANIM;
    const pos = this.sv;
    a.braking = a.diving = a.tumbling = a.floating = false;
    a.calling = false;
    a.walk = 0;
    a.walkPhase = 0;
    for (let i = 0; i < m.allies.length; i++) {
      const ally = m.allies[i]!;
      const airborne = ally.state !== AllyState.Roost;
      // Its place is the middle of the gull; on the roost that was set a little high for the old model.
      this.at(ally, alpha, pos, airborne ? 0 : -0.08);
      const mo = this.motion(ally, ally.yaw);
      a.time = this.t;
      a.airborne = airborne;
      a.flapPhase = ally.flapPhase;
      a.flapping = ally.flapping;
      a.yawRate = airborne ? mo.yawRate : 0;
      a.speed = Math.hypot(ally.vel.e, ally.vel.n, ally.vel.h);
      a.diving = airborne && ally.vel.h < -6;
      flock.place(i, pos, this.yawAt(ally, ally.yaw, alpha), Math.atan2(ally.vel.h, Math.max(1, Math.hypot(ally.vel.e, ally.vel.n))) * 0.6, a, dt, 1.08);
    }
    a.diving = false;
    // The town's gulls: whatever the mission lists, each kept in its own slot for as long as it is listed.
    const world = m.world;
    const seen = this.ambientSeen;
    seen.clear();
    const n = Math.min(m.ambient.length, AMBIENT_MAX);
    for (let k = 0; k < n; k++) {
      const g = m.ambient[k]!;
      seen.add(g.id);
      let slot = this.ambientSlot.get(g.id);
      if (slot === undefined) {
        slot = this.ambientFree.pop();
        if (slot === undefined) continue;
        this.ambientSlot.set(g.id, slot);
        flock.reset(slot);
        this.walkPhase[slot] = 0;
        this.footing[slot * 4] = NaN;
      }
      this.at(g, alpha, pos);
      if (camera.position.distanceToSquared(pos) > FLOCK_RANGE * FLOCK_RANGE) {
        flock.hide(slot);
        continue;
      }
      const mo = this.motion(g, g.yaw);
      a.time = this.t;
      a.airborne = g.airborne;
      a.flapping = g.flapping;
      a.flapPhase = g.flapPhase;
      a.calling = g.calling;
      a.floating = false;
      a.walk = 0;
      let pitch = 0;
      if (g.airborne) {
        a.yawRate = mo.yawRate;
        a.speed = mo.speed || 11;
        pitch = Math.atan2(mo.climb, Math.max(1, mo.flat)) * 0.6;
      } else {
        // Standing or afloat. Its place is the middle of its 0.3 m ball, as the player's gull's is, or (if it was
        // given the spot it stands on) its feet: either way the feet go on what is under it.
        // (Worked out when it moves, not every frame.)
        const f = slot * 4;
        if (!(Math.abs(this.footing[f]! - g.pos.e) + Math.abs(this.footing[f + 1]! - g.pos.n) + Math.abs(this.footing[f + 2]! - g.pos.h) < 0.01)) {
          const under = world.supportUnder(g.pos, 0.3);
          this.footing[f] = g.pos.e;
          this.footing[f + 1] = g.pos.n;
          this.footing[f + 2] = g.pos.h;
          this.footing[f + 3] = g.pos.h - under.h > 0.15 ? g.pos.h - 0.3 : g.pos.h;
          this.afloat[slot] = under.water && this.footing[f + 3]! < world.waterLevel + 0.2 ? 1 : 0;
        }
        const feet = this.footing[f + 3]!;
        a.floating = this.afloat[slot] === 1;
        this.at(g, alpha, pos, feet - g.pos.h + (a.floating ? 0.06 : 0.17));
        a.yawRate = 0;
        a.speed = mo.flat;
        a.walk = a.floating ? 0 : Math.min(1, mo.flat / 1.2);
        this.walkPhase[slot] = (this.walkPhase[slot]! + dt * mo.flat * 1.6) % 1;
      }
      a.walkPhase = this.walkPhase[slot]!;
      flock.place(slot, pos, this.yawAt(g, g.yaw, alpha), pitch, a, dt);
    }
    if (this.ambientSlot.size > seen.size) {
      for (const [id, slot] of this.ambientSlot) {
        if (seen.has(id)) continue;
        flock.hide(slot);
        this.ambientFree.push(slot);
        this.ambientSlot.delete(id);
      }
    }
    flock.commit();
  }

  dispose(): void {
    this.flock.dispose();
    this.group.removeFromParent();
    // Geometries, this mission's own materials and its canvas textures (name plates, banners); shared ones stay.
    disposeObject(this.group);
    this.poopGeo.dispose();
  }
}
