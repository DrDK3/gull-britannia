/**
 * Mission 2's parade and flock. DOM-free.
 *
 * Marcher: a soldier on parade. Marches in formation, eyes front (a soldier on parade does not look up). Flinches
 * when hit; scatters when the formation breaks; then shuffles back into line.
 *
 * AllyGull: a gull of the Bomber Wing. Roosts until signalled, then flies in a box on the player's wing, releases when
 * the leader releases, circles the target once and returns to the roost to reload.
 */
import type { Gull } from './gull';
import { Rng } from './rng';
import { add, dist, lerpAngle, scale, sub, v3, type V3 } from './world';

export const MarchState = { March: 0, Halt: 1, Chaos: 2, Reform: 3 } as const;
export type MarchStateId = (typeof MarchState)[keyof typeof MarchState];

const CHAOS_LINES = ['My eyes!', 'Medic!', 'It’s in my HAT!', 'Air raid!', 'Not the greatcoat!', 'Mama!', 'Gulls! GULLS!', 'Which way is front?!'];

export class Marcher {
  state: MarchStateId = MarchState.March;
  pos: V3;
  /** Where his slot in the formation is now. */
  target: V3;
  heading = 0;
  yaw = 0;
  hits = 0;
  anim = 'march';
  phase = 0;
  moving = false;
  running = false;
  capOff = false;
  speech: { text: string; t: number } | undefined;
  private t: number;
  private flinch = 0;
  private chaosTarget: V3 = v3();
  private chaosTimer = 0;

  constructor(
    readonly id: string,
    /** Offset in the formation: x across (right), y back (m). */
    readonly slot: { x: number; y: number },
    pos: V3,
    private readonly rng: Rng,
    private readonly ground: (e: number, n: number) => number,
  ) {
    this.pos = { ...pos };
    this.target = { ...pos };
    this.t = rng.next() * 3;
  }

  say(text: string, dur = 2.2): void {
    this.speech = { text, t: dur };
  }

  onHit(): void {
    this.hits++;
    this.flinch = 1.2;
    if (this.state === MarchState.March && this.rng.next() < 0.6) this.say(this.rng.pick(['Ugh!', 'Eyes front…', 'Steady…', 'Not now…']), 1.6);
  }

  startChaos(centre: V3, area: { eMin: number; eMax: number; nMin: number; nMax: number }): void {
    this.state = MarchState.Chaos;
    this.chaosTimer = this.rng.range(0, 0.6);
    this.pickChaos(centre, 9, area);
    if (this.rng.next() < 0.65) this.say(this.rng.pick(CHAOS_LINES), 2.5);
    if (this.rng.next() < 0.5) this.capOff = true;
  }

  private pickChaos(c: V3, r: number, area: { eMin: number; eMax: number; nMin: number; nMax: number }): void {
    const e = Math.max(area.eMin, Math.min(area.eMax, c.e + this.rng.range(-r, r)));
    const n = Math.max(area.nMin, Math.min(area.nMax, c.n + this.rng.range(-r, r)));
    this.chaosTarget = v3(e, n, 0);
  }

  reform(): void {
    this.state = MarchState.Reform;
  }

  update(dt: number, area: { eMin: number; eMax: number; nMin: number; nMax: number }): void {
    this.t += dt;
    if (this.speech) {
      this.speech.t -= dt;
      if (this.speech.t <= 0) this.speech = undefined;
    }
    this.flinch = Math.max(this.flinch - dt, 0);
    this.moving = false;
    this.running = false;
    const toward = (t: V3, spd: number) => {
      const de = t.e - this.pos.e;
      const dn = t.n - this.pos.n;
      const d = Math.hypot(de, dn);
      if (d < 1e-4) return 0;
      const s = Math.min(d, spd * dt);
      this.pos.e += (de / d) * s;
      this.pos.n += (dn / d) * s;
      return d;
    };
    switch (this.state) {
      case MarchState.March:
      case MarchState.Halt: {
        const d = Math.hypot(this.target.e - this.pos.e, this.target.n - this.pos.n);
        if (d > 0.05) {
          toward(this.target, Math.max(1.4, d * 2));
          this.moving = this.state === MarchState.March || d > 0.3;
        }
        this.yaw = lerpAngle(this.yaw, this.heading, 1 - Math.exp(-6 * dt));
        this.anim = this.flinch > 0.6 ? 'flail' : this.moving && this.state === MarchState.March ? 'march' : 'attention';
        break;
      }
      case MarchState.Chaos: {
        this.chaosTimer -= dt;
        const de = this.chaosTarget.e - this.pos.e;
        const dn = this.chaosTarget.n - this.pos.n;
        if (Math.hypot(de, dn) > 0.4) {
          toward(this.chaosTarget, 3.2);
          this.yaw = lerpAngle(this.yaw, Math.atan2(de, dn), 1 - Math.exp(-8 * dt));
          this.moving = this.running = true;
          this.anim = 'flail';
        } else {
          this.anim = ['shoo', 'flail', 'outrage', 'look_up'][Math.floor(this.t * 0.7 + this.slot.x + 2) % 4]!;
          if (this.chaosTimer <= 0) {
            this.chaosTimer = this.rng.range(1.5, 3.5);
            this.pickChaos(this.pos, 6, area);
          }
        }
        break;
      }
      case MarchState.Reform: {
        const de = this.target.e - this.pos.e;
        const dn = this.target.n - this.pos.n;
        if (Math.hypot(de, dn) > 0.15) {
          toward(this.target, 2.4);
          this.yaw = lerpAngle(this.yaw, Math.atan2(de, dn), 1 - Math.exp(-6 * dt));
          this.moving = true;
          this.anim = 'idle';
        } else {
          this.yaw = lerpAngle(this.yaw, this.heading, 1 - Math.exp(-6 * dt));
          this.anim = 'attention';
        }
        break;
      }
    }
    this.pos.h = this.ground(this.pos.e, this.pos.n);
    if (this.moving) this.phase += dt * (this.running ? 9 : 6.5);
  }
}

