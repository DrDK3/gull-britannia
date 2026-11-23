/**
 * Bakes the collision world: opens the built game in headless Chromium with `?bake`, lets it read the town's solid
 * shape from the picture at full scenery detail (src/gull/view/heightCapture.ts), and writes the height grids to
 * public/geo/ as packed Int16 files plus collision.json (src/gull/view/collisionData.ts).
 *
 *   npm run build && npm run bake:collision && npm run build
 *
 * Run it again whenever the fixed scenery changes (a SailSim update, the 1967 removal list, the capture areas).
 * The files are committed, so players and CI never run the survey.
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium, type Browser } from 'playwright';
import { GRID_PACKING, encodeGridPlanes } from '../src/sim/geo/pack';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4600 + Math.floor(Math.random() * 300);
const NAMES: Record<string, string> = { '0.5': 'collision-town.i16z', '2': 'collision-harbour.i16z' };

function waitFor(url: string, ms: number): Promise<void> {
  const t0 = Date.now();
  return new Promise((ok, fail) => {
    const retry = () => (Date.now() - t0 > ms ? fail(new Error(`no answer from ${url}`)) : setTimeout(tick, 300));
    const tick = () => {
      get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) ok();
        else retry();
      }).on('error', retry);
    };
    tick();
  });
}

async function launch(): Promise<Browser> {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  try {
    return await chromium.launch({ args });
  } catch (e) {
    if (!exe) throw e;
    return chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
  }
}

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
try {
  const url = `http://127.0.0.1:${PORT}/`;
  await waitFor(url, 20000);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}?bake`);
  await page.waitForFunction(() => ['title', 'error'].includes((window as unknown as { __gull?: { game: { state: { screen: string } } } }).__gull?.game.state.screen ?? ''), null, { timeout: 600000, polling: 500 });
  const out = await page.evaluate(() => {
    const g = (window as unknown as { __gull: { game: { state: { screen: string; error?: string }; collisionSource: string; exportCollision(): { e0: number; n0: number; cell: number; nx: number; ny: number; b64: string }[] } } }).__gull.game;
    return { screen: g.state.screen, error: g.state.error, source: g.collisionSource, grids: g.exportCollision() };
  });
  await browser.close();
  if (out.screen !== 'title' || out.source !== 'surveyed' || !out.grids.length) throw new Error(`the game did not survey the town (${out.screen}, ${out.source}, ${out.error ?? ''})`);
  const grids = out.grids.map((g) => {
    const bytes = Buffer.from(g.b64, 'base64');
    const values = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    if (values.length !== g.nx * g.ny) throw new Error(`grid ${g.cell} m: ${values.length} cells, expected ${g.nx * g.ny}`);
    const file = NAMES[String(g.cell)] ?? `collision-${g.cell}m.i16z`;
    const packed = gzipSync(encodeGridPlanes(new Int16Array(values), g.nx, g.ny), { level: 9 });
    writeFileSync(join(root, 'public/geo', file), packed);
    let empty = 0;
    for (const v of values) if (v === -32768) empty++;
    console.log(`${file}: ${g.nx} × ${g.ny} cells of ${g.cell} m, ${(packed.length / 1024).toFixed(0)} kB packed (${((values.length * 2) / 1024).toFixed(0)} kB raw), ${empty} empty cells`);
    return { file, e0: g.e0, n0: g.n0, cell: g.cell, nx: g.nx, ny: g.ny };
  });
  const manifest = { version: 1, generated: new Date().toISOString(), scale: 0.01, nodata: -32768, packing: GRID_PACKING, order: 'row-major, rows south to north, cell centres at e0 + (i + 0.5)·cell; heights are the top of what is drawn, cm above Ordnance Datum Newlyn', grids };
  writeFileSync(join(root, 'public/geo/collision.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`collision.json written (${statSync(join(root, 'public/geo/collision.json')).size} bytes). Rebuild to ship it.`);
} finally {
  server.kill();
}
