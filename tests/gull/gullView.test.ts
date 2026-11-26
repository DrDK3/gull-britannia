/**
 * The gull as drawn (src/gull/view): one draw call, every pose finite, the bill where it should be. No renderer is
 * needed: these check the geometry and the matrices.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GullFlock, GullModel, PLAYER_BILL, gullGeometry, type GullAnim } from '../../src/gull/view/gullModel';
import { GULL_RIG, newGullState, poseGull } from '../../src/gull/view/gullRig';
import { RigPose } from '../../src/gull/view/rig';

const BASE: GullAnim = { time: 0, airborne: false, flapPhase: 0, flapping: false, braking: false, diving: false, tumbling: false, walk: 0, walkPhase: 0, floating: false, yawRate: 0, speed: 0 };
const STATES: Record<string, Partial<GullAnim>> = {
  glide: { airborne: true, speed: 13 },
  flap: { airborne: true, speed: 13, flapping: true },
  bank: { airborne: true, speed: 13, yawRate: 1.8 },
  roll: { airborne: true, speed: 13, roll: 0.5 },
  brake: { airborne: true, speed: 5, braking: true },
  dive: { airborne: true, speed: 28, diving: true },
  tumble: { airborne: true, tumbling: true },
  stand: {},
  walk: { walk: 1 },
  float: { floating: true },
  eat: { eating: true },
  call: { calling: true },
  preen: { idle: 'preen', idleT: 0.5 },
  stretch: { idle: 'stretch', idleT: 0.5 },
  shuffle: { idle: 'shuffle', idleT: 0.4 },
};

const meshes = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) n++;
  });
  return n;
};

describe('the gull as drawn', () => {
  it('is one mesh, and sixteen others are one more', () => {
    expect(meshes(new GullModel().root)).toBe(1);
    expect(meshes(new GullFlock(16).mesh)).toBe(1);
  });

  it('has a well-formed geometry at both levels of detail', () => {
    for (const detail of ['hero', 'flock'] as const) {
      const g = gullGeometry(detail);
      expect(g.position.length % 3).toBe(0);
      expect(g.position.every(Number.isFinite)).toBe(true);
      expect(g.normal.every(Number.isFinite)).toBe(true);
      expect(Math.max(...g.skinIndex)).toBeLessThan(GULL_RIG.count);
      expect(Math.max(...g.index)).toBeLessThan(g.position.length / 3);
      // About 0.6 m long and 1.45 m across, as the bird.
      let minX = 0;
      let maxX = 0;
      let minZ = 0;
      let maxZ = 0;
      for (let i = 0; i < g.position.length; i += 3) {
        minX = Math.min(minX, g.position[i]!);
        maxX = Math.max(maxX, g.position[i]!);
        minZ = Math.min(minZ, g.position[i + 2]!);
        maxZ = Math.max(maxZ, g.position[i + 2]!);
      }
      expect(maxX - minX).toBeGreaterThan(1.35);
      expect(maxX - minX).toBeLessThan(1.6);
      expect(maxZ - minZ).toBeGreaterThan(0.55);
      expect(maxZ - minZ).toBeLessThan(0.72);
    }
    expect(gullGeometry('flock').index.length).toBeLessThan(gullGeometry('hero').index.length);
  });

  it('poses every state with finite matrices, through a second of each', () => {
    const rig = new RigPose(GULL_RIG);
    const out = new Float32Array(GULL_RIG.count * 16);
    for (const [name, part] of Object.entries(STATES)) {
      const st = newGullState(0.3);
      const a = { ...BASE, ...part };
      for (let i = 0; i < 60; i++) {
        a.time += 1 / 60;
        if (a.flapping) a.flapPhase += 3.2 / 60;
        if (a.walk) a.walkPhase += 2 / 60;
        poseGull(rig, st, a, a.diving ? -0.7 : 0, 1 / 60);
        rig.solve();
        rig.write(out, 0);
        expect(out.every(Number.isFinite), name).toBe(true);
      }
    }
  });

  it('holds what it carries at the bill, which points where it looks', () => {
    const m = new GullModel();
    const at = new THREE.Vector3(10, 5, -20);
    const a = { ...BASE, lookYaw: 0, attentive: true };
    // Facing north (−z in the scene): the bill is ahead of the body and above the feet.
    m.pose(at, 0, 0, a, 0);
    const bill = m.billPosition();
    expect(bill.z).toBeLessThan(at.z - 0.15);
    expect(Math.abs(bill.x - at.x)).toBeLessThan(0.01);
    expect(bill.y).toBeGreaterThan(at.y);
    expect(PLAYER_BILL.yaw).toBeCloseTo(0, 2);
    // Facing east (+x): the same, turned.
    const e = new GullModel();
    e.pose(at, Math.PI / 2, 0, a, 0);
    const east = e.billPosition();
    expect(east.x).toBeGreaterThan(at.x + 0.15);
    expect(PLAYER_BILL.yaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it('turns its head to where the view turns before its body follows', () => {
    const m = new GullModel();
    const at = new THREE.Vector3();
    const a = { ...BASE };
    m.pose(at, 0, 0, a, 0);
    for (let i = 0; i < 30; i++) m.pose(at, 0.6, 0, a, 1 / 60);
    m.billPosition();
    // Standing, a turn of the view of 0.6 rad is taken by the neck: the body has not shuffled round.
    expect(m.root.rotation.y).toBeCloseTo(0, 5);
    expect(PLAYER_BILL.yaw).toBeGreaterThan(0.45);
  });

  it('reads the flight model’s own fields when the gull has them, and does without when it has not', () => {
    const m = new GullModel();
    const at = new THREE.Vector3();
    m.watch({});
    m.pose(at, 0, 0, { ...BASE, airborne: true, speed: 12 }, 1 / 60);
    m.watch({ roll: 0.4, noise: 0.7, callTimer: 1, airState: 'flare', pitch: -0.3, eatingTimer: 0 });
    for (let i = 0; i < 30; i++) m.pose(at, 0, 0, { ...BASE, airborne: true, speed: 12 }, 1 / 60);
    expect(m.noise).toBeCloseTo(0.7);
    m.watch(undefined);
    m.pose(at, 0, 0, { ...BASE }, 1 / 60);
    expect(Number.isFinite(m.billPosition().x)).toBe(true);
  });

  it('draws and hides gulls of the flock', () => {
    const f = new GullFlock(4);
    const skeleton = f.mesh.skeleton;
    const mats = skeleton.boneMatrices!;
    expect(mats.slice(0, 16).every((x) => x === 0)).toBe(true);
    f.place(1, new THREE.Vector3(3, 2, 1), 0.5, 0, { ...BASE, airborne: true, speed: 12 }, 1 / 60);
    const o = GULL_RIG.count * 16;
    expect(mats[o + 15]).toBe(1);
    expect(mats.slice(o, o + 16).every(Number.isFinite)).toBe(true);
    f.hide(1);
    expect(mats.slice(o, o + GULL_RIG.count * 16).every((x) => x === 0)).toBe(true);
    f.dispose();
  });
});
