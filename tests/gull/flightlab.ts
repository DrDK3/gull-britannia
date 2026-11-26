/**
 * The flight laboratory: how the gull flies, as numbers. Each function sets up one manoeuvre, flies it with the
 * player's controls only (a view direction and held keys) and returns what happened. The feel tests assert bands on
 * these (tests/gull/flightfeel.test.ts); `npx tsx tools/flight-metrics.ts` prints them as the table in
 * reports/agents/flight.md.
 */
import { Gull, Mode, NO_CONTROLS, type GullControls, type GullHost, type GullProfile, type Perch } from '../../src/gull/game/gull';
import { World, v3, wrapAngle, type Grid, type V3 } from '../../src/gull/game/world';

export const DT = 1 / 60;

/** A host that keeps count and has no perches. */
export class LabHost implements GullHost {
  perches: Perch[] = [];
  tumbles = 0;
  landed = 0;
  poops: { pos: V3; vel: V3 }[] = [];
  findPerch(): Perch | undefined {
    return undefined;
  }
  perchAt(): Perch | undefined {
    return undefined;
  }
  spawnPoop(pos: V3, vel: V3): void {
    this.poops.push({ pos: { ...pos }, vel: { ...vel } });
  }
  onLanded(): void {
    this.landed++;
  }
  onPerched(): void {}
  onTookOff(): void {}
  onTumbled(): void {
    this.tumbles++;
  }
  onPayloadEmpty(): void {}
  onOutOfBounds(): void {}
}

/**
 * Open sky: the ground stays `below` metres under the gull however far it climbs or sinks (the lab moves it each
 * step), so a long manoeuvre meets neither the ground nor the gull's ceiling.
 */
export function openSky(below = 100): World {
  const sky = { floor: -below, below };
  const w = new World({ grids: [], waterLevel: -1e6, beyond: () => sky.floor, bounds: { eMin: -1e6, eMax: 1e6, nMin: -1e6, nMax: 1e6 } });
  (w as unknown as { sky: typeof sky }).sky = sky;
  return w;
}

/** A world from a height function, on one 0.5 m grid centred on the origin. */
export function gridWorld(size: number, top: (e: number, n: number) => number, waterLevel = -20, cell = 0.5): World {
  const nx = Math.round(size / cell);
  const h = new Float32Array(nx * nx);
  const e0 = -size / 2;
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = top(e0 + (i + 0.5) * cell, e0 + (j + 0.5) * cell);
  const grid: Grid = { e0, n0: e0, cell, nx, ny: nx, h };
  return new World({ grids: [grid], waterLevel, bounds: { eMin: -1e5, eMax: 1e5, nMin: -1e5, nMax: 1e5 } });
}

export interface Lab {
  g: Gull;
  w: World;
  host: LabHost;
  t: number;
}

export function lab(w: World = openSky(), profile?: Partial<GullProfile>): Lab {
  const g = new Gull();
  if (profile) g.setProfile(profile);
  return { g, w, host: new LabHost(), t: 0 };
}

/** Put the gull in the air at a point, flying along its view at a speed. */
export function launch(l: Lab, at: V3, yaw: number, pitch: number, speed: number): void {
  const g = l.g;
  g.spawn(at, yaw, pitch);
  g.setMode(Mode.Air);
  g.flyDir = g.lookDir();
  g.airSpeed = speed;
}

/** One step holding these controls. */
export function step(l: Lab, c: Partial<GullControls> = {}): void {
  const sky = (l.w as unknown as { sky?: { floor: number; below: number } }).sky;
  if (sky) sky.floor = l.g.pos.h - sky.below;
  (l.w as unknown as { tick?: (dt: number) => void }).tick?.(DT);
  l.g.step(DT, { ...NO_CONTROLS, ...c }, l.w, l.host);
  l.t += DT;
}

export function hold(l: Lab, seconds: number, c: Partial<GullControls> = {}, until?: () => boolean): boolean {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    step(l, c);
    if (until?.()) return true;
  }
  return until ? until() : true;
}

/** Heading of the ground track (rad). */
export const track = (g: Gull): number => Math.atan2(g.vel.e, g.vel.n);

// ---------------------------------------------------------------------------------------------- glide

