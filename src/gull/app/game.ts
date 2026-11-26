/**
 * The game controller: loads the River Dart (SailSim's data and scene, taken back to 1967) and the baked solid town,
 * and runs the current mission at a fixed 60 Hz with the view interpolated between steps.
 *
 * Screens: loading → title → briefing → playing → results. While playing there is a gate:
 *
 *   READY ──click, Space or "keyboard only"──▶ FLYING ──Esc, P, lost mouse capture, hidden tab──▶ PAUSED ──Resume──▶ FLYING
 *
 * The mission's clock, guards, radio and timers run only in FLYING, so nothing happens before the player has control.
 *
 * Input goes through the input map (input.ts): keys, mouse buttons and a gamepad are bound to the player's actions
 * (game/actions.ts) and dispatched by kind, so this file names no key. The player steers with the captured mouse, the
 * arrow keys, the pointer's position (trackpad) or a stick.
 *
 * Everything the game says goes through the message bus (messages.ts), which gives each kind of message one fixed slot;
 * what to teach comes from the coach (game/coach.ts). The React UI subscribes to `state`.
 */
import * as THREE from 'three';
import { loadDartData, type DartData } from '../../app/geoLoader';
import { DartScene } from '../../render/dart';
import { DynamicResolution } from '../../render/dynamicResolution';
import { presetSettings, type GraphicsPreset } from '../../render/graphics';
import { buildConditions, DEFAULT_CONDITIONS, type BuiltConditions } from '../../sim/env/conditions';
import { presetSky } from '../../sim/env/sky';
import { sunPosition } from '../../sim/env/sun';
import { RDYC_ORIGIN } from '../../sim/geo/projection';
import { ACTIONS, formatActions, type ActionId, type ActionInfo } from '../game/actions';
import { Coach, tokenise } from '../game/coach';
import { GuardState } from '../game/guard';
import { Mode, NO_CONTROLS, type GullControls } from '../game/gull';
import { M1_CONDITIONS } from '../game/m1';
import type { Mission, MissionConditions, MissionEvent, ObjectiveState, Results } from '../game/mission';
import { conditionsFor, createMission } from '../game/operations';
import { AllyState } from '../game/parade';
import { World } from '../game/world';
import { gridToInt16, loadCollision } from '../view/collisionData';
import { data1967 } from '../view/era1967';
import { GullModel } from '../view/gullModel';
import { CAMERA_LABEL, GULL_CAMERAS, GullScene, type GullCamera, type GullPose } from '../view/gullScene';
import { captureHeights, type CaptureArea } from '../view/heightCapture';
import { MissionView } from '../view/missionView';
import { GameAudio } from './audio';
import { BRIEFINGS, OPERATIONS, type Briefing } from './briefings';
import { InputMap, loadBindings } from './input';
import { placeBox, type Box } from './labels';
import { MessageBus, type MessageView, type RadioPriority } from './messages';
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

export type Screen = 'loading' | 'title' | 'briefing' | 'playing' | 'results' | 'error';
/** While playing: waiting for the player to take control, in control, or in the pause menu. */
export type Gate = 'ready' | 'flying' | 'paused';
/** How the player steers: the mouse (captured) with the keyboard, or the keyboard alone (arrow keys look). */
export type InputMode = 'mouse' | 'keys';
/** The pause menu's pages. */
export type PauseTab = 'orders' | 'controls' | 'log' | 'settings';

export interface HudState {
  speedKmh: number;
  /** Height above the river (m): what the readout shows. It reads the same on a roof as passing over it. */
  height: number;
  /** Clear air underneath (m). */
  altitude: number;
  mode: string;
  payload: number;
  maxPayload: number;
  heading: number;
  drop?: { onTarget: boolean };
  beak?: string;
  /** The beak holds the operation's papers: a gull that guards look at twice. */
  beakIsMission?: boolean;
  /** How far away the current order's marker is (m), when it has one. */
  distance?: number;
  /** The marker's direction when it is off screen (rad, 0 = up, clockwise). */
  offscreen?: number;
  /** "Just a gull": how the gull looks to whoever thinks worst of it. The level in words, the main reason, 0 to 1. */
  conspicuous: { level: string; reason: string; value: number };
  /** The garrison's alert ladder: the rung (0 calm to 3 alarmed), its name, and how far up that rung (0 to 1). */
  alert: { level: number; name: string; progress: number };
  /** The clock from the fiction, while it runs: "Courier back", "13.30", and the seconds left. */
  deadline?: { label: string; clock: string; left: number };
  /**
   * Who is taking an interest: where each is from the way the gull looks (rad; 0 ahead, positive to the right) and how
   * strongly (0 to 1). Strongest first; people in nearly the same direction are shown as one.
   */
  noticers: { id: string; rel: number; strength: number; sees: boolean; alert: boolean }[];
}

const NO_STEALTH = { conspicuous: { level: 'just a gull', reason: 'just a gull', value: 0 }, alert: { level: 0, name: 'calm', progress: 0 }, noticers: [] } as const;