export const AllyState = { Roost: 0, Follow: 1, Circle: 2, Return: 3 } as const;
export type AllyStateId = (typeof AllyState)[keyof typeof AllyState];

export class AllyGull {
  state: AllyStateId = AllyState.Roost;
  pos: V3;
  vel: V3 = v3();
  yaw = Math.PI / 2;
  reloadTimer = 0;
  flapping = false;
  flapPhase = 0;
  private circleCentre: V3 = v3();
  private circleT = 0;
  private readonly releaseQueue: number[] = [];
  private dropsLeft = 0;
  private t: number;

  constructor(
    readonly callsign: string,
    readonly roost: V3,
    /** Box slot behind the leader: x right, y up, z back (m). */
    readonly slot: { x: number; y: number; z: number },
    private readonly rng: Rng,
  ) {
    this.pos = { ...roost };
    this.t = rng.next() * 5;
  }

  isReady(): boolean {
    return this.state === AllyState.Roost && this.reloadTimer <= 0;
  }

  scramble(): void {
    this.state = AllyState.Follow;
    this.dropsLeft = 4;
    this.vel = v3(0, 0, 4);
  }

  /** The leader released: queue this gull's drops with a little stagger. */
  release(delay: number): void {
    if (this.state !== AllyState.Follow || this.dropsLeft <= 0) return;
    this.dropsLeft -= 2;
    this.releaseQueue.push(delay, delay + 0.16);
  }

  slotPosition(leader: Gull): V3 {
    let f = v3(leader.vel.e, leader.vel.n, 0);
    const l = Math.hypot(f.e, f.n);
    f = l < 1 ? leader.flatDir() : scale(f, 1 / l);
    const right = v3(f.n, -f.e, 0);
    return add(add(leader.pos, scale(right, this.slot.x)), v3(-f.e * this.slot.z, -f.n * this.slot.z, this.slot.y));
  }

  breakOff(centre: V3): void {
    if (this.state === AllyState.Follow) {
      this.state = AllyState.Circle;
      this.circleCentre = { ...centre };
      this.circleT = 0;
    }
  }

  /** Snap into the box (tests). */
  snapTo(leader: Gull): void {
    this.pos = this.slotPosition(leader);
    this.vel = { ...leader.vel };
  }

  update(dt: number, leader: Gull, spawnPoop: (pos: V3, vel: V3) => void): void {
    this.t += dt;
    let desired = this.pos;
    switch (this.state) {
      case AllyState.Roost:
        this.reloadTimer = Math.max(this.reloadTimer - dt, 0);
        this.pos = { ...this.roost };
        this.yaw = lerpAngle(this.yaw, Math.PI / 2 + Math.sin(this.t * 0.3) * 0.4, dt);
        this.flapping = false;
        return;
      case AllyState.Follow:
        desired = this.slotPosition(leader);
        for (let i = this.releaseQueue.length - 1; i >= 0; i--) {
          this.releaseQueue[i]! -= dt;
          if (this.releaseQueue[i]! <= 0) {
            this.releaseQueue.splice(i, 1);
            spawnPoop(add(this.pos, v3(0, 0, -0.2)), add(leader.vel, v3(this.rng.range(-0.3, 0.3), this.rng.range(-0.3, 0.3), -1)));
          }
        }
        break;
      case AllyState.Circle: {
        this.circleT += dt;
        const a = this.circleT * 0.9 + this.slot.x;
        desired = add(this.circleCentre, v3(Math.cos(a) * 14, Math.sin(a) * 14, 22 + this.slot.y * 2));
        if (this.circleT > 6) this.state = AllyState.Return;
        break;
      }
      case AllyState.Return:
        desired = add(this.roost, v3(0, 0, 0.4));
        if (dist(this.pos, this.roost) < 0.8) {
          this.state = AllyState.Roost;
          this.reloadTimer = 14;
          this.vel = v3();
          return;
        }
        break;
    }
    const to = sub(desired, this.pos);
    const maxSpd = this.state === AllyState.Follow ? 34 : 16;
    let want = scale(to, 2.4);
    const wl = Math.hypot(want.e, want.n, want.h);
    if (wl > maxSpd) want = scale(want, maxSpd / wl);
    const k = 1 - Math.exp(-4 * dt);
    this.vel = add(this.vel, scale(sub(want, this.vel), k));
    this.pos = add(this.pos, scale(this.vel, dt));
    if (Math.hypot(this.vel.e, this.vel.n) > 0.5) this.yaw = lerpAngle(this.yaw, Math.atan2(this.vel.e, this.vel.n), 1 - Math.exp(-6 * dt));
    this.flapping = this.vel.h > -1 || this.state !== AllyState.Follow;
    if (this.flapping) this.flapPhase += dt * 3.2;
  }
}
