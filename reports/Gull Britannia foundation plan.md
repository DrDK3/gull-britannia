# Gull Britannia: foundation plan

19 November 2026. Built from five research threads on 1967 and three expert reviews of the current build (design and story; UI, UX and accessibility; engine and technology). The detail behind every line is in the files listed at the end.

## The short version

The technical base is good: a real, solid Dartmouth; deterministic game logic; a mature scenery engine; a consistent written voice. All three reviewers said so independently.

It is not yet the game the brief describes. In one reviewer's words, it is "a well-made stealth tutorial with a parody coat of paint", wrapped in a prototype UI. Underneath are defects and structural gaps that every new mission would inherit. None of them is hard. Fixing them first is the right call.

The plan has five stages and a parallel art and audio track. Mission 3 should not start until the exit gates at the end are met.

## What we found that you probably didn't know

### Broken or misleading in the live build

| # | Finding | Evidence |
| --- | --- | --- |
| 1 | **The fine collision grid is never used.** A bug of mine: the lookup takes the first grid in the list, and the coarse 2 m grid comes first. In the old town, roofs, walls and perches are up to 2 m off, and lanes are up to 4 m narrower than drawn. The pasty's windowsill reads as the bakery roof. | Engine review C1; I confirmed it in `world.ts`. One-line fix, but every perch moves. |
| 2 | **Mission 2's set piece fails if you follow the game's own cue.** Releasing on ON TARGET while flying with the march, the Bomber Wing hit nothing in 4 of 4 simulated runs. Flying head-on, it worked 4 of 4. Nothing tells the player. The wingmen trail 3–5 m behind their slots, and the drop marker ignores that the soldiers keep marching. | Design review F3.3 (simulated on the tests' stand-in town); engine review C9. |
| 3 | **Mission 2's first objective cannot be done on a trackpad or keyboard.** Scouting exists only on the right mouse button. | UX review I-1. |
| 4 | **Scoring rewards the opposite of the fantasy.** Eleven hits on an already-distracted sentry scored 1965 (A+). A perfect unseen run scored 1190 (A). | Design review F3.7 (simulated). |
| 5 | **The stealth alerts are close to invisible.** SPOTTED measures about 1.1:1 contrast over Dartmouth's white houses and sky. HUD text is 10–13 px. Messages overlap at 1024 px wide and below. | UX review H-1, H-2 (measured in the running build). |
| 6 | **Control of the gull leaks.** The game runs while the mouse is not captured. Esc on the pause menu resumes without recapturing it. Mother's first line and the mission clock start before the player has control. | UX review I-4. |
| 7 | **Characters cost more to draw than the town.** Mission 2's 17 people and 5 gulls add about 2,070 draw calls a frame to the town's 1,880. Lowering resolution cannot help that. | Engine review R1 (measured under software rendering; the counts hold on any GPU). |
| 8 | **Only your gull moves smoothly.** Guards, wingmen, poop and the carried item are not interpolated, so they judder on any screen that is not exactly 60 Hz. | Engine review R4. |
| 9 | **Tide and light depend on how long you sat in the menus.** The clock never resets. | Engine review A3. |
| 10 | **Small things that undercut trust.** Mother's first scouting hint cannot work (the sentry is 317 m away; tagging reaches 170 m). She says "Morning" at 13.20. The routine readout the README promises is never drawn. Failures during loading freeze silently. | Design review; UX review H-4, E-1. |

### Missing foundations

| Area | Gap |
| --- | --- |
| The premise | "To them you are just a gull", yet Scrumpy is the only gull in Dartmouth. The ambient gulls of the first version were lost in the port. There is nothing gull-like to hide behind. |
| Stealth | Too forgiving and too hard to read at once. The sentry leaves the table unwatched 71% of the time, in 48-second windows (simulated). The key rule (a calm guard does not look up more than 30°) is never shown. Nothing can fail or escalate. |
| Story | Two briefings, 34 radio lines (664 words) and two 50-word debriefs. The cast are names. Who Mother and Section G are has never been decided. |
| Use of the map | Both missions use the same 135 × 360 m strip (about 1.4% of the play area) and the same drop point. The Naval College, the Higher Ferry, Sandquay, the castles and Kingswear are unused. |
| Onboarding | Radio lines that vanish, at a median of about 227 words a minute, while the player is learning to fly. |
| Input and access | No remapping, no gamepad, no hold-or-toggle, no text or HUD scaling, no subtitle controls, no assists. Key letters are written into mission text. |
| Mission framework | Missions are hand-written code that cannot be saved. Nothing that moves is solid, which a ferry or submarine mission needs. Guards walk in straight lines through houses. |
| Safety net | No CI. The end-to-end test teleports past the hardest moments. Never tested on a real GPU, in Safari or Firefox, or with real players. |

### 1967

The street plan and the reclaimed waterfront are right for 1967. The errors are at the water's edge, on Kingswear's railway land, at Noss, and in everything that moves.

| Kind | Finding |
| --- | --- |
| Errors in my removal list | "Spar" removes three buildings, one of them in the old town. The "Kingswear ferry landing" I kept is a modern pontoon between Darthaven and Hoodown. The Double Steps Pontoon I kept dates from about 2023. My notes say the marinas date from the 1970s, but Dart Marina at Sandquay opened in 1965 (the hotel in 1961). |
| Modern things still in the picture | The Dartmouth Steam Railway's steam train (in 1967 the line was British Railways, with diesel units and no steam). The 2009 Higher Ferry. Today's Lower Ferry floats and passenger ferry. The training ship *Hindostan* and the blue-and-white picket boats at Sandquay (built 1975). Buoys in today's system (introduced from 1977). The Kingswear light (today's drum dates from 1981). The Hoodown depot. Present-day walkers, cars and yacht shapes. |
| 1967 things missing | Philip & Son's working shipyard at Noss. The covered wooden pontoon at Dartmouth station. Kingswear's idle goods yard where Darthaven now lies. The river-boat fleet (five motor vessels). The paddle steamer *Kingswear Castle* laid up in Old Mill Creek, and the hulk of *Totnes Castle*. The 1864 stone lighthouse. Western National buses, K6 phone boxes, a mix of old and new road signs. |
| Story material the research turned up | 3 June 1967 is two days before the Six-Day War. Chichester sailed into Plymouth on 28 May. Sgt. Pepper came out on 1 June. Pirate radio was legal until 14 August. The Devon and Cornwall Constabulary was formed that month. *Kingswear Castle* was sold for £600 and towed away in August. The tide on 3 June was near neaps, so "Low Tide" belongs about a week later, on the spring tides after the new moon of 8 June. |

