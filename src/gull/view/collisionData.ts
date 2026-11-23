/**
 * The baked collision world: the height grids that src/gull/view/heightCapture.ts reads from the picture, captured
 * once at build time (tools/bake-collision.ts) and shipped as packed files in public/geo/, so every player gets the
 * same solid town without surveying it on their own graphics card.
 *
 * Files: `collision.json` (this manifest) and one `.i16z` file per grid: Int16 centimetres above Ordnance Datum,
 * packed as SailSim packs its grids (src/sim/geo/pack.ts) and gzipped. −32768 marks a cell where nothing is drawn.
 */
import { GRID_PACKING, decodeGridPlanes, isGzip } from '../../sim/geo/pack';
import type { Grid } from '../game/world';

export const COLLISION_MANIFEST = 'collision.json';
export const COLLISION_NODATA = -32768;
export const COLLISION_SCALE = 0.01;

export interface CollisionManifest {
  version: 1;
  generated: string;
  /** Metres per unit. */
  scale: number;
  nodata: number;
  packing: string;
  grids: { file: string; e0: number; n0: number; cell: number; nx: number; ny: number }[];
}

/** A grid's heights as Int16 centimetres (what the files hold). */
export function gridToInt16(g: Grid): Int16Array {
  const out = new Int16Array(g.h.length);
  for (let k = 0; k < out.length; k++) {
    const v = g.h[k]!;
    out[k] = v === v ? Math.max(-32767, Math.min(32767, Math.round(v / COLLISION_SCALE))) : COLLISION_NODATA;
  }
  return out;
}

export function int16ToHeights(v: Int16Array, scale = COLLISION_SCALE, nodata = COLLISION_NODATA): Float32Array {
  const h = new Float32Array(v.length);
  for (let k = 0; k < h.length; k++) h[k] = v[k] === nodata ? NaN : v[k]! * scale;
  return h;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // A server that sent the file with Content-Encoding: gzip has already undone the gzip layer.
  if (!isGzip(bytes)) return bytes;
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack the data (no DecompressionStream)');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

/** Load the baked grids. Throws if any part is missing or malformed (the caller falls back to surveying). */
export async function loadCollision(base: string): Promise<Grid[]> {
  const res = await fetch(base + COLLISION_MANIFEST);
  if (!res.ok) throw new Error(`${COLLISION_MANIFEST}: ${res.status}`);
  const m = (await res.json()) as CollisionManifest;
  if (m.version !== 1 || m.packing !== GRID_PACKING || !Array.isArray(m.grids) || !m.grids.length) throw new Error(`${COLLISION_MANIFEST}: not a version this build reads`);
  return Promise.all(
    m.grids.map(async (g) => {
      const r = await fetch(base + g.file);
      if (!r.ok) throw new Error(`${g.file}: ${r.status}`);
      const bytes = await gunzip(new Uint8Array(await r.arrayBuffer()));
      const v = new Int16Array(decodeGridPlanes(bytes, g.nx, g.ny));
      if (v.length !== g.nx * g.ny) throw new Error(`${g.file}: ${v.length} cells, expected ${g.nx * g.ny}`);
      return { e0: g.e0, n0: g.n0, cell: g.cell, nx: g.nx, ny: g.ny, h: int16ToHeights(v, m.scale, m.nodata) } satisfies Grid;
    }),
  );
}
