/**
 * Gull Britannia's 3D view: SailSim's SceneView (src/render/scene.ts) with the Squib, its wake, the fleet and the
 * course taken out, and cameras that follow a flying gull. The sky, weather, haze from the sky's own horizon colour,
 * lighting, water, reflections and finishing effects are SailSim's, used as SailSim uses them.
 *
 * Game positions are SailSim's local metres (e east, n north) and heights in m ODN; the scene draws the water's
 * surface at y = 0, so a height h is drawn at y = h − waterLevel.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SunLight, rendererName, shadowQuality } from '../../render/sunlight';
import { Water, type SeaSample } from '../../render/water';
import { PlanarReflection } from '../../render/reflection';
import { PostPipeline } from '../../render/post';
import { SUN_THROUGH, VIEWPORT } from '../../render/materialFx';
import { loadGraphics, pixelRatioFor, saveGraphics, type GraphicsSettings } from '../../render/graphics';
import { CloudDome, Rain } from '../../render/weather';
import type { DartScene, DartUpdate } from '../../render/dart';
import { daylight } from '../../sim/env/sun';
import { FOG, FOG_DENSITY, FOG_DENSITY_DART, FOG_OVERCAST, NIGHT, SKY_GAIN, readHorizon, sunVector, type SceneWeather } from '../../render/scene';
import { setFlagMotionReduced, type WindAt } from '../../render/flagMotion';

export type GullCamera = 'chase' | 'first' | 'scenic' | 'orbit' | 'free';
export const GULL_CAMERAS: GullCamera[] = ['chase', 'first', 'scenic', 'orbit'];
export const CAMERA_LABEL: Record<GullCamera, string> = { chase: 'Chase', first: 'First person', scenic: 'Scenic', orbit: 'Orbit', free: 'Free' };

/** Near plane (m): close for the first-person view's own bill; further out otherwise, for ten times the depth precision. */
const NEAR_FIRST = 0.05;
const NEAR = 0.25;
const BLEND_S = 0.6;
const SUN_COLOUR = new THREE.Color();

/** What the scene shows of the gull this frame (interpolated by the caller). */
export interface GullPose {
  e: number;
  n: number;
  h: number;
  /** View heading and pitch (rad): where the player looks. */
  yaw: number;
  pitch: number;
  speed: number;
  /** Smoothed turn rate (rad/s), for banking the camera. */
  yawRate: number;
  airborne: boolean;
  scouting: boolean;
  /** Walking (bob) and tumbling (shake) for the first-person camera. */
  walking: boolean;
  tumbling: boolean;
  /** Wingmen on the wing: the chase camera pulls back so they are in view. */
  wide?: boolean;
}

export interface GullSceneEnv {
  time: number;
  frameDt: number;
  waterLevel: number;
  windFromDir: number;
  windSpeed: number;
  windAt?: WindAt;
  sea?: (n: number, e: number) => SeaSample;
  current?: { n: number; e: number };
  dart?: Omit<DartUpdate, 'camera' | 'time'>;
  /** Ground height (m ODN) at (e, n), to keep the camera out of buildings and hills. */
  groundAt?: (e: number, n: number) => number;
}

