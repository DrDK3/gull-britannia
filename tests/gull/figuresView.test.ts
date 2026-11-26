/**
 * The people as drawn (src/gull/view/figures.ts): a whole cast is one mesh, every look builds, every gesture the game
 * asks for poses without a NaN, and the named characters get their own looks. No renderer is needed.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Cast, FIG_RIG, LOOKS, figureGeometry, lookFor, newFigureState, poseFigure, type FigurePose } from '../../src/gull/view/figures';
import { RigPose } from '../../src/gull/view/rig';

/** Every `anim` the game sets: guard.ts (GuardAnim), parade.ts, m1.ts, m1watch.ts, m2.ts. */
const ANIMS = ['idle', 'sip', 'outrage', 'scrub', 'shoo', 'look_up', 'look_around', 'point', 'throw', 'salute', 'march', 'read', 'attention', 'stretch', 'sit', 'flail', 'stir'];
const BASE: FigurePose = { anim: 'idle', phase: 0, moving: false, running: false, time: 0, headYaw: 0, headPitch: 0 };

describe('the people as drawn', () => {
  it('draws a whole cast as one mesh', () => {
    const cast = new Cast(Object.values(LOOKS));
    let meshes = 0;
    cast.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(1);
    expect(cast.figures.length).toBe(Object.keys(LOOKS).length);
    cast.dispose();
  });

  it('builds every look: well formed, the height of a person, light enough to draw seventeen of', () => {
    for (const look of Object.values(LOOKS)) {
      const g = figureGeometry(look);
      expect(g.position.every(Number.isFinite), look.id).toBe(true);
      expect(g.normal.every(Number.isFinite), look.id).toBe(true);
      expect(Math.max(...g.skinIndex), look.id).toBeLessThan(FIG_RIG.count);
      expect(Math.max(...g.index), look.id).toBeLessThan(g.position.length / 3);
      let top = 0;
      let low = 1;
      for (let i = 1; i < g.position.length; i += 3) {
        top = Math.max(top, g.position[i]!);
        low = Math.min(low, g.position[i]!);
      }
      // The reference figure is 1.75 m to the crown; a cap or a cook's hat adds to it.
      expect(top, look.id).toBeGreaterThan(1.74);
      expect(top, look.id).toBeLessThan(2.0);
      expect(low, look.id).toBeGreaterThan(-0.01);
      expect(low, look.id).toBeLessThan(0.02);
      expect(g.index.length / 3, look.id).toBeLessThan(3200);
    }
  });

  it('poses every gesture the game asks for, standing, walking and running, without a NaN', () => {
    const rig = new RigPose(FIG_RIG);
    const out = new Float32Array(FIG_RIG.count * 16);
    for (const look of [LOOKS.soldier!, LOOKS.marcher!, LOOKS.voronova!, LOOKS.clerk!, LOOKS.baker!, LOOKS.borovsky!]) {
      for (const anim of ANIMS) {
        for (const [moving, running] of [[false, false], [true, false], [true, true]] as const) {
          const st = newFigureState(0.4);
          const p: FigurePose = { ...BASE, anim, moving, running, mug: anim === 'sip' };
          poseFigure(rig, st, { ...BASE }, look, 0);
          for (let i = 0; i < 40; i++) {
            p.time += 1 / 60;
            if (moving) p.phase += 0.11;
            poseFigure(rig, st, p, look, 1 / 60);
            rig.solve();
            rig.write(out, 0);
            expect(out.every(Number.isFinite), `${look.id} ${anim}`).toBe(true);
          }
        }
      }
    }
  });

  it('gives the named characters their own looks, and the parade its rifles', () => {
    expect(lookFor('borovsky', 'soldier').right).toBe('mug');
    expect(lookFor('borovsky', 'soldier').belly).toBeGreaterThan(0.8);
    expect(lookFor('corporal', 'soldier').rifle).toBe(true);
    expect(lookFor('voronova', 'officer').left).toBe('clipboard');
    expect(lookFor('grushkov', 'officer').moustache).toBe(2);
    expect(lookFor('general', 'officer').coat).toBe('greatcoat');
    expect(lookFor('clerk', 'civilian').left).toBe('newspaper');
    expect(lookFor('courier', 'soldier').satchel).toBe(true);
    expect(lookFor('baker', 'civilian').apron).toBe(true);
    expect(lookFor('marcher-2-1', 'marcher').rifle).toBe(true);
    // Anyone unnamed is drawn by their style; an unknown style is still somebody.
    expect(lookFor('kulik', 'soldier').coat).toBe('tunic');
    expect(lookFor('stranger', 'civilian').id).toBe('civilian');
    expect(lookFor('nobody', 'no-such-style').coat).toBe('tunic');
  });

  it('sits down, and holds out a hand for what is carried', () => {
    const cast = new Cast([LOOKS.clerk!, LOOKS.soldier!]);
    const at = new THREE.Vector3(5, 2, -3);
    const [clerk, soldier] = cast.figures as [Cast['figures'][0], Cast['figures'][0]];
    soldier.pose(at, 0, { ...BASE }, 0);
    const standing = cast.batch.matrices[(FIG_RIG.count + FIG_RIG.index.pelvis) * 16 + 13]!;
    expect(soldier.hand.y).toBeGreaterThan(at.y + 0.5);
    expect(soldier.hand.y).toBeLessThan(at.y + 1.2);
    expect(soldier.hand.distanceTo(at)).toBeLessThan(1.3);
    clerk.pose(at, 0, { ...BASE, anim: 'sit' }, 0);
    const seated = cast.batch.matrices[FIG_RIG.index.pelvis * 16 + 13]!;
    expect(seated).toBeLessThan(standing - 0.25);
    soldier.hide();
    const o = FIG_RIG.count * 16;
    expect(cast.batch.matrices.slice(o, o + FIG_RIG.count * 16).every((x) => x === 0)).toBe(true);
    cast.dispose();
  });
});
