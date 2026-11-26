/**
 * The player's gull: the herring gull of gullRig.ts as one skinned mesh (one draw call), posed each frame from the
 * flight model. The body trails the view a little in a turn and the head leads it, so the neck turns the head to
 * where the gull is looking; standing still, the head turns first and the feet follow only if it is turned far.
 *
 * Local frame: forward is −z, up +y, right +x (three.js camera convention); `pose()` turns it to a compass
 * heading and pitch.
 */
import * as THREE from 'three';
import { BILL_GRIP, GULL_RIG, buildGullGeometry, buildViewBill, newGullState, poseGull, type GullAnim, type GullBone } from './gullRig';
import { PAL } from './palette';
import { RigBatch, RigPose, rigMaterial, type RigGeometry } from './rig';

export type { GullAnim, GullIdle } from './gullRig';

export const GULL_COLOURS = {
  white: PAL.gullWhite,
  mantle: PAL.mantle,
  tip: PAL.primary,
  bill: PAL.bill,
  spot: PAL.gonys,
  legs: PAL.leg,
  eye: PAL.pupil,
};

let HERO: RigGeometry<GullBone> | undefined;
let FLOCK: RigGeometry<GullBone> | undefined;
/** The gull's geometry, built once: 'hero' for the player's, 'flock' for the others. */
export function gullGeometry(detail: 'hero' | 'flock'): RigGeometry<GullBone> {
  if (detail === 'hero') return (HERO ??= buildGullGeometry('hero'));
  return (FLOCK ??= buildGullGeometry('flock'));
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class GullModel {
  readonly root = new THREE.Group();
  private readonly batch: RigBatch;
  private readonly rig = new RigPose(GULL_RIG);
  private readonly state = newGullState(0.37);
  private readonly anim: GullAnim = { time: 0, airborne: false, flapPhase: 0, flapping: false, braking: false, diving: false, tumbling: false, walk: 0, walkPhase: 0, floating: false, yawRate: 0, speed: 0 };
  /** The heading the body is drawn at; it trails the view's. */
  private bodyYaw: number | undefined;
  private turning = false;
  private lastYaw = 0;
  private quiet = 0;
  private beak?: THREE.Mesh;
  private watched: Record<string, unknown> | undefined;

  constructor() {
    this.root.name = 'player-gull';
    this.batch = new RigBatch([{ geo: gullGeometry('hero'), copies: 1 }], rigMaterial(), 'player-gull-mesh');
    this.root.add(this.batch.mesh);
    // Drawn once at rest, so that it is never a collapsed mesh if shown before the first pose.
    this.rig.reset();
    this.rig.solve();
    this.rig.write(this.batch.matrices, 0);
    this.batch.commit();
  }

  /**
   * Give the model the game's gull to read what `pose` is not told: where it is looking (pitch), and, when the
   * flight model has them, `roll`, a call state (`calling` or `callTimer`) and `eatingTimer`. Every field is
   * optional and checked, so this works with a gull that has none of them.
   */
  watch(gull: object | undefined): void {
    this.watched = gull as Record<string, unknown> | undefined;
  }

  /** Where the bill grips what it carries, in the scene now (call after `pose`). */
  billPosition(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateWorldMatrix(true, false);
    return this.rig.point('head', BILL_GRIP[0], BILL_GRIP[1], BILL_GRIP[2], out).applyMatrix4(this.root.matrixWorld);
  }

  /** The first-person view's own bill, at the bottom of the picture (add to the camera). */
  viewBeak(): THREE.Object3D {
    if (this.beak) return this.beak;
    const m = new THREE.Mesh(buildViewBill(), rigMaterial());
    m.name = 'view-bill';
    // Seen from just above and behind its base, as the gull sees its own bill.
    m.position.set(0, -0.082, -0.1);
    m.rotation.x = 0.16;
    m.scale.set(1.25, 1.25, 1.1);
    this.beak = m;
    return m;
  }

  /** Place the gull: centre (scene coordinates), compass heading and pitch (rad). */
  pose(pos: THREE.Vector3, yaw: number, pitch: number, a: GullAnim, dt: number): void {
    const w = this.watched;
    const an = Object.assign(this.anim, a);
    an.roll = a.roll ?? (w ? num(w.roll) : undefined);
    an.calling = a.calling ?? (w ? w.calling === true || (num(w.callTimer) ?? 0) > 0 : undefined);
    an.eating = a.eating ?? (w ? (num(w.eatingTimer) ?? 0) > 0 : undefined);
    an.idle = a.idle;
    an.idleT = a.idleT;
    an.attentive = a.attentive;

    // The body follows the view: closely on the wing and when walking; standing, only once the head is turned far.
    const grounded = !a.airborne && !a.floating;
    if (this.bodyYaw === undefined || dt <= 0 || dt > 0.5) this.bodyYaw = yaw;
    const off = wrap(yaw - this.bodyYaw);
    const moved = Math.abs(wrap(yaw - this.lastYaw)) > 0.0015;
    this.lastYaw = yaw;
    this.quiet = moved || a.airborne || a.walk > 0.08 ? 0 : this.quiet + dt;
    let rate = 7;
    if (a.tumbling) rate = 30;
    else if (grounded && a.walk > 0.08) rate = 12;
    else if (!a.airborne) {
      if (Math.abs(off) > 0.95) this.turning = true;
      else if (Math.abs(off) < 0.12) this.turning = false;
      rate = this.turning ? 6 : 0;
    }
    this.bodyYaw += off * (1 - Math.exp(-rate * dt));
    const lead = wrap(yaw - this.bodyYaw);
    // Left alone on a perch for a moment, it looks about for itself; otherwise the head is the player's.
    const own = a.lookYaw === undefined && !a.airborne && this.quiet > 1.6 && !(w && w.scouting === true);
    an.lookYaw = a.lookYaw ?? (own ? undefined : lead);
    an.lookPitch = a.lookPitch ?? (own ? undefined : w ? num(w.pitch) : undefined);
    an.attentive ??= !own && !a.airborne && this.quiet < 4;

    this.root.position.copy(pos);
    this.root.rotation.set(0, -this.bodyYaw, 0);
    poseGull(this.rig, this.state, an, pitch, dt);
    this.rig.solve();
    this.rig.write(this.batch.matrices, 0);
    this.batch.commit();
  }

  dispose(): void {
    this.batch.dispose();
    this.beak?.geometry.dispose();
  }
}