export interface GuardOverlay {
  id: string;
  name?: string;
  /** A tagged guard's routine, step by step, and which step he is on (−1 when off his routine). */
  routine?: string[];
  routineStep?: number;
  /** Seconds until he leaves that step. */
  stepLeft?: number;
  /** For a guard who minds something: whether his routine has him watching it now, and for how many seconds more. */
  watching?: boolean;
  windowLeft?: number;
  /** The tell he gives just before he turns back. */
  telling?: string;
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
  /** How far through loading (0 to 1): moves at each stage, not continuously. */
  loaded: number;
  error?: string;
  issues: string[];
  gate: Gate;
  inputMode: InputMode;
  /** Mouse capture was refused this many times in a row (the Ready card explains). */
  captureRefused: number;
  locked: boolean;
  /** In the pause menu (gate === 'paused'). */
  paused: boolean;
  /** The graphics context is lost: nothing can be drawn until the browser restores it. */
  contextLost: boolean;
  /** `?debug`: show the frame rate and camera readout. */
  debug: boolean;
  camera: GullCamera;
  cameraLabel: string;
  hud: HudState;
  settings: Settings;
  fps: number;
  operation?: string;
  operationTitle?: string;
  briefing?: Briefing;
  objectives: { id: string; text: string; state: string; optional: boolean }[];
  score: number;
  tension: number;
  /** What the message bus has on show: radio, prompt, change of orders, toasts, alert or banner. */
  msg: MessageView;
  /** Goes up whenever the labels of bindings change, so that they are drawn again. */
  bindingsRev: number;
  /** Which page the pause menu opens on. */
  pauseTab: PauseTab;
  overlays: GuardOverlay[];
  results?: Results;
  saved: Progress;
  /** SailSim's graphics preset ('custom' when changed by hand there). */
  graphics: string;
}

