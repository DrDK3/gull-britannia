import { describe, expect, it } from 'vitest';
import { World, v3, type Grid } from '../../src/gull/game/world';

function grid(e0: number, n0: number, cell: number, nx: number, ny: number, top: (e: number, n: number) => number): Grid {
  const h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = top(e0 + (i + 0.5) * cell, n0 + (j + 0.5) * cell);
  return { e0, n0, cell, nx, ny, h };
}

describe('the world’s height grids', () => {
  // A house 6 m tall from e 10.5 to 14.5. The coarse 2 m grid keeps the highest sample in each cell, so it makes the
  // house a metre and a half fatter on each side; the fine 0.5 m grid has it as drawn.
  const house = (e: number) => (e >= 10.5 && e <= 14.5 ? 6 : 0);
  const coarse = grid(0, 0, 2, 20, 20, (e) => Math.max(house(e - 0.99), house(e + 0.99), house(e)));
  const fine = grid(8, 0, 0.5, 24, 80, (e) => house(e));

  it('uses the finest grid that covers a point, whatever order they are given in', () => {
    for (const grids of [
      [coarse, fine],
      [fine, coarse],
    ]) {
      const w = new World({ grids, waterLevel: -5 });
      // Just outside the wall: the fine grid says street, the coarse one says roof.
      expect(w.cellTop(10.2, 5)).toBe(0);
      expect(w.cellTop(14.8, 5)).toBe(0);
      expect(w.cellTop(12, 5)).toBe(6);
      // Outside the fine grid the coarse one answers.
      expect(w.cellTop(30, 5)).toBe(0);
      expect(w.cellTop(3, 5)).toBe(0);
    }
  });

  it('collides with the house as drawn, not the coarse grid’s fatter one', () => {
    const w = new World({ grids: [coarse, fine], waterLevel: -5 });
    // A gull-sized sphere 0.5 m off the east wall, 3 m up: clear of the drawn wall.
    const clear = w.collideSphere(v3(15.0, 5, 3), 0.3);
    expect(clear.contacts.length).toBe(0);
    // Touching the drawn wall: pushed back out.
    const touching = w.collideSphere(v3(14.6, 5, 3), 0.3);
    expect(touching.contacts.length).toBeGreaterThan(0);
    expect(touching.pos.e).toBeGreaterThan(14.75);
  });

  it('sight lines pass along the lane beside the house', () => {
    const w = new World({ grids: [coarse, fine], waterLevel: -5 });
    expect(w.lineOfSight(v3(15.2, 0, 1.5), v3(15.2, 30, 1.5))).toBe(true);
    expect(w.lineOfSight(v3(9, 5, 1.5), v3(16, 5, 1.5))).toBe(false);
  });
});