**Confidence.** The session's network policy blocked the primary-source sites, and the search budget ran out. Every research finding rests on search-result summaries, not full pages. Treat the 1967 report as a strong draft that needs a verification pass.

## Decisions I need from you

| # | Decision | My recommendation |
| --- | --- | --- |
| 1 | **Failure.** Add a soft "Compromised" outcome and an alert ladder (the level changes as alarm rises), still with no death? | Yes. Without stakes the stealth has no tension. |
| 2 | **Story bible.** Who are Mother and Section G? Is there a through-line and a twist? The design review proposes one: the Committee is quietly closing Section G as "uneconomic", and the friend at the lobster pot is the unseen skipper of the *Dorothy May*. | Decide before Mission 3. I can draft the bible for you to edit. |
| 3 | **Platforms.** Mouse and keyboard only, or also gamepad, trackpad and keyboard-only? Touch and phones? | Add gamepad and a keyboard-only profile. Leave touch out for now, with a clear message. |
| 4 | **Sound.** Stay with code-made sound only, or allow free-licence recordings (gull calls, harbour ambience)? | Allow recordings for calls and ambience; keep the original score. Synthesis caps the quality. |
| 5 | **Characters.** Rebuild people on SailSim's own figures, and replace the gull model? | Yes to both. The gull is the asset players look at most and is currently the crudest. A new gull needs an authored model: tell me if you have an artist, or I will build the best one I can in code. |
| 6 | **How far to take 1967.** Remove anachronisms only, or also add back the lost landmarks (Noss shipyard, covered pontoon, laid-up paddle steamers, the old lighthouse, the goods yard)? | Add them back, in priority order. They are story material: Mission 4 is set at Sandquay and Noss. |
| 7 | **Research access.** Allow the blocked research sites so the 1967 findings can be checked against full pages and 1960s maps? | Yes. I am asking for this now. |

