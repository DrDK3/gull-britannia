/**
 * A pilot for tests: plays a mission through the player's inputs only. It turns the view as a hand on a mouse does
 * (Gull.look, rate-limited), holds the same control flags the keys set, and presses Q, E and G through the mission's
 * own entry points. It never places the gull, the guards or the parade, and never spawns a drop: whatever it achieves,
 * a player could.
 */
import { Mode, NO_CONTROLS, type GullControls, type Perch } from '../../src/gull/game/gull';
import type { Mission } from '../../src/gull/game/mission';
import type { V3 } from '../../src/gull/game/world';

export const DT = 1 / 60;
/** How fast the pilot turns the view (rad/s): a brisk but ordinary sweep of the mouse. */
const LOOK_RATE = 3.2;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class Pilot {
  /** Seconds flown. */
  t = 0;

  constructor(readonly m: Mission) {}

  get g() {
    return this.m.gull;
  }

  /** One simulation step holding these controls; `poop` is a press of Q on this step. */
  step(c: Partial<GullControls> = {}, poop = false): void {
    this.m.step(DT, { ...NO_CONTROLS, ...c }, poop);
    this.t += DT;
  }

  /** Hold these controls for a time, or until `until` is true. Returns whether it became true. */
  hold(seconds: number, c: Partial<GullControls> = {}, until?: () => boolean): boolean {
    for (let i = 0; i < seconds * 60; i++) {
      this.step(c);
      if (until?.()) return true;
    }
    return until ? until() : true;
  }

  /** Move the mouse towards this heading and pitch, for one step. */
  look(yaw: number, pitch: number): void {
    const g = this.g;
    g.look(clamp(wrap(yaw - g.yaw), -LOOK_RATE * DT, LOOK_RATE * DT), clamp(pitch - g.pitch, -LOOK_RATE * DT, LOOK_RATE * DT));
  }

  /** Move the mouse towards a point in the world, for one step (from the gull's eye). */
  lookAt(p: V3): void {
    const eye = this.g.eye();
    this.look(Math.atan2(p.e - eye.e, p.n - eye.n), Math.atan2(p.h - eye.h, Math.max(Math.hypot(p.e - eye.e, p.n - eye.n), 0.1)));
  }

  /** Space until airborne. */
  takeOff(): boolean {
    return this.hold(3, { flap: true }, () => this.g.mode === Mode.Air);
  }

  /**
   * Fly to within `radius` (m, in plan) of a point, holding its height: view on the point, W for speed, Space to
   * climb, a glide to come down. Returns whether it got there in time.
   */
  flyTo(to: V3, radius: number, seconds: number, each?: () => void): boolean {
    const g = this.g;
    for (let i = 0; i < seconds * 60; i++) {
      const de = to.e - g.pos.e;
      const dn = to.n - g.pos.n;
      const flat = Math.hypot(de, dn);
      if (flat < radius) return true;
      const dh = to.h - g.pos.h;
      // Aim a little above or below the level to correct height, never steeply.
      this.look(Math.atan2(de, dn), clamp(Math.atan2(dh, Math.max(flat, 12)), -0.5, 0.45));
      const c: Partial<GullControls> = {};
      if (g.mode !== Mode.Air) c.flap = true;
      else {
        c.forward = g.airSpeed < 13;
        c.flap = dh > 1.5 && g.airSpeed < 15;
      }
      this.step(c);
      each?.();
    }
    return false;
  }

  /** Come down onto a perch: approach above it, then R (landing assist) with the view on it. */
  landOn(p: Perch, seconds = 40): boolean {
    const g = this.g;
    if (!this.flyTo({ e: p.pos.e, n: p.pos.n, h: p.pos.h + 5 }, 16, seconds)) return false;
    for (let i = 0; i < 20 * 60; i++) {
      if (g.perch === p && g.mode === Mode.Ground) return true;
      this.lookAt(p.pos);
      this.step(g.mode === Mode.Air ? { land: true } : {});
    }
    return g.perch === p;
  }
}
