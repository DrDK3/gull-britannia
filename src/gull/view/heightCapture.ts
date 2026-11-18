/**
 * The solid town, read from the picture: the Dart scene's fixed scenery (ground, quays, buildings, walls, steps,
 * masts, the station, the fort) is drawn once from straight above into an off-screen target, with a shader that
 * writes each surface's height instead of its colour, and read back into height grids (src/gull/game/world.ts).
 * A roof the player sees is a roof the gull lands on; a gap between two houses is a gap the gull can fly down.
 *
 * Each grid cell takes the highest of several samples (supersampled), so thin things (a mast, a railing, a
 * lamp post) are not missed. People and moving cars are left out (they move), and so are the trees, which are
 * built around the camera as it moves: their crowns are added from the woodland's own plan instead.
 */
import * as THREE from 'three';
import type { DartScene } from '../../render/dart';
import type { Grid } from '../game/world';

export interface CaptureArea {
  e0: number;
  n0: number;
  e1: number;
  n1: number;
  /** Grid cell (m). */
  cell: number;
  /** Samples per cell along each side (the cell keeps the highest). */
  ss: number;
}

/** Objects that move, or are not solid, by name (src/render/population.ts and friends). */
const SKIP = new Set(['cars', 'walkers', 'people-on-quays', 'people-on-pontoons', 'woodland']);

const OFFSET = 100;
const SCALE = 1000;

