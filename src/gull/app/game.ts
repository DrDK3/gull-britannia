/**
 * The game controller: loads the River Dart (SailSim's data and scene, taken back to 1967), reads the town's solid
 * shape from the picture, and runs the current mission at a fixed 60 Hz with the view interpolated between steps.
 * Screens: loading → title → briefing → playing (pause) → results. Input is the keyboard and the mouse (pointer
 * lock), with the arrow keys to look. The React UI subscribes to `state`.
 */
import * as THREE from 'three';
import { loadDartData, type DartData } from '../../app/geoLoader';
import { DartScene } from '../../render/dart';
import { DynamicResolution } from '../../render/dynamicResolution';
import { presetSettings, type GraphicsPreset } from '../../render/graphics';
import { buildConditions, DEFAULT_CONDITIONS, type BuiltConditions } from '../../sim/env/conditions';
import { sunPosition } from '../../sim/env/sun';
import { RDYC_ORIGIN } from '../../sim/geo/projection';
import { presetSky } from '../../sim/env/sky';
import { FreeFlight } from '../game/free';
import { GuardState } from '../game/guard';
import { Mode, NO_CONTROLS, type GullControls } from '../game/gull';
import { Mission1 } from '../game/m1';
import { Mission2 } from '../game/m2';
import { AllyState } from '../game/parade';
import type { Mission, MissionEvent, Results, Tone } from '../game/mission';
import { World } from '../game/world';
import { data1967 } from '../view/era1967';
import { GullModel } from '../view/gullModel';
import { CAMERA_LABEL, GULL_CAMERAS, GullScene, type GullCamera, type GullPose } from '../view/gullScene';
import { captureHeights, type CaptureArea } from '../view/heightCapture';
import { MissionView } from '../view/missionView';
import { GameAudio } from './audio';
import { BRIEFINGS, OPERATIONS, type Briefing } from './briefings';
import { loadProgress, saveProgress, type Progress } from './progress';
import { loadSettings, saveSettings, type Settings } from './settings';

const DT = 1 / 60;
const MAX_STEPS = 6;

/** The play area: Dartmouth, the harbour and Kingswear (local metres). */
export const PLAY_BOUNDS = { eMin: -1150, eMax: 550, nMin: -750, nMax: 1350 };
/** Collision grids: 2 m over the play area, 0.5 m over the old town and the quays. */
export const CAPTURE_AREAS: CaptureArea[] = [
  { e0: -1200, n0: -800, e1: 600, n1: 1400, cell: 2, ss: 2 },
  { e0: -640, n0: -80, e1: -200, n1: 640, cell: 0.5, ss: 2 },
];

/** A June afternoon in 1967: high water a little after one, a light south-westerly, fair skies. */
export const START_TIME = '1967-06-03T12:20:00Z';
const CONDITIONS = {
  ...DEFAULT_CONDITIONS,
  startTime: START_TIME,
  weather: { source: 'manual' as const, twsKn: 9, twdDeg: 235 },
  gusts: { preset: 'steady' as const, seed: 1967 },
  tide: { mode: 'manual' as const, hwTime: '1967-06-03T12:05:00Z', hwHeightM: 4.7, lwHeightM: 0.9 },
  sky: { source: 'preset' as const, preset: 'fair' as const },
};

export type Screen = 'loading' | 'title' | 'briefing' | 'playing' | 'results' | 'error';

export interface HudState {
  speedKmh: number;
  altitude: number;
  mode: string;
  payload: number;
  maxPayload: number;
  heading: number;
  drop?: { x: number; y: number; onTarget: boolean };
  /** The objective marker's direction when it is off screen (rad, 0 = up, clockwise). */
  offscreen?: number;
  beak?: string;
}

export interface GuardOverlay {
  id: string;
  x: number;
  y: number;
  name?: string;
  routine?: string;
  state: string;
  /** 0…1 */
  suspicion: number;
  icon: '' | '?' | '!' | '…';
  speech?: string;
  tag?: number;
}

