# Gull Britannia: engine and technology review

Reviewed 19 Nov 2026 on branch `sailsim-engine` (HEAD 81bce0f). I read all of `src/gull/`, `src/main.tsx`, `index.html`, the Vite and TypeScript configs, the vendored SailSim parts the game leans on (`scene.ts`, `dart.ts`, `water.ts`, `graphics.ts`, `dynamicResolution.ts`, `sunlight.ts`, `reflection.ts`, `post.ts`, `trees.ts`, `people.ts`, `crew.ts`, `audio*.ts`, `dispose.ts`), SailSim's PERFORMANCE.md and GRAPHICS_REPORT.md, and `tests/`.

I also measured the built game (`dist/`, served on :4180) in headless Chromium with SwiftShader, driving it through `window.__gull`. The numbers count work (draw calls, programs, textures, meshes, JS time). They do not measure GPU speed. Both Playwright scripts are throwaway and live outside the repo. No repository file was changed apart from this one.

Severity: **critical** = wrong behaviour or a cost that dominates the frame; **high** = must be fixed before building missions 3–6 on top of it; **medium** = real but local; **low** = polish or hygiene. Effort: **S** ≤ 1 day, **M** 2–5 days, **L** 1–3 weeks.

---

## Verdict

**The architecture is sound.** It has:
- a deterministic, DOM-free game layer on a fixed 60 Hz step, kept honest by a separate type-check;
- a mature scenery engine (SailSim), vendored rather than rewritten;
- React only for screens;
- a step that costs almost nothing: 0.03 ms on the ground, 0.3 ms in flight including the drop prediction.

That is a better start than most browser games have.

**Five problems sit underneath it, and the owner is probably unaware of most of them.** Fix them before more missions are built:

1. **The collision world in the old town is the coarse one.**
   - The 0.5 m grid is captured at every load and then never read. `World.cellTop` takes the first grid in the list, and the first one is the 2 m grid.
   - Measured: 100% of old-town lookups return the 2 m value, up to 18 m too high.
   - The bakery sill's cell reads the bakery roof (16.17 m against 3.39 m drawn). The Custom House gutter perch sits 0.87 m above the drawn gutter.
   - Every house is up to 2 m fatter on each side, so lanes are up to 4 m narrower than drawn.
   - The fix is one line, but it moves every perch.
2. **The game's own characters cost more to draw than the town.**
   - Mission 2's 17 people and 5 gulls are 543 visible meshes (the whole River Dart scene has 1,160).
   - On Balanced they add **+2,074 draw calls a frame**: 3,951 in total against 1,877 for the same view without them.
   - Dynamic resolution cannot help a draw-call-bound frame, and its request to lower the preset is ignored.
   - SailSim already has a one-draw-call skinned person (`crew.ts`) and a GPU-instanced crowd (`people.ts`). The game uses neither.
3. **Only the player's gull is interpolated.**
   - Guards, marchers, wingmen, poop and the item in the beak are drawn at the last step. They judder on any display that is not exactly 60 Hz.
   - The carried dispatch floats up to 0.25 m ahead of the bill at cruise speed and 0.5 m in a dive.
   - World-anchored labels (`?` `!`, names, speech) are placed at 10 Hz, so they swim against a mouse-driven camera.
4. **The mission framework will not stretch to four more missions.**
   - Missions are imperative code full of closures: they cannot be saved and have no scripting layer.
   - Mission 2's concepts leak into the base class, the controller and the view.
   - Nothing that moves can be collided with or landed on, which a ferry or submarine mission needs.
   - Guards walk in straight lines through houses and into the river.
   - The game clock is never reset, so tide and light depend on how long the player sat in the menus.
