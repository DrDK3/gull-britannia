/**
 * The real town for flight tests: the baked collision grids the game ships (public/geo/collision-*, the same solid
 * Dartmouth the browser flies in), read from disk. Where the grids hold nothing, the ground is taken as the river bed.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeGridPlanes, isGzip } from '../../src/sim/geo/pack';
import { World, type Grid } from '../../src/gull/game/world';

/** The play area, as src/gull/app/game.ts has it. */
export const PLAY_BOUNDS = { eMin: -1150, eMax: 550, nMin: -750, nMax: 1350 };

interface Manifest {
  scale: number;
  nodata: number;
  grids: { file: string; e0: number; n0: number; cell: number; nx: number; ny: number }[];
}

let cache: Grid[] | undefined;

export function townGrids(): Grid[] {
  if (cache) return cache;
  const dir = new URL('../../public/geo/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('collision.json', dir), 'utf8')) as Manifest;
  cache = m.grids.map((g) => {
    let bytes = new Uint8Array(readFileSync(new URL(g.file, dir)));
    if (isGzip(bytes)) bytes = new Uint8Array(gunzipSync(bytes));
    const v = new Int16Array(decodeGridPlanes(bytes, g.nx, g.ny));
    const h = new Float32Array(v.length);
    for (let k = 0; k < h.length; k++) h[k] = v[k] === m.nodata ? NaN : v[k]! * m.scale;
    return { e0: g.e0, n0: g.n0, cell: g.cell, nx: g.nx, ny: g.ny, h };
  });
  return cache;
}

/** The town at a given water level (m ODN; mean high water springs at Dartmouth is about 2 m). */
export function townWorld(waterLevel = 2.06): World {
  return new World({ grids: townGrids(), waterLevel, beyond: () => -5, bounds: PLAY_BOUNDS });
}
