/**
 * The art studio: one model, or a sheet of them, on neutral ground under the game's daylight, with no Dartmouth.
 * Served by the dev server only (studio.html is not part of the build):
 *
 *   npx vite --port 5310 --strictPort
 *   http://127.0.0.1:5310/studio.html?show=gull&pose=flap&t=0.3&view=side
 *
 * Address parameters:
 *   show   what to draw: see SUBJECTS in subjects.ts (gull, flockgull, soldier, borovsky, …, prop:table, vfx:splat)
 *   pose   its pose or animation (gull: glide, flap, bank, brake, dive, tumble, stand, walk, look, shuffle, preen,
 *          stretch, float, eat, call; people: any `anim` the game uses)
 *   t      animation time (s), or the phase of a cycle (0…1) for flap and walk
 *   view   front | back | side | side2 | three | rear | top | below | chase | far ("30 m away") | close
 *   bg     ground: neutral (default) | white (a whitewashed wall behind, to check the gull reads) | slate | water
 *   sheet  a named contact sheet (see SHEETS), or cells written out: sheet=gull:glide:three;gull:flap@0.3:side
 *   cols   columns in a sheet
 *   play   1 to run the clock (a real browser; screenshots want a still)
 *
 * It prints the draw calls and triangles of the last frame (also window.__studio, for scripts).
 */
import * as THREE from 'three';
import { SHEETS, makeSubject, type Subject } from './subjects';

declare global {
  interface Window {
    __studio?: { calls: number; triangles: number; ms: number; cells: number; ready: boolean };
  }
}

interface Cell {
  show: string;
  pose: string;
  t: number;
  view: string;
  label?: string;
}

const q = new URLSearchParams(location.search);
const BG = q.get('bg') ?? 'neutral';

function parseCells(): { cells: Cell[]; cols: number } {
  const sheet = q.get('sheet');
  const view = q.get('view') ?? 'three';
  if (!sheet) return { cells: [{ show: q.get('show') ?? 'gull', pose: q.get('pose') ?? '', t: Number(q.get('t') ?? 'NaN'), view }], cols: 1 };
  const spec = SHEETS[sheet] ?? sheet;
  const cells = spec
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [show = 'gull', poseT = '', v = view] = c.split('|');
      const [pose = '', tt] = poseT.split('@');
      return { show, pose, t: tt === undefined ? NaN : Number(tt), view: q.get('view') ?? v };
    });
  const cols = Number(q.get('cols')) || Math.ceil(Math.sqrt(cells.length * 1.6));
  return { cells, cols };
}

const stage = document.getElementById('stage')!;
const stats = document.getElementById('stats')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(stage.clientWidth, stage.clientHeight);
// As the game: ACES at 0.9, soft shadows.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xaebfca);
scene.background = SKY;
// The game's fair June day near noon (gullScene.ts applyWeather): a warm sun, and the sky's light from above.
// The sky's environment map is stood in for by a little more hemisphere light, to keep this page quick.
const sunDir = new THREE.Vector3(-0.42, 0.78, -0.46).normalize();
const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.95, 0.88), 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = 0.02;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.86, 0.9, 0.96), new THREE.Color(0.36, 0.34, 0.26), 0.85));

const GROUNDS: Record<string, number> = { neutral: 0x8f958c, white: 0xb9b5aa, slate: 0x56606a, water: 0x4d7c84 };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: GROUNDS[BG] ?? GROUNDS.neutral, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// A metre grid for scale, faint.
const grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.07;
grid.position.y = 0.002;
scene.add(grid);
const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 0.4), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.9 }));
wall.receiveShadow = true;
wall.visible = BG === 'white';
scene.add(wall);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 2000);
const holder = new THREE.Group();
scene.add(holder);

