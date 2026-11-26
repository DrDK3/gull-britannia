# Art: report

Branch `agent/art`. Round 1 was the studio page and the gull; round 2 is the people. The props, the effects and the
shadow work (steps 3 to 5 of the brief) are not started.

# Round 2: the people

Started from `origin/main` with `origin/agent/stealth` merged in (its tracked `node_modules` link is untracked again
on this branch).

## What changed

**The people are one mesh.** `src/gull/view/figures.ts` is rebuilt on `rig.ts`. A person is one merged,
vertex-coloured geometry on a twenty-bone rig, and all the people of a mission are one skinned mesh (`Cast`): one draw
call in each pass, whoever and however many they are. Mission 2's seventeen people, the twelve marchers among them,
are one draw call.

**They are characters.** Adult proportions (a 1.75 m reference, scaled to each person's height and build), hands with
a thumb, and a face made to carry: heavy brows set by temperament, eyes, a moustache where there is one. A 1960s
summer field uniform with nothing real on it: khaki tunic worn outside the breeches under a leather belt, boots, a
side cap for the ranks and a peaked cap for officers, plain coloured shoulder boards and collar tabs. The badge is
invented: a brass lozenge with a teal pip.

| Who | Silhouette and prop |
| --- | --- |
| Pte Borovsky | Short and stout, over his belt; mild brows, a clipped moustache; the enamel mug with a blue rim |
| Cpl. Dunayev | The tallest and leanest; a rifle on his back, a stripe on his sleeve, a scowl |
| Lt Voronova | Tall and straight-backed, a skirt and boots, her hair in a bun; the clipboard held to her chest |
| Col Grushkov | A barrel behind a grand moustache; six rows of plain ribbon bars on both sides of his chest |
| The Marshal (`general`) | A grey greatcoat to the calf with red lapels and two rows of buttons, even in June |
| The Clerk | Tweed jacket and tie, flat cap, round glasses, behind an open newspaper |
| The courier | A despatch rider: goggles pushed up on his cap, gauntlets, the satchel the dispatch goes into |
| Mrs Pascoe | Blue blouse with rolled sleeves, a long skirt, a white apron, a headscarf, a striped tea towel in her fist |
| The cook | Whites, a toque, a moustache, a ladle |
| The ranks | Three builds and faces, chosen by name, so the stand's sentries and the parade are not twelve of one man |

**Every gesture the game asks for**: `idle`, `attention`, `march`, `salute`, `sip`, `outrage`, `scrub`, `shoo`,
`look_up`, `look_around`, `point`, `throw`, `read`, `sit`, `flail`, `stir`, and the new `stretch` (Borovsky's tell:
arms up and out, back arched, up on his toes). A walk with hips, knees that bend as the leg comes through, and arm
swing; a run; a straight-legged parade step with the free arm across the belt and the other hand on the sling.
`flail` is three things: a panic run with the arms anywhere, a man keeping his place with his arms over his cap, and
the clerk on his bench with his newspaper over his head. Joints ease into a new pose over a third of a second instead
of snapping.

**The stealth states are drawn.**

- `stretch`, the `civilian` guard style (Mrs Pascoe), Cpl. Dunayev and the courier, as above.
- `ItemState.Taken`: the item is no longer drawn (it is in the satchel).
- `dispatch.covered`: the stealth branch shows its `paperweight` prop; it is drawn as the mug on the dispatch, and on
  its side once knocked off.
- `mission.watch.wake`: a crabber is drawn where the track is, turned the way it is going. It is the existing crabber
  prop and has no collision.
- Splats on caps are one instanced mesh that rides each cap (they were three meshes each). A drop that lands on a
  marcher's or a bystander's head now stays on him too.
- Anyone the mission sits down where there is no bench (the courier at his lunch) gets a crate.
- The ambient gulls now use the flock's own fields (`STAND`, `walking`, `walkPhase`, `bank`, `pitch`).

**Colours.** The game's sky light is strong and lifts every colour: a true khaki read as pale green, as the gull's
true grey read as white last round. The uniform, belts, tweed and Mrs Pascoe's blue are a shade darker for it, and
the studio's quick light is now matched to `light=game`.

## Draw calls

Measured in the built game (`renderer.info.render.calls`, all passes of a frame, with and without each mesh).

| | Before | Now |
| --- | --- | --- |
| A person | 25 or 26 meshes | a share of 1 mesh |
| Mission 2's 17 people, Smooth | about 425 meshes, each in the picture and in the shadow map | **2** draw calls (547 with them, 545 without) |
| Mission 2's people and gulls together, Smooth | about 2,070 added on Balanced by the review's count | **6** (547 against 541). The budget was 120 |
| The same with shadow cascades (`?quality=high`) | | **8** (1,490 against 1,482) |
| Mission 1's 6 people | about 150 meshes | 1 mesh: one draw call a pass |
| Mission group, visible meshes: Mission 1 / Mission 2 | 143 / 543 (review); 459 in Mission 2 after round 1 | 101 / 47 |
| Triangles | | about 2,200 a person: 37,094 for Mission 2's seventeen |

What is left in the mission group is props, items, markers and vision cones: next round's work.

## Screenshots (`docs/screenshots/art/`)

All looked at. Studio sheets are under the game's sky light where it says so.

| File | What it shows |
| --- | --- |
| `people_before_after.jpg` | The old box soldier above, the new below: standing, walking, saluting, at his tea, on parade |
| `before_people_old_figures.jpg` | Eight of the old figures (drawn from the code before this round) |
| `people_cast.jpg` | The cast in a row, at ease, one mesh, under the game's light |
| `people_cast_in_action.jpg` | The same, each doing what they are known for |
| `people_faces.jpg` | Ten heads and shoulders |
| `people_gestures_1.jpg`, `_2`, `_3` | Every gesture: 27 cells |
| `game_sentry_from_the_gutter.jpg` | Mission 1: Borovsky at his post from the Custom House gutter, chase camera |
| `game_sentry_scouted_from_the_gutter.jpg` | The same through the scouting view, tagged, his routine above him |
| `game_borovsky_at_his_tea.jpg`, `game_borovsky_stretch_tell.jpg` | His tea, and the tell at the river wall |
| `game_mrs_pascoe.jpg`, `game_courier_at_lunch.jpg`, `game_corporal_posted.jpg`, `game_clerk_on_his_bench.jpg` | The rest of Mission 1's cast where the game puts them |
| `game_dispatch_covered.jpg`, `game_dispatch_taken.jpg`, `game_wake_boat.jpg` | The mug on the dispatch; the table after the courier has taken it; the boat on the wake track |
| `game_parade_passing_the_stand.jpg`, `game_parade_close.jpg` | Mission 2: the parade passing the stand |
| `game_officers_on_the_stand.jpg` | Grushkov saluting, Voronova with her clipboard, the Marshal in his greatcoat |
| `game_formation_broken.jpg`, `game_stand_in_uproar.jpg` | The formation broken; Grushkov's outrage |

For the game before, compare `docs/screenshots/2.1/03_gutter_routine.jpg` and `08_formation_broken.jpg`.

## Interfaces

`MissionView`'s public interface is unchanged (`snapshot`, `sync`, `headOf`, `revealForWarmUp`, `onEvent`,
`dispose`). No edit outside my files this round.

