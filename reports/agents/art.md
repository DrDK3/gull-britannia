# Art, round 1: the studio page and the gull

Branch `agent/art`. This round was narrowed by the lead to steps 0 and 1 of the brief: the studio page, and the gull
(the player's, the Bomber Wing and the town's other gulls). The people, the props, the effects and the shadow and rim
work (steps 2 to 5) are not started; they are listed under "Left over".

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

## Left over

Not started, by instruction:

- **Step 2, the people.** `Figure` is still 25 meshes a person. `rig.ts` is built for it: all of a mission's people
  can be one batch and one draw call a pass.
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