/** Let the page paint (a progress message) before a long synchronous step. */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const ACTION_TABLE: Record<string, ActionInfo> = ACTIONS;

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
  /** Seconds since the current operation's clock started (or since the title scene's did). */
  time = 0;
  /** Tests and screenshots: hold the game still without the pause menu. */
  frozen = false;
  /**
   * Switches in the page's address: `?debug` shows the frame rate and camera readout; `?survey` reads the town's solid
   * shape from the picture on this machine instead of loading the baked one; `?bake` does that at full scenery detail
   * for tools/bake-collision.ts.
   */
  readonly flags = (() => {
    const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
    return { debug: q.has('debug'), survey: q.has('survey') || q.has('bake'), bake: q.has('bake') };
  })();
  /** How the solid town was obtained this visit. */
  collisionSource: 'baked' | 'surveyed' = 'baked';

  /** Which input does which action, and what each is called on the device in hand. */
  readonly input = new InputMap(loadBindings());
  /** Everything the game says in play, each kind in its own slot. */
  readonly messages = new MessageBus();
  /** Decides what to teach, one verb at a time (rebuilt with each mission). */
  coach?: Coach;

  private readonly listeners = new Set<() => void>();
  private st: GameState;
  /** Arrow keys held: they turn the view, with the mouse or without it. */
  private readonly arrows = new Set<string>();
  private accumulator = 0;
  private lastFrame = 0;
  private raf = 0;
  private prev = { e: 0, n: 0, h: 0 };
  private readonly dropRing: THREE.Mesh;
  private dropOnTarget = false;
  private readonly dynRes = new DynamicResolution();
  private fpsAcc = { n: 0, t: 0, fps: 0 };
  private publishT = 0;
  private weatherT = 0;
  private resizeObs?: ResizeObserver;
  /** Objective states as last seen, and the id of the current order, to announce changes. */
  private readonly objSeen = new Map<string, ObjectiveState>();
  private orderId = '';
  /** The fixed HUD boxes on screen (CSS pixels), which pinned labels keep clear of; measured a few times a second. */
  private hudBoxes: Box[] = [];
  private hudBoxesAt = -1e9;
  private root?: HTMLElement;
  /** Pinned labels, most important first (the order they are placed in). */
  private anchorOrder: string[] = [];
  private titleT = 0;
  /** The current operation's clock zero (ms since 1970). */
  private startEpoch = Date.parse(M1_CONDITIONS.startTime);
  /** The mission has been started (Mother has spoken, the clock runs when flying). */
  private started = false;
  /** Which operation `mission` was built for. */
  private builtFor?: string;
  /** The player asked for the mouse and the browser has not answered yet. */
  private wantCapture = false;
  /** When mouse capture last ended (ms), to ignore the Escape that some browsers deliver with it. */
  private captureEndedAt = -1e9;
  /** HUD elements pinned to things in the world (guards' labels, speech, ON TARGET): the UI registers them here. */
  private readonly anchors = new Map<string, HTMLElement>();

  constructor() {
    this.st = {
      screen: 'loading',
      progress: 'Loading the River Dart…',
      loaded: 0.05,
      issues: [],
      gate: 'ready',
      inputMode: 'mouse',
      captureRefused: 0,
      locked: false,
      paused: false,
      contextLost: false,
      debug: this.flags.debug,
      camera: 'chase',
      cameraLabel: CAMERA_LABEL.chase,
      hud: { speedKmh: 0, height: 0, altitude: 0, mode: '', payload: 3, maxPayload: 3, heading: 0, ...NO_STEALTH, noticers: [] },
      settings: this.settings,
      fps: 0,
      objectives: [],
      score: 0,
      tension: 0,
      msg: this.messages.view,
      bindingsRev: 0,
      pauseTab: 'orders',
      overlays: [],
      saved: loadProgress(),
      graphics: 'balanced',
    };
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    ring.visible = false;
    this.dropRing = ring;
    // Lines are timed by what the player reads: the binding's label, not the {token}.
    this.messages.measure = (text) => formatActions(text, this.label).length;
    void this.readKeyboardLayout();
  }

  /** The label of an action's current binding ("Space", "Right mouse"). */
  readonly label = (id: ActionId): string => this.input.label(id);

  /** Where the browser can say what each key prints on this keyboard (AZERTY: the W key is Z), label by that. */
  private async readKeyboardLayout(): Promise<void> {
    try {
      const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<{ get(code: string): string | undefined }> } }).keyboard;
      const map = await kb?.getLayoutMap?.();
      if (!map) return;
      this.input.layout = map;
      this.publish({ bindingsRev: this.st.bindingsRev + 1 });
    } catch {
      /* not offered here: US labels */
    }
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
    try {
      await this.boot(container);
    } catch (e) {
      console.error(e);
      this.fail(`Something went wrong while loading: ${(e as Error).message ?? e}`);
    }
  }

  private fail(error: string, issues: string[] = this.st.issues): void {
    cancelAnimationFrame(this.raf);
    this.publish({ screen: 'error', error, issues });
  }

  /** The grids as the bake stores them (Int16 centimetres), base64 (tools/bake-collision.ts). */
  exportCollision(): { e0: number; n0: number; cell: number; nx: number; ny: number; b64: string }[] {
    return (this.world?.grids ?? []).map((g) => {
      const bytes = new Uint8Array(gridToInt16(g).buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { e0: g.e0, n0: g.n0, cell: g.cell, nx: g.nx, ny: g.ny, b64: btoa(bin) };
    });
  }

  private async boot(container: HTMLElement): Promise<void> {
    const base = `${import.meta.env.BASE_URL}geo/`;
    const dataP = loadDartData(base);
    const bakedP = this.flags.survey
      ? Promise.resolve(undefined)
      : loadCollision(base).catch((e: unknown) => {
          console.warn('Baked collision not used, surveying instead:', e);
          return undefined;
        });
    let view: GullScene;
    try {
      view = new GullScene(container);
    } catch (e) {
      this.fail(`This browser could not start WebGL, which the game needs to draw (${(e as Error).message}). Try another browser, or turn on hardware acceleration.`);
      return;
    }
    this.view = view;
    this.root = container.parentElement ?? container;
    view.onContextChange = (lost) => this.onContext(lost);
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
      this.fail('The River Dart’s map data could not be loaded. Check the connection and try again.', issues);
      return;
    }
    performance.mark('gb:data');
    this.applyConditions(M1_CONDITIONS);
    this.publish({ progress: 'Raising the town…', loaded: 0.2, issues });
    await nextFrame();
    const dart = new DartScene({ manifest: data.manifest, geo: data.geo, features: data.features, drape: data.drape, town: data.town, waterMask: data.waterMask, roads: data.roads, quays: data.quays, detail: this.flags.bake ? 'high' : view.quality, era: '1967' });
    this.dart = dart;
    performance.mark('gb:scene');
    let grids = await bakedP;
    this.collisionSource = grids ? 'baked' : 'surveyed';
    if (!grids) {
      this.publish({ progress: 'Surveying the rooftops…', loaded: 0.6 });
      await nextFrame();
      grids = await captureHeights(view.renderer, dart, CAPTURE_AREAS, (d, n) => this.publish({ progress: `Surveying the rooftops… ${Math.round((100 * d) / n)}%` }));
    }
    performance.mark('gb:collision');
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
    this.publish({ progress: 'Painting the town…', loaded: 0.7 });
    await nextFrame();
    this.titleCamera(0);
    this.renderFrame(0);
    await view.warmUp().catch(() => undefined);
    performance.mark('gb:shaders');
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.audio.music('title');
    this.publish({ screen: 'title', progress: '', loaded: 1 });
    performance.mark('gb:title');
  }

  // ------------------------------------------------------------------ the day: clock, tide, sky

  /** Start the clock of an operation's day and build its wind, tide and sky. */
  private applyConditions(c: MissionConditions): void {
    this.startEpoch = Date.parse(c.startTime);
    this.time = 0;
    this.conditions = buildConditions(
      {
        ...DEFAULT_CONDITIONS,
        startTime: c.startTime,
        weather: { source: 'manual', twsKn: c.windKn, twdDeg: c.windFromDeg },
        gusts: { preset: 'steady', seed: 1967 },
        tide: { mode: 'manual', hwTime: c.hwTime, hwHeightM: c.hwHeightM, lwHeightM: c.lwHeightM },
        sky: { source: 'preset', preset: c.sky },
      },
      this.data?.geo,
    );
    // While loading there is no town yet: boot() gives the view its weather once, after the scene is in place.
    // (Doing it here as well made the sky's environment map twice, about a second on a software renderer.)
    if (!this.world) return;
    this.world.waterLevel = this.waterLevel();
    this.view?.setWeather(this.sceneWeather());
  }

  waterLevel(): number {
    return this.conditions?.env.waterLevel?.(this.time) ?? 1.3;
  }

  epochMs(): number {
    return this.startEpoch + this.time * 1000;
  }

  private sceneWeather() {
    const sun = sunPosition(this.epochMs(), RDYC_ORIGIN.lat, RDYC_ORIGIN.lon);
    return { sky: (this.conditions?.env.sky ?? presetSky('fair')).at(this.time), sunElevationDeg: sun.elevationDeg, sunAzimuthDeg: sun.azimuthDeg };
  }

  // ------------------------------------------------------------------ screens

  /** The title, briefing and review screens: a slow flight round the harbour. */
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
    // Build the operation and compile what it draws while the dossier is being read, so it starts without a stall.
    this.buildMission(id);
    void this.warmMission();
  }

  /** Build an operation's world: its day, its mission and what the mission draws. It is not started. */
  private buildMission(id: string): void {
    const world = this.world;
    const view = this.view;
    if (!world || !view) return;
    this.endMission();
    world.solids.splice(0, world.solids.length);
    this.applyConditions(conditionsFor(id));
    const m = createMission(id, world);
    this.mission = m;
    this.builtFor = id;
    this.started = false;
    this.missionView = new MissionView(m, (e, n, h, out) => view.toScene(e, n, h, out));
    view.game.add(this.missionView.group);
    this.snapPrev();
  }

  /** Compile the shaders of everything the mission can draw (vision cones and markers included). */
  private async warmMission(): Promise<void> {
    const v = this.view;
    const mv = this.missionView;
    if (!v || !mv) return;
    const restore = mv.revealForWarmUp();
    try {
      await v.warmUp();
    } catch {
      /* compiled at first draw instead */
    } finally {
      restore();
    }
  }

  /** Enter an operation (or free flight, 'free') at the Ready gate: the scene is shown, nothing runs yet. */
  startOperation(id: string): void {
    if (!this.world || !this.view) return;
    this.audio.unlock();
    if (this.builtFor !== id || this.started || !this.mission) this.buildMission(id);
    const m = this.mission;
    if (!m) return;
    this.releaseInput();
    this.messages.clear();
    this.coach = new Coach(m);
    this.objSeen.clear();
    for (const o of m.objectives) this.objSeen.set(o.id, o.state);
    this.orderId = m.objectives.find((o) => o.state === 'active' && !o.optional)?.id ?? '';
    this.accumulator = 0;
    this.setCamera(this.st.camera === 'scenic' || this.st.camera === 'orbit' ? 'chase' : this.st.camera);
    this.audio.setPaused(false);
    this.publish({ screen: 'playing', gate: 'ready', paused: false, captureRefused: 0, operation: id, operationTitle: m.title, results: undefined, msg: this.messages.view, overlays: [] });
    this.publishHud(m);
  }

  /** Let go of every key, button and toggle (a new start, a pause, lost focus). */
  private releaseInput(): void {
    this.input.releaseAll();
    this.arrows.clear();
  }

  private endMission(): void {
    this.missionView?.dispose();
    this.missionView = undefined;
    this.mission = undefined;
    this.builtFor = undefined;
    this.started = false;
    this.coach = undefined;
    this.anchors.clear();
    this.audio.stopAll();
  }

  /** Abandon to the title screen. */
  toTitle(): void {
    this.endMission();
    this.wantCapture = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.applyConditions(M1_CONDITIONS);
    this.audio.setPaused(false);
    this.audio.music('title');
    this.messages.clear();
    this.publish({ screen: 'title', gate: 'ready', paused: false, results: undefined, msg: this.messages.view, overlays: [] });
  }

  /** Start the operation again, and take control at once (the click on Restart or Try again allows it). */
  restart(): void {
    const id = this.st.operation ?? 'free';
    this.buildMission(id);
    this.startOperation(id);
    this.begin();
  }

  private onFinished(r: Results): void {
    const saved: Progress = { done: [...this.st.saved.done], best: { ...this.st.saved.best } };
    // A compromised operation is not done: it is not filed, cannot be the best run, and opens nothing.
    if (r.outcome !== 'compromised') {
      if (!saved.done.includes(r.missionId)) saved.done.push(r.missionId);
      const best = saved.best[r.missionId];
      if (!best || r.total > best.total) saved.best[r.missionId] = { total: r.total, grade: r.grade };
      saveProgress(saved);
    }
    this.wantCapture = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.music('results');
    this.messages.clear(true);
    this.publish({ screen: 'results', results: r, saved, msg: this.messages.view, overlays: [] });
  }

  // ------------------------------------------------------------------ the gate: ready, flying, paused

  /**
   * Take control and fly: from the Ready gate or the pause menu. With the mouse, the game waits for the browser to
   * grant the capture; with the keyboard alone it starts at once.
   */
  begin(mode: InputMode = this.st.inputMode): void {
    if (this.st.screen !== 'playing' || this.st.gate === 'flying' || this.st.contextLost) return;
    this.audio.unlock();
    // Prompts name the arrow keys, and keys rather than mouse buttons, when the mouse is not in use.
    this.input.profile = mode;
    if (mode !== this.st.inputMode) this.publish({ inputMode: mode });
    if (mode !== 'mouse') {
      this.enterFlying();
      return;
    }
    const canvas = this.view?.renderer.domElement;
    if (!canvas) return;
    if (document.pointerLockElement === canvas) {
      this.enterFlying();
      return;
    }
    this.wantCapture = true;
    let asked: unknown;
    try {
      asked = canvas.requestPointerLock();
    } catch {
      this.captureRefused();
      return;
    }
    // Newer browsers answer with a promise; older ones with the pointerlockchange and pointerlockerror events.
    if (asked instanceof Promise) asked.catch(() => this.captureRefused());
  }

  private captureRefused(): void {
    if (!this.wantCapture) return;
    this.wantCapture = false;
    this.publish({ captureRefused: this.st.captureRefused + 1 });
  }

  private enterFlying(): void {
    const m = this.mission;
    if (!m || this.st.screen !== 'playing') return;
    this.wantCapture = false;
    this.releaseInput();
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.audio.setPaused(false);
    this.publish({ gate: 'flying', paused: false, captureRefused: 0 });
    if (!this.started) {
      this.started = true;
      m.start();
      // The coach looks at once, so that the first prompt is up with the first picture.
      this.coach?.step(0);
      this.drainEvents();
      this.publishHud(m);
    }
  }

  /** To the pause menu (from flying), on the page asked for. */
  pause(tab: PauseTab = 'orders'): void {
    if (this.st.screen !== 'playing' || this.st.gate !== 'flying') return;
    this.releaseInput();
    this.wantCapture = false;
    this.audio.setPaused(true);
    this.publish({ gate: 'paused', paused: true, pauseTab: tab });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setPauseTab(tab: PauseTab): void {
    if (tab !== this.st.pauseTab) this.publish({ pauseTab: tab });
  }

  /** From the pause menu back to flying (the mouse is captured again first). */
  resume(): void {
    if (this.st.gate === 'paused') this.begin();
  }

  /** From the pause menu to the Ready gate: the scene, and one click to fly. */
  toReady(): void {
    if (this.st.screen !== 'playing' || this.st.gate !== 'paused') return;
    this.publish({ gate: 'ready', paused: false });
  }

  /** Kept for tests and older callers: pause or resume. */
  setPaused(paused: boolean): void {
    if (paused) this.pause();
    else this.resume();
  }

  private onContext(lost: boolean): void {
    if (lost) {
      this.pause();
      this.publish({ contextLost: true });
    } else {
      this.view?.setWeather(this.sceneWeather());
      this.publish({ contextLost: false });
    }
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed here (an embedding page may forbid it) */
    }
  }

  // ------------------------------------------------------------------ input

  private bindInput(container: HTMLElement): void {
    const canvas = this.view!.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      // A click on the picture takes control (the Ready card does the same).
      if (this.st.screen === 'playing' && this.st.gate === 'ready') this.begin('mouse');
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.publish({ locked });
      if (locked) {
        if (this.wantCapture && this.st.screen === 'playing') this.enterFlying();
      } else {
        this.captureEndedAt = performance.now();
        if (this.st.screen === 'playing' && this.st.gate === 'flying' && this.st.inputMode === 'mouse') this.pause();
      }
    });
    document.addEventListener('pointerlockerror', () => this.captureRefused());
    document.addEventListener('mousemove', (ev) => {
      if (document.pointerLockElement !== canvas || this.st.gate !== 'flying' || !this.mission) return;
      const k = this.settings.sensitivity / 1000;
      this.mission.gull.look(ev.movementX * k, -ev.movementY * k * (this.settings.invertY ? -1 : 1));
    });
    document.addEventListener('mousedown', (ev) => {
      if (document.pointerLockElement !== canvas || this.st.gate !== 'flying') return;
      for (const id of this.input.press(`Mouse${ev.button}`)) this.fire(id);
    });
    document.addEventListener('mouseup', (ev) => this.input.release(`Mouse${ev.button}`));
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
      // The browser's own shortcuts are the browser's.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if ((ev.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      if (this.st.screen !== 'playing') return;
      const gate = this.st.gate;
      const code = ev.code;
      const on = this.input.actionsOn(code);
      if (gate === 'ready') {
        // Space or Enter at the Ready gate takes control, unless a button there has the focus (it handles them itself).
        if ((code === 'Space' || code === 'Enter') && !(ev.target as HTMLElement | null)?.closest?.('button, a')) {
          ev.preventDefault();
          this.begin();
        }
        return;
      }
      if (gate === 'paused') {
        // Escape belongs to the pause card (it steps back to the Ready gate); the other pause key does the same. The
        // key that opened the log or the controls closes them again, back into flight.
        if (ev.repeat) return;
        if (on.includes('pause')) this.toReady();
        else if ((on.includes('log') && this.st.pauseTab === 'log') || (on.includes('help') && this.st.pauseTab === 'controls')) this.resume();
        return;
      }
      if (on.length || code.startsWith('Arrow')) ev.preventDefault();
      if (code.startsWith('Arrow')) {
        this.arrows.add(code);
        return;
      }
      // Some browsers deliver the Escape that released the mouse as a key press too: one pause, not pause and back.
      if (code === 'Escape' && performance.now() - this.captureEndedAt < 300) return;
      // Dispatch by kind (actions.ts): the map says which actions this key is bound to, and fires each once per press.
      for (const id of this.input.press(code)) this.fire(id);
    });
    window.addEventListener('keyup', (ev) => {
      this.arrows.delete(ev.code);
      this.input.release(ev.code);
    });
    window.addEventListener('blur', () => {
      this.releaseInput();
      this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('beforeunload', (ev) => {
      // Ask before leaving an operation under way.
      if (this.st.screen === 'playing' && this.started && !this.mission?.finished && this.st.operation !== 'free') ev.preventDefault();
    });
  }

  /** What the application itself does for an action of kind 'app'. An id without an entry here does nothing. */
  private readonly appActions: Record<string, () => void> = {
    camera: () => this.cycleCamera(),
    pause: () => this.pause(),
    help: () => this.pause('controls'),
    log: () => this.pause('log'),
    repeat: () => this.repeatRadio(),
  };

  /**
   * An action was pressed. Generic by kind, so an action added to the table needs nothing here: a press goes to the
   * mission by name; an app action to its handler; controls and triggers are read while held (controls(), step()).
   */
  private fire(id: ActionId): void {
    const kind = ACTION_TABLE[id]?.kind;
    if (kind === 'press') this.mission?.press(id);
    else if (kind === 'app') this.appActions[id]?.();
  }

  /** Say the last radio line again. */
  repeatRadio(): void {
    if (this.messages.repeatLast()) this.showMessages();
  }

  /** Advance the messages by `dt` real seconds, and hand the interface what is now on show if that has changed. */
  private showMessages(dt = 0): void {
    this.messages.step(dt);
    if (this.messages.view !== this.st.msg) this.publish({ msg: this.messages.view });
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

  /** The held controls for this step: every control action that is down sets the GullControls field of its name. */
  private controls(): GullControls {
    return this.input.controls(NO_CONTROLS);
  }

  // ------------------------------------------------------------------ the loop

  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const raw = (now - this.lastFrame) / 1000;
    const dt = Math.max(0, Math.min(0.1, raw));
    this.lastFrame = now;
    const screen = this.st.screen;
    const flying = screen === 'playing' && this.st.gate === 'flying';
    if (flying && !this.frozen) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS) {
        this.snapPrev();
        this.missionView?.snapshot();
        this.step(DT);
        this.accumulator -= DT;
        steps++;
      }
      if (steps >= MAX_STEPS) this.accumulator = 0;
      // The sun and the sky move with the operation's clock.
      if (now - this.weatherT > 1000) {
        this.weatherT = now;
        this.view?.setWeather(this.sceneWeather());
      }
    } else if (!this.frozen && (screen === 'title' || screen === 'briefing' || screen === 'results')) {
      this.titleCamera(dt);
    }
    // Messages keep real time (a slow frame does not shorten a line's reading time by much), and stop with the game.
    if (flying) this.showMessages(Math.min(Math.max(raw, 0), 0.25));
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
    if (this.st.screen !== 'playing' || this.st.gate !== 'flying') {
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
    if (g) this.prev = { e: g.pos.e, n: g.pos.n, h: g.pos.h };
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
    const ay = (this.arrows.has('ArrowRight') ? 1 : 0) - (this.arrows.has('ArrowLeft') ? 1 : 0);
    const ap = (this.arrows.has('ArrowUp') ? 1 : 0) - (this.arrows.has('ArrowDown') ? 1 : 0);
    if (ay || ap) g.look(ay * lookRate, ap * lookRate * (this.settings.invertY ? -1 : 1));
    m.step(dt, this.controls(), this.input.isHeld('poop'));
    this.coach?.step(dt);
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
    const batch = m.takeEvents();
    if (batch.length) {
      this.messages.now = m.elapsed;
      // A radio line is urgent, and said at once, when it comes with an alert (spotted, the ladder rising, the papers
      // dropped), or in the last two minutes of the mission's clock (the courier has asked for his bill).
      const left = m.deadlineLeft;
      const urgent = (left !== undefined && left < 125 && !m.completed) || batch.some((e) => (e.type === 'banner' && (e.tone === 'bad' || e.tone === 'warn')) || (e.type === 'toast' && e.tone === 'bad'));
      for (const e of batch) this.onMissionEvent(e, urgent);
    }
    this.noteObjectives(m);
    this.showMessages();
  }

  /**
   * A mission's event, sent to its place. What the mission says goes to the message bus, which gives each kind one
   * slot: radio, toast (the feed), and banner, which is an alert when it is a warning. Text is passed through
   * `tokenise`, so a key still named in old text is shown as its action's current binding.
   */
  private onMissionEvent(e: MissionEvent, urgent: boolean): void {
    switch (e.type) {
      case 'radio': {
        // A mission may set `priority` on the event itself ('urgent', 'normal', 'flavour').
        const asked = (e as { priority?: RadioPriority }).priority;
        this.messages.radio(e.speaker, tokenise(e.text), asked ?? (urgent ? 'urgent' : 'normal'));
        break;
      }
      case 'toast':
        // "Done: …" is announced in the orders card (noteObjectives), not as a toast as well.
        if (e.tone === 'good' && e.text.startsWith('Done: ')) break;
        this.messages.toast(tokenise(e.text), e.tone);
        break;
      case 'banner':
        if (e.tone === 'bad' || e.tone === 'warn') this.messages.alert(e.text, e.tone, e.dur);
        else this.messages.banner(e.text, e.tone, e.dur);
        break;
      case 'sfx':
        this.audio.play(e.name, e.at, e.gain ?? 0, e.rate ?? 1);
        if (!e.at && (e.name === 'squawk' || e.name === 'flock')) this.model.call(); // handoff: art. The gull is seen to give the call that is heard.
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

  /** Announce changes of orders: an objective done or failed, and a new one to act on. */
  private noteObjectives(m: Mission): void {
    for (const o of m.objectives) {
      const was = this.objSeen.get(o.id);
      if (was === o.state) continue;
      this.objSeen.set(o.id, o.state);
      if (was === undefined) continue;
      if (o.state === 'done') this.messages.objective(tokenise(o.text), 'done');
      else if (o.state === 'failed') this.messages.objective(tokenise(o.text), 'failed');
    }
    const cur = m.objectives.find((o) => o.state === 'active' && !o.optional);
    const id = cur?.id ?? '';
    if (id !== this.orderId) {
      this.orderId = id;
      if (cur) this.messages.objective(tokenise(cur.text), 'new');
    }
  }

  // ------------------------------------------------------------------ drawing

  private pose(alpha: number): GullPose {
    const g = this.mission!.gull;
    const p = this.prev;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    return {
      e: lerp(p.e, g.pos.e),
      n: lerp(p.n, g.pos.n),
      h: lerp(p.h, g.pos.h),
      // The view turns with the latest mouse movement, not a step behind it.
      yaw: g.yaw,
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
    const playing = this.st.screen === 'playing';
    let pose: GullPose | undefined;
    // Between the last two steps, by how far the frame clock is into the next one. When something else is stepping the
    // game (tests and screenshot scripts set `frozen`), draw the latest state as it is.
    const alpha = this.frozen ? 1 : Math.min(1, this.accumulator / DT);
    this.model.root.visible = !!m && !(playing && this.st.camera === 'first');
    this.model.watch(m?.gull); // handoff: art. The model reads what `pose` is not given from the gull itself (look pitch, and roll, call and eating when they exist).
    this.dropRing.visible = false;
    this.dropOnTarget = false;
    if (m) {
      const g = m.gull;
      pose = this.pose(alpha);
      const grounded = g.mode === Mode.Ground;
      const floating = g.mode === Mode.Water;
      const at = v.toScene(pose.e, pose.n, grounded ? pose.h - 0.13 : floating ? wl + 0.06 : pose.h);
      const flatSpeed = Math.hypot(g.vel.e, g.vel.n);
      this.model.pose(at, pose.yaw, g.mode === Mode.Air ? Math.atan2(g.flyDir.h, Math.hypot(g.flyDir.e, g.flyDir.n)) : 0, { time: t, airborne: g.isAirborne(), flapPhase: g.flapPhase, flapping: g.flapping, braking: g.braking, diving: g.diving, tumbling: g.mode === Mode.Tumble, walk: grounded ? Math.min(1, flatSpeed / 2.4) : 0, walkPhase: g.walkPhase, floating, yawRate: g.yawRate, speed: g.speed() }, dt);
      this.missionView?.sync(dt, v.camera, alpha, { pos: this.model.billPosition(), yaw: pose.yaw });
      if (playing && this.settings.dropMarker) {
        const pred = m.dropPrediction();
        if (pred) {
          v.toScene(pred.point.e, pred.point.n, pred.point.h + 0.05, this.dropRing.position);
          const d = Math.hypot(pred.point.e - g.pos.e, pred.point.n - g.pos.n, pred.point.h - g.pos.h);
          this.dropRing.scale.setScalar(Math.max(1, d / 12));
          this.dropRing.visible = true;
          this.dropOnTarget = pred.onTarget;
          (this.dropRing.material as THREE.MeshBasicMaterial).color.set(pred.onTarget ? 0xff5040 : 0xffffff);
        }
      }
      this.audio.setWind(playing && this.st.gate === 'flying' && g.isAirborne() ? g.speed() : 0);
    }
    const cam = v.camera.position;
    this.audio.listener = { e: cam.x, n: -cam.z, h: cam.y + wl };
    const wind = env?.wind(t, pose?.n ?? 260, pose?.e ?? -300);
    const dart = this.dart;
    const windFromDir = wind ? Math.atan2(-wind.e, -wind.n) : (235 * Math.PI) / 180;
    const windSpeed = wind ? Math.hypot(wind.n, wind.e) : 4.6;
    v.render(playing ? pose : undefined, {
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
    if (m && playing) this.placeAnchors(m, alpha);
    const now = performance.now();
    if (m && playing && now - this.publishT > 100) {
      this.publishT = now;
      this.publishHud(m);
    }
  }

  setAnchor(id: string, el: HTMLElement | null): void {
    if (el) this.anchors.set(id, el);
    else this.anchors.delete(id);
  }

  /** The fixed HUD boxes as they are on screen now (CSS pixels from the picture's top left). */
  private measureHud(): Box[] {
    const root = this.root;
    const canvas = this.view?.renderer.domElement;
    if (!root || !canvas) return [];
    const origin = canvas.getBoundingClientRect();
    const out: Box[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('[data-hud]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
    return out;
  }

  /**
   * Pin each registered label to its place in the world, every frame (React draws their contents ten times a second),
   * clear of the fixed HUD and of each other (labels.ts): the drop marker's label first, then people, nearest first.
   * A label with nowhere near to go is hidden for the frame.
   */
  private placeAnchors(m: Mission, alpha: number): void {
    if (!this.anchors.size) return;
    const v = this.view!;
    const mv = this.missionView;
    const view = { w: v.renderer.domElement.clientWidth, h: v.renderer.domElement.clientHeight };
    const now = performance.now();
    if (now - this.hudBoxesAt > 200) {
      this.hudBoxesAt = now;
      this.hudBoxes = this.measureHud();
    }
    const taken = [...this.hudBoxes];
    const place = (id: string, at: { e: number; n: number; h: number } | undefined, below = false) => {
      const el = this.anchors.get(id);
      if (!el) return;
      const s = at ? v.screenOf(at.e, at.n, at.h) : undefined;
      const bw = el.offsetWidth;
      const bh = el.offsetHeight;
      const box = s && !s.behind && Math.abs(s.x) <= 1.15 && Math.abs(s.y) <= 1.15 && bw > 0 ? placeBox({ x: (s.x * 0.5 + 0.5) * view.w - bw / 2, y: (0.5 - s.y * 0.5) * view.h + (below ? 0.9 * bh : -bh), w: bw, h: bh }, taken, view, 6, 240) : undefined;
      if (!box) {
        el.style.visibility = 'hidden';
        return;
      }
      taken.push(box);
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px, 0)`;
    };
    if (this.anchors.has('drop')) {
      const p = this.dropRing.position;
      place('drop', this.dropRing.visible && this.dropOnTarget ? { e: p.x, n: -p.z, h: p.y + this.world!.waterLevel } : undefined, true);
    }
    for (const id of this.anchorOrder) {
      const guard = m.guards.find((x) => x.id === id);
      const other = guard ? undefined : (m.npcs.find((x) => x.id === id) ?? m.marchers.find((x) => x.id === id));
      place(id, guard ? mv?.headOf(guard, alpha, 2.3) : other ? mv?.headOf(other, alpha, 2.1) : undefined);
    }
  }

  private publishHud(m: Mission): void {
    const v = this.view!;
    const g = m.gull;
    const world = this.world!;
    const ground = world.surfaceAt(g.pos.e, g.pos.n).h;
    let offscreen: number | undefined;
    let distance: number | undefined;
    const target = m.running ? m.currentTarget() : undefined;
    if (target) {
      distance = Math.hypot(target.e - g.pos.e, target.n - g.pos.n, target.h - g.pos.h);
      const s = v.screenOf(target.e, target.n, target.h + 2.2);
      if (s.behind || Math.abs(s.x) > 0.95 || Math.abs(s.y) > 0.92) offscreen = s.behind ? Math.atan2(-s.x, -Math.abs(s.y) - 1) : Math.atan2(s.x, s.y);
    }
    const near: (GuardOverlay & { d: number })[] = [];
    const away = (p: { e: number; n: number; h: number }) => Math.hypot(p.e - g.pos.e, p.n - g.pos.n, p.h - g.pos.h);
    for (const gd of m.guards) {
      const d = away(gd.headPosition());
      if (d > 90) continue;
      const st = gd.state;
      const icon = st === GuardState.Alert ? '!' : st === GuardState.Suspicious || st === GuardState.Investigate || st === GuardState.Search ? '?' : st === GuardState.Distracted ? '…' : '';
      const onRound = gd.tagged && gd.routine.length > 1;
      const minds = onRound && gd.routine.some((s) => s.watch);
      const tag = g.scouting && !gd.tagged ? m.tagProgressOf(gd) : undefined;
      if (!gd.tagged && !icon && !gd.speech && !(tag && tag > 0)) continue;
      near.push({
        id: gd.id,
        name: gd.tagged ? gd.name : undefined,
        routine: onRound ? gd.routineLabels() : undefined,
        routineStep: onRound ? gd.routineStep : -1,
        stepLeft: onRound ? gd.stepTimeLeft : undefined,
        watching: minds && gd.routineStep >= 0 ? gd.watchingNow : undefined,
        windowLeft: minds && gd.routineStep >= 0 ? gd.windowTimeLeft : undefined,
        telling: gd.tagged ? gd.telling : undefined,
        state: gd.stateName,
        suspicion: gd.suspicion / 100,
        icon,
        speech: gd.speech?.text,
        tag,
        d,
      });
    }
    for (const n of [...m.npcs, ...m.marchers]) if (n.speech) near.push({ id: n.id, state: '', suspicion: 0, icon: '', speech: n.speech.text, d: away(n.pos) });
    // Nearest first, and three people speaking at most: a parade in uproar is otherwise a wall of bubbles.
    near.sort((a, b) => a.d - b.d);
    let speaking = 0;
    const overlays: GuardOverlay[] = [];
    for (const { d: _d, ...o } of near) {
      if (o.speech && ++speaking > 3) o.speech = undefined;
      if (o.name || o.icon || o.speech || (o.tag !== undefined && o.tag > 0)) overlays.push(o);
    }
    this.anchorOrder = overlays.map((o) => o.id);
    // Who is taking an interest, strongest first: at most five, and one for each direction.
    const noticers: HudState['noticers'] = [];
    for (const n of m.noticing()) {
      if (noticers.length >= 5) break;
      if (noticers.some((t) => Math.abs(Math.atan2(Math.sin(t.rel - n.relBearing), Math.cos(t.rel - n.relBearing))) < 0.4)) continue;
      noticers.push({ id: n.id, rel: n.relBearing, strength: n.strength, sees: n.sees, alert: n.state === 'alert' });
    }
    const left = m.deadlineLeft;
    // The one prompt on show is the coach's choice: a lesson, a reminder, or the mission's own prompt.
    this.messages.setPrompt(this.st.gate === 'flying' ? this.coach?.prompt() : undefined);
    this.messages.step(0);
    this.publish({
      hud: {
        speedKmh: g.speed() * 3.6,
        height: Math.max(0, g.pos.h - world.waterLevel),
        altitude: Math.max(0, g.pos.h - Math.max(ground, world.waterLevel) - 0.3),
        mode: g.modeName(),
        payload: g.payload,
        maxPayload: g.profile.maxPayload,
        heading: ((g.yaw * 180) / Math.PI + 360) % 360,
        drop: this.dropRing.visible && this.dropOnTarget ? { onTarget: true } : undefined,
        beak: m.beak?.name,
        beakIsMission: m.beak?.isMission,
        distance,
        offscreen,
        conspicuous: { level: m.conspicuousLevel, reason: m.conspicuousReason, value: m.conspicuousness },
        alert: { level: m.alert.level, name: m.alert.name, progress: m.alert.progress },
        deadline: m.deadline && left !== undefined && m.running && !m.completed ? { label: m.deadline.label, clock: m.deadline.clock, left } : undefined,
        noticers,
      },
      objectives: m.objectives.filter((o) => o.state !== 'hidden').map((o) => ({ id: o.id, text: tokenise(o.text), state: o.state, optional: o.optional })),
      score: m.liveScore(),
      tension: m.tension,
      overlays,
      fps: this.fpsAcc.fps,
      msg: this.messages.view,
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.audio.dispose();
    this.view?.dispose();
  }
}
