/**
 * The player's gull: a low-poly herring gull (white head and body, silver-grey mantle and wings, black wingtips
 * with white mirrors, yellow bill with a red spot, pink legs), with jointed wings that flap, glide, flare to
 * brake, tuck to dive and fold on the ground. About 0.6 m long with a 1.4 m span, as the real bird.
 *
 * Local frame: forward is −z, up +y, right +x (three.js camera convention); `pose()` turns it to a compass
 * heading and pitch.
 */
import * as THREE from 'three';

export const GULL_COLOURS = {
  white: 0xf3f3ee,
  mantle: 0xa3abb4,
  tip: 0x1b1b1d,
  bill: 0xf0c22e,
  spot: 0xc8321e,
  legs: 0xe3a09a,
  eye: 0x101010,
};

const mat = (color: number, rough = 0.78) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

/** A wing panel along ±x: chord tapering from root to tip, thin, with a gentle camber. */
function panel(span: number, rootChord: number, tipChord: number, side: 1 | -1, sweepBack = 0): THREE.BufferGeometry {
  const t = 0.012;
  const s = side;
  // Leading edge at z = −chord·0.35, trailing at +chord·0.65 (forward is −z).
  const v = [
    [0, 0, -rootChord * 0.35],
    [0, 0, rootChord * 0.65],
    [s * span, 0, -tipChord * 0.35 + sweepBack],
    [s * span, 0, tipChord * 0.65 + sweepBack],
  ];
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], y: number) => {
    pos.push(a[0]!, a[1]! + y, a[2]!, b[0]!, b[1]! + y, b[2]!, c[0]!, c[1]! + y, c[2]!);
    pos.push(b[0]!, b[1]! + y, b[2]!, d[0]!, d[1]! + y, d[2]!, c[0]!, c[1]! + y, c[2]!);
  };
  quad(v[0]!, v[1]!, v[2]!, v[3]!, t / 2);
  quad(v[0]!, v[2]!, v[1]!, v[3]!, -t / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface Wing {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  side: 1 | -1;
}

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
}

export class GullModel {
  readonly root = new THREE.Group();
  /** Pitch and bank under the heading. */
  private readonly body = new THREE.Group();
  private readonly wings: Wing[] = [];
  private readonly legs: THREE.Group[] = [];
  private readonly head = new THREE.Group();
  private readonly tail: THREE.Mesh;
  /** Smoothed wing pose: spread 0 folded … 1 open; sweep back; dihedral. */
  private spread = 0;
  private sweep = 0;
  private bank = 0;
  private bodyPitch = 0;
  private beak?: THREE.Object3D;

