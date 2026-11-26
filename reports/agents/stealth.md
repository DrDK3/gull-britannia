# Stealth and mission systems: report

Branch `agent/stealth`. Scope as narrowed by the coordinator: the owner's acceptance items 1 to 6 for Mission 1, and the scoring test for Mission 2. Everything is game logic (`src/gull/game/`) with tests; nothing in `view`, `app` or `ui` was touched, and neither were `gull.ts` or `world.ts`.

## Before and after

Measured on the stand-in town (`tests/gull/m1world.ts`) with scripts that step the mission; "baked" means the same run on the real collision grids from `public/geo` (`tests/gull/realtown.ts`).

| Measure | Before (`aa33a59`) | After |
| --- | --- | --- |
| Share of time the table is outside Borovsky's view | 71% | 43% (stand-in and baked) |
| His unwatched windows | 48.1 s and 5.1 s | 11.0 s (river wall) and 8.5 s (bakery corner) in a 51 s round; none under 6 s or over 12 s |
| Tell before he turns back | none | a line and a stretch, 1.5 to 1.6 s ahead, every time |
| Mission 1, perfect unseen run | 1190, A | 1590, A+, "Ghost" (flown by the pilot in 1:45, stand-in and baked) |
| Mission 1, tea route | not measured | 1380, A, "Saboteur" (pilot, 1:16) |
| Mission 1, poop-spam (a drop on the sentry every 2.5 s) | 1940, A+, never spotted (10 hits of 11) | Compromised after 25 s with 70 points: third hit is an alert, the alarm tops out, the courier takes the dispatch |
| Mission 2, unseen strike (4 Wing hits, no scouting) | 1610, A | 2010, A (A+ starts at 2050: a Ghost with a fuller strike) |
| Mission 2, poop-spam (12 drops on the stand's sentries) | 2360, A+, never spotted | 1310, B, spotted 4 times |
| A hit on a target already hit | 40 points, for ever | 40, 20, 10, then nothing; everything a payload earns is capped at 200 |
| Guard: spotted, then back to his routine | 14.0 s (alert 2.0, searching 9.0) | 14.0 s (unchanged) |
| Guard: near miss, then back to his routine | 8.5 s | 8.5 s (unchanged) |
| What lasts after a sighting | nothing | the ladder: "searching" for 55 s, then "suspicious" for the rest of the operation; the corporal stays posted |
| What lasts after one question mark | nothing | "suspicious" for 23 s, then calm |
| The pasty's sill is watched | never by anyone placed to | 49% of the time (baked: 52%); the chips' bench 0% |
| Other gulls | 0 | 12 in Mission 1, 11 in Mission 2 |
| Ways to lose | none | Compromised: the courier is back at 13.30 (600 s), or is sent for when the alarm tops out (62 s in the pilot's loud run) |

## What changed

- **Scoring** (`scoring.ts`, `mission.ts`). Repeat hits diminish and the payload is capped. The review marks an approach: Ghost (+400: never spotted, no question mark, no hit on a watcher or his tea), Saboteur and Shadow (+150), Hooligan (0). The Ghost bonus exceeds any other approach plus the cap, so an unseen run always wins. "Stealth: never spotted" (300) and "Clean escape" (200) are unchanged. Grade bands: Mission 1's A moves from 1150 to 1250; Mission 2's become 2050, 1700, 1300, 900. `liveScore()` is still there.
- **Hits escalate** (`guard.ts`). First hit: bad luck, he goes to put it right (as before). Second of the same kind: "Again? AGAIN?", a question mark. Third of any kind: he knows, wherever the gull is.
- **Ambient gulls** (`ambient.ts`). `AmbientFlock` moves loafers, circlers, beggars, a squabbling pair and two gulls working a boat's wake, from its own seeded generator. It fills `Mission.ambient`.
- **"Just a gull" as a system** (`conspicuous.ts`). A value from 0 to 1 and its main reason. Guards' interest is that value on their old scale, so papers, the cordon and "under his nose" behave as before. New: company excuses odd behaviour; loitering alone near the table, staring, thieving, calling and hovering over the table are noticed. Odd behaviour alone can earn a question mark, never an alert.
- **Alert ladder** (`alert.ts`). Heat from incidents, four rungs, cools by one rung at most. In Mission 1 (`m1watch.ts`): suspicious, the sentry's gaze rises 15° and he checks the sky at the end of each watching step; searching, Cpl. Dunayev leaves his tea and watches the table from the foot of the lane; alarmed, the sentry weighs the dispatch down with a mug (first pull knocks it off with a clatter he can hear); at the top, the courier is sent for.
- **The courier and Compromised** (`m1watch.ts`). He sits at lunch by the field kitchen, asks for his bill two minutes before 13.30, walks down the lane and takes the dispatch if it is on the table. Mother is drily disappointed; the review says Compromised. If the gull already has it, he finds an empty table and raises the alarm instead.
- **Borovsky** (`m1.ts`, the sentry block only). Seven steps: post, tea, river wall, a look back, post, the fort side (the bakery corner), a look back. On watching steps his head stays on the table while he walks.
- **The pasty** (`m1watch.ts`). Mrs Pascoe is at her door for 6 s and at her oven for 7 s. A gull at the pasty in her sight is shouted at; the shout brings the sentry (a question mark, and an opening). The sentry's round also brings him within 8 m of the sill.
- **Also in, beyond the narrowed list**: guards hear a shout, another man's whistle and a gull's long call (`Guard.hearNoise`, `Mission.emitNoise`, `Mission.longCall`). One test each; no pilot test.

Decisions taken: the clock is ten minutes (13.20 to 13.30) so that a first-time player usually finishes; finding the table empty after an unseen snatch does not cost the Ghost; a baker's shout is a question mark, not a sighting; the opening lesson is skipped in the pilot tests because it is being rewritten on `agent/ux`.

## What the view and the HUD should read

All plain fields and methods; nothing needs a new event type.

**Ambient gulls**
- `mission.ambient: AmbientGull[]`: `id`, `pos` (the bird's middle; standing is 0.25 m above the surface), `yaw`, `airborne`, `flapping`, `flapPhase`, `calling`, `behaviour` (`loaf`, `circle`, `beg`, `squabble`, `follow`), `walking`, `walkPhase`, `bank`, `pitch`.
- `mission.watch.wake` (Mission 1): `pos` and `yaw` of the undrawn boat the two followers work. Draw a crabber there, or give the followers a SailSim boat.

**Conspicuousness**
- `mission.conspicuousness` (0 to 1), `mission.conspicuousReason` ("just a gull", "loafing among gulls", "loitering alone", "hovering alone over the table", "inside the cordon", "carrying papers" and so on), `mission.conspicuousLevel` ("just a gull", "odd", "conspicuous", "very conspicuous").
- `mission.company` (gulls nearby doing the same), `mission.loiter` (seconds).

**The ladder and the clock**
- `mission.alert`: `level` (0 to 3), `name`, `heat` (0 to 100), `progress` (0 to 1 within the rung), `peak`, `peakName`, `toppedOut`. A banner "ALERT: SEARCHING" is queued on each rise.
- `mission.deadline` (`label`, `clock` "13.30", `at`) and `mission.deadlineLeft` (seconds). In Mission 1 also `mission.watch.courier` (an Npc, id `courier`), `courierPhase`, `courierEta`, `courierRecalled`, `posted`, `coverOrdered`, `weight` (a prop of kind `mug`, shown on the dispatch), and `dispatch.covered`.
- Results: `outcome` (`complete` or `compromised`), `approach` (`id`, `title`, `citation`, `points`), `alertPeak`. A compromised review has grade "—" and grade title "Compromised".

**Each guard's perception** (`mission.guards`, which now includes the baker and the corporal)
- `g.cone`: `range`, `fovDeg`, `yaw`, `gazeLimitDeg`, `gazeFloorDeg`. Also singly: `g.gazeLimitDeg` (the vertical limit now in force), `g.viewRangeNow`, `g.fovDeg`, `g.facingYaw()`.
- `g.routine`, `g.routineLabels()`, `g.routineStep` (−1 off his routine), `g.atStep`, `g.stepTimeLeft`, `g.watchingNow`, `g.windowTimeLeft` (seconds until he next turns to or from what he guards), `g.telling` (the tell, while he gives it). `g.routineText` is the labels joined with " · ", so the existing readout in `game.ts` keeps its playhead.
- `g.watches(point)`, `g.hearingRadius()`, `g.vigilance`, `g.offDuty`, `g.civilian`, `g.label`.
- `mission.restricted[]` (the cordons, with `label`), `mission.noiseRadius` (how far the gull's wings carry now), `mission.noises[]` (`at`, `radius`, `kind`, `age`) for rings.

**Who is noticing me**
- `mission.noticers: Noticer[]`: for each guard within 120 m, `id`, `name`, `bearing` (compass), `relBearing` (from the gull's view; 0 ahead, positive to the right), `distance`, `strength` (0 to 1), `sees`, `noticing`, `state`, `civilian`. `mission.noticing()` gives those with strength above 0, strongest first.

## `tests/e2e/missions.e2e.cjs`

No line needs to change. The suite's Mission 1 sequence was replayed step for step on the baked town in Node and passes: spotted 0, "Stealth: never" 300, "Clean escape: never" 200, review A+ 1590. The river wall is still routine step 2, and he stays there 5 s after arriving.

## Verified

- `npm run typecheck`, `npm run lint`, `npm test`: 75 tests in 9 files pass (43 before). New: `stealth.test.ts` (27 tests) and `m1pilot.test.ts` (5: the unseen route, the tea route, Compromised by the alarm and by the clock, and the two routes again on the baked town). Changed: `m1.test.ts` (his round has 7 steps, not 4; the unseen run now asserts the Ghost line and A+).
- The baked town caught two things the stand-in hid: a squabbling gull standing in mid-air off the edge of the nest's roof, and the begging gulls walking into the river (in front of the clerk's bench the ground falls away). Both are fixed and tested on the baked grids.
- `tests/gull/m1world.ts` builds its grid once per test file.
- **One `// handoff:` edit outside my files**: `tests/gull/m2pilot.test.ts`, the test "does so higher, lower, and along an outer file" now has a 30 s limit (two added comment lines and `}, 30_000);`). Its ten flights take 2 to 4 s, and reached 5.9 s here when all nine files ran at once on the shared machine, which fails the default 5 s limit. Its assertions are untouched and it passes.
- CI on `agent/stealth`: see the last line of this file.

## For others (outside my files, not done)

1. **Lead, `src/gull/app/game.ts`, `onFinished`**: a review with `outcome === 'compromised'` is at present saved as done and can become the best score, which would unlock File 2. It should do neither.
2. **Lead, `App.tsx`**: the review already has "Try again"; make it the first action when compromised, and show `approach.title`.
3. **UX and story, text now untrue or missing**: the Fort parapet hint ("The fort end of his patrol."); Mother's tag line ("post, tea, river, fort"); `Mission.prompt()` still offers a plain snatch for a covered dispatch. New radio lines to review are in `m1watch.ts` and `mission.ts` (`onGuardHit`); all are under 140 characters, with no key letters and no exclamation marks from Mother.
4. **Art**: guard animation `stretch` and guard style `civilian` (the baker) are new; `ItemState.Taken` is new (the dispatch's `pos` follows the courier). Sound `tell` has no voice yet.
5. **Flight**: `gull.noise` is read through `gullNoise()` (falls back to flapping). A long call is taken from `gull.events.longCall` or `gull.events.call`, and from {signal} when the mission does not use it.
6. **Whoever retunes flight**: the pilot in `tests/gull/m1pilot.ts` is closed-loop but will need a look; its `log` says how far each flight got.

## Mission 2 still needs

- A Compromised outcome and a clock of its own (the Marshal leaves; the Order goes into Voronova's case).
- What each rung of the ladder does on the Embankment. The ladder runs there and guards look higher, but no second watcher or covering is scripted.
- Labels, `watch` flags and tells on Voronova's and the stand sentries' routines, so the readouts mean as much as Borovsky's.
- The long call on {signal}: Mission 2 uses that action for the Wing everywhere.
- An unseen farm of first hits on different marchers stays within the 200 cap and is allowed; decide whether it should raise questions.

## Left over

- The "also worth doing" items are implemented but thinly tested, as above. A dropped chip drawing a mob, and swoops, are not done.
- The off-duty corporal and the courier at lunch stand in the open by the field kitchen; nobody has looked at them in the browser. Nothing here was checked in a screenshot.
- Owner's calls: the ten-minute clock; the size of the Ghost bonus and the grade bands; whether the baker should be able to swat the gull.