export interface GlideResult {
  /** Metres forward for each metre down, steady, and the speed and sink rate there (m/s). */
  ratio: number;
  speed: number;
  sink: number;
}

/** A steady glide with the view held at `pitch` (rad) and no keys, measured over the last `over` seconds. */
export function glide(pitch: number, from = 12, settle = 25, over = 5, profile?: Partial<GullProfile>): GlideResult {
  const l = lab(openSky(), profile);
  launch(l, v3(0, 0, 3000), 0, pitch, from);
  hold(l, settle);
  const a = { ...l.g.pos };
  hold(l, over);
  const b = l.g.pos;
  const fwd = Math.hypot(b.e - a.e, b.n - a.n);
  const down = a.h - b.h;
  return { ratio: down > 1e-6 ? fwd / down : Infinity, speed: fwd / over, sink: down / over };
}

/** The best glide over a sweep of view pitches, and the slowest sink. */
export function glidePolar(profile?: Partial<GullProfile>): { best: GlideResult & { pitchDeg: number }; minSink: GlideResult & { pitchDeg: number }; level: GlideResult } {
  let best: (GlideResult & { pitchDeg: number }) | undefined;
  let minSink: (GlideResult & { pitchDeg: number }) | undefined;
  for (let deg = 0; deg <= 14; deg += 0.5) {
    const r = { ...glide((-deg * Math.PI) / 180, 12, 25, 5, profile), pitchDeg: -deg };
    if (!best || r.ratio > best.ratio) best = r;
    if (!minSink || r.sink < minSink.sink) minSink = r;
  }
  return { best: best!, minSink: minSink!, level: glide(0, 12, 25, 5, profile) };
}

// ---------------------------------------------------------------------------------------------- stall

export interface StallResult {
  /** Lowest airspeed reached (m/s), whether it came back to flying speed, how long that took from levelling the view
   * (s), and the height lost from the top of the zoom to the lowest point (m). */
  minSpeed: number;
  recovered: boolean;
  recoverTime: number;
  heightLost: number;
  /** Fastest descent on the way (m/s). */
  maxSink: number;
}

/** Pull up steeply at low speed until it stalls, then level the view and let go. */
export function stall(holdUp = 2): StallResult {
  const l = lab();
  const g = l.g;
  launch(l, v3(0, 0, 500), 0, 1.2, 8);
  let top = g.pos.h;
  let minSpeed = g.airSpeed;
  let maxSink = 0;
  const watch = () => {
    top = Math.max(top, g.pos.h);
    minSpeed = Math.min(minSpeed, g.airSpeed);
    maxSink = Math.max(maxSink, -g.vel.h);
  };
  for (let i = 0; i < holdUp * 60; i++) {
    step(l);
    watch();
  }
  g.pitch = 0;
  let low = g.pos.h;
  let recoverTime = NaN;
  const stallSpeed = g.profile.stallSpeed;
  for (let i = 0; i < 8 * 60; i++) {
    step(l);
    watch();
    low = Math.min(low, g.pos.h);
    if (Number.isNaN(recoverTime) && g.airSpeed >= stallSpeed && -g.vel.h < 2) recoverTime = (i + 1) * DT;
  }
  return { minSpeed, recovered: g.mode === Mode.Air && !Number.isNaN(recoverTime), recoverTime, heightLost: top - low, maxSink };
}

// ---------------------------------------------------------------------------------------------- turns

export interface TurnResult {
  /** Seconds to reverse the ground track, the radius of the turn (half the sideways distance covered, m), the speed
   * at the end (m/s), the height change (m) and the steepest bank on the way (rad, if the gull reports one). */
  time: number;
  radius: number;
  endSpeed: number;
  heightChange: number;
  maxRoll: number;
}

/**
 * A 180° turn from straight flight north at `speed`. `how` is the player's input: 'look' snaps the view round to
 * the south (a flick of the mouse), 'sweep' turns it at a steady 3.2 rad/s, 'key' holds the bank key.
 */
