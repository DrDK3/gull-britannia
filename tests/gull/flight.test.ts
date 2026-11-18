import { describe, expect, it } from 'vitest';
import { World, v3, type V3 } from '../../src/gull/game/world';
import { Gull, Mode, NO_CONTROLS, type GullControls, type Perch } from '../../src/gull/game/gull';
import { testWorld, TestHost } from './helpers';

const DT = 1 / 60;

function run(g: Gull, w: World, host: TestHost, seconds: number, c: Partial<GullControls> = {}, until?: () => boolean): boolean {
  const ctl = { ...NO_CONTROLS, ...c };
  for (let i = 0; i < seconds * 60; i++) {
    g.step(DT, ctl, w, host);
    if (until?.()) return true;
  }
  return until ? until() : true;
}

function airborne(g: Gull, at: V3, yaw: number, pitch: number, speed: number): void {
  g.spawn(at, yaw, pitch);
  g.setMode(Mode.Air);
  g.flyDir = g.lookDir();
  g.airSpeed = speed;
}

describe('gull flight', () => {
  it('stands on the quay, takes off with a fresh flap and climbs', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    g.spawn(v3(-20, 0, 2.3), 0);
    run(g, w, host, 0.5);
    expect(g.mode).toBe(Mode.Ground);
    expect(g.pos.h).toBeCloseTo(2.3, 1);
    const h0 = g.pos.h;
    expect(run(g, w, host, 1, { flap: true }, () => g.mode === Mode.Air)).toBe(true);
    run(g, w, host, 1, { flap: true });
    expect(g.pos.h - h0).toBeGreaterThan(1.5);
  });

  it('builds speed flapping, holds a level glide, dives fast', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(10, -80, 40), 0, 0, 10);
    run(g, w, host, 3, { forward: true });
    expect(g.airSpeed).toBeGreaterThan(14);
    const h = g.pos.h;
    run(g, w, host, 2);
    expect(Math.abs(g.pos.h - h)).toBeLessThan(4);
    expect(g.airSpeed).toBeGreaterThan(7);
    g.pitch = -0.8;
    run(g, w, host, 1.5, { dive: true });
    expect(g.airSpeed).toBeGreaterThan(20);
  });

  it('always recovers from a stall', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(10, -50, 80), 0, 1.2, 6);
    run(g, w, host, 2);
    g.pitch = 0;
    run(g, w, host, 2.5);
    expect(g.mode).toBe(Mode.Air);
    expect(g.airSpeed).toBeGreaterThan(6);
    expect(g.pos.h).toBeGreaterThan(40);
  });

  it('brakes to a flare and hovers with brake and flap', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(10, -80, 30), 0, 0, 15);
    run(g, w, host, 1.6, { back: true });
    expect(g.airSpeed).toBeLessThan(4.5);
    expect(g.sink).toBeLessThanOrEqual(2.3);
    const h = g.pos.h;
    run(g, w, host, 1.5, { back: true, flap: true });
    expect(g.pos.h).toBeGreaterThan(h - 1);
  });

  it('lands with landing assist on the quay and on a pitched roof, without tumbling', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(-20, -20, 14), 0, -0.2, 9);
    expect(run(g, w, host, 12, { land: true }, () => g.mode === Mode.Ground)).toBe(true);
    expect(g.pos.h).toBeCloseTo(2.3, 0);
    airborne(g, v3(-50, -10, 27), 0, -0.4, 8);
    expect(run(g, w, host, 12, { land: true }, () => g.mode === Mode.Ground)).toBe(true);
    expect(g.pos.h).toBeGreaterThan(12);
    expect(host.tumbles).toBe(0);
  });

  it('walks, walks up a roof, and takes off again', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    g.spawn(v3(-50, 1, 13), 0);
    run(g, w, host, 0.5);
    const n0 = g.pos.n;
    run(g, w, host, 1.5, { forward: true });
    expect(g.pos.n - n0).toBeGreaterThan(2);
    expect(g.mode).toBe(Mode.Ground);
    expect(g.pos.h).toBeGreaterThan(13);
    run(g, w, host, 0.3);
    expect(run(g, w, host, 1, { flap: true }, () => g.mode === Mode.Air)).toBe(true);
  });

  it('tumbles into a wall at speed and recovers', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(-80, 0, 10), -Math.PI / 2, 0, 22);
    expect(run(g, w, host, 2, {}, () => g.mode === Mode.Tumble)).toBe(true);
    expect(run(g, w, host, 3, {}, () => g.mode === Mode.Air || g.mode === Mode.Ground)).toBe(true);
    expect(g.pos.e).toBeGreaterThan(-98);
  });

  it('lands on the water, floats, and takes off from it', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(20, 0, 4), 0, -0.3, 8);
    expect(run(g, w, host, 6, { back: true }, () => g.mode === Mode.Water)).toBe(true);
    run(g, w, host, 0.5);
    expect(g.pos.h).toBeLessThan(1.1);
    expect(run(g, w, host, 1, { flap: true }, () => g.mode === Mode.Air)).toBe(true);
  });

  it('glides onto a perch with landing assist, and settles onto one from a slow hover', () => {
    const w = testWorld();
    const host = new TestHost();
    const perch: Perch = { id: 'chimney', name: 'Chimney', hint: '', pos: v3(-50, 6, 16) };
    host.perches.push(perch);
    const g = new Gull();
    airborne(g, v3(-36, 8, 20), -Math.PI / 2, -0.3, 8);
    expect(run(g, w, host, 4, { land: true }, () => g.mode === Mode.Ground && g.perch === perch)).toBe(true);
    airborne(g, v3(-49, 6.5, 17), 0, -0.5, 2);
    expect(run(g, w, host, 3, { back: true }, () => g.mode === Mode.Ground && g.perch === perch)).toBe(true);
  });

  it('a poop keeps the gull’s momentum', () => {
    const w = testWorld();
    const host = new TestHost();
    const g = new Gull();
    airborne(g, v3(10, -80, 30), 0, 0, 12);
    run(g, w, host, 0.2);
    g.poop(host);
    expect(host.poops.length).toBe(1);
    expect(host.poops[0]!.vel.n).toBeGreaterThan(10);
    const pred = g.predictDrop(w);
    expect(pred).toBeDefined();
    expect(pred!.point.n).toBeGreaterThan(g.pos.n + 10);
  });
});