## The plan

Sizes are the reviewers' rough estimates for one developer: S is a day or less, M several days, L a week or more.

### Stage 0. Correctness release

Fix what is wrong today. Mostly S items; ship them together and re-run every test, because perches move.

| Item | Size |
| --- | --- |
| Collision: read the finest grid first; re-place perches and props; test with two grids | S |
| Mission 2 strike: wingmen hold their slots (feed-forward follow); the drop marker leads moving targets and shows the Wing's footprint; both directions work | S–M |
| Interpolate every moving thing; attach the carried item to the bill; position labels every frame | S–M |
| A clock, tide and sky per mission, reset on restart. Correct 3 June to a neap tide | S–M |
| Scout on a key as well as the mouse; draw the guard's routine; fix the scouting hint, "Morning", and the sideways toasts | S |
| Mouse capture: play only when in control; resume means recapture; a Ready gate before the clock and Mother start | M |
| Solid plates behind every alert and message; 16 px minimum text | S |
| Confirm Restart and Abandon; "Proceed to File 2"; Begin above the fold; Esc and focus in menus (SailSim's dialog code is already in the repository) | S |
| Readable errors with Retry; pause on a lost graphics context; a loading screen that cannot freeze | S–M |
| Pre-compile mission shaders during the briefing; raise the near plane; fix the splat and restart leaks; the audio burst after a hidden tab | S each |
| 1967 quick corrections: the four removal-list errors; remove *Hindostan*, the picket boats, the Hoodown depot and the steam train; fix SOURCES.md | S–M |

### Stage 1. Controls, messages and readable stealth

The UI foundation. Without it, each new mission adds more hard-coded keys and more overlapping text.

| Item | Size |
| --- | --- |
| Input layer: missions name actions, not keys. Remapping, hold or toggle, gamepad with glyphs, keyboard-only and trackpad profiles | M |
| One message system with priorities and fixed screen slots. Reading-time durations, a radio log, a repeat key, subtitle options | M |
| Stealth readout: attention icons for every guard, detection arcs round the reticle, a "just a gull" status chip, the vertical limit drawn on the vision cone, routine with a playhead, directional barks | M |
| Navigation: compass, distance on the marker and edge arrow, a notebook map | M |
| Settings in grouped tabs: controls, camera and comfort, display, sound, accessibility, assists. Text and HUD scale, comfort sliders, colour-independent coding | M |
| Assists with neutral grading: game speed, guard perception, auto-land, strike and tag assists | M |
| A period design system that reaches into the HUD, with tests (accessibility, layout, contrast, input) | M–L |

### Stage 2. Game and story foundation

| Item | Size |
| --- | --- |
| Story bible: Mother, Section G, the spine question, arcs for Borovsky, Voronova, the Wing and the skipper | S to write; your decision |
| Scoring rebuilt: repeat hits capped, the unseen run worth most, approach ratings, 8–10 feats per mission, no live score | M |
| "Just a gull" as a system: ambient gulls, a conspicuousness indicator, gull-like behaviour lowering suspicion | M |
| Alert ladder and the Compromised outcome; a clock from the fiction (the courier returns) | M |
| Onboarding: a flight school in Mission 1's first three minutes, one verb per beat, hints that stay until used | M–L |
| Mission 1 tightened: 6–12 second windows, a second watcher, a pasty that really is riskier | S–M |
| Two or three discoverable opportunities in each existing mission | M each |
| Reactive Mother: about 30 lines that notice what you do; Wing chatter; personal guard lines that escalate | S–M |
| Mission ending: intercept, then debrief, then review, then the next file | S–M |
| New gull verbs (shortlist: swoop, long call, drop an object, kite on the wind) and flight depth (silent glide, ridge lift) | M–L |
| Progression: a personnel file (citations, reprimands, pantry ledger), a landmarks tour in free flight, specialists as verbs | M, then L |

### Stage 3. Engine foundation

| Item | Size |
| --- | --- |
| People on SailSim's one-draw-call figures and instanced crowds; a merged gull; shadows on and from characters | M |
| A performance governor that can lower the preset, with a 45–60 fps target and a first-run device check | S–M |
| Collision baked at build time, in two layers, so arches, bridges and eaves work and every player gets the same world | M |
| CI: type check, lint, unit tests, build, the browser run, plus budgets for draw calls, leaks and determinism. Pilot tests that fly with player inputs only | M |
| An input-command layer inside the fixed step (no lost taps; replays for debugging) | M |
| Camera: proper collision, pull in fast and let out slowly, gull fade when close | S–M |

### Stage 4. The 1967 world pass

| Item | Size |
| --- | --- |
| Verification pass on the research, with full pages and 1960s Ordnance Survey maps (needs network access) | M |
| Ferries and trains as they were: Higher Ferry No. 7, the Hauley tugs and period floats, the British Railways ferry, a diesel unit on the branch | M–L |
| The river: the motor-vessel fleet, the laid-up paddle steamers, fewer and older yachts, period buoys, no modern harbour branding | M |
| Add back: Noss shipyard, the covered station pontoon, Kingswear goods yard, the 1864 lighthouse | M–L |
| Streets: period cars (nothing newer than an E plate), a Western National bus, K6 kiosks, pillar boxes, mixed road signs, period dress for walkers | M–L |
| Names and signs: "The Cinema", the British Railways ticket office, the Harbour Commissioners | S |
| Period sound: the Light Programme from a window, the ferry bell, ice-cream chimes, diesel not steam | S–M |

### Stage 5. Mission 3 as the pilot of the mission kit

Build the kit and the mission together, so a real mission shapes it: data-driven placements, scripted beats, moving solids (boats you can land on), guards that follow streets, versioned saves. Use the mission checklist from the design review: a new district, three or more approaches, one set piece, one new guard type, a clock from the fiction, and a pilot test for each approach.

### In parallel: art and audio

A new gull model and animation. Spatial sound with a limiter. Particles and contact with the water (splashes, wakes, feathers). These do not block missions and bring the biggest visible gains.

## Exit gates before Mission 3

1. The fine collision world is in use and baked; perches are tested on the real town.
2. Following ON TARGET breaks the formation from either direction, in a test flown with player inputs only.
3. An unseen run outscores a poop-spam run in both missions.
4. Both missions can be finished with keyboard only, with a trackpad, and with a gamepad. No key letter is written into mission text.
5. Every HUD text is on a plate at 4.5:1 contrast or better and at least 16 px at 1080p. Menus pass the automated accessibility check.
6. Mission 2 stays within a draw-call budget agreed after the character rebuild, and holds 45 fps or better at Balanced on a mid-range laptop. This needs a real machine: yours or a tester's.
7. Five people who have never seen the game finish Mission 1 without help. This needs you to arrange it.
8. The story bible is agreed.
9. CI runs on every push.
10. The 1967 verification pass is done and the removal list corrected.

## What is not verified

- **The research** rests on search summaries (see Confidence above).
- **Simulated numbers** in the design review come from the tests' stand-in town, not the captured one. They should be close, not exact.
- **Performance** was measured under software rendering. Draw-call counts transfer; frame rates do not. No real GPU, Safari, Firefox, trackpad or gamepad has been tested.
- **No one has play-tested it.** Every judgement about fun, difficulty and onboarding is expert opinion until real players try it.

## Where the detail is

| File | What it holds |
| --- | --- |
| `reports/Dartmouth and the Dart in 1967.md` | The 1967 report: town, Kingswear, river, everyday life, conditions, the change audit, conflicts and gaps, 198 sources |
| `research_notes/Dartmouth and the Dart in 1967/` | The five researchers' notes |
| `research_notes/Game foundation review/design_story.md` | Design and story review: findings, top 15, writing samples, gull verbs, opportunities, the six-mission through-line, the mission checklist |
| `research_notes/Game foundation review/ux_accessibility.md` | UI, UX and accessibility review: 57 findings, top 15, nine specifications (controls, capture flow, onboarding, HUD layout, settings, menus, messages, visual system, tests) |
| `research_notes/Game foundation review/engine_tech.md` | Engine review: measurements, 45 findings, top 15 and an order of work |