`src/gull/view/figures.ts` is new inside:

- `LOOKS` and `lookFor(id, style)`: a person is drawn by a look of their own if `LOOKS` has their id (`borovsky`,
  `corporal`, `voronova`, `grushkov`, `general`, `clerk`, `courier`, `baker`, `cook`), otherwise by their style
  (`soldier`, `officer`, `civilian`, `cook`, `sailor`). **To give a new character a silhouette, add an entry to
  `LOOKS` under the id the mission gives them.** A `FigureLook` is plain data: height, girth, shoulders, belly, coat,
  legs, hat, colours, brows, moustache, and what is carried.
- `Cast(looks)`: `figures[i].pose(pos, yaw, FigurePose, dt)`, `.hide()`, `.hand` (where the right hand is),
  `.hatMatrix`; `commit()`, `dispose()`, `mesh`.
- `FigurePose` has two new optional fields, `mug` and `capOff`.
- `poseFigure`, `figureGeometry`, `FIG_RIG` for anything else that wants to pose one (the studio does).

For whoever writes missions: a new `anim` name that the view does not know is drawn as standing (or sitting, if they
were); nothing breaks. An `Npc` that moves faster than 2.6 m/s is drawn running.

The studio: `show=person:<who>` with `pose=` any of the game's `anim` values (or `walk`, `run`, `runflail`,
`marchhit`, `sitflail`), `show=cast` and `show=cast:action`, the sheets `gestures-1` to `gestures-3`, and two new
views, `face` and `ten` (ten metres away).