export function turn180(speed: number, how: 'look' | 'sweep' | 'key' = 'sweep', c: Partial<GullControls> = {}, profile?: Partial<GullProfile>): TurnResult {
  const l = lab(openSky(), profile);
  const g = l.g;
  launch(l, v3(0, 0, 1000), 0, 0, speed);
  const e0 = g.pos.e;
  const h0 = g.pos.h;
  let maxRoll = 0;
  let time = NaN;
  // East-about (clockwise), so the track's heading rises from 0 to π.
  let turned = 0;
  let prev = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const ctl: Partial<GullControls> = { ...c };
    if (how === 'look') g.yaw = Math.PI - 1e-3;
    else if (how === 'sweep') g.look(Math.min(3.2 * DT, Math.max(0, Math.PI - 1e-3 - g.yaw)), 0);
    else ctl.right = true;
    step(l, ctl);
    const tr = track(g);
    turned += wrapAngle(tr - prev);
    prev = tr;
    maxRoll = Math.max(maxRoll, Math.abs((g as unknown as { roll?: number }).roll ?? 0));
    if (turned >= Math.PI - 0.02) {
      time = (i + 1) * DT;
      break;
    }
  }
  return { time, radius: Math.abs(g.pos.e - e0) / 2, endSpeed: g.airSpeed, heightChange: g.pos.h - h0, maxRoll };
}

/** The fastest the flight path turns (rad/s) after the view snaps 90° to one side at `speed`: twitchiness. */
export function snapTurnRate(speed: number): number {
  const l = lab();
  const g = l.g;
  launch(l, v3(0, 0, 1000), 0, 0, speed);
  g.yaw = Math.PI / 2;
  let prev = Math.atan2(g.flyDir.e, g.flyDir.n);
  let max = 0;
  for (let i = 0; i < 120; i++) {
    step(l, speed < 6 ? { back: true, flap: true } : {});
    const h = Math.atan2(g.flyDir.e, g.flyDir.n);
    max = Math.max(max, Math.abs(wrapAngle(h - prev)) / DT);
    prev = h;
  }
  return max;
}

// ---------------------------------------------------------------------------------------------- energy

export interface SwoopResult {
  /** Height given up in the dive, height won back in the zoom, their ratio, and the top speed (m/s). */
  lost: number;
  regained: number;
  recovery: number;
  topSpeed: number;
}

/**
 * A swoop: from cruise, dive (the dive key, view `diveDeg` below the horizon) for `diveFor` seconds, then let go,
 * pull the view up to `zoomDeg` and coast until the speed is back to where it started.
 */
export function swoop(diveDeg = 45, diveFor = 2, zoomDeg = 40, start = 13): SwoopResult {
  const l = lab();
  const g = l.g;
  launch(l, v3(0, 0, 1000), 0, 0, start);
  const h0 = g.pos.h;
  let topSpeed = start;
  const lookTo = (deg: number) => g.look(0, Math.max(-3.2 * DT, Math.min(3.2 * DT, (deg * Math.PI) / 180 - g.pitch)));
  for (let i = 0; i < diveFor * 60; i++) {
    lookTo(-diveDeg);
    step(l, { dive: true });
    topSpeed = Math.max(topSpeed, g.airSpeed);
  }
  let low = g.pos.h;
  let high = g.pos.h;
  let climbing = false;
  for (let i = 0; i < 20 * 60; i++) {
    lookTo(zoomDeg);
    step(l);
    topSpeed = Math.max(topSpeed, g.airSpeed);
    if (!climbing) {
      low = Math.min(low, g.pos.h);
      if (g.vel.h > 0.5) climbing = true;
      high = g.pos.h;
    } else {
      high = Math.max(high, g.pos.h);
      if (g.airSpeed <= start || g.vel.h <= 0) break;
    }
  }
  const lost = h0 - low;
  const regained = high - low;
  return { lost, regained, recovery: regained / lost, topSpeed };
}

/** Flapping for speed, level: the speed after 3 s from 10 m/s, and the top speed (m/s). */
export function flapSpeed(profile?: Partial<GullProfile>): { after3: number; top: number; heightChange: number } {
  const l = lab(openSky(), profile);
  launch(l, v3(0, 0, 1000), 0, 0, 10);
  hold(l, 3, { forward: true });
  const after3 = l.g.airSpeed;
  hold(l, 20, { forward: true });
  return { after3, top: l.g.airSpeed, heightChange: l.g.pos.h - 1000 };
}

