/**
 * People, low-poly and readable at a distance: occupation soldiers (khaki tunic, peaked cap with a red band, boots),
 * an officer, a cook in whites, a clerk in a grey suit. Jointed at the shoulders, elbows, hips and knees, with poses
 * for the guards' routines and reactions. Feet at the group's origin; facing −z (turned by the compass yaw).
 */
import * as THREE from 'three';
import { shared } from '../../render/dispose';

export type FigureStyle = 'soldier' | 'officer' | 'cook' | 'civilian' | 'sailor';

const STYLES: Record<FigureStyle, { tunic: number; trousers: number; cap: number; band: number; skin: number; boots: number; hat: 'peaked' | 'toque' | 'flat' | 'none'; shoulder?: number }> = {
  soldier: { tunic: 0x6f6b45, trousers: 0x5c5a3b, cap: 0x6f6b45, band: 0xa3261b, skin: 0xe0b393, boots: 0x1c1a17, hat: 'peaked', shoulder: 0xa3261b },
  officer: { tunic: 0x5b5f45, trousers: 0x2f3542, cap: 0x5b5f45, band: 0xb3261b, skin: 0xdcae8f, boots: 0x151412, hat: 'peaked', shoulder: 0xd6b24a },
  cook: { tunic: 0xf1efe7, trousers: 0x3e3e44, cap: 0xf6f5ef, band: 0xf6f5ef, skin: 0xe5b896, boots: 0x2a2622, hat: 'toque' },
  civilian: { tunic: 0x6f7378, trousers: 0x55595e, cap: 0x4a4038, band: 0x4a4038, skin: 0xe4b593, boots: 0x2b2420, hat: 'flat' },
  sailor: { tunic: 0x1f2a44, trousers: 0x1f2a44, cap: 0xf2f2ee, band: 0x1f2a44, skin: 0xe2b190, boots: 0x161515, hat: 'flat' },
};

const matCache = new Map<number, THREE.MeshStandardMaterial>();
const mat = (c: number) => {
  let m = matCache.get(c);
  if (!m) {
    m = shared(new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0 }));
    matCache.set(c, m);
  }
  return m;
};

const box = (w: number, h: number, d: number, c: number, y = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.y = y;
  m.castShadow = true;
  return m;
};