/** Place the camera for a view of a subject (its centre and the radius that frames it). */
function aim(view: string, s: Subject, aspect: number): void {
  const c = s.centre;
  const r = s.radius;
  camera.fov = 30;
  // Fit the radius in the smaller of the two angles.
  const half = (camera.fov * Math.PI) / 360;
  const fit = (r * 1.12) / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect)));
  let dir = new THREE.Vector3(0.62, 0.38, -0.69);
  let d = fit;
  wall.position.set(c.x, 15, c.z + 3.5);
  wall.rotation.y = 0;
  switch (view) {
    case 'front':
      dir.set(0, 0.08, -1);
      break;
    case 'back':
      dir.set(0, 0.12, 1);
      wall.position.set(c.x, 15, c.z - 3.5);
      break;
    case 'side':
      dir.set(-1, 0.06, 0);
      wall.position.set(c.x + 3.5, 15, c.z);
      wall.rotation.y = Math.PI / 2;
      break;
    case 'side2':
      dir.set(1, 0.06, 0);
      wall.position.set(c.x - 3.5, 15, c.z);
      wall.rotation.y = Math.PI / 2;
      break;
    case 'rear':
      dir.set(-0.55, 0.45, 0.7);
      wall.position.set(c.x, 15, c.z - 3.5);
      break;
    case 'top':
      dir.set(0, 1, 0.001);
      break;
    case 'below':
      dir.set(0.25, -0.9, -0.35);
      break;
    case 'close':
      dir.set(0.55, 0.2, -0.8);
      d = fit * 0.5;
      break;
    case 'chase':
      // The game's chase camera: 4.2 m behind along the view, a little above, 70° (gullScene.ts).
      camera.fov = 70;
      camera.position.set(c.x, c.y + 0.3 + 0.45 + 0.42, c.z + 4.2);
      camera.lookAt(c.x, c.y + 0.3, c.z - 8);
      wall.position.set(c.x, 15, c.z - 9);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return;
    case 'far':
      // Thirty metres away, as the game would show it.
      camera.fov = 70;
      dir.set(0.5, 0.25, -0.83);
      d = 30;
      wall.position.set(c.x, 15, c.z + 6);
      break;
    default:
      break;
  }
  dir = dir.normalize();
  camera.position.copy(c).addScaledVector(dir, d);
  camera.up.set(0, 1, 0);
  if (view === 'top') camera.up.set(0, 0, -1);
  camera.lookAt(c);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

const { cells, cols } = parseCells();
const rows = Math.ceil(cells.length / cols);
const subjects: Subject[] = [];
const labels: HTMLElement[] = [];
for (const c of cells) {
  const s = makeSubject(c.show, c.pose, c.t);
  s.object.visible = false;
  holder.add(s.object);
  subjects.push(s);
  if (cells.length > 1 || q.get('label')) {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = `${c.show}${c.pose ? ' · ' + c.pose : ''}${Number.isFinite(c.t) ? ' @' + c.t : ''}`;
    stage.appendChild(el);
    labels.push(el);
  }
}

const info = { calls: 0, triangles: 0 };
let clock = 0;

function draw(dt: number): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.clear();
  info.calls = 0;
  info.triangles = 0;
  const cw = Math.floor(w / cols);
  const ch = Math.floor(h / rows);
  const t0 = performance.now();
  cells.forEach((c, i) => {
    const s = subjects[i]!;
    if (dt > 0) s.advance?.(dt);
    for (const o of subjects) o.object.visible = o === s;
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    aim(c.view, s, cw / ch);
    s.beforeDraw?.(camera);
    sun.target.position.copy(s.centre);
    sun.position.copy(s.centre).addScaledVector(sunDir, 40);
    const sc = sun.shadow.camera;
    const sr = Math.max(1.5, s.radius * 1.6);
    sc.left = -sr;
    sc.right = sr;
    sc.top = sr;
    sc.bottom = -sr;
    sc.near = 1;
    sc.far = 90;
    sc.updateProjectionMatrix();
    renderer.setViewport(x, h - y - ch, cw, ch);
    renderer.setScissor(x, h - y - ch, cw, ch);
    renderer.setScissorTest(true);
    renderer.info.reset();
    renderer.render(scene, camera);
    info.calls += renderer.info.render.calls - (s.overhead ?? 0);
    info.triangles += renderer.info.render.triangles;
    const el = labels[i];
    if (el) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  });
  const ms = performance.now() - t0;
  // Each cell also draws the ground, the grid and (if shown) the wall, in the picture and in the shadow map.
  const base = cells.length * (2 + (wall.visible ? 1 : 0));
  const own = Math.max(0, info.calls - base);
  stats.textContent = `draw calls ${info.calls} (stage ${base}, models ${own}, shadow pass included) · triangles ${info.triangles} · ${ms.toFixed(0)} ms`;
  window.__studio = { calls: own, triangles: info.triangles, ms, cells: cells.length, ready: true };
}

renderer.info.autoReset = false;
draw(0);
console.log('[studio]', stats.textContent);

if (q.get('play')) {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    draw(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => {
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  draw(0);
});
void clock;