const material = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying float vY;
      void main() {
        float v = floor(clamp((vY + ${OFFSET.toFixed(1)}) * ${SCALE.toFixed(1)}, 1.0, 16777000.0));
        float r = floor(v / 65536.0);
        float g = floor((v - r * 65536.0) / 256.0);
        float b = v - r * 65536.0 - g * 256.0;
        gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
      }`,
  });

/** Decode one read-back pixel to a height (m ODN), or NaN where nothing was drawn. */
export function decodeHeight(r: number, g: number, b: number, a: number): number {
  if (a < 128) return NaN;
  return (r * 65536 + g * 256 + b) / SCALE - OFFSET;
}

/** Encode a height as the shader does (for tests). */
export function encodeHeight(h: number): [number, number, number, number] {
  const v = Math.floor(Math.min(16777000, Math.max(1, (h + OFFSET) * SCALE)));
  const r = Math.floor(v / 65536);
  const g = Math.floor((v - r * 65536) / 256);
  return [r, g, v - r * 65536 - g * 256, 255];
}

/** Keep the highest sample in each cell of `grid` from a tile of read-back pixels. */
export function foldTile(grid: Grid, px: Uint8Array, w: number, h: number, ss: number, ci0: number, cj0: number): void {
  const cw = Math.floor(w / ss);
  const ch = Math.floor(h / ss);
  for (let cj = 0; cj < ch; cj++) {
    const gj = cj0 + cj;
    if (gj < 0 || gj >= grid.ny) continue;
    for (let ci = 0; ci < cw; ci++) {
      const gi = ci0 + ci;
      if (gi < 0 || gi >= grid.nx) continue;
      let top = NaN;
      for (let y = 0; y < ss; y++) {
        let k = ((cj * ss + y) * w + ci * ss) * 4;
        for (let x = 0; x < ss; x++, k += 4) {
          const v = decodeHeight(px[k]!, px[k + 1]!, px[k + 2]!, px[k + 3]!);
          if (v === v && !(v <= top)) top = v;
        }
      }
      const idx = gj * grid.nx + gi;
      const old = grid.h[idx]!;
      if (top === top && !(top <= old)) grid.h[idx] = top;
    }
  }
}

/** Raise the cells under each tree's crown to its top (the trees are drawn later, near the camera). */
export function addTrees(grid: Grid, trees: readonly { e: number; n: number; ground: number; crown: number; h: number; conifer: boolean }[]): void {
  for (const t of trees) {
    const r = t.crown * (t.conifer ? 0.3 : 0.38);
    const top = t.ground + t.h * 0.94;
    const i0 = Math.floor((t.e - r - grid.e0) / grid.cell);
    const i1 = Math.floor((t.e + r - grid.e0) / grid.cell);
    const j0 = Math.floor((t.n - r - grid.n0) / grid.cell);
    const j1 = Math.floor((t.n + r - grid.n0) / grid.cell);
    for (let j = Math.max(0, j0); j <= Math.min(grid.ny - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(grid.nx - 1, i1); i++) {
        const ce = grid.e0 + (i + 0.5) * grid.cell;
        const cn = grid.n0 + (j + 0.5) * grid.cell;
        if (Math.hypot(ce - t.e, cn - t.n) > r + grid.cell * 0.5) continue;
        const k = j * grid.nx + i;
        if (!(grid.h[k]! >= top)) grid.h[k] = top;
      }
    }
  }
}

/**
 * Capture the Dart scene's fixed scenery over `areas` (finest last is fine: the world picks the finest grid that
 * covers a point). Call before the scene is added to the view, or with it in place: the group is lent to a scene
 * of its own for the capture and put back.
 */
export async function captureHeights(renderer: THREE.WebGLRenderer, dart: DartScene, areas: readonly CaptureArea[], onProgress?: (done: number, total: number) => void): Promise<Grid[]> {
  const TILE = Math.min(1024, renderer.capabilities.maxTextureSize);
  const target = new THREE.WebGLRenderTarget(TILE, TILE, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const scene = new THREE.Scene();
  const mat = material();
  scene.overrideMaterial = mat;
  const fixed = dart.fixed;
  const parent = fixed.parent;
  const y0 = fixed.position.y;
  scene.add(fixed);
  fixed.position.y = 0;
  // Hide what moves or is not solid, and draw every LOD at its finest.
  const restore: (() => void)[] = [];
  fixed.traverse((o) => {
    if (SKIP.has(o.name) || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
      const v = o.visible;
      o.visible = false;
      restore.push(() => (o.visible = v));
    }
    const lod = o as THREE.LOD;
    if (lod.isLOD) {
      const auto = lod.autoUpdate;
      const vis = lod.levels.map((l) => l.object.visible);
      lod.autoUpdate = false;
      lod.levels.forEach((l, i) => (l.object.visible = i === 0));
      restore.push(() => {
        lod.autoUpdate = auto;
        lod.levels.forEach((l, i) => (l.object.visible = vis[i]!));
      });
    }
  });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  camera.up.set(0, 0, -1);
  const px = new Uint8Array(TILE * TILE * 4);
  const grids: Grid[] = [];
  const jobs: { grid: Grid; a: CaptureArea; ti: number; tj: number }[] = [];
  for (const a of areas) {
    const nx = Math.ceil((a.e1 - a.e0) / a.cell);
    const ny = Math.ceil((a.n1 - a.n0) / a.cell);
    const grid: Grid = { e0: a.e0, n0: a.n0, cell: a.cell, nx, ny, h: new Float32Array(nx * ny).fill(NaN) };
    grids.push(grid);
    const cellsPerTile = Math.floor(TILE / a.ss);
    for (let tj = 0; tj < ny; tj += cellsPerTile) for (let ti = 0; ti < nx; ti += cellsPerTile) jobs.push({ grid, a, ti, tj });
  }
  try {
    let done = 0;
    for (const { grid, a, ti, tj } of jobs) {
      const span = Math.floor(TILE / a.ss) * a.cell;
      const te0 = a.e0 + ti * a.cell;
      const tn0 = a.n0 + tj * a.cell;
      camera.left = 0;
      camera.right = span;
      camera.bottom = 0;
      camera.top = span;
      camera.updateProjectionMatrix();
      // Camera at the tile's south-west corner, looking straight down, north up the picture.
      camera.position.set(te0, 2000, -tn0);
      camera.lookAt(te0, 0, -tn0);
      camera.updateMatrixWorld();
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, TILE, TILE, px);
      foldTile(grid, px, TILE, TILE, a.ss, ti, tj);
      onProgress?.(++done, jobs.length);
      // Let the page breathe between tiles (a software renderer takes a while over each).
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.enabled = prevShadow;
    for (const r of restore) r();
    fixed.position.y = y0;
    scene.remove(fixed);
    if (parent) parent.add(fixed);
    target.dispose();
    mat.dispose();
  }
  const wood = dart.woodland;
  if (wood) for (const g of grids) addTrees(g, wood.treesIn(g.e0, g.n0, g.e0 + g.nx * g.cell, g.n0 + g.ny * g.cell));
  return grids;
}
