/**
 * A stand-in for the captured town around Bayard's Cove and the Embankment, for Mission 1's logic tests (the real
 * grid needs the GPU). Same coordinates and the heights that matter: the quays at 3.5 m, the river and the Boat Float,
 * the Custom House, the bakery, the nest's flat roof, the station, St Saviour's and the fort.
 */
import { World, type Grid } from '../../src/gull/game/world';

export const WATER = 2.06;

export function m1World(): World {
  const e0 = -420;
  const n0 = -40;
  const cell = 0.5;
  const nx = (Math.round(-240 - e0) / cell) | 0;
  const ny = (Math.round(430 - n0) / cell) | 0;
  const h = new Float32Array(nx * ny);
  const blocks: [number, number, number, number, number][] = [
    // e0, e1, n0, n1, top
    [-332, -321, 52, 67, 13], // Custom House
    [-328, -324, 55, 65, 14.5], // its ridge
    [-320, -313, 34, 46, 15], // the bakery
    [-345, -300, 292, 302, 16.3], // the nest's flat roof
    [-283, -272, 362, 382, 9.5], // the station
    [-405, -385, 335, 355, 14], // St Saviour's
    [-382, -364, 378, 402, 15.5], // the Royal Castle Hotel
  ];
  for (let j = 0; j < ny; j++) {
    const n = n0 + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const e = e0 + (i + 0.5) * cell;
      let top = e < -300 || (e < -272 && n > 120) ? 3.5 : -2;
      if (e > -338 && e < -298 && n > 368 && n < 412) top = -1.3; // the Boat Float
      const df = Math.hypot(e + 290, n + 13);
      if (df < 7) top = df > 5.5 ? 8 : 3.4; // Bayard's Cove Fort
      for (const [a, b, c, d, t] of blocks) if (e >= a && e <= b && n >= c && n <= d) top = Math.max(top, t);
      h[j * nx + i] = top;
    }
  }
  const grid: Grid = { e0, n0, cell, nx, ny, h };
  return new World({ grids: [grid], waterLevel: WATER, bounds: { eMin: -1150, eMax: 550, nMin: -750, nMax: 1350 } });
}