  constructor() {
    const white = mat(GULL_COLOURS.white);
    const mantle = mat(GULL_COLOURS.mantle);
    const tip = mat(GULL_COLOURS.tip, 0.6);
    const bill = mat(GULL_COLOURS.bill, 0.5);
    const spot = mat(GULL_COLOURS.spot, 0.5);
    const legMat = mat(GULL_COLOURS.legs, 0.7);
    const eye = mat(GULL_COLOURS.eye, 0.3);
    this.root.name = 'player-gull';
    this.root.add(this.body);

    // Body: a white spindle, the grey mantle over its back.
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), white);
    torso.scale.set(0.085, 0.08, 0.2);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), mantle);
    back.scale.set(0.083, 0.075, 0.19);
    back.position.set(0, 0.012, 0.01);
    this.body.add(torso, back);

    // Head and neck.
    this.head.position.set(0, 0.06, -0.19);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 9), white);
    skull.scale.set(0.95, 1, 1.12);
    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), white);
    neck.position.set(0, -0.035, 0.05);
    neck.scale.set(1, 1.1, 1.3);
    const billMesh = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.075, 8), bill);
    billMesh.rotation.x = -Math.PI / 2;
    billMesh.position.set(0, -0.008, -0.095);
    billMesh.scale.set(0.8, 1, 1.15);
    const gonys = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), spot);
    gonys.position.set(0, -0.019, -0.105);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), eye);
      e.position.set(s * 0.044, 0.016, -0.03);
      this.head.add(e);
    }
    this.head.add(skull, neck, billMesh, gonys);
    this.body.add(this.head);

    // Tail: a short white fan.
    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4, 1), white);
    this.tail.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    this.tail.scale.set(1, 1, 0.22);
    this.tail.position.set(0, 0.01, 0.24);
    this.body.add(this.tail);

    // Wings: arm (grey) and hand (grey, black tip with white mirrors).
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.06, 0.035, -0.05);
      shoulder.rotation.order = 'YZX';
      const arm = new THREE.Mesh(panel(0.3, 0.17, 0.15, side, 0.01), mantle);
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.3, 0, 0.01);
      elbow.rotation.order = 'YZX';
      const hand = new THREE.Mesh(panel(0.2, 0.15, 0.12, side, 0.035), mantle);
      const tipPanel = new THREE.Mesh(panel(0.16, 0.12, 0.05, side, 0.06), tip);
      tipPanel.position.set(side * 0.2, 0, 0.035);
      const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), white);
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.set(side * 0.31, 0.008, 0.07);
      elbow.add(hand, tipPanel, mirror);
      shoulder.add(arm, elbow);
      this.body.add(shoulder);
      this.wings.push({ shoulder, elbow, side });
      for (const m of [arm, hand, tipPanel]) m.castShadow = true;
    }

    // Legs and webbed feet.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.035, -0.06, 0.02);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 5), legMat);
      shin.position.y = -0.05;
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 3), legMat);
      foot.rotation.x = -Math.PI / 2;
      foot.scale.set(1, 1, 0.15);
      foot.position.set(0, -0.1, -0.02);
      leg.add(shin, foot);
      this.body.add(leg);
      this.legs.push(leg);
    }
    torso.castShadow = back.castShadow = skull.castShadow = true;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = false;
    });
  }

  /** The first-person view's own bill, at the bottom of the picture (add to the camera). */
  viewBeak(): THREE.Object3D {
    if (this.beak) return this.beak;
    const g = new THREE.Group();
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 8), mat(GULL_COLOURS.bill, 0.5));
    bill.rotation.x = -Math.PI / 2;
    bill.scale.set(0.8, 1, 1);
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 5), mat(GULL_COLOURS.spot, 0.5));
    spot.position.set(0, -0.009, -0.012);
    g.add(bill, spot);
    g.position.set(0, -0.098, -0.16);
    g.rotation.x = 0.1;
    g.scale.setScalar(0.75);
    this.beak = g;
    return g;
  }

  /** Place the gull: centre (scene coordinates), compass heading and pitch (rad). */
  pose(pos: THREE.Vector3, yaw: number, pitch: number, a: GullAnim, dt: number): void {
    this.root.position.copy(pos);
    this.root.rotation.set(0, -yaw, 0);
    const k = 1 - Math.exp(-10 * dt);
    const airborne = a.airborne && !a.tumbling;
    // Body attitude: nose follows the flight path in the air, level on the ground; banks into turns.
    const wantPitch = airborne ? Math.max(-0.9, Math.min(0.6, pitch * 0.8)) + (a.braking ? 0.5 : 0) : a.floating ? 0.05 : -0.08;
    this.bodyPitch += (wantPitch - this.bodyPitch) * k;
    const wantBank = airborne ? Math.max(-0.7, Math.min(0.7, -a.yawRate * 0.28)) : 0;
    this.bank += (wantBank - this.bank) * k;
    this.body.rotation.order = 'YXZ';
    this.body.rotation.x = this.bodyPitch;
    this.body.rotation.z = this.bank;
    if (a.tumbling) {
      this.body.rotation.x += a.time * 9;
      this.body.rotation.z += Math.sin(a.time * 13) * 0.8;
    }

    // Wings.
    const spreadWant = airborne ? (a.diving ? 0.45 : 1) : a.tumbling ? 0.7 : 0;
    this.spread += (spreadWant - this.spread) * (1 - Math.exp(-(airborne ? 12 : 8) * dt));
    const sweepWant = airborne ? (a.diving ? 0.75 : a.braking ? -0.25 : 0.08 + Math.min(0.25, Math.max(0, (a.speed - 14) * 0.02))) : 1.45;
    this.sweep += (sweepWant - this.sweep) * k;
    const beat = a.flapping && airborne ? Math.sin(a.flapPhase * Math.PI * 2) : 0;
    const glideDihedral = airborne ? 0.1 + (a.braking ? 0.25 : 0) : 0;
    for (const w of this.wings) {
      const s = w.side;
      const flap = beat * 0.75;
      const fold = 1 - this.spread;
      // Shoulder: sweep back (y) then raise or lower (z, positive raises the tip on either side).
      w.shoulder.rotation.y = -s * this.sweep * (0.4 + 0.6 * fold) - s * fold * 0.2;
      w.shoulder.rotation.z = s * (glideDihedral + flap) * this.spread - s * fold * 0.15;
      w.shoulder.scale.setScalar(1);
      // Hand: lags the beat, and folds back along the arm when closed.
      w.elbow.rotation.y = -s * fold * 2.6;
      w.elbow.rotation.z = s * (Math.sin(a.flapPhase * Math.PI * 2 - 0.9) * 0.45 * (a.flapping && airborne ? 1 : 0) - (a.braking ? 0.2 : 0)) * this.spread;
    }

    // Legs: tucked in flight, walking on land, hidden on the water.
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]!;
      leg.visible = !airborne && !a.floating;
      const swing = Math.sin(a.walkPhase * Math.PI * 2 + i * Math.PI) * 0.6 * a.walk;
      leg.rotation.x = airborne ? 1.3 : swing;
    }
    // Head: bobs while walking, looks about a little when still.
    this.head.position.z = -0.19 - (a.walk > 0.1 ? Math.max(0, Math.sin(a.walkPhase * Math.PI * 4)) * 0.025 : 0);
    this.head.rotation.y = !airborne && a.walk < 0.1 ? Math.sin(a.time * 0.7) * 0.35 * Math.max(0, Math.sin(a.time * 0.23)) : 0;
    // On the ground the gull's centre is its body; the feet reach the ground below it.
    this.body.position.y = airborne ? 0 : a.floating ? -0.02 : 0.02;
    this.tail.rotation.y = Math.PI / 4 + (airborne ? -a.yawRate * 0.05 : 0);
  }
}
