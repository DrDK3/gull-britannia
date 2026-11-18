import { World, v3, type Grid, type V3 } from '../../src/gull/game/world';
import type { GullHost, Perch } from '../../src/gull/game/gull';

/** A test world: quay at 2 m ODN west of e = 0, river (bed −4 m) east of it, a 12 m building and a pitched roof. */
export function testWorld(): World {
  const cell = 0.5;
  const nx = 400;
  const ny = 400;
  const e0 = -150;
  const n0 = -100;
  const h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const e = e0 + (i + 0.5) * cell;
      const n = n0 + (j + 0.5) * cell;
      let top = e < 0 ? 2 : -4;
      // A block of houses: 10 m eaves, a 35° roof rising to 14 m along n.
      if (e > -60 && e < -40 && n > 0 && n < 12) top = 12 + 4 * (1 - Math.abs(n - 6) / 6);
      // A tall wall to crash into.
      if (e > -100 && e < -98 && n > -40 && n < 40) top = 20;
      h[j * nx + i] = top;
    }
  }
  const grid: Grid = { e0, n0, cell, nx, ny, h };
  return new World({ grids: [grid], waterLevel: 0.5, bounds: { eMin: -140, eMax: 40, nMin: -90, nMax: 90 } });
}

export class TestHost implements GullHost {
  perches: Perch[] = [];
  landed = 0;
  tumbles = 0;
  poops: { pos: V3; vel: V3 }[] = [];
  findPerch(from: V3, look: V3, maxDist: number, maxAngleDeg: number): Perch | undefined {
    let best: Perch | undefined;
    let bs = Infinity;
    for (const p of this.perches) {
      const to = v3(p.pos.e - from.e, p.pos.n - from.n, p.pos.h - from.h);
      const d = Math.hypot(to.e, to.n, to.h);
      if (d > maxDist || d < 0.2) continue;
      const cos = (to.e * look.e + to.n * look.n + to.h * look.h) / d;
      const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      if (ang > maxAngleDeg) continue;
      if (ang + d * 0.8 < bs) {
        bs = ang + d * 0.8;
        best = p;
      }
    }
    return best;
  }
  perchAt(p: V3): Perch | undefined {
    return this.perches.find((q) => Math.hypot(q.pos.e - p.e, q.pos.n - p.n, q.pos.h - p.h) < 1.6);
  }
  spawnPoop(pos: V3, vel: V3): void {
    this.poops.push({ pos, vel });
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