5. **The vendoring is copy-and-fork.** Some of what SailSim has since learned is missing from the fork:
   - the fix for its GPU drawing painted materials black;
   - its context-loss handling;
   - its near plane (the fork uses 0.05 m against SailSim's 0.5 m, which gives 10× worse depth precision);
   - the preset step-down.

**Smaller items:**
- The gull's shadow is 2–5 shadow-map texels on Balanced and Ultra, and characters never receive shadows.
- Shaders compile on mission start and again on the first tag.
- Each restart leaks textures and materials.
- Splats cost 4 draw calls each and leak after 80.
- Errors and a lost GPU context fail silently.
- Taps can be lost at low frame rates.
- Audio has no spatial cues and replays a burst of notes after the tab has been hidden.
- There is no CI.

**Suggested order:**
1. Fix correctness: the grid, interpolation, the clock, pre-compiling, the near plane, leaks, failure handling. These are mostly S.
2. Make the foundation measurable and repeatable: bake the collision world offline, add CI, add performance budgets and an input-command layer.
3. Rebuild characters on SailSim's people systems and fix shadows.
4. Build the mission kit (data, scripts, moving colliders, navigation) together with Mission 3 as its pilot.

Run an art and audio track in parallel: a new gull model and animation, spatial audio, ambience.

---

## What is good and should be kept

- **The model–view split.** `src/gull/game` has no DOM, Three.js or React, and `tsconfig.game.json` enforces it. Missions emit events (`MissionEvent`); the controller turns them into sound and HUD.
- **Determinism.** A fixed step with a seeded RNG per mission (`rng.ts`). `Math.random` appears only in view and audio code.
- **The fixed-step loop** has a 0.1 s clamp and a cap of 6 steps (`game.ts:497–526`): no spiral of death.
- **Flight sub-stepping.** Steps are at most 0.2 m against a 0.3 m sphere (`gull.ts:419–438`). At 32 m/s that is 3 sub-steps, so there is no tunnelling through the grid or through thin solids.
- **Forgiving flight.** Stall recovery, tumbles instead of deaths, landing assist. The numbers are sensible: stall 7 m/s, cruise 13 m/s, dive 32 m/s.
- **The drop prediction** uses the same integrator as the falling poop, so the ring is honest for still targets (moving ones are a separate problem: C9).
- **Collision read from the picture** is a good idea. Its implementation is what needs work (C1–C4).
- **The test setup**: unit tests on the game logic, plus an e2e autopilot that flies the real town in SwiftShader.

---

## Measurements

| Measure | Smooth (SwiftShader default) | Balanced (`?quality=high`, CSM + reflections) |
|---|---|---|
| Load to title screen | 10.2–16.0 s (survey started at 8.7 s) | 21.3 s |
| Whole scene at title | 1,597 meshes (1,160 visible, 568 casting shadows), 721 geometries, 20 textures | — |
| Draw calls per frame, all passes: title / M1 / M2 | 522 / 748 / 1,078 | — / 2,099 / **3,951** |
| M2, same view, mission group hidden | — | 1,877, so **the mission adds 2,074 (+110%)** |
| Mission group meshes, M1 / M2 | 153 / 567 (143 / 543 visible; 123 / 482 cast shadows; 63 / 92 materials) | same |
| Programs (compiled shaders) | 38 at title; +2 on M1's first frame; +4 more on M2's; +2 on the first tag | 73 at title; +5 on the first tag (that frame took 712 ms) |
| Textures over 6 restarts of M2 | 44 → 47 → 50 → 53 → 56 → 59 (+3 per restart: leak) | — |
| 40 splats | +160 draw calls, +160 geometries | — |
| JS heap | 260–290 MB | — |
| Game step (JS) | 0.026 ms (M2) to 0.041 ms (M1) on the ground; 0.28 ms in the air with `predictDrop` | — |
| `predictDrop` per frame | 0.14 ms (M1), 0.40 ms (M2: 30 targets, closures allocated per test) | — |
| `publishHud`, controller side | 0.01–0.02 ms (React rendering not included) | — |
| Collision grids | 2 m: 900 × 1,100 (3.8 MB); 0.5 m: 880 × 1,440 (4.8 MB, **never read**) | same |
| Bundle | JS 638 + 828 + 190 kB raw = 228 + 206 + 59 kB gzipped; maps 7 MB (deployed); geo 2.2 MB (≈1.3 MB on the wire) | — |

---

## 1. Architecture and code health

### A1. Missions are imperative code; the framework will not stretch to four more. **High**

**Evidence:**
- `mission.ts` is a base class of 1,076 lines. It holds objectives, scoring, the beak slot, poop ballistics, guard callbacks, tagging, prompts and the review.
- Mission 2's own concepts sit on the base class (`marchers`, `allies`: `mission.ts:158–161`). The controller's camera reads them (`game.ts:663`), and so does the view (`missionView.ts:381–391, 498–518`).
- Every prop kind for every mission is in one switch statement (`missionView.ts:80–266`).
- Objective targets, poop targets and timers are closures (`mission.ts:32, 51, 389–391`).
- Dialogue strings are in the code.
- Placements are literal coordinates whose heights are read from the world at run time (`m1.ts:31–51`). Fixing C1 will move them.

**Why it matters:**
- Each new mission touches the base class, the controller and the view.
- State cannot be serialised, so there are no checkpoints and no replays.
- There is no route to translations or recorded voice.
- Positions are only ever checked by flying to them.

**Recommendation:** build a small mission kit, and build it *with* Mission 3 rather than as a big-bang rewrite. **M–L**
- Typed data per mission for placements: props, perches, items, guards and routines.
- Mission scripts as generator coroutines driven by the fixed step (`yield* until(() => …); say(…); yield wait(3)`). They are deterministic, and their position can be serialised.
- An explicit objective graph.
- Each mission's view module registers its own prop builders.
- Each mission (logic, view and data) loaded as its own lazy chunk.
- Mission 2's marchers and wingmen moved into the Mission 2 module, behind a generic `actors` list.

### A2. Input is applied outside the fixed step; taps can be lost. **High**

**Evidence:**
- Mouse look changes `gull.yaw` and `gull.pitch` inside the event handler (`game.ts:359–363`).
- E, F and G call mission methods straight from `keydown` (`game.ts:401–409`).
- Held keys are a `Set` sampled once per step (`game.ts:485–493`). A key pressed and released between two frames is never seen. That covers a Space take-off and a Q poop; Q's `poopHeld` flag is set and cleared the same way (`game.ts:398–419`).
- At 20 fps (a low-end GPU) a 40 ms tap can vanish. The e2e environment runs at about 1 fps.

**Why it matters:**
- Inputs are dropped exactly on the machines that already struggle.
- There is no way to record and replay a session to reproduce a bug.
- Tests call mission methods directly instead of going through the input path.

**Recommendation:** an input layer that produces one command per step: the accumulated look delta, the held buttons, and latched "pressed since the last step" flags. Keep the last N seconds of commands in a ring buffer (a flight recorder) so bugs can be replayed in tests. Gamepad support plugs in here too. **M**

### A3. The game clock leaks across missions, and conditions are fixed at load. **High**

**Evidence:**
- `time` advances on the title, briefing and results screens (`game.ts:513–515`) as well as during play (`game.ts:550`). `startOperation` never resets it (`game.ts:291–313`).
- The tide (`game.ts:260–262`) and floating props (`mission.ts:452–468`) follow that clock.
- Sky and sun are set once, at load (`game.ts:249`).

**Why it matters:**
- The tide at mission start depends on how long the player spent in the menus. High water is 12:05 with a 3.8 m range: roughly 0.5 m lower after an hour in menus, 1.2 m after two (rule of twelfths, E).
- Mission 2's briefing says Wednesday 10:55, but the sky is Saturday 12:20.
- Mission 3 ("Low Tide") and any dusk or night mission need their own date, time, tide and weather.

**Recommendation:**
- Each mission declares its conditions.
- `startOperation` resets `time` and rebuilds the conditions.
- Call `setWeather` about once a second during play, as SailSim does. This also lets the sun move.

**S–M**

### A4. Coupling to SailSim is a fork by copy. **Medium**

**Evidence:**
- `gullScene.ts:232–322` duplicates `SceneView.applyWeather`, `updateFogColour` and `rebuildEnvironment` line for line.
- It drops what SailSim learned since:
  - the GPU material fix (`scene.ts:274, 446, 984–1000`): "painted hulls drew black on the owner's card";
  - `onContextChange` (`scene.ts:1221–1238`);
  - the listener for changes to the reduced-motion preference (`scene.ts:278`);
  - `NEAR_M = 0.5` (`scene.ts:61`).
- Vendored files are edited in place in three places.
- 22.6k lines of `src/render`, the 3.4k-line `src/app/controller.ts`, and `src/ui` are carried but mostly unused.

**Why it matters:**
- SailSim's fixes do not reach the game.
- Updating SailSim means a manual merge.
- If the owner's GPU is the one that draws painted materials black, the game's figures, props and gull will draw black on it.

**Recommendation:**
- In SailSim, factor out an `Environment` renderer (sky, sun and CSM, haze, water and reflection, cloud and rain, post-processing, GPU fixes, context handling). Have both `SceneView` and `GullScene` use it.
- Vendor SailSim as a subtree pinned to a commit, with a CI check that the vendored copy matches.
- Delete the vendored code the game does not use.

**M** (L if done properly upstream)

### A5. Failures are silent. **Medium**

**Evidence:**
- There is no React error boundary, no `window.onerror` and no `unhandledrejection` handler.
- `void game.attach(el)` (`App.tsx:19`): if the survey or the scene build throws, the loading card says "Surveying…" for ever.
- `frame()` has no `try`/`catch`. An exception repeats every frame behind a frozen picture.
- On `webglcontextlost` the view only sets a flag (`gullScene.ts:182–189`) and skips drawing (`364`), while the mission keeps stepping.
- After the context comes back, render-target contents are gone, including the PMREM sky light. It is rebuilt only after a 3° sun move, which never happens in a session, so the scene stays without sky light and the water reflects black.
- A context loss during the survey would produce a garbage collision world without anyone noticing.

**Recommendation:**
- Port SailSim's GR-3 handling: pause, show a message with a Reload button, test with `WEBGL_lose_context`.
- Rebuild the environment map when the context is restored.
- Add a catch-all error screen with "copy diagnostics" (GPU, preset, fps, last errors).
- Check the captured grid: share of NaN cells, and known heights at known landmarks (the e2e already has such checks).

**S–M**

### A6. The save system is minimal. **Medium**

**Evidence:** `progress.ts` stores `{done, best}` in localStorage, with no schema version, no migration and no per-mission statistics. Mission state cannot be serialised (A1).

**Recommendation:**
- Now: a versioned envelope `{v, progress, stats}` with migration functions, and JSON export/import. **S**
- Later: checkpoints. Once mission state is plain data (A1), a checkpoint is a snapshot. **M**

### A7. Test gaps, and no CI. **Medium**

**Evidence:**
- The 25 unit tests run on stand-in worlds with a single grid (`tests/gull/helpers.ts`, `m1world.ts`). That is why C1 passes.
- The e2e teleports past the hard parts: onto the gutter, beside the dispatch, beside the chips, onto the pile (`missions.e2e.cjs:85, 89, 103, 141, 161`).
- There are no tests of:
  - determinism (a replay hash);
  - frame-rate independence;
  - draw-call, program or texture budgets;
  - visuals (screenshots);
  - context loss.
- There is no GitHub Actions workflow. ESLint is installed but has no config and no script.

**Recommendation:**
1. Bake the collision world (C2) so that Node tests run on the real town.
2. Add a determinism test: a scripted input stream, then a hash of the final state.
3. Add an e2e performance budget per mission (draw calls, programs, textures, and the same after 5 restarts).
4. Add a CI workflow (typecheck, lint, vitest, build, e2e under SwiftShader) that gates the deploy to `gh-pages`.

**M**

### A8. Events and sound names are plain strings. **Low**

`'sfx'` and `'music'` events carry free strings, and an unknown name is silently ignored (`audio.ts:124–125`). The `stomp` voice exists but is never played: the parade marches in silence. Use union types for sound and track ids. **S**

### A9. React publishing. **Low**

Each publish copies the whole state, and the whole HUD re-renders 10 times a second (objectives, controls panel, overlays). This is cheap today. The real issue is that world-anchored overlays lag (R5).

Split the state into slices, memoise the static panels, and move world-anchored UI out of React. **S**

---

## 2. Rendering performance

### R1. Characters cost more than the town. **Critical**

**Evidence:**
- A `Figure` is 25–26 separate meshes, each with its own `BoxGeometry` (`figures.ts:28–40, 73–169`).
- A `GullModel` is 21 meshes, and each instance makes 7 new materials (`gullModel.ts:21, 88–175`).
- In Mission 2 the mission group has 543 visible meshes and 482 shadow casters, including noses, cap stars, visors and belts.
- On Balanced, each mesh is drawn in the main pass, in up to 3 CSM cascades and in the water reflection. Result: +2,074 draw calls, 52% of the frame's 3,951.

**Why it matters:**
- In Chrome/ANGLE each WebGL draw call costs roughly 5–20 µs of CPU, more when materials change. That is about 10–40 ms a frame on a mid-range laptop for 17 people (E).
- Lowering the resolution does not help a CPU-bound frame.
- Crowds, ferries and a submarine in missions 3–6 multiply the cost.

**Recommendation:**
- **(a) People.** Use SailSim's `crew.ts` skinned figure for guards and NPCs: one draw call each, with IK for hands (mug, dispatch, pointing). Colour it per uniform with vertex colours. Use `people.ts`' GPU-instanced, shader-posed crowd for the parade and other crowds, adding `march`, `attention` and `salute` activities: 12 marchers become one draw call.
- **(b) Gull.** One skinned mesh, or 3 merged meshes (body with head, two wings), with vertex colours and a single material. Draw the wingmen as instances.
- **(c) Shadows.** Characters cast through one coarse proxy only, and only within about 60 m. Items cast none.
- **(d) Distance.** Hide figures beyond about 250 m; freeze animation beyond about 80 m.
- **(e) Props.** Merge each mission's static props into one geometry (`mergeGeometries`, vertex colours).

Target: at most 60 draw calls for Mission 2's group across all passes. **M** for (a) and (b), **S** for (c)–(e).

### R2. Dynamic resolution misses the bottleneck, and its preset fallback is dropped. **High**

**Evidence:**
- `afterDraw` handles only the `'scale'` action (`game.ts:533–537`). `'lower-preset'` (`dynamicResolution.ts:111–115`) is ignored.
- The budget is 33.4 ms (`dynamicResolution.ts:36`), which targets 30 fps.
- Every real GPU defaults to Balanced (`graphics.ts:65–67`), integrated laptop GPUs included.

**Why it matters:** on an integrated GPU the game drops to 0.6× resolution and looks blurry, yet still misses its budget in Mission 2 because it is limited by draw calls, not pixels. It never steps the preset down. 30 fps is also a low target for a flight game.

**Recommendation:**
- Handle `'lower-preset'` as SailSim does: step down, tell the player, do not save. **S**
- Budget 16.7–22 ms (60–45 fps), keeping the same hysteresis.
- Measure the CPU time spent submitting each frame:
  - if the GPU is the limit, lower the resolution;
  - if the CPU is the limit, cut cascades, reflection and figure detail instead. **M**
- Run SailSim's device check on first launch to choose the preset.

### R3. Shaders compile at mission start and on the first tag. **High**

**Evidence:**
- Shader warm-up runs only at load, before any mission exists (`game.ts:250–253`).
- Mission 1 compiles +2 programs on its first frame; Mission 2 compiles 4 more (6 above the title).
- The first tag shows the vision cone for the first time: +2 programs on Smooth, +5 on Balanced, and that frame took 712 ms.
- Without `KHR_parallel_shader_compile` warm-up is skipped altogether (`gullScene.ts:500`).

**Why it matters:** a stall of 100–500 ms on Windows/ANGLE and on Safari, exactly at a gameplay beat (the start of the mission, the moment of tagging).

**Recommendation:**
- Build `Mission` and `MissionView` while the briefing is on screen.
- Make every object briefly visible (cones, glints, perch rings, marker, splat and cap meshes, drop ring), call `sun.prepareNow`, then `compileAsync`, or draw one frame off screen.
- Test that the program count does not grow after the first frame of a mission.

**S**

### R4. Only the player's gull is interpolated. **High**

**Evidence:**
- `pose()` interpolates the gull (`game.ts:645–665`).
- `MissionView.sync` draws guards, NPCs, marchers, wingmen, items, poop and caps at their current state (`missionView.ts:446–547`).
- The held item follows `beakPosition()`, which uses the current (not interpolated) gull (`mission.ts:471–485`).

**Why it matters:**
- On 75, 120 and 144 Hz screens, and with uneven frame pacing at 60 Hz, everything except the gull moves in 16.7 ms steps.
- The wingmen, at 15–30 m/s beside a smoothly moving player, judder visibly.
- The carried item is drawn (1 − α)·v·Δt ahead of the bill: up to 0.25 m at 15 m/s and 0.5 m at 30 m/s, jittering as α changes from frame to frame.

**Recommendation:**
- Keep the previous pose of every actor (in the view, keyed by id) and draw all of them at α.
- In the view, attach the held item to the gull model's bill rather than reading its simulated position.

**S–M**

### R5. World-anchored overlays update at 10 Hz. **Medium**

**Evidence:**
- Guard names, `?` and `!` icons, suspicion meters, speech bubbles, the ON TARGET marker and the off-screen arrow are projected in `publishHud` 10 times a second (`game.ts:719–778`) and laid out by React (`App.tsx:244–268`).
- Screenshot 05 shows five speech bubbles on top of each other.

**Why it matters:** a mouse-driven camera turns at 200–300° a second. A label lags its head by up to 100 ms, then jumps, which reads as a bug.

**Recommendation:**
- Project every frame and write `translate3d` to pooled DOM nodes through refs (no React render), or draw the labels in WebGL.
- Keep React for content changes only.
- Spread overlapping bubbles apart.

**S–M**

### R6. Depth precision. **Medium**

**Evidence:** `NEAR = 0.05` (`gullScene.ts:28`) with a far plane at 25,000 m (`gullScene.ts:131`), against SailSim's `NEAR_M = 0.5` (`scene.ts:61`). With a 24-bit depth buffer, depth resolution is about z²/(near·2²⁴):

| Distance | Depth resolution |
|---|---|
| 500 m | 0.30 m |
| 1 km | 1.2 m |
| 2 km | 4.8 m |

That is 10× worse than SailSim at every distance.

**Why it matters:** z-fighting where roads and kerbs are draped on the terrain, at quay edges against the water, at roof and wall joins, and on distant hills, in the title flight and at altitude.

**Recommendation:**
- Near 0.25–0.3 m for chase, scenic, orbit and title cameras; 0.05 m only in first person.
- Optionally `reversedDepthBuffer: true` where `EXT_clip_control` exists (not in Safari).

**S**

### R7. Splats: 4 meshes each, leaking after 80. **Medium**

**Evidence:**
- Each splat is 4 new `SphereGeometry` meshes (`missionView.ts:410–424`). Measured: 40 splats = +160 draw calls and +160 geometries.
- After 80, the oldest splats are removed without being disposed (`missionView.ts:439–442`).
- A flock strike in Mission 2 makes dozens of splats at once.

**Recommendation:** one `InstancedMesh` ring buffer of about 128 flat, textured quads, oriented to the surface normal with a polygon offset. Splats on uniforms become instanced children of the figure. **S**

### R8. GPU resources leak on every restart. **Medium**

**Evidence:**
- `MissionView.dispose` frees geometries only (`missionView.ts:572–578`).
- Never freed:
  - the canvas textures for boat names and banners (`missionView.ts:121–135, 215–229`);
  - the materials made per build (`M()`, the 7 materials of each wingman's `GullModel`, each `Figure`'s mug).
- Measured: +3 textures on every Mission 2 restart.

**Recommendation:**
- Use SailSim's `disposeObject` (`src/render/dispose.ts`) with `sharedAll(MAT)`.
- Cache the name and banner textures by their text.
- Add the leak to the performance budget test (A7).

**S**

### R9. Per-frame scene walks and allocations: small now, growing with content. **Low**

**Evidence:**
- `SunLight.prepare` walks the whole scene every frame (`sunlight.ts:120, 143–149`): about 3,200 objects in Mission 2. On Ultra the GTAO pass walks it again (`post.ts`).
- The camera code allocates about 35 `Vector3`s a frame (`gullScene.ts:401–466`).
- `sync` allocates a vector per actor (`missionView.ts:478`).
- `collideSphere` builds a `Set` and string keys on every sub-step (`world.ts:217–226`).
- `predictDrop` costs 0.40 ms a frame in Mission 2.

**Recommendation:**
- `prepare` only when the scene changes (a dirty flag set when a `MissionView` is built).
- Reusable scratch vectors and numeric cell keys.
- `predictDrop` at 20 Hz.

**S**

### R10. The game keeps drawing at full rate while paused. **Low**

**Evidence:** `frame()` draws every animation frame regardless of pause (`game.ts:517–519`), under menus that use `backdrop-filter: blur` (`gull.css:165, 409`).

**Recommendation:** while paused, draw once (or at about 10 fps) and keep the last picture. This saves battery and heat on laptops. **S**

### R11. Ultra multisamples twice. **Low**

**Evidence:** the renderer is created with `antialias: true` (`gullScene.ts:119`), and the post-processing chain draws into its own 4× MSAA half-float target (`post.ts:24`). At `maxPixelRatio` 2 that is two large multisampled buffers.

**Recommendation:** no default-framebuffer MSAA when post-processing is on (create the renderer accordingly), or use SMAA in the chain. This applies to SailSim too. **S–M**

---

## 3. Collision and physics

### C1. The fine collision grid is never read. **Critical**

**Evidence:**
- `World.cellTop` and `cellBox` return the *first* grid in the array that covers the point (`world.ts:166–187`). The comments say "the finest" (`world.ts:165`, `heightCapture.ts:120`).
- `CAPTURE_AREAS` lists the 2 m grid first (`game.ts:40–43`).
- Measured in the browser, at both presets, over 20,000 random points in the old-town area:
  - 17,961 points differ between the two grids;
  - **all 17,961 return the 2 m value, none the 0.5 m one**;
  - the largest difference is 18.3 m.

Mission 1 places, as the game reads them and as they are drawn:

| Place | `cellTop` (2 m grid, used) | Fine grid (as drawn) | Error |
|---|---|---|---|
| Gutter perch | 14.64 | 13.77 | +0.87 m |
| Pasty sill | 16.17 (the bakery roof) | 3.39 | +12.78 m |
| Table | 3.45 | 3.46 | none |
| Lamp | 3.75 | 3.75 | none |

- Each 2 m cell keeps the highest of its 4 samples, so every cell touching a wall takes the roof's height. Houses grow by up to 2 m on each side and lanes shrink by up to 4 m.
- Guards' line of sight and the camera's collision use the same fattened town.

**Why it matters:**
- The README's promise ("everything you see is solid… any gap between houses is a way through") is false in the very area both missions use.
- Perches float above what is drawn.
- Half the load-time survey is wasted.
- Neither the unit tests (one grid) nor the e2e (teleports, loose checks) can see it.

**Recommendation:**
- In `World`'s constructor, sort the grids from finest to coarsest. One line.
- Re-run the e2e and re-place perches and props: the gutter, sill, lamp and fort will move.
- Add a unit test with two overlapping grids.
- Add an e2e check that each perch is within 0.2 m of the fine grid.

**S + S**

### C2. The collision world is captured on the player's GPU at every load. **High**

**Evidence:**
- `captureHeights` draws the whole fixed scenery 12 times (tiles) and reads each tile back synchronously, 4 MB a time (`heightCapture.ts:175–197`).
- The result depends on:
  - the rasterizer;
  - the scenery detail level (`detail: view.quality`, `game.ts:234`);
  - SailSim's object names (the `SKIP` list, `heightCapture.ts:27`).
- Nothing checks the result.
- Covering future mission areas at 0.5 m would multiply the cost: the whole play area at 0.5 m is 14 M cells, 57 MB as Float32.

**Why it matters:**
- Slower first interaction on every visit.
- Collision differs between machines and presets, and between the SwiftShader e2e and real players.
- Tests cannot use the real town.
- Any SailSim change to the fixed scenery silently changes gameplay.

**Recommendation:**
- Bake the grids at build time with the existing Playwright setup, always at high detail, into packed int16 files with centimetre precision. Use SailSim's i16z packing (estimated 0.5–1.5 MB).
- Load them like the other grids. Keep the run-time capture as a developer tool.
- Fine tiles only where missions need them.
- An explicit collision allow-list (a three.js layer) instead of a skip-list of names.
- A CI check whenever SailSim is updated.

This also unlocks Node tests and tooling on the real town (A7). **M**

### C3. 2.5-D limits: nothing has an underside. **High**

**Evidence:**
- Every cell is solid from the bottom up to its top (`world.ts:4–7`), and the capture looks straight down (`heightCapture.ts:184–186`).
- What this seals:
  - the Boat Float's arch under the Embankment, which SailSim draws (`boatfloat.ts:21–22`);
  - eaves and porches;
  - tree crowns, which are solid down to the ground (no flying under a tree, no perching in one);
  - any bridge, arch or colonnade added later.
- Thin things are captured unreliably. At 1 m sampling (2 m grid, 2× supersampling) a 15 cm mast is usually missed, and otherwise becomes an invisible 2 × 2 m column.

**Recommendation:** choose one of these before missions 3–6 depend on arches or routes under bridges.
- **Two-layer grid** (**M**): also capture from below (or depth-peel) and store the bottom and top of the highest slab in each cell. A bottom more than 0.8 m above the ground is an opening. Collide against those intervals. About +50% memory.
- **BVH** (**L**): `three-mesh-bvh` over a simplified static collision mesh with sphere or capsule casts. Exact, but costs more memory (tens of MB).

In either case, make masts, lamp posts and railings explicit solids taken from SailSim's feature data instead of rasterising them.

### C4. Nothing that moves is solid. **High**

**Evidence:**
- Only `dart.fixed` is captured (`heightCapture.ts:130–134`).
- SailSim's floating scenery (moored and berthed boats, pontoons: `dart.ts:227–228`) and its traffic (ferries) have no collision. The gull flies through every boat except the three mission props.
- Floating props move only up and down (`mission.ts:452–468`).
- A gull standing on a moving solid has no notion of the platform it is on. It would slide off, and after 0.22 s off the floor it falls (`gull.ts:309–313`).

**Why it matters:** boats and masts are a gull's natural perches in a harbour. Mission 4 (a submarine) and Mission 6 ("The Last Ferry") need moving platforms the gull can land on.

**Recommendation:**
- A dynamic collider layer: solids attached to a moving transform (position and yaw each step), with perches in that frame.
- A grounded gull remembers its platform and moves with it.
- Generate a hull box, a mast and a masthead perch for SailSim's berthed boats from the berth data, rising and falling with the tide.

**M**

### C5. The walkable step does not match the cell size; roofs cannot be walked. **Medium**

**Evidence:**
- `STEP` is 0.45 m (`world.ts:113`). On the 2 m grid, which is in use everywhere (C1), a 35° roof is a staircase of 1.4 m steps, i.e. walls.
- `floorNormal` throws away slope wherever a step exceeds 0.9 m (`world.ts:297–305`).
- Even on 0.5 m cells, roofs steeper than about 42° (common for Dartmouth slate) become walls.
- Touching down on a stepped roof can lift the gull by up to 0.9 m (`world.ts:250–252`).

**Recommendation:** once C1 is fixed, take slope from a smoothed (bilinear) field rather than the staircase, treat a consistent gradient up to about 55° as floor, and scale walking speed by slope. **S–M**

### C6. NPCs walk in straight lines. **Medium**

**Evidence:** `Guard.moveTo` and `Marcher.toward` walk straight at the target and set their height to the ground there (`guard.ts:410–424`, `parade.ts:91–100`). The only limit is a box around their area.

**Why it matters:** a guard who chases or investigates walks through houses, props and other guards, and into the river, where the ground is the river bed under the water. A town-wide patrol, a chase, or a dog in "The Dachshund Exchange" would show this at once.

**Recommendation:**
- Route patrols and chases with A* on SailSim's road and footway network. `roads.json` is already loaded, and SailSim's street walkers use it with keep-out rules.
- Local avoidance between actors.
- A "can stand here" test on the baked grid.

**M**

### C7. The air is still. **Low**

**Evidence:**
- The flight model is kinematic (`gull.ts:347–416`):
  - the flight path eases toward the look direction (time constant about 0.3 s at cruise);
  - height and speed are traded through −dir.h·g;
  - drag is quadratic;
  - stalls always recover.
- Wind does not move the gull and gives no lift, although the environment has a wind field and terrain wind (`sim/env/terrainWind.ts`).

**Why it matters:** hanging in the updraft at a roof edge or along the sea front is a herring gull's signature move. It would be free gameplay and feel.

**Recommendation:** fly relative to the wind, and add a gentle, tunable lift term from wind × slope, precomputed from the baked grid. **M**

### C8. Determinism across machines. **Low**

**Evidence:** the collision world comes from the GPU (C2). `Math.sin`, `atan2` and `hypot` are not guaranteed to give identical bits in V8, JavaScriptCore and SpiderMonkey.

**Why it matters:** fine for single player. Replays, ghosts and leaderboards would only compare within one browser engine.

**Recommendation:** bake the world (C2) and keep replays per engine, or accept the limit and write it down. **S** (a decision)

### C9. The drop prediction ignores moving targets. **Medium**

**Evidence:** `predictDrop` tests targets at their *current* position (`gull.ts:597–613`, `game.ts:689`, `mission.ts:788–795`). Marchers move at 1.3 m/s, and a poop dropped from 20 m falls for about 1.6 s. The red "ON TARGET" ring can therefore be about 2 m wrong, against a 0.72 m target radius, in the very mission built around hitting moving soldiers.

**Recommendation:** targets expose their velocity, and the prediction tests each target at its position at the time of flight. **S**

---

## 4. Cameras

### K1. Chase-camera collision is a coarse height probe. **Medium**

**Evidence:**
- 12 point samples of `world.cellTop` between the gull and the camera (`gullScene.ts:417–429`):
  - mission solids are ignored (wheelhouse, canopy, pile, lamp);
  - samples are 0.35–1.3 m apart over the 4.2–16 m zoom range, so they step over chimneys and parapets.
- The camera snaps in, then eases in *and out* at the same fast rate (k = 1 − e^(−14Δt), `gullScene.ts:431–432`). It pumps when the gull skims along roofs.
- In a lane, the minimum pull-in (5%) can put the camera inside the gull (about 0.2 m away), with no fade.

**Recommendation:**
- A sphere cast (r ≈ 0.25 m) against the grid and the solids.
- Pull in fast (about 20/s), let out slowly (about 3/s, with a short hold).
- Two "whisker" probes to anticipate walls.
- Fade the gull below about 0.8 m and hide it below about 0.4 m.

**S–M**

### K2. Mode changes blend in world space. **Medium**

**Evidence:** the blend runs from the camera's world position at the moment of the switch (`gullScene.ts:333, 472–479`).

**Why it matters:** at 30 m/s, the 0.6 s blend drags the view back up to 18 m: a lurch.

**Recommendation:** blend the offset relative to the gull, and the orientation, rather than absolute positions. **S**

### K3. Interpolated yaw scales the latest mouse input. **Low–medium**

**Evidence:** the drawn yaw is prev + α·(yaw − prev) (`game.ts:649–655`), but `yaw` already includes mouse movement since the last step. Pitch is not interpolated at all (`game.ts:656`).

**Why it matters:** recent mouse movement is shown at a fraction α (0–1) that changes from frame to frame. The aim feels slightly mushy and jittery, and yaw and pitch respond differently.

**Recommendation:** interpolate positions only. Point the camera with the latest yaw and pitch (A/D banking can be added on top). **S**

### K4. Framing and field of view. **Low**

**Evidence:**
- Chase is rigid to the mouse (aim = gull + look·8; the position settles with a 70 ms time constant). That is good for aiming drops.
- There is no look-ahead in a dive and no downward bias when braking near a perch.
- Roll is half the bank, which is good, and it respects reduced motion.
- The default field of view is 70° vertical (about 102° horizontal at 16:9), and it gets extreme on ultrawide screens.

**Recommendation:**
- A small look-ahead along the velocity.
- A downward bias when the landing assist is held.
- A field of view that keeps the horizontal angle on wide screens, with a horizontal FOV setting.

**S**

### K5. First person. **Low**

Only the bill is visible. Flashing wingtips at the screen edges on each flap would be a cheap, large gain in feel. The camera shake uses `Math.random`, which is fine in the view. **S**

---

## 5. Audio

### S1. No spatial sound, no limiter, no ducking. **Medium**

**Evidence:**
- Positioned sounds are only attenuated by 1/(1 + d/10) from the camera (`audio.ts:111–127`). There is no panner and no listener orientation.
- The master chain is gain → destination with no compressor (`audio.ts:53–59`).
- SailSim's own engine already has `PannerNode` (HRTF and equal-power) driven by the camera's pose (`render/audio.ts:205, 271–283`, `scene.ts listenerPose`).

**Why it matters:**
- You cannot hear where the whistle came from, or which guard said "Hm?". In a stealth game that is the main audio cue.
- Mission 2's stacked events (four squawks per flock call, splats, the alert chord) can clip.

**Recommendation:**
- A `PannerNode` per positioned voice (equal-power is cheap), with the listener's pose updated every frame.
- A limiter on master.
- Duck the music under radio messages and alerts.

**S–M**

### S2. A burst of notes after the tab has been hidden; audio ignores pause. **Medium**

**Evidence:**
- `schedule()` plays every missed beat: `while (nextBeat < currentTime + 0.15)` (`audio.ts:290–301`). Browsers throttle `setInterval` to 1 s or more in hidden tabs.
- Nothing suspends the audio context when the tab is hidden.
- Pause leaves the loops and music running.

**Why it matters:** in a background tab, and on return, a second's worth of notes fires at once.

**Recommendation:**
- If `nextBeat` has fallen behind `currentTime`, snap it back onto the beat grid instead of playing the missed notes.
- Suspend the context when the tab is hidden; resume when it is visible again.
- Fade the loops out on pause.

**S**

### S3. Pure synthesis caps the quality. **Medium**

**Evidence:**
- The herring gull's call is a sawtooth through a band-pass filter (`audio.ts:213–227`).
- Flaps are filtered noise, and the harbour bed is low-passed noise.
- There is no town ambience (crowd murmur, distant engines, church bells, rigging, other gulls).
- The parade has no footsteps.
- Mother has no voice.
- SailSim has a sample manifest that records each file's source and licence (`render/audioSamples.ts`). It fits the owner's "own recordings or licensed with a source" rule.

**Recommendation:**
- Use that manifest approach.
- Record or license about 20 one-shots and 4 beds (gull calls, wing beats, splashes, marching, a Mother radio burble) as MP3 or AAC: about 1–2 MB, fetched after the title screen.
- Keep the synthesised music, which has charm.
- Add stingers and bar-aligned crossfades instead of a hard switch of track (`audio.ts:283–288`).

**M**

---

## 6. Loading, build and delivery

### L1. The path to the first interaction. **Medium**

**Evidence:**
- About 1.8 MB goes over the wire:
  - JS: 493 kB gzipped;
  - geo data: about 1.3 MB (elevation 583 kB, features 218 kB gzipped, town 159 kB, drape 140 kB, current 92 kB, roads 58 kB, water mask 46 kB).
- The geo download starts only after the JS has been parsed and `attach()` has run (`game.ts:209`).
- After that come the scene build, the survey (C2) and the shader warm-up.
- Load to the title screen took 10–16 s on Smooth and 21 s on Balanced under SwiftShader.

**Recommendation:**
- `<link rel="preload" as="fetch" crossorigin>` in `index.html` for the manifest, elevation, town and features.
- Bake the grids (C2), or cache them in IndexedDB keyed by the build hash.
- Let the title and briefing screens appear while the scene finishes building.
- Lazy-load the Ultra-only post-processing (EffectComposer, GTAO) and each mission's code.

**S–M**

### L2. A stale `index.html` after a deploy. **Medium**

**Evidence:**
- The `gh-pages` branch holds only the current build (`git ls-tree origin/gh-pages`), so a deploy deletes the old hashed chunks.
- GitHub Pages caches HTML for 10 minutes.
- The geo files have fixed names.

**Why it matters:**
- For up to 10 minutes after a deploy, a returning player can load the old HTML, whose chunks now return 404: a blank page.
- A change to the geo format could mix old cached data with new code.

**Recommendation:**
- Keep the previous build's `assets/` when deploying.
- Version the geo folder (or add a build hash to its URLs).
- Reload once automatically if a chunk fails to load.

**S**

### L3. Source maps are deployed. **Low**

`sourcemap: true` (`vite.config.ts:10`) puts 7 MB of `.map` files on `gh-pages`. Players never download them, and they expose source that is presumably public anyway. Use `'hidden'` maps and keep them as a build artefact for error reports. **S**

### L4. No service worker. **Low**

With the grids baked, the whole game is about 3 MB. A service worker that precaches it would make repeat loads instant and allow offline play. Weigh that against stale-cache bugs: it needs version and update handling. **M**

### L5. Bundle hygiene. **Low**

- The three.js chunk is 828 kB minified (206 kB gzipped).
- The app chunk includes about 960 kB of `src/render` source and 390 kB of `src/sim`. Among it are SailSim's Squib model and its boat damage and flooding modules, pulled in transitively.

Check with a bundle visualiser, cut imports the game does not use, and lazy-load post-processing. **S–M**

### L6. Platform coverage. **Low** (documentation and decisions)

- **Safari** (WebGL 2, required by three.js r186; Safari 15+):
  - `DecompressionStream` needs Safari 16.4+.
  - Without `KHR_parallel_shader_compile` the warm-up is skipped, so R3 hurts most there.
  - No reversed depth, so fix the near plane (R6).
  - `requestPointerLock` returns no promise (already handled).
- **Phones and tablets:** no touch controls, no pointer lock on iOS, and 260–290 MB of JS heap plus GPU memory. Say so on load rather than failing.
- **Gamepads:** not supported. A pad is a natural fit for a flight game; add it through A2.
- **Raw mouse:** request pointer lock with `{unadjustedMovement: true}` to bypass OS mouse acceleration.

**S each**

---

## 7. Visual fidelity

### V1. The asset players look at most is the crudest. **High** (art track)

**Evidence:**
- The gull is 21 primitives (`gullModel.ts:88–175`): spheres for the body and head, cones for the bill and tail, and two flat quads per wing segment.
- It has no texture, no feather breakup and no wrist joint.
- The wing beat is a symmetrical sine (`gullModel.ts:218–231`).
- The head turns rigidly with the body: no head stabilisation.
- There is no landing pose (feet forward, tail fanned) and no take-off hop.
- At the default 4.2 m chase distance it fills a large part of the screen, in front of photo-draped scenery.

**Recommendation:**
- **Model.** An authored gull of 2–5k triangles, the owner's own, made in Blender or lofted in code. Skinned rig: shoulder, elbow, wrist, tail fan, neck and head. Vertex-colour or painted feather groups, and alpha-tested primaries with the white mirrors.
- **Animation**, procedural on top:
  - an asymmetric beat: fast downstroke, hand folded on the upstroke;
  - small adjustments while gliding;
  - the head held level with the horizon;
  - tail fanned and feet down when braking;
  - wings tucked in a dive;
  - a flare at touchdown.
- **Delivery.** One or two draw calls, shipped as glTF with meshopt compression (about 100–200 kB).

**M–L**

### V2. The gull's own shadow is lost, and characters are never shaded. **High**

**Evidence:**
- `GullModel` sets `receiveShadow = false` on every mesh (`gullModel.ts:172–174`). `Figure` never sets it (`figures.ts:28–40`). Guards and the gull are therefore fully sunlit inside the shade of a house.
- CSM uses 3 cascades with a practical split (λ 0.5) out to 1,100 m (`sunlight.ts:45, 70`). The first cascade covers about 0–185 m, so a 2048² map spans about 550 m: roughly 27 cm per texel.
- The gull's shadow is therefore about 2 × 5 texels on Balanced (about 13 cm per texel on Ultra): effectively invisible.
- On Smooth, the single shadow map covering 20 m around the gull gives a crisp shadow, so **the lowest preset has the best gull shadow**. On the other hand, figures more than about 10 m from the gull get no shadow at all on Smooth.

**Why it matters:**
- The gull's shadow on a roof is the main depth cue for landing and for aiming drops.
- Characters lit by full sun in the shade look pasted on.

**Recommendation:**
- **(a)** Set `receiveShadow` on characters, tuning the normal bias for the thin wings. **S**
- **(b)** Give the gull a close-range "hero" shadow: a second shadow map of 1024² covering ±10 m around the gull, with only the game layer casting. Alternatively, 4 cascades with custom splits (about 15 m / 80 m / 350 m / 1,100 m). **M**
- **(c)** Put soft blob shadows under every actor and item on every preset. **S**

### V3. Two styles of person in one picture, and poses that snap. **Medium**

**Evidence:**
- The town's walkers are SailSim's instanced people. The game's guards are box figures.
- `Figure.pose` resets every joint and sets the new animation's pose outright each frame. Changing animation (idle → sip → point → throw) therefore snaps, with no blend (`figures.ts:172–307`).

**Recommendation:**
- One figure system for everyone (R1a).
- Blend joint angles toward the target pose (time constant 0.15–0.25 s).
- Spend the detail on silhouettes: caps, greatcoats, rifles.

**M** (comes with R1)

### V4. No particles and no contact with the water. **Medium**

**Evidence:**
- Splashes, plops, landings, tumbles and knocks make only a sound (`game.ts:565–570`).
- There are no feathers, spray, ripple rings or poop trails.
- A gull floating on the water leaves no wake, although SailSim's wake, hull foam and bow spray code is available (`render/boatWater.ts`).

**Recommendation:**
- One small instanced particle system: feathers on a knock, a splash crown and ring on the water, dust on roofs.
- A small V-wake for the paddling gull, reusing SailSim's wake ribbon.

**M**

### V5. Props are flat-coloured primitives beside textured scenery. **Low**

**Evidence:**
- Props are flat-coloured primitives next to SailSim's textured scenery.
- The lobster pot is drawn in wireframe (`missionView.ts:144`): one-pixel lines at every distance, aliased.
- There is no level of detail for game objects. Vision cones show up to 140 m away (`missionView.ts:484`).

**Recommendation:**
- A shared prop atlas drawn on a canvas (wood grain, paint, rope).
- Merge the props per mission (R1e).
- A distance cut-off for cones and glints.

**M**

### V6. Lighting is consistent, with gaps. **Low**

- The game uses the same sun, hemisphere light, sky light (IBL) and fog with MeshStandard materials throughout. Good.
- Gaps:
  - the GPU fallback for black materials is missing (A4);
  - the sun never moves (A3);
  - figures are not shaded (V2).

---

## Top 15, in order of work

| # | Item | Severity | Effort | Why now |
|---|---|---|---|---|
| 1 | **C1**: read the finest grid first; re-place perches; test with two grids | Critical | S | Collision, perches, sight lines and the camera are all wrong in the main play area |
| 2 | **R4 + K3**: interpolate every actor; attach the held item to the bill; aim the camera with the latest look | High | S–M | Visible judder and a floating dispatch on most screens |
| 3 | **A3**: per-mission clock and conditions (time, tide, sky); `setWeather` during play | High | S–M | Results depend on time spent in menus; Mission 3 needs it |
| 4 | **R3**: build the mission during the briefing; `compileAsync` everything, cones and glints included | High | S | Stalls at the start of a mission and on the first tag |
| 5 | **R6**: near plane 0.25–0.3 m outside first person | Medium | S | 10× better depth precision |
| 6 | **R7 + R8**: instanced splats; dispose textures and materials with SailSim's `disposeObject` | Medium | S | Leaks, and +4 draw calls per splat |
| 7 | **A5 + S2**: handle a lost context (pause, rebuild environment, message); error screen; audio resync and suspend; check the grid | Medium | S–M | Silent failures and broken lighting after a context loss |
| 8 | **R1**: guards and NPCs on SailSim's `crew.ts`; crowds on `people.ts` instancing; merged gull; shadow proxies; distance culling | Critical | M | The mission adds +2,074 draw calls today; missions 3–6 multiply it |
| 9 | **R2**: handle `lower-preset`; 60/45 fps budget; tell CPU-bound from GPU-bound; first-run device check | High | S–M | Integrated-GPU laptops will be blurry *and* slow |
| 10 | **V2**: characters receive shadows; hero shadow for the gull; blob shadows | High | S–M | The landing cue is missing on Balanced and Ultra |
| 11 | **C2 + C3**: bake a two-layer collision world at build time; explicit thin solids; collision layer instead of a skip-list | High | M | Faster loads, the same collision for everyone, arches and bridges become possible |
| 12 | **A7**: CI (typecheck, lint, vitest, build, SwiftShader e2e); Node tests on the baked town; determinism hash; draw-call, program and leak budgets | Medium | M | Locks in 1–11 and catches the next C1 |
| 13 | **A2**: input-command layer (latched taps, look deltas per step, flight recorder, gamepad hook) | High | M | Taps lost on slow machines; replays to debug |
| 14 | **C4 + C6**: moving colliders and platforms, solid moored boats with masthead perches, guard navigation on SailSim's road network | High | M + M | Prerequisites for the ferry and submarine missions and for town chases |
| 15 | **A1 + A6**: mission kit (data placements, coroutine scripts, objective graph, per-mission view and lazy chunk), versioned save | High | M–L | Build it with Mission 3 as the pilot, so the kit is shaped by a real mission |

### Suggested order

1. **Week 1: items 1–7.** Mostly S each. Ship them as a correctness release, re-run the e2e, and re-shoot the README screenshots, because perches will move after C1.
2. **Weeks 2–3: items 8–10.** Measure each before and after with a budget harness like the one used for this review, which should become part of item 12.
3. **Weeks 3–5: items 11–13.** The infrastructure.
4. **Weeks 5–8: items 14–15, together with Mission 3.** Do not start Mission 3 before items 1–4 and 11 are done: its placements would be authored against the wrong collision world and the wrong tide.

### In parallel (not blocking missions; the biggest gains in quality)

- **V1**: new gull model and animation (M–L).
- **S1 + S3**: spatial audio, limiter, ducking; recorded calls and ambience through SailSim's sample manifest (S–M, M).
- **K1 + K2**: camera sphere cast, pull in fast and let out slowly, gull fade, blends relative to the gull (S–M).
- **V4**: particles and contact with the water (M).
- **C9**: drop prediction that leads moving targets (S). Do this before balancing Mission 2 any further.
- **L1 + L2**: preload hints, deploys that keep the old assets, versioned geo (S).