export interface GameState {
  screen: Screen;
  progress: string;
  error?: string;
  issues: string[];
  locked: boolean;
  paused: boolean;
  camera: GullCamera;
  cameraLabel: string;
  hud: HudState;
  settings: Settings;
  fps: number;
  operation?: string;
  operationTitle?: string;
  briefing?: Briefing;
  objectives: { id: string; text: string; state: string; optional: boolean }[];
  prompt: string;
  score: number;
  tension: number;
  radio?: { speaker: string; text: string; id: number };
  toasts: { id: number; text: string; tone: Tone }[];
  banner?: { text: string; tone: Tone; id: number };
  overlays: GuardOverlay[];
  results?: Results;
  saved: Progress;
  /** SailSim's graphics preset ('custom' when changed by hand there). */
  graphics: string;
}

const KEYS: Record<string, keyof GullControls> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'flap',
  ShiftLeft: 'dive',
  ShiftRight: 'dive',
  KeyR: 'land',
};

export class GullGame {
  view?: GullScene;
  dart?: DartScene;
  data?: DartData;
  world?: World;
  conditions?: BuiltConditions;
  mission?: Mission;
  missionView?: MissionView;
  readonly model = new GullModel();
  readonly audio = new GameAudio();
  settings: Settings = loadSettings();
  /** Run time (s) since the scene started (the clock, the tide). */
  time = 0;
  /** Tests and screenshots: hold the game still without the pause menu. */
  frozen = false;
  private readonly listeners = new Set<() => void>();
  private st: GameState;
  private readonly keys = new Set<string>();
  private mouseScout = false;
  private poopHeld = false;
  private accumulator = 0;
  private lastFrame = 0;
  private raf = 0;
  private prev = { e: 0, n: 0, h: 0, yaw: 0 };
  private readonly dropRing: THREE.Mesh;
  private dropOnTarget = false;
  private readonly dynRes = new DynamicResolution();
  private fpsAcc = { n: 0, t: 0, fps: 0 };
  private publishT = 0;
  private resizeObs?: ResizeObserver;
  private seq = 0;
  private radioTimer = 0;
  private bannerTimer = 0;
  private readonly radioQueue: { speaker: string; text: string; dur: number }[] = [];
  private readonly toastTimers = new Map<number, number>();
  private titleT = 0;

  constructor() {
    this.st = {
      screen: 'loading',
      progress: 'Loading the River Dart…',
      issues: [],
      locked: false,
      paused: false,
      camera: 'chase',
      cameraLabel: CAMERA_LABEL.chase,
      hud: { speedKmh: 0, altitude: 0, mode: '', payload: 3, maxPayload: 3, heading: 0 },
      settings: this.settings,
      fps: 0,
      objectives: [],
      prompt: '',
      score: 0,
      tension: 0,
      toasts: [],
      overlays: [],
      saved: loadProgress(),
      graphics: 'balanced',
    };
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    ring.visible = false;
    this.dropRing = ring;
  }

  // ------------------------------------------------------------------ state for the UI