const cyl = (rt: number, rb: number, h: number, c: number, y = 0, seg = 8) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
  m.position.y = y;
  m.castShadow = true;
  return m;
};

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export interface FigurePose {
  anim: string;
  /** Walk cycle (rad). */
  phase: number;
  moving: boolean;
  running: boolean;
  time: number;
  headYaw: number;
  headPitch: number;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  /** Where a splat on the cap sits. */
  readonly hat = new THREE.Group();
  readonly handR = new THREE.Group();
  private readonly arms: Limb[] = [];
  private readonly legs: Limb[] = [];
  private readonly torso = new THREE.Group();
  readonly mug: THREE.Mesh;

  /** A rifle slung on the right shoulder (soldiers on parade). */
  readonly rifle?: THREE.Group;

  constructor(readonly style: FigureStyle, opts: { rifle?: boolean } = {}) {
    const s = STYLES[style];
    this.root.add(this.body);
    // Legs (hips at 0.92 m).
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.1, 0.92, 0);
      const thigh = box(0.15, 0.46, 0.17, s.trousers, -0.23);
      upper.add(thigh);
      const lower = new THREE.Group();
      lower.position.y = -0.46;
      const shin = box(0.13, 0.42, 0.15, style === 'soldier' || style === 'officer' ? s.boots : s.trousers, -0.21);
      const foot = box(0.12, 0.07, 0.26, s.boots, -0.43);
      foot.position.z = -0.05;
      lower.add(shin, foot);
      upper.add(lower);
      this.body.add(upper);
      this.legs.push({ upper, lower });
    }
    // Torso.
    this.torso.position.y = 0.92;
    const trunk = box(0.42, 0.6, 0.25, s.tunic, 0.32);
    const belt = box(0.43, 0.06, 0.26, style === 'cook' ? 0xe8e6de : 0x4a3423, 0.06);
    this.torso.add(trunk, belt);
    if (s.shoulder) {
      for (const side of [-1, 1]) {
        const sb = box(0.1, 0.02, 0.13, s.shoulder, 0.62);
        sb.position.x = side * 0.17;
        this.torso.add(sb);
      }
    }
    if (style === 'cook') this.torso.add(box(0.36, 0.5, 0.02, 0xffffff, 0.3).translateZ(-0.135));
    this.body.add(this.torso);
    // Head.
    this.head.position.y = 0.66;
    const neck = cyl(0.06, 0.07, 0.08, s.skin, 0.04);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(s.skin));
    skull.position.y = 0.17;
    skull.scale.set(0.95, 1.1, 1);
    skull.castShadow = true;
    const nose = box(0.03, 0.05, 0.04, s.skin, 0.16);
    nose.position.z = -0.11;
    this.head.add(neck, skull, nose);
    this.hat.position.y = 0.28;
    if (s.hat === 'peaked') {
      const crown = cyl(0.15, 0.12, 0.07, s.cap, 0.03, 12);
      crown.scale.z = 1.08;
      const band = cyl(0.117, 0.117, 0.04, s.band, -0.015, 12);
      const visor = cyl(0.12, 0.12, 0.012, 0x101010, -0.03, 12);
      visor.scale.set(0.9, 1, 0.55);
      visor.position.z = -0.08;
      const star = box(0.025, 0.025, 0.01, 0xd6b24a, -0.01);
      star.position.z = -0.12;
      this.hat.add(crown, band, visor, star);
    } else if (s.hat === 'toque') {
      this.hat.add(cyl(0.12, 0.11, 0.2, s.cap, 0.06, 10));
    } else if (s.hat === 'flat') {
      const cap = cyl(0.125, 0.12, 0.05, s.cap, 0, 10);
      const peak = box(0.18, 0.012, 0.09, s.cap, -0.015);
      peak.position.z = -0.11;
      this.hat.add(cap, peak);
    }
    this.head.add(this.hat);
    this.torso.add(this.head);
    // Arms (shoulders at 0.6 m above the hips).
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.27, 0.58, 0);
      upper.add(box(0.11, 0.32, 0.12, s.tunic, -0.16));
      const lower = new THREE.Group();
      lower.position.y = -0.32;
      lower.add(box(0.1, 0.28, 0.11, s.tunic, -0.14));
      const hand = box(0.08, 0.09, 0.09, s.skin, -0.32);
      lower.add(hand);
      if (side === 1) {
        this.handR.position.y = -0.33;
        lower.add(this.handR);
      }
      upper.add(lower);
      this.torso.add(upper);
      this.arms.push({ upper, lower });
    }
    if (opts.rifle) {
      const r = new THREE.Group();
      const stock = box(0.05, 0.3, 0.09, 0x5a3b22, -0.15);
      const barrel = box(0.035, 0.75, 0.04, 0x1f1f22, 0.38);
      r.add(stock, barrel);
      r.position.set(0.24, 0.55, 0.12);
      r.rotation.x = 0.12;
      this.torso.add(r);
      this.rifle = r;
    }
    this.mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.35 }));
    this.mug.position.set(0, -0.02, -0.06);
    this.mug.visible = false;
    this.handR.add(this.mug);
  }

  /** Place and pose: feet at `pos` (scene), compass yaw. */
  pose(pos: THREE.Vector3, yaw: number, p: FigurePose): void {
    this.root.position.copy(pos);
    this.root.rotation.y = -yaw;
    const [legL, legR] = this.legs as [Limb, Limb];
    const [armL, armR] = this.arms as [Limb, Limb];
    const t = p.time;
    // Defaults: standing.
    for (const l of this.legs) {
      l.upper.rotation.set(0, 0, 0);
      l.lower.rotation.set(0, 0, 0);
    }
    for (const a of this.arms) {
      a.upper.rotation.set(0, 0, 0);
      a.lower.rotation.set(0, 0, 0);
    }
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    armL.upper.rotation.z = 0.08;
    armR.upper.rotation.z = -0.08;
    if (p.moving) {
      const amp = p.running ? 0.85 : 0.5;
      const s = Math.sin(p.phase);
      legL.upper.rotation.x = s * amp;
      legR.upper.rotation.x = -s * amp;
      legL.lower.rotation.x = Math.max(0, -s) * amp * 1.2;
      legR.lower.rotation.x = Math.max(0, s) * amp * 1.2;
      armL.upper.rotation.x = -s * amp * 0.8;
      armR.upper.rotation.x = s * amp * 0.8;
      armL.lower.rotation.x = armR.lower.rotation.x = -0.3 - (p.running ? 0.6 : 0);
      this.body.position.y = Math.abs(Math.cos(p.phase)) * (p.running ? 0.06 : 0.03);
      if (p.running) this.torso.rotation.x = -0.18;
    }
    switch (p.anim) {
      case 'sip':
        armR.upper.rotation.x = -1.2;
        armR.lower.rotation.x = -1.4 + Math.sin(t * 0.8) * 0.15;
        this.head.rotation.x = 0.15;
        break;
      case 'outrage':
        armL.upper.rotation.set(-2.6 + Math.sin(t * 14) * 0.3, 0, 0.4);
        armR.upper.rotation.set(-2.6 + Math.cos(t * 13) * 0.3, 0, -0.4);
        this.body.position.y = Math.max(0, Math.sin(t * 9)) * 0.08;
        break;
      case 'scrub':
        this.torso.rotation.x = -0.5;
        armR.upper.rotation.x = -0.9 + Math.sin(t * 10) * 0.35;
        armR.lower.rotation.x = -0.6;
        armL.upper.rotation.x = -0.7;
        armL.lower.rotation.x = -0.5;
        legL.upper.rotation.x = legR.upper.rotation.x = -0.25;
        legL.lower.rotation.x = legR.lower.rotation.x = 0.4;
        this.body.position.y = -0.06;
        break;
      case 'shoo':
        armR.upper.rotation.x = -1.6 + Math.sin(t * 16) * 0.6;
        armL.upper.rotation.x = -1.2 + Math.cos(t * 15) * 0.5;
        break;
      case 'point':
        armR.upper.rotation.x = -1.5;
        armR.lower.rotation.x = 0;
        armL.upper.rotation.x = -0.2;
        break;
      case 'throw':
        armR.upper.rotation.x = -2.6;
        armR.lower.rotation.x = -0.8;
        this.torso.rotation.y = 0.35;
        break;
      case 'look_up':
        this.head.rotation.x = 0.55;
        armR.upper.rotation.x = -2.2;
        armR.lower.rotation.x = -1.6;
        break;
      case 'look_around':
        this.head.rotation.y = Math.sin(t * 1.3) * 0.9;
        this.head.rotation.x = 0.25;
        break;
      case 'sit':
        legL.upper.rotation.x = legR.upper.rotation.x = -1.5;
        legL.lower.rotation.x = legR.lower.rotation.x = 1.5;
        this.body.position.y = -0.45;
        armR.upper.rotation.x = -0.7 + (t % 7 < 2.2 ? -0.9 + Math.sin(t * 3) * 0.3 : 0);
        armR.lower.rotation.x = -0.9;
        armL.upper.rotation.x = -0.5;
        armL.lower.rotation.x = -0.6;
        break;
      case 'flail':
        legL.upper.rotation.x = legR.upper.rotation.x = -1.5;
        legL.lower.rotation.x = legR.lower.rotation.x = 1.5;
        this.body.position.y = -0.45;
        armL.upper.rotation.set(-2.4 + Math.sin(t * 15) * 0.5, 0, 0.5);
        armR.upper.rotation.set(-2.4 + Math.cos(t * 14) * 0.5, 0, -0.5);
        break;
      case 'stir':
        this.torso.rotation.x = -0.15;
        armR.upper.rotation.x = -0.9;
        armR.lower.rotation.x = -0.6;
        armR.upper.rotation.z = -0.2 + Math.sin(t * 3) * 0.25;
        armL.upper.rotation.x = -0.4;
        break;
      case 'salute':
        armR.upper.rotation.set(-1.7, 0, -0.9);
        armR.lower.rotation.x = -2.1;
        break;
      case 'attention':
        armL.upper.rotation.z = 0.02;
        armR.upper.rotation.z = -0.02;
        break;
      case 'read':
        armL.upper.rotation.x = armR.upper.rotation.x = -0.6;
        armL.lower.rotation.x = armR.lower.rotation.x = -1.1;
        this.head.rotation.x = -0.35;
        break;
      case 'march': {
        const s = Math.sin(p.phase);
        legL.upper.rotation.x = s * 0.55;
        legR.upper.rotation.x = -s * 0.55;
        armL.upper.rotation.x = -s * 0.9;
        armR.upper.rotation.x = s * 0.9;
        break;
      }
    }
    // The poses above are written with negative x as "forward" for arms and thighs; three.js turns the other way.
    for (const l of [...this.arms, ...this.legs]) {
      l.upper.rotation.x = -l.upper.rotation.x;
      l.lower.rotation.x = -l.lower.rotation.x;
    }
    if (p.anim !== 'look_around') this.head.rotation.y += p.headYaw;
    this.head.rotation.x += p.anim === 'look_up' ? 0 : Math.max(-0.5, Math.min(0.7, p.headPitch)) * 0.8;
    if (!p.moving && p.anim === 'idle') {
      // Breathing and weight shifts.
      this.torso.rotation.z = Math.sin(t * 0.6) * 0.015;
      this.head.rotation.y += Math.sin(t * 0.37) * 0.12;
    }
  }
}