## How it was verified

- `npm run typecheck`, `npm run lint`, `npm test`: 88 tests in 11 files (83 before; 5 new in
  `tests/gull/figuresView.test.ts`: a cast is one mesh; every look builds, well formed and the height of a person;
  every gesture poses standing, walking and running without a NaN, for six looks; the named characters get their looks;
  sitting lowers the hips, the hand is where a carried thing should be, and a hidden figure is collapsed).
- The studio: the cast line-up, the faces, and all 27 gesture cells looked at and reworked (arms that crossed when
  raised, a stretch that read as a shrug, an apron that stood off the body, a skirt the legs came through, the
  parade's free hand up by the face, colours too pale under the game's light).
- The built game at 960 × 540 on Smooth: the sentry from the gutter (chase and scouting), his tea, his stretch, the
  baker, the courier and cook, the corporal posted, the clerk, the covered and the taken dispatch, the wake boat, the
  parade passing the stand, the officers on it, the formation broken. Once with `?quality=high`: the people draw and
  cast shadows correctly under the cascades.

## Left over

- **Step 3, the props; step 4, the effects; step 5, shadows.** Not started. The crate the courier sits on is a plain
  box, the clerk's bench hides most of him from behind, and the wake boat is the old crabber.
- **The Skipper** is not made: nobody in the game is him yet. An oilskin look is one entry in `LOOKS` when he is.
- From the gutter with the chase camera Borovsky is about 30 pixels tall: he reads as a stout soldier by his outline
  and his red boards, and his face only through the scouting view. That is the camera's distance, not the model.
- Hands are mittens with a thumb. The clerk's hand passes behind his newspaper when he reaches for a chip. Skirts and
  the greatcoat stretch rather than swing at a run. The tea towel is stiff.
- The marchers are three builds chosen by name; the thirteenth man would repeat one of them.
- Only a software renderer was available: nothing here was seen on a real GPU or with the Ultra preset's occlusion
  pass.
- The wake boat has no collision; the gull flies through it.

## For the owner to decide

- The invented badge (a brass lozenge with a teal pip) and the uniform's colours, which are darker than the cloth on
  purpose.
- The courier as a despatch rider and Mrs Pascoe's look are my inventions; the stealth and story branches describe
  neither.

# Round 1: the studio page and the gull