export class GullScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Game objects (the gull, guards, props, effects), in scene coordinates. */
  readonly game = new THREE.Group();
  /** Attached to the camera: the first-person beak and wings. */
  readonly viewModel = new THREE.Group();
  private readonly controls: OrbitControls;
  private readonly water: Water;
  graphics: GraphicsSettings;
  private readonly sun: SunLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly skyMesh: Sky;
  private readonly pmrem: THREE.PMREMGenerator;
  private envMap?: THREE.Texture;
  private readonly sunDir = sunVector((38 * Math.PI) / 180, (200 * Math.PI) / 180);
  private readonly clouds = new CloudDome();
  private readonly rain = new Rain();
  private readonly reflection = new PlanarReflection();
  private post?: PostPipeline;
  private readonly bufferSize = new THREE.Vector2();
  private baseFogDensity = FOG_DENSITY;
  private weather?: SceneWeather;
  private envFor = { el: NaN, cloud: NaN };
  private horizon: Float32Array | null = null;
  private horizonGen = 0;
  private fogMix = { overcast: 0, night: 0 };
  private sunIntensity = 2.2;
  private waterLevel = 0;
  private dart?: DartScene;
  private lastWind = { tws: -1, twd: -1 };
  mode: GullCamera = 'chase';
  /** Chase distance (m): the wheel zooms. */
  chaseDist = 4.2;
  /** Field of view for chase and first person (deg; the settings change it). */
  baseFov = 70;
  /** Camera motion (roll with banking, head bob): off with reduced motion. */
  reducedMotion = false;
  private blend?: { p: THREE.Vector3; q: THREE.Quaternion; t: number };
  private scenicT = 0;
  private camVel = new THREE.Vector3();
  private bank = 0;
  private wideK = 0;
  private bobT = 0;
  private shake = 0;
  private fov = 70;
  private lost = false;
  private readonly motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  private systemReduced = false;

  constructor(container: HTMLElement) {
    this.systemReduced = !!this.motionQuery?.matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: true });
    this.graphics = loadGraphics(rendererName(this.renderer));
    this.renderer.setPixelRatio(pixelRatioFor(this.graphics, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / Math.max(1, container.clientHeight), NEAR, 25000);
    this.camera.position.set(0, 10, 20);
    this.camera.add(this.viewModel);
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = false;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 120;

    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u['turbidity']!.value = 4;
    u['rayleigh']!.value = 1.2;
    u['mieCoefficient']!.value = 0.004;
    u['mieDirectionalG']!.value = 0.8;
    u['sunPosition']!.value.copy(this.sunDir);
    u['uSkyGain'] = { value: SKY_GAIN };
    sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSkyGain = u['uSkyGain']!;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uSkyGain;\nvoid main() {')
        .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb *= uSkyGain;\n#include <tonemapping_fragment>');
    };
    this.scene.add(sky);
    this.skyMesh = sky;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.fog = new THREE.FogExp2(FOG.clone(), FOG_DENSITY);
    this.scene.add(this.clouds.mesh, this.rain.lines);
    this.hemi = new THREE.HemisphereLight(0xcfe3f5, 0x31505a, 0.6);
    this.scene.add(this.hemi);
    this.sun = new SunLight(this.scene, this.camera, shadowQuality(this.renderer, this.graphics.scenery), this.graphics.shadows === 'fine' ? 4096 : 2048);
    this.sun.set(this.sunDir, 2.2, new THREE.Color(0xfff3e0));
    this.water = new Water(this.sunDir, FOG, FOG_DENSITY);
    this.scene.add(this.water.mesh, this.water.farMesh);
    this.water.setDetail(this.graphics.water);
    this.rebuildEnvironment();
    this.scene.add(this.game);
    this.applyGraphics(this.graphics);
  }

  /** Drawing detail: 'low' on a software renderer. */
  get quality(): 'high' | 'low' {
    return this.sun.quality;
  }

  get contextLost(): boolean {
    return this.lost;
  }

  /** Told when the graphics context is lost (true) and when the browser has restored it (false). */
  onContextChange?: (lost: boolean) => void;

  private readonly onContextLost = (ev: Event) => {
    ev.preventDefault(); // allow the browser to restore it
    this.lost = true;
    this.onContextChange?.(true);
  };

  private readonly onContextRestored = () => {
    this.lost = false;
    // The sky's environment map and the horizon colours lived on the lost context: make them again.
    this.envFor = { el: NaN, cloud: NaN };
    this.horizon = null;
    this.applyWeather();
    if (!this.weather) this.rebuildEnvironment();
    this.onContextChange?.(false);
  };

  setDart(dart: DartScene | undefined): void {
    if (this.dart) this.scene.remove(this.dart.fixed, this.dart.floating, this.dart.labels);
    this.dart = dart;
    if (dart) this.scene.add(dart.fixed, dart.floating);
    this.water.setMask(dart?.waterMask);
    this.water.setBed(dart?.bed);
    this.baseFogDensity = dart ? FOG_DENSITY_DART : FOG_DENSITY;
    this.applyWeather();
  }

  setWeather(w: SceneWeather): void {
    this.weather = w;
    this.applyWeather();
  }

  /** Dynamic resolution (src/render/dynamicResolution.ts): a share of the preset's pixels while frames run late. */
  dynamicScale = 1;

  setDynamicScale(f: number): void {
    if (Math.abs(f - this.dynamicScale) < 1e-6) return;
    this.dynamicScale = f;
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.max(0.35, pixelRatioFor(this.graphics, window.devicePixelRatio) * this.dynamicScale));
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setSize(size.x, size.y, false);
    this.post?.resize();
  }

  applyGraphics(g: GraphicsSettings, persist = false): void {
    this.graphics = g;
    if (persist) saveGraphics(g);
    this.applyPixelRatio();
    this.water.setDetail(g.water);
    this.reflection.quality = g.water === 'high' ? g.reflections : 'off';
    this.water.setReflection(this.reflection.quality === 'off' ? null : this.reflection.target.texture, this.reflection.matrix);
    this.applyWeather();
  }

  private rebuildEnvironment(): void {
    const skyScene = new THREE.Scene();
    skyScene.add(this.skyMesh.clone());
    const disc = this.skyMesh.material.uniforms['showSunDisc'];
    const shown = disc?.value;
    if (disc) disc.value = 0;
    const old = this.envMap;
    this.envMap = this.pmrem.fromScene(skyScene, 0.02).texture;
    if (disc) disc.value = shown;
    this.scene.environment = this.envMap;
    this.water.setEnv(this.envMap);
    old?.dispose();
    const gen = ++this.horizonGen;
    readHorizon(this.renderer, this.envMap)
      ?.then((h) => {
        if (gen !== this.horizonGen) return;
        this.horizon = h;
        if (this.graphics.atmosphere) this.updateFogColour();
      })
      .catch(() => undefined);
  }

  /** Sky, light, haze and rain for the weather and the time of day (SailSim's, unchanged). */
  private applyWeather(): void {
    const fog = this.scene.fog as THREE.FogExp2;
    const w = this.weather;
    if (!w) {
      fog.density = this.baseFogDensity;
      this.water.setFog(this.baseFogDensity);
      return;
    }
    const DEG = Math.PI / 180;
    const { cloud, lowCloud, visibilityM, rainMmH } = w.sky;
    const day = daylight(w.sunElevationDeg);
    this.dart?.setDaylight(day);
    sunVector(w.sunElevationDeg * DEG, w.sunAzimuthDeg * DEG, this.sunDir);
    const u = this.skyMesh.material.uniforms;
    u['sunPosition']!.value.copy(this.sunDir);
    u['turbidity']!.value = 2.2 + 6 * Math.min(1, 6000 / Math.max(visibilityM, 500)) + 4 * cloud;
    u['rayleigh']!.value = 1.7 - 0.9 * cloud;
    const sunVis = day * (1 - 0.75 * cloud - 0.2 * lowCloud) * Math.min(1, Math.max(0, w.sunElevationDeg / 4));
    const warm = Math.min(1, Math.max(0, (12 - w.sunElevationDeg) / 12));
    this.sunIntensity = 3.5 * Math.max(0, sunVis);
    this.sun.set(this.sunDir, this.sunIntensity, SUN_COLOUR.setRGB(1, 0.95 - 0.25 * warm, 0.88 - 0.45 * warm));
    this.hemi.intensity = (0.03 + 0.35 * day) * (1 + 0.6 * cloud);
    this.hemi.color.setRGB(0.97 - 0.3 * cloud, 0.96 - 0.3 * cloud, 0.93 - 0.26 * cloud);
    this.hemi.groundColor.setRGB(0.3, 0.29, 0.2);
    this.scene.environmentIntensity = ((0.02 + 0.18 * day) * (1 - 0.3 * cloud) + 0.12 * cloud * day) / SKY_GAIN;
    const density = Math.max(this.baseFogDensity, 1.978 / Math.max(visibilityM, 50));
    fog.density = density;
    this.fogMix = { overcast: Math.min(1, cloud * 0.9 + (visibilityM < 3000 ? 0.3 : 0)), night: 1 - (0.03 + 0.97 * day) };
    this.updateFogColour();
    this.water.setSky({ sunDir: this.sunDir, fogColor: fog.color, fogDensity: density, cloud, day, glint: Math.max(0, sunVis), sunColor: SUN_COLOUR });
    this.clouds.set(cloud, lowCloud, day, this.sunDir, fog.color, Math.min(1, Math.max(0, (6000 - visibilityM) / 5000)), SUN_COLOUR, warm);
    this.rain.setRate(rainMmH);
    this.renderer.toneMappingExposure = 0.9 * (0.75 + 0.25 * day);
    if (!(Math.abs(w.sunElevationDeg - this.envFor.el) < 3) || !(Math.abs(cloud - this.envFor.cloud) < 0.15)) {
      this.rebuildEnvironment();
      this.envFor = { el: w.sunElevationDeg, cloud };
    }
  }

  private updateFogColour(): void {
    const fog = this.scene.fog as THREE.FogExp2;
    const h = this.graphics.atmosphere ? this.horizon : null;
    if (h) {
      const d = new THREE.Vector3();
      this.camera.getWorldDirection(d);
      const az = Math.atan2(d.x, -d.z);
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let k = -2; k <= 2; k++) {
        const a = az + (k * 15 * Math.PI) / 180;
        const f = ((((a / (2 * Math.PI)) % 1) + 1) % 1) * 16;
        const i0 = Math.floor(f) % 16;
        const i1 = (i0 + 1) % 16;
        const t = f - Math.floor(f);
        const w = 1 - Math.abs(k) * 0.2;
        r += w * (h[i0 * 3]! * (1 - t) + h[i1 * 3]! * t);
        g += w * (h[i0 * 3 + 1]! * (1 - t) + h[i1 * 3 + 1]! * t);
        b += w * (h[i0 * 3 + 2]! * (1 - t) + h[i1 * 3 + 2]! * t);
        wsum += w;
      }
      fog.color.setRGB(r / wsum, g / wsum, b / wsum, THREE.SRGBColorSpace);
    } else fog.color.copy(FOG);
    fog.color.lerp(FOG_OVERCAST, this.fogMix.overcast).lerp(NIGHT, this.fogMix.night);
    this.water.setFogColour(fog.color);
    this.clouds.setFogColour(fog.color);
  }

  /** Game position (m ODN height) to scene coordinates. */
  toScene(e: number, n: number, h: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(e, h - this.waterLevel, -n);
  }

  setCameraMode(mode: GullCamera): void {
    const was = this.mode;
    this.mode = mode;
    const reduced = this.reducedMotion || this.systemReduced;
    this.blend = !reduced && was !== mode && mode !== 'orbit' && was !== 'free' ? { p: this.camera.position.clone(), q: this.camera.quaternion.clone(), t: 0 } : undefined;
    this.controls.enabled = mode === 'orbit';
    this.viewModel.visible = mode === 'first';
    const near = mode === 'first' ? NEAR_FIRST : NEAR;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The wheel: zoom the chase and scenic cameras. */
  zoom(deltaY: number): void {
    this.chaseDist = Math.max(1.8, Math.min(16, this.chaseDist * Math.exp(deltaY * 0.001)));
  }

  /** A fixed viewpoint (game coordinates) that does not follow the gull: screenshots and the title screen. */
  freeCamera(pos: [number, number, number], target: [number, number, number]): void {
    this.mode = 'free';
    this.blend = undefined;
    this.controls.enabled = false;
    this.toScene(pos[0], pos[1], pos[2], this.camera.position);
    const t = this.toScene(target[0], target[1], target[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(t);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.post?.resize();
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.sun.resize();
  }

  /** Draw a frame. */
  render(g: GullPose | undefined, env: GullSceneEnv): void {
    if (this.lost) return;
    this.waterLevel = env.waterLevel;
    if (Math.abs(env.windSpeed - this.lastWind.tws) > 0.3 || Math.abs(env.windFromDir - this.lastWind.twd) > 0.05) {
      this.water.setWind(env.windSpeed, env.windFromDir);
      this.lastWind = { tws: env.windSpeed, twd: env.windFromDir };
    }
    const focus = g ? this.toScene(g.e, g.n, g.h) : this.camera.position.clone();
    if (env.sea) this.water.updateField(env.sea, this.camera.position.x, this.camera.position.z, env.time, env.sea(g?.n ?? 0, g?.e ?? 0), env.current ?? { n: 0, e: 0 });
    if (g && this.mode !== 'free') this.updateCamera(g, env);
    if (this.graphics.atmosphere && this.horizon) this.updateFogColour();
    SUN_THROUGH.uSunDirView.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse);
    SUN_THROUGH.uSunLight.value.copy(SUN_COLOUR).multiplyScalar(this.sunIntensity);
    this.sun.update(focus);
    this.water.update(env.time, this.camera);
    const to = env.windFromDir + Math.PI;
    const wx = Math.sin(to) * env.windSpeed;
    const wz = -Math.cos(to) * env.windSpeed;
    this.clouds.update(this.camera, env.frameDt, wx, wz);
    this.rain.update(this.camera, env.frameDt, wx, wz);
    if (this.dart && env.dart) {
      this.dart.update({ ...env.dart, windAt: env.dart.windAt ?? env.windAt, camera: this.camera, time: env.time });
      this.water.setWaterLevel(env.dart.waterLevel);
    }
    this.game.position.y = 0;
    const drawn = this.water.reflectionWanted && this.reflection.render(this.renderer, this.scene, this.camera, [this.water.mesh, this.water.farMesh, this.rain.lines, this.viewModel], (this.scene.fog as THREE.FogExp2 | null)?.color ?? FOG);
    this.water.reflectionDrawn(drawn);
    VIEWPORT.uViewportH.value = this.renderer.getDrawingBufferSize(this.bufferSize).y;
    if (this.graphics.ambientOcclusion) {
      this.post ??= new PostPipeline(this.renderer, this.scene, this.camera);
      this.post.render(env.frameDt);
    } else this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(g: GullPose, env: GullSceneEnv): void {
    const dt = env.frameDt;
    const reduced = this.reducedMotion || this.systemReduced;
    setFlagMotionReduced(reduced);
    const body = this.toScene(g.e, g.n, g.h);
    const c = Math.cos(g.pitch);
    const look = new THREE.Vector3(Math.sin(g.yaw) * c, Math.sin(g.pitch), -Math.cos(g.yaw) * c);
    const bankTarget = reduced || !g.airborne ? 0 : Math.max(-0.38, Math.min(0.38, -g.yawRate * 0.11));
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-6 * dt));
    if (g.tumbling && !reduced) this.shake = 1;
    this.shake = Math.max(0, this.shake - dt * 2);
    let wantFov = this.baseFov + (reduced ? 3 : 11) * Math.min(1, Math.max(0, (g.speed - 12) / 20));
    if (this.mode === 'chase') {
      const scout = g.scouting;
      this.wideK += ((g.wide ? 1 : 0) - this.wideK) * (1 - Math.exp(-2 * dt));
      const distance = scout ? 1.6 : this.chaseDist * (1 + 1.4 * this.wideK);
      const target = body.clone().add(new THREE.Vector3(0, 0.3, 0));
      // Over the shoulder while scouting: a little to the right.
      if (scout) target.add(new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw)).multiplyScalar(0.35));
      const desired = target.clone().addScaledVector(look, -distance).add(new THREE.Vector3(0, 0.45 + distance * 0.1, 0));
      // Keep the camera out of roofs and hills: pull in along the line to the gull.
      if (env.groundAt) {
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const p = target.clone().lerp(desired, i / steps);
          const ground = env.groundAt(p.x, -p.z) - this.waterLevel;
          if (p.y < ground + 0.35) {
            desired.copy(target.clone().lerp(desired, Math.max(0.05, (i - 1) / steps)));
            desired.y = Math.max(desired.y, ground + 0.4);
            break;
          }
        }
      }
      // Firm but not rigid: the camera trails a little behind turns (and jumps there when far off, as at the start).
      const k = this.blend || this.camera.position.distanceTo(desired) > 25 ? 1 : 1 - Math.exp(-14 * dt);
      this.camera.position.lerp(desired, k);
      const aim = target.clone().addScaledVector(look, 8);
      this.camera.up.set(0, 1, 0).applyAxisAngle(look.clone().setY(0).normalize(), reduced ? 0 : this.bank * 0.5);
      this.camera.lookAt(aim);
      this.camera.up.set(0, 1, 0);
      if (scout) wantFov = 30;
    } else if (this.mode === 'first') {
      const eye = body.clone().add(new THREE.Vector3(0, 0.14, 0));
      if (!reduced) {
        if (g.walking) {
          this.bobT += dt * 13;
          eye.y += Math.sin(this.bobT) * 0.03;
        }
        if (this.shake > 0) eye.add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, 0).multiplyScalar(this.shake));
      }
      this.camera.position.copy(eye);
      this.camera.up.set(0, 1, 0).applyAxisAngle(look.clone().setY(0).normalize(), this.bank);
      this.camera.lookAt(eye.clone().add(look));
      this.camera.up.set(0, 1, 0);
      if (g.scouting) wantFov = 30;
    } else if (this.mode === 'scenic') {
      if (!reduced) this.scenicT += dt;
      const a = this.scenicT * 0.12 + g.yaw + Math.PI * 0.75;
      const d = 9 + this.chaseDist * 2;
      const p = body.clone().add(new THREE.Vector3(Math.sin(a) * d, 3 + d * 0.25, -Math.cos(a) * d));
      if (env.groundAt) p.y = Math.max(p.y, env.groundAt(p.x, -p.z) - this.waterLevel + 2);
      this.camera.position.lerp(p, this.blend || this.camera.position.distanceTo(p) > 60 ? 1 : 1 - Math.exp(-3 * dt));
      this.camera.lookAt(body.clone().add(new THREE.Vector3(0, 0.3, 0)));
      wantFov = 45;
    } else if (this.mode === 'orbit') {
      const delta = body.clone().add(new THREE.Vector3(0, 0.3, 0)).sub(this.controls.target);
      if (delta.length() < 50) this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.controls.update();
    }
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-7 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.blend) {
      this.blend.t += dt;
      const t = Math.min(1, this.blend.t / BLEND_S);
      const e = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.blend.p, this.camera.position.clone(), e);
      this.camera.quaternion.slerpQuaternions(this.blend.q, this.camera.quaternion.clone(), e);
      if (t >= 1) this.blend = undefined;
    }
    this.camVel.set(0, 0, 0);
  }

  /** Where a game point is on screen (x, y in −1…1, y up) and whether it is behind the camera. */
  screenOf(e: number, n: number, h: number): { x: number; y: number; behind: boolean } {
    const p = this.toScene(e, n, h);
    const behind = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z > -0.05;
    const v = p.project(this.camera);
    return { x: v.x, y: v.y, behind };
  }

  /** The compass heading the camera looks along (rad). */
  get viewHeading(): number {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(d.x, -d.z);
  }

  /** Compile the scene's shaders without blocking where the browser can. */
  async warmUp(): Promise<void> {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    if (this.renderer.extensions.has('KHR_parallel_shader_compile') && typeof r.compileAsync === 'function') await r.compileAsync(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.reflection.dispose();
    this.post?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