/** Climb rates (m/s), steady: flapping for height with the view level; flapping for speed with the view 20° up. */
export function climb(): { flap: number; flapSpeed: number; forward20: number; forward20Speed: number } {
  const a = lab();
  launch(a, v3(0, 0, 1000), 0, 0, 11);
  hold(a, 6, { flap: true });
  const h1 = a.g.pos.h;
  hold(a, 4, { flap: true });
  const b = lab();
  launch(b, v3(0, 0, 1000), 0, (20 * Math.PI) / 180, 11);
  hold(b, 6, { forward: true });
  const h2 = b.g.pos.h;
  hold(b, 4, { forward: true });
  return { flap: (a.g.pos.h - h1) / 4, flapSpeed: a.g.airSpeed, forward20: (b.g.pos.h - h2) / 4, forward20Speed: b.g.airSpeed };
}

/** Braking from 15 m/s: time and distance to 4.5 m/s, then the steady sink with the brake held (m/s). */
export function brake(): { time: number; distance: number; sink: number; hoverSink: number } {
  const l = lab();
  const g = l.g;
  launch(l, v3(0, 0, 1000), 0, 0, 15);
  let time = NaN;
  for (let i = 0; i < 600 && Number.isNaN(time); i++) {
    step(l, { back: true });
    if (g.airSpeed < 4.5) time = (i + 1) * DT;
  }
  const distance = g.pos.n;
  hold(l, 3, { back: true });
  const h = g.pos.h;
  hold(l, 2, { back: true });
  const sink = (h - g.pos.h) / 2;
  const h2 = g.pos.h;
  hold(l, 2, { back: true, flap: true });
  return { time, distance, sink, hoverSink: (h2 - g.pos.h) / 2 };
}

/** Taking off from flat ground with the flap key held: height gained after 1 s and 2 s, and the airspeed then. */
export function takeOff(windSpeed = 0, windFromDeg = 0): { h1: number; h2: number; speed: number } {
  const w = gridWorld(120, () => 0);
  setWind(w, windSpeed, windFromDeg, 0);
  const l = lab(w);
  const g = l.g;
  g.spawn(v3(0, 0, 0.3), 0);
  hold(l, 0.5);
  const h0 = g.pos.h;
  hold(l, 1, { flap: true });
  const h1 = g.pos.h - h0;
  hold(l, 1, { flap: true });
  return { h1, h2: g.pos.h - h0, speed: g.airSpeed };
}

// ---------------------------------------------------------------------------------------------- wind

/** Give the world a wind, if this build has one (speed in m/s at 10 m, the direction it blows from, gustiness). */
export function setWind(w: World, speed: number, fromDeg: number, gust = 0, seed = 1): boolean {
  const ww = w as unknown as { setWind?: (s: { speed: number; fromDeg: number; gust?: number; seed?: number }) => void };
  if (!ww.setWind) return false;
  ww.setWind({ speed, fromDeg, gust, seed });
  return true;
}

export const KN = 0.514444;

/**
 * A long ridge running north–south: a 25° slope rising from the west to a crest 30 m up at e = 0, and the same down
 * the east side. The wind in these tests blows from the west, square onto it.
 */
export function ridgeWorld(): World {
  return gridWorld(400, (e) => Math.max(0, 30 - Math.abs(e) * Math.tan((25 * Math.PI) / 180)), -20, 1);
}

// ---------------------------------------------------------------------------------------------- walls

/** Fly at a wall 0.5 m thick at full speed, at an angle from square (rad): the furthest it got past the near face. */
export function wallTest(angle: number, speed: number, tailwind = 0): { beyond: number; tumbled: boolean; mode: number } {
  // The wall stands on e = 0 to 0.5, 30 m tall.
  const w = gridWorld(200, (e) => (e >= 0 && e < 0.5 ? 30 : 0));
  if (tailwind) setWind(w, tailwind, 270, 0);
  const l = lab(w);
  const g = l.g;
  const yaw = Math.PI / 2 - angle;
  launch(l, v3(-25, -25 * Math.tan(angle) * 0, 12), yaw, 0, speed);
  let beyond = -Infinity;
  for (let i = 0; i < 6 * 60; i++) {
    step(l, { forward: true });
    beyond = Math.max(beyond, g.pos.e);
  }
  return { beyond, tumbled: l.host.tumbles > 0, mode: g.mode };
}