This round was narrowed by the lead to steps 0 and 1 of the brief: the studio page, and the gull (the player's, the
Bomber Wing and the town's other gulls).

## What changed

**A studio page** (`studio.html`, `src/studio/`), served by the dev server only and not part of the build. It draws
one model, or a contact sheet of poses, on neutral ground under the game's daylight, with camera presets (front, back,
side, three-quarter, rear, top, below, close, the game's chase camera, and 30 m away), the pose and its time chosen in
the address, and the draw calls and triangles of the frame printed on the page and in `window.__studio`. A page draws
in 0.15 to 0.45 s under software rendering and is ready in under a second. `light=game` builds the game's real sky as
the environment map (slower); the default is a stand-in matched to it by eye.

    npx vite --port 5310 --strictPort
    http://127.0.0.1:5310/studio.html?show=gull&pose=flap&t=0.3&view=side
    http://127.0.0.1:5310/studio.html?sheet=gull-ground&cols=4

**The gull**, rebuilt in code as one skinned mesh (`src/gull/view/gullRig.ts`, `gullModel.ts`):

- An adult herring gull in summer: white head, neck, body and tail; grey mantle and upperwing with a white trailing
  edge; black outer primaries with white mirrors and tips; a yellow bill with the red gonys spot; a pale eye in a
  yellow ring; pink legs and webbed feet. About 0.6 m long and 1.45 m across, as before.
- A real wing: upper arm, forearm, hand and outer primaries are separate segments, and every flight feather is its own
  blade (10 secondaries and 10 primaries a side). A tail of seven feathers that fans. A neck, a head and a lower
  mandible that opens. Legs with three joints. Standing, a folded wing lies along the flank with the black primaries
  crossed over the tail; the open wing and the folded one swap in the quarter second it takes to open or close.
- Poses from the existing `GullAnim` fields: glide (dihedral at the arm, hands drooped, tips flexed), a flap with a
  longer downstroke and a quicker recovery in which the wrist flexes and the hand trails, bank with the head held
  level, brake and flare (wings up and spread, tail fanned, legs down), dive tuck, tumble, walk with a head bob,
  floating, eating, and the long call. On a perch it looks about in quick turns, shuffles, preens over a shoulder and
  stretches both wings, by the clock.
- The head turns to where the gull is looking. The body is drawn trailing the view a little in a turn (and, standing
  still, does not turn until the head is turned far), and the neck takes up the difference. The head is aimed in the
  frame of the heading, not of the body, so it stays level through pitch and bank.
- What it carries is drawn exactly at the bill's grip point, pointing where the bill points, held by its near edge.
- The first-person bill is the same bill.
- A thin dark rim on the player's gull (the same triangles turned inside out, in the same draw call) so that it reads
  against white houses.

**The other gulls.** The Bomber Wing and whatever is in `Mission.ambient` are drawn by `GullFlock`: one mesh and one
draw call for up to twenty gulls (four of the Wing and sixteen of the town's), each with its own easing. They open
their wings, bank, stand on what is under them, float, walk and call.

**Under it**, `src/gull/view/rig.ts`: models as one merged, vertex-coloured geometry, posed by writing bone matrices
straight into a three.js `SkinnedMesh`'s skeleton (no Bone objects, no allocation per frame). Because it is three.js's
own skinning, the shadow passes, the cascades, the water's reflection and the ambient-occlusion pass pose the models
correctly with their stock materials. Any number of models can be merged into one batch, which is how the people can
become one draw call next round.

## Draw calls, before and after

| | Before | After |
| --- | --- | --- |
| The player's gull: meshes | 21 | 1 |
| The player's gull, studio (picture and one shadow map) | 26 flying, 30 standing | 2 |
| The four gulls of the Wing: meshes | 84 | 1, shared with up to 16 ambient gulls |
| Mission 2's five gulls, Smooth, all passes of a frame | about 130 (5 × 26) | **4** (measured in the game: 520 with them, 516 without) |
| The same with shadow cascades (`?quality=high`) | about 220 by count (5 × (17 + 9 × 3)) | **9** (measured: 2,664 with them, 2,655 without) |
| Mission 1 on the nest, Smooth, all passes of a frame: the gull's share | about 30 (21 + 9 in the shadow map) | **2** (measured: 751 with it, 749 without) |
| Mission 2's mission group: visible meshes | 543 | 459 |
| Mission 2's people | 17 × 25 meshes | unchanged: next round |

The brief's budget (Mission 2's people and gulls together at most 120 draw calls) is met for the gulls alone and not
yet for the whole, because the people are still the old figures. Triangles: the player's gull 5,878 with its rim, each
of the others 3,140. With no gull of the flock in sight its mesh is not drawn at all.

## Screenshots (`docs/screenshots/art/`)

All looked at. Studio pictures are 1440 × 810; game pictures are 960 × 540 on the Smooth preset.

| File | What it shows |
| --- | --- |
| `gull_before_after.jpg` | The old model above, the new below: glide, flap, standing, from above |
| `before_gull_old_model.jpg`, `after_gull_new_model.jpg` | The same eight views of each (the old model was drawn from `aa33a59`) |
| `gull_views.jpg` | Glide and standing from every side, the chase camera, and 30 m away |
| `gull_air.jpg` | Glide, five moments of a flap, bank, brake, dive, tumble |
| `gull_flap_cycle.jpg` | Ten moments of one wing beat, from behind |
| `gull_ground.jpg` | Stand, walk, look, shuffle, preen, stretch, float, eat, call, head turned |
| `gull_head_and_bill.jpg` | The head turned, preening, calling, eating, level in a bank; a close view; afloat |
| `gull_carrying.jpg` | The dispatch in the bill, standing, walking and on the wing |
| `gull_flock_one_draw_call.jpg` | Sixteen of the cheaper gulls as one mesh |
| `gull_first_person_bill.jpg` | The first-person bill |
| `gull_on_white.jpg` | New and old against a whitewashed wall |
| `gull_game_light.jpg` | Under the game's real sky light, including the chase camera's view |
| `game_on_the_nest.jpg`, `game_gliding.jpg`, `game_flapping_turn.jpg` | Mission 1 in the built game |
| `game_ambient_gulls.jpg` | Six gulls put into `Mission.ambient` by the screenshot script: three on the roof, three in the air |
| `game_wing_on_the_roost.jpg`, `game_wing_in_formation.jpg` | Mission 2: the Wing on the hotel roof, and on the wing |

For the game before, compare `docs/screenshots/2.1/07_wing_in_formation.jpg`.

## Interfaces

Unchanged for `game.ts`: `new GullModel()`, `root`, `pose(pos, yaw, pitch, anim, dt)`, `billPosition(out?)`,
`viewBeak()`; `MissionView`'s `snapshot`, `sync`, `headOf`, `revealForWarmUp`, `onEvent`, `dispose`.

New, in `src/gull/view/gullModel.ts`:

- `GullModel.watch(gull)`: the model reads from the game's gull what `pose` is not given. Every field is optional and
  checked: `pitch` (where it looks), `scouting`, `eatingTimer`, and for the flight engineer `roll` (rad, **positive is
  right wing down**; without it the bank follows the turn rate as before), `noise` (kept as `model.noise`, draws
  nothing yet), `airState` (a name containing brake, flare, hover or land spreads the wings; dive or stoop tucks
  them), and a call state (`calling: true`, a running `callTimer` or `call`, or a `callState` that is not idle).
- `GullModel.call(seconds)`: give the long call now.
- `GullAnim` has new optional fields: `roll`, `lookYaw`, `lookPitch`, `calling`, `eating`, `attentive`, `idle`,
  `idleT`. Existing callers need none of them.
- `PLAYER_BILL { yaw, pitch, holding }`: which way the player's bill points (set by `billPosition`), and whether it
  holds something (set by the mission view, so the gull does not preen with a dispatch in its bill).
- `GullFlock(capacity)`: `place(i, pos, yaw, pitch, anim, dt, scale?)`, `hide(i)`, `reset(i)`, `commit()`,
  `dispose()`, `mesh`.

For whoever fills `Mission.ambient`: the view draws the first 16, keeps each in its own slot by `id`, hides any beyond
450 m, and draws `calling`. An airborne gull's bank, pitch and speed are taken from its last two steps. A gull that is
not airborne stands on what is under it whether its `pos` is the middle of a 0.3 m ball (as the player's is) or the
spot it stands on, and floats if that is water.

Two one-line edits in `src/gull/app/game.ts`, both marked `// handoff: art`:

1. `this.model.watch(m?.gull);` in `renderFrame`.
2. In `onMissionEvent`, a `squawk` or `flock` sound with no position also calls `this.model.call()`, so the gull is
   seen to give the call that is heard.

One new test file, `tests/gull/gullView.test.ts`. No new dependency.

## How it was verified

- `npm run typecheck`, `npm run lint`, `npm test` (50 tests, 7 of them new: one mesh for the gull and one for the
  flock; both geometries well formed and the right size; every pose finite through a second of each state; the bill
  ahead of the body and pointing where it looks; the head turning before the body; the watched fields read and done
  without; flock slots drawn and hidden).
- The studio: every state above, looked at and reworked (the flap's timing, the brake, the stretch, the folded
  wing's white tips, the head's aim, the colours under the game's sky light).
- The built game (`npm run build`, preview on 5311, `tools/shoot.cjs` at 960 × 540): on the nest, flapping in a turn,
  gliding, with ambient gulls, the Wing on the roost, the Wing in formation, the signal call. Once more with
  `?quality=high` (cascaded shadows) at 640 × 360: the gulls draw and are lit correctly.
- The end-to-end suites were not run here; CI runs them on the branch.

## Left over at the end of round 1

Not started, by instruction:

- **Step 2, the people.** Done in round 2, above.
- **Step 3, the props**, **step 4, the effects**, **step 5, shadows and rim** for characters. `palette.ts` and the
  helpers in `shapes.ts` (`Parts`, `mergeColoured`) are there for them and unused so far.

Of the gull itself:

- At the default chase distance the gull is about 160 pixels across on a 720-line screen, and softer still on the
  Smooth preset's render scale. The model cannot fix that: the chase camera's owner might try 3.2 m.
- Only a software renderer was available. The ambient-occlusion pass (Ultra) and a real GPU were not seen.
- The wing stretch is both wings raised; a one-wing-and-leg stretch would be a better likeness.
- The others have one level of detail (3,100 triangles each). A far, coarser one would be cheap to add if sixteen of
  them ever cost too much.
- The open and the folded wing swap rather than fold feather by feather. It is over in a quarter of a second.

## For the owner to decide

- The mantle is a shade darker than a real herring gull's. Under the game's bright sky light the true pale grey read as
  white.
- The dark rim is on the player's gull only. It makes the gull read against white houses, and it is a small step
  towards a drawn look that the town does not have.