  get state(): GameState {
    return this.st;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private publish(patch: Partial<GameState> = {}): void {
    this.st = { ...this.st, ...patch };
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------------ start-up

  async attach(container: HTMLElement): Promise<void> {
    const dataP = loadDartData(`${import.meta.env.BASE_URL}geo/`);
    let view: GullScene;
    try {
      view = new GullScene(container);
    } catch (e) {
      this.publish({ screen: 'error', error: `WebGL could not start: ${(e as Error).message}` });
      return;
    }
    this.view = view;
    this.publish({ graphics: view.graphics.preset });
    view.game.add(this.model.root, this.dropRing);
    view.viewModel.add(this.model.viewBeak());
    view.viewModel.visible = false;
    this.applySettings(this.settings);
    this.resizeObs = new ResizeObserver(() => view.resize(container.clientWidth, container.clientHeight));
    this.resizeObs.observe(container);
    this.bindInput(container);
    const data = data1967(await dataP);
    this.data = data;
    const issues = data.issues.map((i) => `${i.asset}: ${i.message} (${i.effect})`);
    if (!data.geo || !data.manifest) {
      this.publish({ screen: 'error', error: 'The River Dart data could not be loaded.', issues });
      return;
    }
    this.conditions = buildConditions(CONDITIONS, data.geo);
    const dart = new DartScene({ manifest: data.manifest, geo: data.geo, features: data.features, drape: data.drape, town: data.town, waterMask: data.waterMask, roads: data.roads, quays: data.quays, detail: view.quality, era: '1967' });
    this.dart = dart;
    this.publish({ progress: 'Surveying the rooftops…', issues });
    const grids = await captureHeights(view.renderer, dart, CAPTURE_AREAS, (d, n) => this.publish({ progress: `Surveying the rooftops… ${Math.round((100 * d) / n)}%` }));
    view.setDart(dart);
    // People and props stand on what is drawn (quay tops and pavements sit up to a metre above SailSim's terrain),
    // but not on roofs or treetops overhead.
    const ground = (e: number, n: number) => {
      const g = dart.groundAt(e, n);
      const top = this.world ? this.world.cellTop(e, n) : g;
      return top > g && top < g + 1.2 ? top : g;
    };
    this.world = new World({ grids, waterLevel: this.waterLevel(), beyond: (e, n) => dart.groundAt(e, n), ground, bounds: PLAY_BOUNDS });
    view.setWeather(this.sceneWeather());
    this.publish({ progress: 'Compiling shaders…' });
    this.titleCamera(0);
    this.renderFrame(0);
    await view.warmUp().catch(() => undefined);
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.audio.music('title');
    this.publish({ screen: 'title', progress: '' });
  }

  waterLevel(): number {
    return this.conditions?.env.waterLevel?.(this.time) ?? 2;
  }

  epochMs(): number {
    return Date.parse(START_TIME) + this.time * 1000;
  }

  private sceneWeather() {
    const sun = sunPosition(this.epochMs(), RDYC_ORIGIN.lat, RDYC_ORIGIN.lon);
    return { sky: (this.conditions?.env.sky ?? presetSky('fair')).at(this.time), sunElevationDeg: sun.elevationDeg, sunAzimuthDeg: sun.azimuthDeg };
  }

  // ------------------------------------------------------------------ screens

  /** The title and briefing screens: a slow flight round the harbour. */
  private titleCamera(dt: number): void {
    this.titleT += dt * (this.settings.reducedMotion ? 0.3 : 1);
    const a = this.titleT * 0.025 + 2.2;
    const c = { e: -300, n: 260 };
    this.view?.freeCamera([c.e + Math.sin(a) * 230, c.n + Math.cos(a) * 230, 75], [c.e, c.n - 40, 10]);
  }

  showBriefing(id: string): void {
    const op = OPERATIONS.find((o) => o.id === id);
    if (!op?.playable) return;
    this.audio.unlock();
    this.publish({ screen: 'briefing', operation: id, operationTitle: op.title, briefing: BRIEFINGS[id], results: undefined });
  }

  /** Start (or restart) an operation; 'free' for free flight. */
  startOperation(id: string): void {
    const world = this.world;
    const view = this.view;
    if (!world || !view) return;
    this.audio.unlock();
    this.endMission();
    world.solids.splice(0, world.solids.length);
    world.waterLevel = this.waterLevel();
    const m: Mission = id === 'm1' ? new Mission1(world).init() : id === 'm2' ? new Mission2(world).init() : new FreeFlight(world).init();
    this.mission = m;
    this.missionView = new MissionView(m, (e, n, h, out) => view.toScene(e, n, h, out));
    view.game.add(this.missionView.group);
    this.snapPrev();
    this.keys.clear();
    this.poopHeld = this.mouseScout = false;
    this.radioQueue.length = 0;
    this.radioTimer = 0;
    this.setCamera(this.st.camera === 'scenic' || this.st.camera === 'orbit' ? 'chase' : this.st.camera);
    m.start();
    this.drainEvents();
    this.publish({ screen: 'playing', operation: id, operationTitle: m.title, paused: false, results: undefined, toasts: [], banner: undefined });
    void this.lockPointer();
  }

  private endMission(): void {
    this.missionView?.dispose();
    this.missionView = undefined;
    this.mission = undefined;
    this.audio.stopAll();
  }

  /** Abandon to the title screen. */
  toTitle(): void {
    this.endMission();
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.music('title');
    this.publish({ screen: 'title', paused: false, results: undefined, radio: undefined, toasts: [], banner: undefined, overlays: [] });
  }

  restart(): void {
    this.startOperation(this.st.operation ?? 'free');
  }

  private onFinished(r: Results): void {
    const saved: Progress = { done: [...this.st.saved.done], best: { ...this.st.saved.best } };
    if (!saved.done.includes(r.missionId)) saved.done.push(r.missionId);
    const best = saved.best[r.missionId];
    if (!best || r.total > best.total) saved.best[r.missionId] = { total: r.total, grade: r.grade };
    saveProgress(saved);
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.music('results');
    this.publish({ screen: 'results', results: r, saved, radio: undefined, overlays: [] });
  }

  // ------------------------------------------------------------------ input

  private bindInput(container: HTMLElement): void {
    const canvas = this.view!.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.st.screen === 'playing' && !this.st.paused && document.pointerLockElement !== canvas) void this.lockPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.st.locked && this.st.screen === 'playing') this.setPaused(true);
      this.publish({ locked });
    });
    document.addEventListener('mousemove', (ev) => {
      if (document.pointerLockElement !== canvas || this.st.paused || !this.mission) return;
      const k = this.settings.sensitivity / 1000;
      this.mission.gull.look(ev.movementX * k, -ev.movementY * k * (this.settings.invertY ? -1 : 1));
    });
    document.addEventListener('mousedown', (ev) => {
      if (document.pointerLockElement !== canvas) return;
      if (ev.button === 0) this.poopHeld = true;
      if (ev.button === 2) this.mouseScout = true;
    });
    document.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) this.poopHeld = false;
      if (ev.button === 2) this.mouseScout = false;
    });
    container.addEventListener('contextmenu', (ev) => ev.preventDefault());
    container.addEventListener(
      'wheel',
      (ev) => {
        this.view?.zoom(ev.deltaY);
        ev.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (ev) => {
      if ((ev.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      if (this.st.screen !== 'playing') return;
      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        this.setPaused(!this.st.paused);
        return;
      }
      if (this.st.paused) return;
      if (ev.code in KEYS || ev.code.startsWith('Arrow') || ev.code === 'F1') ev.preventDefault();
      if (ev.repeat) return;
      this.keys.add(ev.code);
      const m = this.mission;
      switch (ev.code) {
        case 'KeyC':
          this.cycleCamera();
          break;
        case 'KeyQ':
          this.poopHeld = true;
          break;
        case 'KeyE':
          m?.interact();
          break;
        case 'KeyF':
          m?.eat();
          break;
        case 'KeyG':
          m?.signal();
          break;
        case 'KeyH':
        case 'F1':
          this.updateSettings({ showControls: !this.settings.showControls });
          break;
      }
    });
    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
      if (ev.code === 'KeyQ') this.poopHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.poopHeld = this.mouseScout = false;
    });
  }

  async lockPointer(): Promise<void> {
    const canvas = this.view?.renderer.domElement;
    if (!canvas || document.pointerLockElement === canvas) return;
    try {
      await canvas.requestPointerLock();
    } catch {
      /* the browser refused (e.g. too soon after leaving): a click tries again */
    }
  }

  setPaused(paused: boolean): void {
    if (paused === this.st.paused) return;
    this.keys.clear();
    this.poopHeld = this.mouseScout = false;
    if (paused && document.pointerLockElement) document.exitPointerLock();
    this.lastFrame = performance.now();
    this.publish({ paused });
  }

  resume(): void {
    this.setPaused(false);
    void this.lockPointer();
  }

  cycleCamera(): void {
    const i = GULL_CAMERAS.indexOf(this.st.camera);
    this.setCamera(GULL_CAMERAS[(i + 1) % GULL_CAMERAS.length]!);
  }

  setCamera(mode: GullCamera): void {
    this.view?.setCameraMode(mode);
    this.publish({ camera: mode, cameraLabel: CAMERA_LABEL[mode] });
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applySettings(this.settings);
    this.publish({ settings: this.settings });
  }

  /** SailSim's graphics presets: Smooth, Balanced, Ultra (scenery detail and shadow size apply on reload). */
  setGraphicsPreset(p: GraphicsPreset): void {
    const v = this.view;
    if (!v) return;
    v.applyGraphics(presetSettings(p, v.graphics.cameraMotion), true);
    this.dynRes.reset(performance.now());
    v.setDynamicScale(1);
    this.publish({ graphics: p });
  }

  private applySettings(s: Settings): void {
    this.audio.setVolumes(s.master, s.music, s.effects);
    const v = this.view;
    if (!v) return;
    v.reducedMotion = s.reducedMotion;
    v.baseFov = s.fov;
  }

  private controls(): GullControls {
    const c = { ...NO_CONTROLS };
    for (const k of this.keys) {
      const m = KEYS[k];
      if (m) c[m] = true;
    }
    c.scout = this.mouseScout;
    return c;
  }

  // ------------------------------------------------------------------ the loop

  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const raw = (now - this.lastFrame) / 1000;
    const dt = Math.max(0, Math.min(0.1, raw));
    this.lastFrame = now;
    const screen = this.st.screen;
    if (screen === 'playing' && !this.st.paused && !this.frozen) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS) {
        this.snapPrev();
        this.step(DT);
        this.accumulator -= DT;
        steps++;
      }
      if (steps >= MAX_STEPS) this.accumulator = 0;
    } else if (!this.frozen && (screen === 'title' || screen === 'briefing' || screen === 'results')) {
      this.time += dt;
      this.titleCamera(dt);
    }
    this.uiTimers(dt);
    this.renderFrame(dt);
    this.afterDraw(now, raw * 1000);
    this.fpsAcc.n++;
    this.fpsAcc.t += raw;
    if (this.fpsAcc.t >= 1) {
      this.fpsAcc.fps = this.fpsAcc.n / this.fpsAcc.t;
      this.fpsAcc = { n: 0, t: 0, fps: this.fpsAcc.fps };
    }
  };

  private afterDraw(now: number, frameMs: number): void {
    if (this.st.paused || this.st.screen !== 'playing') {
      this.dynRes.skipWindow(now);
      return;
    }
    const a = this.dynRes.frame(now, frameMs);
    if (a?.kind === 'scale') {
      this.view?.setDynamicScale(a.scale);
      this.dynRes.skipWindow(performance.now());
    }
  }

  private snapPrev(): void {
    const g = this.mission?.gull;
    if (g) this.prev = { e: g.pos.e, n: g.pos.n, h: g.pos.h, yaw: g.yaw };
  }

  /** One fixed step of the game. */
  step(dt: number): void {
    const world = this.world;
    const m = this.mission;
    if (!world || !m) return;
    this.time += dt;
    world.waterLevel = this.waterLevel();
    const g = m.gull;
    const lookRate = 1.6 * dt;
    const ay = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const ap = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    if (ay || ap) g.look(ay * lookRate, ap * lookRate * (this.settings.invertY ? -1 : 1));
    m.step(dt, this.controls(), this.poopHeld);
    this.drainEvents();
  }

  private drainEvents(): void {
    const m = this.mission;
    if (!m) return;
    const ev = m.gull.events;
    if (ev.flap) this.audio.play('flap', undefined, -8, 0.9 + Math.random() * 0.2);
    if (ev.land) this.audio.play('land', undefined, -6);
    if (ev.splash) this.audio.play('splash', undefined, -4);
    if (ev.bonk) this.audio.play('bonk', undefined, -2);
    if (ev.skim) this.audio.play('skim', undefined, -6);
    if (ev.poop) this.audio.play('poop', undefined, -8);
    m.gull.events = { flap: false, land: false, splash: false, bonk: false, skim: false, poop: false };
    for (const e of m.takeEvents()) this.onMissionEvent(e);
  }

  private onMissionEvent(e: MissionEvent): void {
    switch (e.type) {
      case 'radio':
        this.radioQueue.push(e);
        if (this.radioTimer <= 0) this.nextRadio();
        break;
      case 'toast': {
        const id = ++this.seq;
        this.toastTimers.set(id, 3.2);
        this.publish({ toasts: [...this.st.toasts.slice(-4), { id, text: e.text, tone: e.tone }] });
        break;
      }
      case 'banner':
        this.bannerTimer = e.dur;
        this.publish({ banner: { text: e.text, tone: e.tone, id: ++this.seq } });
        break;
      case 'sfx':
        this.audio.play(e.name, e.at, e.gain ?? 0, e.rate ?? 1);
        break;
      case 'loop':
        this.audio.loop(e.name, e.on, e.gain ?? 0);
        break;
      case 'music':
        this.audio.music(e.name);
        break;
      case 'splat':
        this.missionView?.onEvent(e);
        break;
      case 'finished':
        this.onFinished(e.results);
        break;
    }
  }

  private nextRadio(): void {
    const r = this.radioQueue.shift();
    if (!r) {
      this.radioTimer = 0;
      if (this.st.radio) this.publish({ radio: undefined });
      return;
    }
    this.radioTimer = r.dur;
    this.publish({ radio: { speaker: r.speaker, text: r.text, id: ++this.seq } });
  }

  private uiTimers(dt: number): void {
    if (this.st.paused) return;
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) this.nextRadio();
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.publish({ banner: undefined });
    }
    if (this.toastTimers.size) {
      let changed = false;
      for (const [id, t] of this.toastTimers) {
        const left = t - dt;
        if (left <= 0) {
          this.toastTimers.delete(id);
          changed = true;
        } else this.toastTimers.set(id, left);
      }
      if (changed) this.publish({ toasts: this.st.toasts.filter((x) => this.toastTimers.has(x.id)) });
    }
  }

  // ------------------------------------------------------------------ drawing

  private pose(alpha: number): GullPose {
    const g = this.mission!.gull;
    const p = this.prev;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    let dy = g.yaw - p.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return {
      e: lerp(p.e, g.pos.e),
      n: lerp(p.n, g.pos.n),
      h: lerp(p.h, g.pos.h),
      yaw: p.yaw + dy * alpha,
      pitch: g.pitch,
      speed: g.speed(),
      yawRate: g.yawRate,
      airborne: g.isAirborne(),
      scouting: g.scouting,
      walking: g.mode === Mode.Ground && Math.hypot(g.vel.e, g.vel.n) > 0.3,
      tumbling: g.mode === Mode.Tumble,
      wide: this.mission!.allies.some((a) => a.state === AllyState.Follow),
    };
  }

  renderFrame(dt: number): void {
    const v = this.view;
    const world = this.world;
    if (!v || !world) return;
    const m = this.mission;
    const env = this.conditions?.env;
    const t = this.time;
    const wl = world.waterLevel;
    let pose: GullPose | undefined;
    this.model.root.visible = !!m && this.st.camera !== 'first';
    this.dropRing.visible = false;
    this.dropOnTarget = false;
    if (m) {
      const g = m.gull;
      pose = this.pose(Math.min(1, this.accumulator / DT));
      const grounded = g.mode === Mode.Ground;
      const floating = g.mode === Mode.Water;
      const at = v.toScene(pose.e, pose.n, grounded ? pose.h - 0.13 : floating ? wl + 0.06 : pose.h);
      const flatSpeed = Math.hypot(g.vel.e, g.vel.n);
      this.model.pose(at, pose.yaw, g.mode === Mode.Air ? Math.atan2(g.flyDir.h, Math.hypot(g.flyDir.e, g.flyDir.n)) : 0, { time: t, airborne: g.isAirborne(), flapPhase: g.flapPhase, flapping: g.flapping, braking: g.braking, diving: g.diving, tumbling: g.mode === Mode.Tumble, walk: grounded ? Math.min(1, flatSpeed / 2.4) : 0, walkPhase: g.walkPhase, floating, yawRate: g.yawRate, speed: g.speed() }, dt);
      this.missionView?.sync(dt, v.camera);
      if (this.settings.dropMarker) {
        const pred = g.predictDrop(world, (a, b) => m.poopTargetOnSegment(a, b)?.pos());
        if (pred) {
          v.toScene(pred.point.e, pred.point.n, pred.point.h + 0.05, this.dropRing.position);
          const d = Math.hypot(pred.point.e - g.pos.e, pred.point.n - g.pos.n, pred.point.h - g.pos.h);
          this.dropRing.scale.setScalar(Math.max(1, d / 12));
          this.dropRing.visible = true;
          this.dropOnTarget = pred.onTarget;
          (this.dropRing.material as THREE.MeshBasicMaterial).color.set(pred.onTarget ? 0xff5040 : 0xffffff);
        }
      }
      this.audio.setWind(g.isAirborne() ? g.speed() : 0);
    }
    const cam = v.camera.position;
    this.audio.listener = { e: cam.x, n: -cam.z, h: cam.y + wl };
    const wind = env?.wind(t, pose?.n ?? 260, pose?.e ?? -300);
    const dart = this.dart;
    const windFromDir = wind ? Math.atan2(-wind.e, -wind.n) : (235 * Math.PI) / 180;
    const windSpeed = wind ? Math.hypot(wind.n, wind.e) : 4.6;
    v.render(pose, {
      time: t,
      frameDt: dt,
      waterLevel: wl,
      windFromDir,
      windSpeed,
      windAt: env ? (n, e) => env.wind(t, n, e) : undefined,
      sea: env?.seaState ? (n, e) => env.seaState!(t, n, e) : undefined,
      groundAt: (e, n) => world.cellTop(e, n),
      dart: dart ? { waterLevel: wl, epochMs: this.epochMs(), stream: (n, e) => env?.current(t, n, e) ?? { n: 0, e: 0 }, windFromDir, windSpeed, showLabels: false } : undefined,
    });
    const now = performance.now();
    if (m && this.st.screen === 'playing' && now - this.publishT > 100) {
      this.publishT = now;
      this.publishHud(m);
    }
  }

  private publishHud(m: Mission): void {
    const v = this.view!;
    const g = m.gull;
    const world = this.world!;
    const ground = world.surfaceAt(g.pos.e, g.pos.n).h;
    let drop: HudState['drop'];
    if (this.dropRing.visible && this.dropOnTarget) {
      const p = this.dropRing.position;
      const s = v.screenOf(p.x, -p.z, p.y + world.waterLevel);
      if (!s.behind) drop = { x: s.x, y: s.y, onTarget: true };
    }
    let offscreen: number | undefined;
    const target = m.running ? m.currentTarget() : undefined;
    if (target) {
      const s = v.screenOf(target.e, target.n, target.h + 2.2);
      if (s.behind || Math.abs(s.x) > 0.95 || Math.abs(s.y) > 0.92) offscreen = s.behind ? Math.atan2(-s.x, -Math.abs(s.y) - 1) : Math.atan2(s.x, s.y);
    }
    const overlays: GuardOverlay[] = [];
    for (const gd of m.guards) {
      const head = gd.headPosition();
      const s = v.screenOf(head.e, head.n, head.h + 0.55);
      const d = Math.hypot(head.e - g.pos.e, head.n - g.pos.n, head.h - g.pos.h);
      if (s.behind || Math.abs(s.x) > 1.1 || Math.abs(s.y) > 1.1 || d > 90) continue;
      const st = gd.state;
      const icon = st === GuardState.Alert ? '!' : st === GuardState.Suspicious || st === GuardState.Investigate || st === GuardState.Search ? '?' : st === GuardState.Distracted ? '…' : '';
      overlays.push({ id: gd.id, x: s.x, y: s.y, name: gd.tagged ? gd.name : undefined, routine: gd.tagged ? gd.routineText : undefined, state: gd.stateName, suspicion: gd.suspicion / 100, icon, speech: gd.speech?.text, tag: g.scouting && !gd.tagged ? m.tagProgressOf(gd) : undefined });
    }
    for (const n of [...m.npcs, ...m.marchers]) {
      if (!n.speech) continue;
      const s = v.screenOf(n.pos.e, n.pos.n, n.pos.h + 2.1);
      if (s.behind || Math.abs(s.x) > 1.1 || Math.abs(s.y) > 1.1) continue;
      overlays.push({ id: n.id, x: s.x, y: s.y, state: '', suspicion: 0, icon: '', speech: n.speech.text });
      if (overlays.length > 14) break;
    }
    this.publish({
      hud: {
        speedKmh: g.speed() * 3.6,
        altitude: Math.max(0, g.pos.h - Math.max(ground, world.waterLevel) - 0.3),
        mode: g.modeName(),
        payload: g.payload,
        maxPayload: g.profile.maxPayload,
        heading: ((g.yaw * 180) / Math.PI + 360) % 360,
        drop,
        offscreen,
        beak: m.beak?.name,
      },
      objectives: m.objectives.filter((o) => o.state !== 'hidden').map((o) => ({ id: o.id, text: o.text, state: o.state, optional: o.optional })),
      prompt: m.prompt(),
      score: m.liveScore(),
      tension: m.tension,
      overlays,
      fps: this.fpsAcc.fps,
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.audio.dispose();
    this.view?.dispose();
  }
}
