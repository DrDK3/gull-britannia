/**
 * The real town, for tests that should hold on it and not only on the stand-in (m1world.ts): the baked collision
 * grids in public/geo, read as the game reads them (src/gull/view/collisionData.ts), without a browser.
 *
 * One thing differs from the game: people's ground. The game takes it from SailSim's terrain; here it is the top of
 * whatever is drawn, which is the same on open quays and pavements (where everyone in the missions stands) and wrong
 * under roofs and trees. Do not put a person indoors in a test on this world.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { World, type Grid } from '../../src/gull/game/world';
import { decodeGridPlanes } from '../../src/sim/geo/pack';
import { WATER } from './m1world';

const GEO = fileURLToPath(new URL('../../public/geo/', import.meta.url));

interface Manifest {
  scale: number;
  nodata: number;
  grids: { file: string; e0: number; n0: number; cell: number; nx: number; ny: number }[];
}

let cached: Grid[] | undefined;

function grids(): Grid[] {
  if (cached) return cached;
  const m = JSON.parse(readFileSync(GEO + 'collision.json', 'utf8')) as Manifest;
  cached = m.grids.map((g) => {
    let bytes = new Uint8Array(readFileSync(GEO + g.file));
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(gunzipSync(bytes));
    const v = new Int16Array(decodeGridPlanes(bytes, g.nx, g.ny));
    const h = new Float32Array(v.length);
    for (let k = 0; k < h.length; k++) h[k] = v[k] === m.nodata ? NaN : v[k]! * m.scale;
    return { e0: g.e0, n0: g.n0, cell: g.cell, nx: g.nx, ny: g.ny, h };
  });
  return cached;
}

/** A fresh world on the baked town (missions add their own solids to it), at Mission 1's water level. */
export function realTown(waterLevel = WATER): World {
  return new World({ grids: grids(), waterLevel, bounds: { eMin: -1150, eMax: 550, nMin: -750, nMax: 1350 } });
}
