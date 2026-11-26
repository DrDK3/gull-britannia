/**
 * What the studio can draw, and the named contact sheets. Each subject is built once for a pose and a time; with
 * ?play=1 it is advanced every frame.
 */
import * as THREE from 'three';
import { GullModel, type GullAnim } from '../gull/view/gullModel';

export interface Subject {
  object: THREE.Object3D;
  /** What the camera frames: a centre and the radius of a sphere round the model. */
  centre: THREE.Vector3;
  radius: number;
  advance?(dt: number): void;
  beforeDraw?(camera: THREE.Camera): void;
  /** Draw calls of helpers that are not the model's (taken off the count). */
  overhead?: number;
}

// ------------------------------------------------------------------ the gull

interface GullPreset {
  anim: Partial<GullAnim>;
  /** Flight path pitch (rad). */
  pitch?: number;
  /** Seconds to run before the picture, for poses that build up (a call, a swallow). */
  run?: number;
  /** Which clock the studio's `t` sets. */
  clock?: 'flap' | 'walk' | 'idle' | 'run' | 'time';
  place?: 'air' | 'ground' | 'water';
  yaw?: number;
}

const AIR: Partial<GullAnim> = { airborne: true, speed: 13 };
export const GULL_POSES: Record<string, GullPreset> = {
  glide: { anim: { ...AIR } },
  flap: { anim: { ...AIR, flapping: true, flapPhase: 0.25 }, clock: 'flap' },
  bank: { anim: { ...AIR, yawRate: 1.7 } },
  brake: { anim: { ...AIR, braking: true, speed: 5 }, pitch: 0.05 },
  dive: { anim: { ...AIR, diving: true, speed: 28 }, pitch: -0.75 },
  tumble: { anim: { ...AIR, tumbling: true }, clock: 'time', run: 0.31 },
  stand: { anim: { attentive: true, lookYaw: 0 }, place: 'ground' },
  walk: { anim: { walk: 1, walkPhase: 0.2, lookYaw: 0 }, clock: 'walk', place: 'ground' },
  look: { anim: {}, place: 'ground', clock: 'time', run: 3.1 },
  shuffle: { anim: { idle: 'shuffle', idleT: 0.4 }, clock: 'idle', place: 'ground' },
  preen: { anim: { idle: 'preen', idleT: 0.5 }, clock: 'idle', place: 'ground', run: 0.5 },
  stretch: { anim: { idle: 'stretch', idleT: 0.5 }, clock: 'idle', place: 'ground', run: 0.5 },
  float: { anim: { floating: true, attentive: true, lookYaw: 0.4 }, place: 'water' },
  eat: { anim: { eating: true, lookYaw: 0 }, place: 'ground', clock: 'run', run: 0.2 },
  call: { anim: { calling: true, lookYaw: 0 }, place: 'ground', clock: 'run', run: 0.95 },
  turn: { anim: { lookYaw: 1.1, lookPitch: -0.3, attentive: true }, place: 'ground' },
};

const BASE_ANIM: GullAnim = { time: 0, airborne: false, flapPhase: 0, flapping: false, braking: false, diving: false, tumbling: false, walk: 0, walkPhase: 0, floating: false, yawRate: 0, speed: 0 };

function gullSubject(poseName: string, t: number): Subject {
  const preset = GULL_POSES[poseName] ?? GULL_POSES.glide!;
  const model = new GullModel();
  const a: GullAnim = { ...BASE_ANIM, ...preset.anim };
  let run = preset.run ?? 0;
  if (Number.isFinite(t)) {
    if (preset.clock === 'flap') a.flapPhase = t;
    else if (preset.clock === 'walk') a.walkPhase = t;
    else if (preset.clock === 'idle') a.idleT = t;
    else run = t;
  }
  const place = preset.place ?? 'air';
  // As the game places it: the root is the middle of the gull, 0.17 m above what it stands on.
  const pos = new THREE.Vector3(0, place === 'air' ? 1.3 : place === 'water' ? 0.06 : 0.17, 0);
  const pitch = preset.pitch ?? 0;
  model.pose(pos, 0, pitch, a, 0);
  const steps = Math.round(run * 60);
  for (let i = 0; i < steps; i++) {
    a.time += 1 / 60;
    model.pose(pos, 0, pitch, a, 1 / 60);
  }
  // A few more frames so that eased things arrive.
  if (!steps) for (let i = 0; i < 40; i++) model.pose(pos, 0, pitch, a, 1 / 60);
  const flying = place === 'air';
  return {
    object: model.root,
    centre: new THREE.Vector3(0, pos.y + (flying ? 0 : 0.04), 0),
    radius: flying && !a.diving ? 0.74 : 0.36,
    advance(dt) {
      a.time += dt;
      if (a.flapping) a.flapPhase += dt * 3.2;
      if (a.walk > 0) a.walkPhase += dt * 2.2;
      model.pose(pos, 0, pitch, a, dt);
    },
  };
}

// ------------------------------------------------------------------ registry

type Maker = (pose: string, t: number, arg: string) => Subject;
export const SUBJECTS: Record<string, Maker> = {
  gull: (pose, t) => gullSubject(pose || 'glide', t),
};

export function makeSubject(show: string, pose: string, t: number): Subject {
  const [kind = 'gull', arg = ''] = show.split(':');
  const maker = SUBJECTS[kind];
  if (!maker) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xff00ff })));
    return { object: g, centre: new THREE.Vector3(0, 0.2, 0), radius: 0.5 };
  }
  return maker(pose, t, arg);
}

/** Contact sheets: cells as show|pose@t|view, separated by semicolons. */
export const SHEETS: Record<string, string> = {
  'gull-views': 'gull|glide|three;gull|glide|side;gull|glide|front;gull|glide|top;gull|glide|rear;gull|glide|below;gull|stand|side;gull|stand|three;gull|stand|front;gull|stand|rear;gull|glide|chase;gull|glide|far',
  'gull-air': 'gull|glide;gull|flap@0.25;gull|flap@0.45;gull|flap@0.65;gull|flap@0.8;gull|flap@0.95;gull|bank;gull|brake;gull|dive;gull|tumble',
  'gull-ground': 'gull|stand;gull|walk@0.1;gull|walk@0.35;gull|look;gull|shuffle;gull|preen;gull|stretch;gull|float;gull|eat;gull|call;gull|turn',
  'gull-flap': 'gull|flap@0.05;gull|flap@0.15;gull|flap@0.25;gull|flap@0.35;gull|flap@0.45;gull|flap@0.55;gull|flap@0.65;gull|flap@0.75;gull|flap@0.85;gull|flap@0.95',
};
