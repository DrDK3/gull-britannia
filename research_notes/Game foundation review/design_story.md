# Gull Britannia: design and story foundation review

Reviewer's brief: game design, mission design, systems, pacing and storytelling. Read-only review of the web build (`81bce0f`), compared with the Godot build (`godot-v1`). 19 November 2026.

**Method.** I read the game logic (`src/gull/game`), the story and UI text (`briefings.ts`, `App.tsx`, `game.ts`), the tests and the six screenshots. I then ran headless experiments against the mission code on the unit tests' stand-in town (`tests/gull/m1world.ts`) with `tsx`. The scripts are in my scratchpad, not in the repo. The numbers marked **[sim]** come from those runs. They use the stand-in's geometry, so treat them as close, not exact, for the real town.

Effort key: **S** = under a day · **M** = 1–5 days · **L** = 1–3 weeks.

---

## Verdict

The technical foundation is unusually good. The town is real and solid, the simulation is deterministic and testable, and Mission 1 is a genuine two-approach stealth puzzle. The written voice ("Behave like one, right up until you don't") is exactly right. As a *game*, though, it is not yet the game the brief describes. It is a well-made stealth tutorial with a parody coat of paint.

Six problems sit under everything, and each will be copied into every mission built on top:

1. **The premise is a line of text, not a system.** "To them you are just a gull" is the hook, yet Scrumpy is the only gull in Dartmouth. The ambient gulls from the Godot build were lost in the port, and there are no gull behaviours to hide behind.
2. **The stealth is too forgiving and too hard to read at the same time.** Borovsky leaves the table unwatched 71% of the time, in 48-second windows. The key rule (guards don't look up more than 30°) is never shown. The routine readout the README promises is never drawn, and nothing can fail.
3. **Mission 2's signature moment fails if you follow the game's own cue.** Release on "ON TARGET" while flying with the march, and the Wing lands every drop 5–9 m behind the column [sim]. Fly head-on and it works. Nothing tells you this.
4. **Scoring rewards the opposite of the fantasy.** Farming direct hits on a sentry who is already distracted scores 1965 (A+). A perfect ghost run scores 1190 (A) [sim].
5. **The story is all paperwork.** Two briefings, 34 radio lines (664 words), two 50-word debriefs placed under the score table, a cast that is mostly names, and no decision yet on who Section G and Mother actually are.
6. **Both missions use the same 135 × 360 m strip, about 1.4% of the play area, and the same drop point.** The Naval College, the Higher Ferry, Sandquay, the castles and Kingswear are all inside the bounds and unused.

Fix these six before Mission 3. Each fix is a template the remaining four missions will inherit.

### Key numbers [sim, stand-in town]

| Measure | Result | Implication |
| --- | --- | --- |
| Borovsky: share of time the table is outside his view cone | 71% of 300 s; windows of **48.4 s** and 5 s on a ~72 s cycle | The unseen route has almost no timing tension |
| M1 perfect ghost run (unseen, chip, no hits, under par) | **1190 = A** | The fantasy run scores less than… |
| M1 with 11 hits on a sentry who stays distracted (each hit restarts his scrubbing) | **1965 = A+**, never spotted | …spamming poop. Hits never escalate his suspicion |
| M2 strike, flying *with* the march, releasing on ON TARGET (2 heights × 2 speeds) | Wing hits **0/4 runs**, formation broken **0/4** | Following the HUD fails |
| M2 strike, flying *against* the march, releasing on ON TARGET | Wing hits 2–4, formation broken **4/4** | Success depends on an unexplained factor |
| Wingman lag behind their designed slot | **3.4 m at 9 m/s, 4.8 m at 13 m/s** | The P-only follow controller (`parade.ts:252-258`) breaks the "box matched to the files" design |
| M2: snatching the Order from the air while Voronova is reading (not looking) | Spotted in 6 of 6 variants | M2 has exactly one solution |
| Distance from the station roof (where Mother says "hold right mouse to scout") to Borovsky | **317 m**; tag range is 170 m (`mission.ts:518`) | The first scouting hint cannot work |

---

## 1. Core loop and moment-to-moment fun

**F1.1 The gull fantasy is under-served: four verbs carry the whole game** · High · M–L
- Evidence: the verbs are fly, perch, snatch/set down, eat, poop, scout/tag, plus the signal (G), which is a squawk with no effect outside M2's roost (`mission.ts:950-953`). People can be acted on only through poop. Props are static. Of the visible humans, only the clerk and the guards react; SailSim's quayside walkers are inert scenery (`heightCapture.ts:27`).
- Why it matters: *Untitled Goose Game* works because the protagonist's natural behaviour (honk, grab, drag, chase) *is* the toolset, and every object is a toy. Real herring gulls snatch food from hands, dive-bomb heads, drop shellfish onto hard ground, foot-paddle, mob, follow trawlers and kite motionless in the wind. Each of those is a ready-made stealth or comedy verb, and none is in the game.
- Do: add 3–4 gull verbs with systemic effects before new missions: **Swoop** (a close pass that knocks caps, mugs and papers out of hands), **Long Call** (squawk: rallies ambient gulls, turns heads), **Drop** (generalise poop ballistics to carried objects) and **Kite** (silent hover in the wind). Detail in Ideas B.

**F1.2 Flight is safe and responsive but has no skill ceiling or energy economy** · High · M
- Evidence: flapping is free and unlimited (`gull.ts:355, 390, 400`). Turning has no energy cost; the flight path converges on the view with a ~0.3 s time constant (`gull.ts:378-380`), so the turn radius is about 6 m at cruise. SailSim's wind field is passed only to rendering (`game.ts:703-716`) and never reaches `airStep`. The flight model's only skill tests are the dive and the landing, and both are assisted (R auto-snaps within 18 m and 42°, `gull.ts:360-365`).
- Why it matters: *Pilotwings* and *Ace Combat* make height, speed and turns a budget you manage. The fun of a gull is soaring on someone else's energy: updrafts over quays and hillsides, hanging in the wind. With free flapping there is no reason ever to glide, so the dive, the long drop and the brake never feel earned.
- Do: (a) make flapping *audible*: a noise radius of about 10 m, shown as a ring when a tagged guard is near. Gliding is silent. That turns the stealth rule into a flight decision (*Mark of the Ninja*'s visible noise). (b) Add ridge lift from the existing wind field on the windward edges of roofs, quays and the Kingswear/Dartmouth hillsides, plus **kiting**: brake into a wind above about 6 m/s to hover in place without flapping. (c) Optional stamina only if (a) and (b) aren't enough. Effort M for (a)+(b).

**F1.3 You cannot look without steering** · High · S–M
- Evidence: the gull flies wherever the view points (`gull.ts:376-380`). Scouting zooms the same view, so it also steers (`gullScene.ts:451`). The arrow keys steer too (`game.ts:553-556`). Mouse sensitivity isn't scaled to the 30° scouting field of view (`game.ts:361`).
- Why it matters: observation while moving is the core stealth verb (*Thief*, *Dishonored*). Wanting to glance at a guard while flying past him, and swerving into him when you do, will feel like the controls fighting you.
- Do: while gliding with no flap and no turn input, holding right mouse should freeze the flight path and free the camera (a "glance"), limited to about ±100° yaw and lasting at most 3 s before the gull drifts. Scale sensitivity by FOV while scouting.

**F1.4 Aiming poop is solved for you** · Medium · S
- Evidence: the drop marker is on by default (`settings.ts:29`); it turns red and labels **ON TARGET** (`game.ts:688-697`, `App.tsx:263-267`).
- Why it matters: in *Tony Hawk* and *Pilotwings* the skill is judgement. Once the ring says ON TARGET, the momentum-based drop the brief asks for stops being a skill, and accuracy (40 points a hit plus a 100 bonus) is free.
- Do: keep the ring and drop the ON TARGET label, or show it only in the first mission and in Free Flight practice. Add a "Bombsight" assist toggle that is noted on the review ("Assisted"), like *Celeste*'s Assist Mode: generous, but on the record.

**F1.5 Risk and reward are flat: food, hits and theft don't interact** · Medium · M
- Evidence: food in the beak is invisible to guards (`mission.ts:850`: only `isMission` items count). The pasty is "tastier, riskier" (`m1.ts:300`), but nothing guards it. The baker doesn't exist, and the sill is 14 m from the fort end with no restricted zone. Eating refills the payload (`mission.ts:679`), which is the one good link between systems, and it is only explained by a toast.
- Do: make the riskier food actually risky (a baker who shouts "THIEF!" and pulls Borovsky off his post: a chain reaction that becomes an *opportunity*). Have Mother teach "food is ammunition" once, out loud.

**F1.6 Emergent mischief is minimal: nobody reacts to anybody else** · High · M
- Evidence: the clerk flails and speaks (`m1.ts:313-316`), but no guard hears him. The cook stirs forever. Marchers don't react to Borovsky, Grushkov doesn't react to Kulik, and civilians can't be pooped on (only `targets` count, `mission.ts:788-795`).
- Why it matters: *Goose Game* and *Hitman* comedy comes from chains the player sets off: A disturbs B, who blames C. Scripted barks give a smile; a chain the player caused gives a laugh and a story they will retell.
- Do: add a tiny "commotion" event bus. Any NPC who shouts emits a sound at a position; guards within about 15 m investigate it. Civilians become low-value poop targets with reactions (hat off, umbrella up, complain to the nearest soldier, who then looks up). Effort M; it pays off in every later mission.

---

## 2. Stealth readability and fairness

**F2.1 The premise has no system behind it: Scrumpy is the only gull in town** · **Critical** · M
- Evidence: there are no ambient gulls in the web build (`grep` finds none). The Godot build had them (`godot-v1:scripts/world/ambient_gull.gd`: "They make the point that a gull over Dartmouth is the most ordinary thing in the world"). Noteworthiness depends only on distance, papers, restricted zones and speed (`mission.ts:846-857`).
- Why it matters: *Hitman*'s disguise system works because the crowd is the cover. "Just a gull" should mean blending into a flock, the flock reacting to you, and acting gull-like as camouflage. At the moment the fantasy exists only in briefing text.
- Do: (1) restore ambient gulls: loafers on ridges, circlers over the Boat Float, scroungers round the bench and the kitchen, followers behind moving boats. (2) A **conspicuousness indicator** by the beak slot: *Just a gull* / *Conspicuous: papers* / *Restricted area* / *Odd behaviour*. (3) Add "gull-ness" inputs to noteworthiness: loafing near other gulls ×0.5; hovering motionless within 10 m of a guard for more than 3 s, or staring (scouting) at him from under 15 m, ×1.5. (4) Let ambient gulls be a resource: a dropped chip draws a mob onto a guard's head, which is a distraction the player wrote.

**F2.2 The most important rule is invisible: guards don't look up more than 30°** · High · S–M
- Evidence: the vertical limit is `upLim = 30° + head pitch`, plus 40° when suspicious or alarmed (`guard.ts:368-371`). The vision cone is a flat fan on the ground (`missionView.ts:303-320`), shown only once a guard is tagged (`:485`). The 6 m restricted cylinder round the table (`m1.ts:173`) and the lectern's 4.5 m one (`m2.ts:158`) are not drawn.
- Why it matters: *Mark of the Ninja*'s rule is that everything the AI uses to detect you is shown to you. Players will learn "height is safety" by accident, and "Voronova saw me on the canopy once she was suspicious" will feel random.
- Do: draw the cone as a wedge with a visible **ceiling**: a faint sheet at the upper limit that tilts up when the guard is suspicious. Mark restricted zones diegetically with a rope cordon on posts and a sign, "ВХОД ВОСПРЕЩЁН · NO ENTRY". The sign is a period joke and an affordance at once.

**F2.3 Scouting reveals less than promised: the routine readout is never drawn** · High · S
- Evidence: the HUD passes `routine` into overlays (`game.ts:750`), but `App.tsx:248-255` renders only the name, the state and the meter. The README says tagged guards show their routine.
- Why it matters: *Invisible Inc.* and *Hitman* earn the time spent observing by turning it into a plan. Tagging currently gives a cone and a name, and the cone only for the guard you were already watching.
- Do: render the routine as steps with a playhead, e.g. `post ▸ tea ▸ RIVER (6 s) ▸ fort`, with the current step and time left. Add one line of intel per guard: "Will leave his post for tea", "Never looks up unless spooked". Effort S.

**F2.4 Off-screen threat awareness was removed in the port** · High · S
- Evidence: overlays skip guards who are behind the camera or more than 90 m away (`game.ts:747`). The Godot HUD drew "directional suspicion arcs around the crosshair (visible even off-screen)" (`godot-v1:scripts/ui/hud.gd:412`).
- Why it matters: in a chase camera the threat is usually behind or below you. A banner reading SUSPICIOUS with no direction gives you nothing to act on.
- Do: port the arcs back: one per guard who is building suspicion, placed at his bearing, thickening with suspicion.

**F2.5 Borovsky is too easy and too predictable to create tension** · High · S
- Evidence: the routine waits are 8, 4.5, 9 and 9 s plus walking (`m1.ts:189-194`). The table is unwatched 71% of the time, in 48 s windows [sim]. The wait on the gutter is the climax of the mission, and it has no pressure.
- Why it matters: *Mark of the Ninja*'s rooms give windows of 3–8 s, and tension comes from committing. A 48-second gap is a queue, not a gamble.
- Do: cut the back-turned windows to about 6–12 s. Add a **second, weaker watcher** with a different rhythm, such as the baker leaning in her doorway or the cook's smoke break, so the safe moment is where two windows overlap. Add audio tells (he hums on the river wall and stops when he turns) as *Thief* does with footsteps.

**F2.6 There is no failure, consequence or escalation** · **Critical** (foundation) · M
- Evidence: being spotted causes a swat or a thrown cap and drops the item, which the guard puts back (`guard.ts:491-519, 595-638`). After 9 s of searching he returns (`guard.ts:521-540`). A discovered theft makes guards jumpy for 35 s (`guard.ts:686`). The mission can't be lost, and nothing changes for the rest of it.
- Why it matters: *Thief* and *Dishonored* make recovery possible but costly: the level changes when you are loud. Without that, players brute-force, and "never spotted" is just a points line. *Hitman*'s escalations and "the target moves to the safe room" show the middle path: no game over, but the world reacts.
- Do: add a **mission alert ladder** (0 Calm, 1 Jumpy, 2 Alarmed, 3 Lockdown) driven by sightings and discovered thefts. Each step changes the world: an extra sentry, a net on a key perch, the dispatch moved indoors, the courier arriving early. At Lockdown the operation is **Compromised**: it still completes, but with a different debrief, a "blown" stamp on the review and a lasting consequence in the campaign. Add a soft clock in M1 (the courier returns at about 6:00, see C1).

**F2.7 Guards are one AI with different parameters** · Medium · M
- Evidence: Borovsky (routine), Voronova (static, 120° FOV, 28 m range), Kulik and Osipov (static, alternating two facings) all share `Guard` with the same states (`m2.ts:169-176, 233-243`). Repeated hits never raise suspicion unless he is already at 50 or more and noticing (`guard.ts:197-210`).
- Do: define 5–6 archetypes now, each with one signature perception rule, and introduce one per mission: **Sentry** (routine), **Officer** (looks up when anything goes wrong nearby), **Spotter with binoculars** (long, narrow cone that sweeps the roofs: the post-M2 escalation), **Cook** (feeds gulls, which is cover; shouts if robbed), **Dog** (smells food in your beak, can't see up: the Dachshund), **Net crew** (claims perches). Add **escalating repeat-victim behaviour**: Borovsky's second hit gets a different line, the third makes him paranoid and look up permanently. That is the comedy rule of three with a mechanical payoff.

**F2.8 The design's hardest moments were never flown by the test bot** · Medium · M
- Evidence: the e2e suite teleports the gull beside the dispatch (`missions.e2e.cjs:89`) and onto the gutter (`:85`), and fakes the Wing's hits with flock poop spawned straight onto soldiers (`:153-158`). The Godot build had `pilot_*` suites that never teleported (`godot-v1:README.md`, Testing). That is how the M2 direction bug (F3.3) went unnoticed.
- Do: add a pilot test that flies the M2 strike with the player's cues only, from both directions, and the M1 drop from the gutter with real controls.

---

## 3. Mission design

**F3.1 Mission 1: a solid two-approach core, wrapped in chores** · Medium
- Strengths: there are two readable approaches (wait for his back, or distract him) and two distraction flavours (tunic sends him to the pump, tea sends him to the kitchen). Papers left lying about are tidied back to the table (`guard.ts:669-678`), and the beak-slot dilemma is real. Good bones.
- Gaps: (a) the **courier never appears**: the briefing says he "takes his lunch" (`briefings.ts:15`), but there is no NPC, no return and no clock, which wastes the obvious timer and a third approach. (b) Lunch is mandatory and mechanically disconnected from the heist. It works as a joke but sits there as a chore. (c) The mission **ends abruptly** 3 s after the second condition (`m1.ts:286-289`), with no exit or flourish. Mother says "Come home" and the game doesn't let you. (d) The hints give the solutions away: "A calm sentry never looks this high", "Clear line to the sentry and his tea" (`m1.ts:103, 110`).
- Do: add the courier (C1). Fold lunch into the heist: the pasty becomes a bribe or a lure, or the clerk's chips draw the mob. End with a 10 s exfil beat: the Dorothy May's skipper reaches into the pot and leaves a mackerel, then cut to the debrief. Hand out hints in stages, *Hitman* "mission story" style: nothing in the first 90 s, then Mother's nudge, then the explicit hint.

**F3.2 Mission 2 is a single-solution rail** · High · M
- Evidence: the objective chain runs scout → signal → strike → steal → deliver (`m2.ts:225-230`). An unseen snatch from above while Voronova reads was spotted in all six variants I tried [sim]. Flapping anywhere within 6 m of a guard is heard whatever way he faces (`guard.ts:361`), and the restricted zone covers the deck. The mandatory scouting yields no intel the player needs: Voronova "stands at the lectern".
- Why it matters: replayability in *Hitman* comes from 3–6 approaches to one target, each found by observation. M2 is the mission that should show "the flock" as one tool among several.
- Do: keep the Wing strike as the loud route and add two others (Ideas C2): the **Marshal's tea** (quiet distraction), the **banner** or **paperweight** (heavy-lift set piece), the **band** (comedy chain). Make scouting the way you find them: tagging Voronova reveals "She will fetch the Marshal's tea herself".

**F3.3 The Wing's strike succeeds or fails on an unexplained factor** · **Critical** · S–M
- Evidence [sim]: following ON TARGET while flying the same way as the column gives 0 Wing hits in 4 runs; flying head-on breaks the formation in 4 of 4. Carpet-dropping early works only when flying with the march. Causes: the wingmen trail 3.4–4.8 m behind their slots, because the follow controller is proportional only (`want = to × 2.4`, `parade.ts:254`); their releases are staggered by 0.05–0.42 s (`m2.ts:436`, `parade.ts:187-191`); and the drop marker predicts only *your* poop (`game.ts:689`). Mother's only guidance is "Fly along the column, not across it" (`m2.ts:423`). The column reverses about every 71 s, so the right direction is effectively a coin toss. A failure costs a 6 s circle, a 14 s reload and a round trip to the roost (`parade.ts:239, 246`).
- Why it matters: this is the brief's showpiece moment ("lead a mass strike"). If it fails half the time for reasons players can't see, they will blame the controls.
- Do: (1) feed-forward in the follow controller, `want = leader.vel + 2.4 × (slot − pos)`, so the box holds. (2) Draw the **Wing's footprint**: five small rings in the box pattern under the main ring, turning red per ring. (3) Count hits from both directions, or have Mother teach "Come at the head of the column." (4) Shorten the reload to about 6 s, and let the Wing circle and wait over the hotel instead of landing.

**F3.4 Set-ups without payoffs, and payoffs without set-ups** · Medium · S
- The **Marshal** first appears in the results ("Formation broken before the Marshal", "The Marshal's greatcoat…", `m2.ts:482, 501`). The briefing never mentions him (`briefings.ts:22`); he is only a code comment (`m2.ts:156`) and one chaos bark.
- The **"friend" who collects** from the lobster pot (`briefings.ts:15`) is never seen or mentioned again: the best mystery hook in the script, unused.
- The **"Royal Dart Squadron" veterans** (`briefings.ts:22`) have no lines.
- Do: put the Marshal in the M2 briefing ("A Marshal of the Soviet Union is visiting. Grushkov has had the Embankment swept, twice"). Make the friend a recurring thread (D).

**F3.5 Both missions use the same small strip of the real map, and the same drop** · High · M (planning)
- Evidence: all of M1 and M2 sits in e −400 to −265, n 40 to 400: about 0.05 km² of the 3.6 km² play area (`game.ts:38`). The M2 stand is built where M1's chip bench stood (`m1.ts:49`, `m2.ts:35`), and both deliver to the Dorothy May's pot (`m1.ts:149`, `m2.ts:154`). Inside the bounds but unused (from `public/geo/features.json`): **Britannia Royal Naval College** (−752, 1009), the **Higher Ferry** (−224…−7, 975…1292), **Sandquay** (below the College, the story's submarine berth), **Dartmouth Castle** (546, −691), **St Petrox** (513, −647), **Kingswear station** (34, 69) and the **Lower Ferry** route. The College is very probably the large building on the hill in the title shot (`01_title.jpg`).
- Why it matters: the real, solid Dartmouth is this game's unique selling point, and players will want to *use* the town. The Naval College is literally "Britannia": the obvious Kommandatura HQ and finale, and a title link that writes itself.
- Do: give each remaining mission its own district (D). Keep the stand-on-the-bench continuity as a deliberate joke: the clerk now watches the parade from the crowd.

**F3.6 Tutorialisation: the hardest skill comes first and the controls arrive as text** · High · M
- See section 6 for the step-by-step. In short: a precision landing is the first task; eight flight inputs are named in one radio line (`m1.ts:240`); the first scouting hint is impossible at 317 m (`m1.ts:101, 299`); and poop aiming is never practised before it matters.
- Why it matters: *Portal* and *Celeste* teach one verb per room, with the geometry doing the teaching and text as a last resort.

**F3.7 Replay value rests on a score that can be farmed** · **Critical** · M
- Evidence: hits score 40 each, long drops 25 each, plus 100 for 75% accuracy (`mission.ts:1007-1010`), uncapped. Repeat hits on a distracted guard restart his distraction and never alert him (`guard.ts:205`). Result: 1965 (A+) by farming against 1190 (A) for a perfect ghost run [sim]. Grade bands are absolute (`mission.ts:246-254`). The ghost and distraction routes get no distinct recognition. The HUD score (`mission.ts:977-979`) reads 0 for most of a run (screenshots 02–05).
- Why it matters: *Hitman*'s ratings (Silent Assassin), *Dishonored*'s Clean Hands and Ghost, and *Tony Hawk*'s goal lists reward *how* you played, and they make each approach a reason to replay. A points sum rewards whatever is spammable.
- Do: (1) cap scoring hits per target (first hit full, second half, third and later zero, *unless* the hit triggers something new). (2) Make the stealth tiers worth more than the hit ceiling (ghost 500). (3) Add **approach ratings** (Ghost / Saboteur / Hooligan) with their own citations. (4) Add 8–10 **feats** per mission, shown on the review and on the title (Ideas A7). (5) Remove the live HUD score, or replace it with "Feats 3/9".

**F3.8 Pacing: about 70% travel and waiting** · Medium · S
- M1 is roughly 1 km of flying (nest → station → bench → cove → Boat Float) plus up to 72 s on the gutter. M2 crosses the same 150 m square four times (St Saviour's → pile → hotel → parade → Dorothy May), and more after a failed strike. Missions last 5–7 minutes, which is fine; there is no rising action, and the music changes only on Alert (`mission.ts:487-502`).
- Do: put the optional scouting perch *on the way* (in M2, scout from the hotel roof or the station turret rather than the pile). Add an audible build-up: St Saviour's chimes the quarter, and the parade's drum gets louder as the column nears the stand. Give each mission one visual set piece: the formation breaking is one; M1 has none.

**F3.9 Side activities and Free Flight are empty** · Medium · M
- Evidence: Free Flight has two perches, no targets, no people and no goals (`free.ts`).
- Do: make Free Flight the map-learning and practice mode. A **Landmarks of Dartmouth** perch tour (20 named roofs, each with one dry line of history), a poop-practice range on the washing lines, time trials through the old town (*Pilotwings*), and **intercepts** to collect: Kommandatura memos that tell the backstory.

---

## 4. Campaign and story

**F4.1 The premise is strong, but its ontology is undecided** · **Critical** (foundation) · S to decide
- Evidence: the briefings address a gull as an agent ("Operative SCRUMPY (Herring Gull, adult, unbanded)", `briefings.ts:15`). Mother speaks to the gull by radio (`m1.ts:230`). There is a "Resistance pantry" (`mission.ts:684-688`) and a "Committee". Nothing says whether Section G is people who run gulls, gulls who run themselves, or people who think they run gulls.
- Why it matters: every joke depends on this answer, and so does every future line of dialogue. The richest version (and the one the current text leans toward) is **deadpan human bureaucracy treating a gull with total seriousness**: personnel files, performance reviews, standing orders, a leg-ring radio. The gull never speaks and never acknowledges any of it. That is *Le Carré* played straight with a herring gull in the chair: comedy from the gap between the paperwork and the bird.
- Do: write a one-page bible now (Ideas D). Who Mother is (retired WAAF plotter or SOE wireless operator, now running Section G from the back of a ship's chandler; dry, fond, slightly terrifying). How the radio works (a leg-ring receiver; "unbanded" in File 1 becomes a joke when Scrumpy is issued one). Who the Committee is (offstage, budget-obsessed). What gulls get out of it (chips; the pantry).

**F4.2 Characters are names, not people** · High · M
- Evidence: Mother's 34 lines are almost all instructions ("Good landing.", "Splendid work."). Scrumpy has no reaction, no tic and no backstory beyond the cider name. The Bomber Wing (Gristle, Mrs Wimbush, Old Nelson, The Padre) has **zero lines** and one remark (`m2.ts:505`). Voronova "misses nothing" (`briefings.ts:22`) and is then beaten by the scripted solution. Borovsky is the one character with texture ("Beautiful. Like Odessa, but wetter.", "…It is STILL THERE.").
- Why it matters: *Firewatch* builds a whole relationship through radio alone. *Monkey Island* gives every bit-part a voice. With text-only radio, character *is* the writing, and it costs nothing to render.
- Do: (1) give Mother a voice with opinions, memories and **reactions** (F4.4). (2) Give the Wing 5–8 barks each during the strike (Ideas A5). (3) Make **Borovsky a recurring character with a career arc** told through the debriefs (A3). (4) Make **Voronova the antagonist with a through-line**: after M2 she is the one officer who believes the gulls are organised (A4), and her counter-measures drive the escalation in M3–M6.

**F4.3 Story delivery is minimal, and the best beat is buried** · High · S–M
- Evidence: there are two static briefing cards (~430 words in total, `briefings.ts`). The plot-advancing debrief (~50 words each, `m1.ts:374`, `m2.ts:510`) is printed **below** the score table and the Committee's remarks (`App.tsx:173-179`), which in screenshot 06 means below the fold. "Continue" goes to the title, not to the next file (`App.tsx:181`). There is no cold open, no framing and no ending.
- Why it matters: the debrief is where the campaign moves forward: S-197, Operation PRIBOI, nets. Players skim score tables and will miss it.
- Do: split the end of a mission into three short screens: (1) the **intercept**, a Kommandatura document reacting to what you did (Borovsky's incident report, Voronova's memo); (2) the **Section G debrief**, a paragraph that ends on the next mission's hook; (3) the **performance review**. Add "Proceed to File N" on the review. Add a 30 s skippable cold open (A1). Effort S for the layout, M for the content.

**F4.4 The radio is a queue of instructions with no awareness** · Medium · S–M
- Evidence: lines run 5–8 s and are queued FIFO (`game.ts:575-618`), so a long line can delay an urgent one (the first sighting, at `mission.ts:873`). Lines are not dropped when they go stale. Mother reacts to the obvious events and, in one lovely moment, to trying to eat the dispatch (`mission.ts:662`).
- Why it matters: *The Stanley Parable*'s narrator is funny because he notices what you do that you shouldn't. "Do NOT eat the dispatch, Scrumpy" is exactly that, and the game needs about thirty more.
- Do: a priority queue with interruption (danger > objective > colour) and condition checks at play time (drop a line if its trigger no longer holds). Add a **"Mother notices"** library keyed to player mischief (A2). Keep lines under about 15 words; anything longer belongs in the briefing.

**F4.5 The tone is right, but the Soviets risk being one joke** · Medium · S
- Evidence: the generic barks lean on Cold War cliché ("Come out, little capitalist", "It has the cunning of the bourgeoisie", `guard.ts:71-73`). Pools are 3–4 lines, so they repeat fast.
- Why it matters: Le Carré's enemies are tired professionals with mothers. Borovsky's Odessa line works because it is homesick, not ideological. Comedy wears thin when every soldier does the same accent joke.
- Do: write the occupiers as bored, homesick and bureaucratic: soldiers who also hate gulls, love tea and fear their sergeant. Give each named guard a personal pool. Generic pools should be 8 or more lines, with no repeat within 3 barks.

**F4.6 Continuity errors (cheap to fix, but they undercut the dossier conceit)** · Low · S
- "Morning, Scrumpy" (`m1.ts:230`) against the 13.20 HRS dateline (`briefings.ts:14`), left over from the Godot 07.40 dateline.
- M2's dateline is Wednesday 7 June at 10.55 (`briefings.ts:21`), but the scene always uses 3 June at 13.20 plus however long you've been playing (`game.ts:46, 264-266`). The mission clock is never reset on start or restart (`game.ts:291-313`), so the sun and tide drift between restarts.
- "One chip was requisitioned" also prints for two chips (`mission.ts:1058`).
- "Commandant" and "Colonel Grushkov" are used without saying they are the same man (`m1.ts:374`, `briefings.ts:22`).
- "Das Boot, Das Gull" in the README against "Das Boot Das Gull" in the brief.

**F4.7 The 1967 setting is scenery, not story material** · High · M
- Evidence: SOURCES lists pre-decimal money and the Home Service as unused. Nothing on screen makes it 1967 rather than any year.
- Do: use the period as *texture* and *plot*. Each item below is marked for checking before use:
  - The **pirate radio** era: the Marine Broadcasting Offences Act came into force in August 1967 (verify). A Resistance pirate transmitter off the Dart mouth is Mother's station, and its last broadcast could be the finale's clock.
  - **Spy fiction at its 1967 peak**: *You Only Live Twice* (released June 1967), the Harry Palmer films, Le Carré's *The Looking Glass War* (1965), whose faded department of old men reliving a war is **exactly** the Bomber Wing (all verify). Use them as tonal references, never quotation.
  - **Wartime memory**: the D-Day embarkation from Dartmouth in 1944 (verify details). The Wing are "veterans of '44" who still talk about the Americans.
  - **Bayard's Cove and the Pilgrim Fathers** (1620, verify): a perch plaque line in the Landmarks tour.
  - **The Naval College** as the Kommandatura: "Britannia" occupied.
  - **The medieval harbour chain** at Dartmouth Castle (verify): a finale device.
  - **The Soviet submarine fleet included ex-German U-boats taken as reparations in 1945–46** (verify specifics). That makes "Das Boot, Das Gull" diegetic: S-197 is an ex-Kriegsmarine boat with German stencils inside, and it sets up the German thread of "The Dachshund Exchange" (an East German liaison and his dog).
  - **Money and objects**: shillings and pence on the chip paper, a ration book, a Morris Minor, a Lambretta, a transistor radio someone is hiding from the patrol. Background props and memo text, not lectures.

**F4.8 The through-line exists only as plot coupons** · High · S to plan
- Evidence: dispatch → S-197 → Inspection Order → PRIBOI sweep → nets (`m1.ts:374`, `m2.ts:510`). It is a chain of MacGuffins with no personal stakes, no antagonist plan seen from her side, and no question the player wants answered.
- Do: give the six missions one spine question and one twist (Ideas D). Suggested spine: *PRIBOI will sweep the Resistance at low tide; who in Dartmouth is feeding the Kommandatura, and who is the friend at the lobster pot?*

---

## 5. Progression and motivation

**F5.1 There is no progression beyond unlocking and a best score** · High · M
- Evidence: `progress.ts` stores only `done` and `best`. The pantry is points that vanish (`mission.ts:684`). Medals are grade titles. The specialists are one forced stat profile (`m2.ts:22-31`).
- Do: a **Personnel File** screen as the hub. It shows Scrumpy's citations (feats), medals and ribbons, *reprimands* (the comedic flip side: "Seen, three times"), the **pantry ledger** (food stashed across missions, dryly itemised), and **Borovsky's file**, which updates after each mission. Use the pantry as a light currency for **Bomber Wing morale** (more wingmen or faster reloads) or "favours" (the cook leaves the kitchen door open in a later mission). Keep it small: *Goose Game* has no economy and doesn't need one, but this game's bureaucratic frame begs for a ledger.

**F5.2 The specialist gulls are stat tweaks, not characters or choices** · Medium-High · L
- Evidence: the Bomber profile is 6 payload, an 11 s reload, and turns 19% slower (`m2.ts:22-31`). The player won't feel it apart from six dots. The Strafer and Heavy-lift don't exist.
- Why it matters: in *Invisible Inc.* each agent is a different way to solve the same room, and choosing the loadout *is* the plan.
- Do: build specialists around verbs. **Bomber**: pattern drops and leads the Wing. **Strafer**: skims under 4 m for silent speed, rapid release, and a skim score. **Heavy-lift**: carries large objects (a codebook, a cap, a paperweight, a lead), can't hover, and is loud. Make each a **named member of the Wing** with a personality, and let the player pick one on replays of earlier missions (M1 as Gristle the Strafer is a different heist).

**F5.3 There are almost no reasons to replay** · High · M
- Do: feats (A7), approach ratings (F3.7), alternative routes (C), intercept collectibles hidden *in mission spaces* (Kommandatura memos on a desk, in a bin, in Borovsky's pocket), and an "Assisted" tag that encourages a no-marker run.

---

## 6. The first ten minutes, step by step

| t | What the player sees and does | Likely reaction | Evidence | Fix |
| --- | --- | --- | --- | --- |
| 0:00 | Loading (~3 MB), "Surveying the rooftops… %" | Fine; charming copy | `game.ts:236-237` | Rotate Standing Orders as loading tips (A8) |
| 0:20 | Title: a dossier card, three buttons, a tagline | Good mood, but no hook beyond the tagline | `01_title.jpg` | 30 s cold open on first launch (A1) |
| 0:30 | Briefing: ~170 words, four orders | Most will skim; the two-approach hint is good | `briefings.ts:13-18` | Cut to about 90 words; leave the orders as a reference |
| 0:50 | Pointer lock, on the nest. HUD: readouts, a **14-line controls panel on by default**, objectives, radio | Overwhelmed; a quarter of the screen is text | `settings.ts:30`, `02_*.jpg` | Controls panel off; show context prompts for the next verb only |
| 1:00 | Take off; Mother lists W, look, Shift, S and R in one 8 s line, then "land on the station roof" | Reads half of it while learning mouse-steer | `m1.ts:240` | Teach flying first: "Off you go. Dive at the Boat Float. Pull up before the water." Landing comes second |
| 1:10–2:30 | First task is a **precision landing** on a small roof 90 m away; R only works within 18 m and 42° | The likeliest early frustration: overshoots, tumbles, circling. The hint arrives only after 40 s | `gull.ts:360-365`, `m1.ts:242` | Make the first landing a big flat roof; highlight R as a big prompt when within range; then the station |
| 2:30 | Landed. Three objectives open at once; two radio lines (7 s + 8 s) queue | "What now?" The order of the objectives is unclear | `m1.ts:293-300` | One beat at a time: lunch first (it's on the way), then the cove |
| 2:40 | Mother: "hold right mouse to scout and tag the sentry". Borovsky is **317 m away**; the tag range is 170 m | Holds right mouse, sees a dot, nothing happens. First "is it broken?" moment | `m1.ts:299`, `mission.ts:518` | Move the scouting instruction to the cove approach; show "out of range" in the scope |
| 3:00 | Marker to the chips (62 m). Snatch in flight (2.6 m grab range), eat with F | Pleasing: the clerk flails. A good first laugh | `m1.ts:313-316` | Keep. Have Mother mention the payload refill here |
| 3:30 | Fly ~250 m to Bayard's Cove following the marker | Pleasant scenery; no tension; no gulls about | — | Ambient gulls; a poop-practice target on the way (a Kommandatura poster on the ferry slip) |
| 4:00 | Lands on some roof. The named perches and their hints are found only by landing on them | Unsure where is "safe". The gutter is the solution, but it is a single named point on the eaves | `m1.ts:103-105` | Scouting shows named perches and their sightlines (Hitman "instinct") |
| 4:30–5:30 | Waits on the gutter for 10–50 s; no routine readout, no "is he looking?" cue except the cone | Either boredom (a long wait) or anxiety with nothing to act on | `App.tsx:248-255` | Routine readout with a timer (F2.3); a tighter window (F2.5) |
| 5:30 | Drops, snatches, flies off. Unseen. Easy | A brief thrill, then anticlimax | — | A second watcher; an audio tell |
| 6:30 | Flies the dispatch to the Dorothy May (~330 m), must be within 2.6 m of the pot. The prompt says "Closer — right over…" | Small friction at the pot | `mission.ts:605-609` | Fine; add the skipper's hand as the payoff |
| 6:40 | Mission ends 3 s after delivery and lunch. Review card: ~10 lines of points, remarks, and the debrief below the fold | Pleased by the grade; misses the S-197 hook | `App.tsx:141-188`, `06_*.jpg` | Intercept, then debrief, then review; "Proceed to File 2" |

Where players will get **lost**: the scouting hint at 317 m, which perch is safe, and in M2, where the roost is relative to the pile and which way to fly the strike. Where they will get **bored**: the gutter wait and the M2 round trips. Where they will get **frustrated**: the first landing, and the M2 strike failing for reasons they can't see.

---

## Prioritised top 15

| # | Change | Areas | Severity | Effort |
| --- | --- | --- | --- | --- |
| 1 | **Fix the M2 strike**: feed-forward follow, Wing footprint rings, both directions count, faster reload | F3.3 | Critical | S–M |
| 2 | **Rebuild scoring**: cap repeat hits, ghost worth more than spam, approach ratings, 8–10 feats per mission, drop the live score | F3.7, F1.4 | Critical | M |
| 3 | **Write the story bible** before M3: Section G's ontology, Mother's voice, the spine question, the twist, arcs for Borovsky, Voronova, the Wing and the Skipper | F4.1, F4.8 | Critical | S (write) |
| 4 | **Make "just a gull" a system**: ambient gulls, conspicuousness indicator, gull-ness inputs to suspicion | F2.1 | Critical | M |
| 5 | **Alert ladder and soft failure**: escalation steps that change the level, a Compromised outcome, M1's courier clock | F2.6, F3.1 | Critical | M |
| 6 | **Perception readability**: routine readout with a playhead, vertical ceiling on the cone, off-screen arcs restored, diegetic cordons | F2.2–F2.4 | High | S–M |
| 7 | **Mission ending sequence**: intercept, then debrief, then review; "Proceed to File N"; exfil beat with the skipper | F4.3, F3.1 | High | S–M |
| 8 | **Onboarding pass on M1's first three minutes**: fly first, then land; one verb per beat; poop practice on the way; scouting in range; controls panel off | F3.6, §6 | High | M |
| 9 | **Tighten M1's stealth**: 6–12 s windows, a second watcher, audio tells, a pasty that is really risky | F2.5, F1.5 | High | S–M |
| 10 | **Two to three opportunities per existing mission** (Ideas C) to set the *Hitman* template | F3.2 | High | M each |
| 11 | **Reactive Mother and character barks**: a priority radio queue, about 30 "Mother notices" lines, Wing chatter, personal guard pools with escalation | F4.2, F4.4, F4.5, F2.7 | High | S–M |
| 12 | **Gull verbs**: Swoop, Long Call, Drop-an-object, Kite (Ideas B) | F1.1 | High | M–L |
| 13 | **Flight depth**: audible flapping and silent gliding, ridge lift and kiting from the existing wind, glance-without-steering | F1.2, F1.3 | High | M |
| 14 | **Commotion bus and reactive civilians**: NPCs react to each other; townspeople as low-value targets | F1.6 | High | M |
| 15 | **Progression shell**: Personnel File (citations, reprimands, pantry ledger, Borovsky's file); Free Flight Landmarks tour and intercepts; specialists as verbs, chosen on replay | F5.1–F5.3, F3.9 | Medium-High | M (shell), L (specialists) |

Quick wins to do alongside (S, under a day in total): the "Morning" line; M2's date and time of day per mission; reset the clock on restart; the "One chip" plural; the Marshal in the M2 briefing; the scouting hint's range; the routine readout; controls panel off by default; "Proceed to File 2".

---

## Ready-to-use ideas

### A. Writing samples in the game's voice

**A1. Cold open** (first launch, typewriter over the title flight, about 30 s, skippable)
> OCTOBER 1962. Somebody blinked.
> It was us.
>
> 1963. The Treaty of Torbay. Fraternal assistance. Russian on the wireless after the shipping forecast.
>
> JUNE 1967. Dartmouth is administered from the Royal Naval College by the Kommandatura of the South-Western District. Tea is rationed. Chips are not. Yet.
>
> The occupation has thought of everything.
>
> Almost.

**A2. Mother: voice and "Mother notices" lines** (each under 15 words; trigger in brackets)
- [idle on the nest 20 s] "Whenever you're ready. The occupation isn't going anywhere. That's rather the problem."
- [first tumble] "Landings are a matter of confidence, Scrumpy. Yours is excessive."
- [third chip] "That's three. The Quartermaster counts, you know. He has nothing else."
- [floating in the Boat Float 30 s] "Are you… paddling? On Section G's wireless time?"
- [pooping on the clerk] "He's a clerk, not a target. Although."
- [flying to Kingswear] "That's Kingswear. We have nobody in Kingswear. Nobody does."
- [second attempt to eat the dispatch] "Scrumpy. We have discussed paper."
- [pasty taken unseen] "The bakery will blame the Russians. Everyone does. It's very restful."
- [third hit on Borovsky] "Once is tradecraft. Three times is a hobby."
- [scouting a guard from under 10 m] "You're staring. Gulls don't stare. Gulls glance, and then they take things."
- [ghost delivery] "Not a feather out of place. I shan't tell the Committee; they'd only expect it."
- [delivery while chased] "Delivered. Loudly. We'll call it a demonstration."
- [M2 start] "Bomber lead, Mother. Today you are the weather."

**A3. Borovsky's career** (an epilogue line on each debrief, with Borovsky's own report as the M1 intercept)
> KOMMANDATURA DARTMOUTH · INCIDENT REPORT · Pte. G. BOROVSKY · 3.6.67
> 13.31 Tea. 13.34 Tea compromised by gull. 13.35 Proceeded to field kitchen for replacement tea per Standing Order on Morale. 13.41 Returned to post. Table present. Dispatch absent. Gull present (several). Questioned gulls. No answer.
> RECOMMENDATION: Fewer gulls.

- After File 1: *Reassigned to latrine duty, South Embankment, pending enquiry into "the gull matter".*
- After File 2: *Appointed to the new Anti-Gull Section (strength: one man, one net) on grounds of experience.*
- After File 3: *Requested transfer to Odessa. Refused: Odessa also has gulls.*
- After File 4: *Commended for bravery aboard S-197. Cannot explain what he was brave about.*
- After File 5: *Seen feeding a gull a crust. Denies it. The gull also denies it.*
- After File 6: *Last seen on the passenger ferry, without a ticket, with a gull.*

Escalating barks for repeat hits:
1. "My tunic! My BEST tunic!" (existing)
2. "Again? AGAIN? Is there one gull in Devon?"
3. "I am writing to my mother. I am telling her everything." *(now looks up)*
4. "I see you. I see ALL of you." *(permanent upward glance; suspicious of any gull within 8 m)*

**A4. Voronova's memo** (the M2 intercept, setting up the antagonist arc)
> KOMMANDATURA · OFFICE OF THE ADJUTANT · MOST SECRET
> To: Col. A. Grushkov. Subject: The Gull Question.
> 1. The Order was not taken by the wind, by a thief, or by "a bird with a grudge". It was taken by a bird with a plan.
> 2. I request (a) nets, (b) an owl, (c) that the men stop feeding them.
> 3. I note the Colonel has approved (a), refused (b) as superstition, and is himself feeding them as I write.
> — Lt. I. Voronova

Her lines from M3 on: "Not just a gull." / "Check the roofs. All of them." / "That one has been on the same chimney for nine minutes. Gulls do not have nine minutes."

**A5. Bomber Wing chatter** (M2; radio speaker tags)
- GRISTLE: "Lead, Gristle. Say the word and I'll do the Marshal personally."
- MRS WIMBUSH: "I've been saving this since Tuesday, dear."
- OLD NELSON: "Bear left, lad. I can only see the left."
- THE PADRE: "For what they are about to receive…"
- [miss] GRISTLE: "Missed the entire army. Takes skill, that."
- [formation broken] OLD NELSON: "England expects!" · MRS WIMBUSH: "Lovely. Lovely."
- [reload] THE PADRE: "Back to the roof, chaps. Loaves and fishes."

**A6. The debrief as a hook** (rewrite of M1's, same facts)
> DEBRIEF. The dispatch is a resupply manifest. Paraffin, potatoes, 400 yards of netting, and one line in a different hand: *Sandquay, berth reserved, S-197.* A submarine, Scrumpy. In the Dart. The Commandant reviews his garrison on Wednesday, and her berthing orders will be on his lectern.
> Mother has sent for the Wing.

**A7. Feats** (*Hitman* challenges, written as citations)

Mission 1:
- **Tea Leaf**: compromise Pte. Borovsky's tea.
- **Laundry Day**: send him to the pump.
- **Nothing Unusual, Apart From the Gulls**: deliver without the theft being discovered.
- **Ghost of Bayard's Cove**: never raise a question mark.
- **Standing Order 4**: lunch before the dispatch.
- **Lunch on the Wing**: snatch and eat without touching down.
- **Unassisted**: no landing assist, no drop marker.
- **The Baker's Dozen**: take the pasty in full view and get away with it.
- **Long Drop**: a hit from 25 m.
- **The Usual Suspect**: get the clerk blamed for something.

Mission 2:
- **For What They Are About to Receive**: break the formation on the first pass.
- **Before the Marshal**: hit the Marshal.
- **Mrs Wimbush's Contribution**: 12 Wing hits.
- **Bun Fight**: liberate the saffron bun during the chaos.
- **Eyes Front**: take the Order without a strike.
- **RE-FORM!**: break the formation twice.

**A8. Standing Orders** (loading tips and the HUD's "lunch" joke)
> 1. An operative is at all times a gull.
> 2. An operative does not eat the documents.
> 4. (Morale) Lunch.
> 9. Chips are not evidence.
> 12. The Committee does not, at any time, discuss the bins.
> 17. If seen, be a different gull.

### B. New gull verbs

| Verb | Input | Mechanic | Stealth or comedy use | Effort |
| --- | --- | --- | --- | --- |
| **Swoop** | Dive past within 1.5 m of a head with Shift released at the last moment | Knocks a cap, mug, papers or chips out of hands. Guard ducks and is "rattled" for 3 s, with no alert if not seen before | Steal from hands (the gull signature); a cap in the river as a distraction; papers blown loose | M |
| **Long Call** | G anywhere (head back, the classic call) | Ambient gulls within 40 m answer and wheel overhead; guards within 20 m look up for 2 s | Turns heads *away* from a spot; masks you in a crowd; summons a mob onto dropped food | M |
| **Drop** | E while flying fast, over a target | Carried items follow poop ballistics; hard items clatter (noise lure), soft items splash | Shell-drop on a bin lid (lure), drop a crust into the tuba, drop the cap into the tea | S–M |
| **Kite** | Brake facing into the wind above about 6 m/s | Silent hover with no flap; the camera steadies | Perfect overwatch; drops while stationary; real gull behaviour | M |
| **Loaf** | Hold C, or crouch, while perched near other gulls | Feathers fluffed; noteworthiness ×0.4; preen animation | Hide in plain sight on a crowded ridge (*Hitman* blending) | S |
| **Mob** | Long Call over dropped food near a person | 3–6 ambient gulls swarm the spot for 6 s | A player-made Bomber Wing in any mission | M |
| **Tug** | Hold E on a marked prop | Pull pegs, ropes, flags, bin lids, mooring lines | Washing on Borovsky, banner over the stand, drifting boat | M |
| **Hitch** | Perch on a moving boat, bus or ferry | Ride as cover and transport; guards ignore gulls on boats | Tailing the courier; finale on the last ferry | M |
| **Paddle-stamp** | Walk on the spot on grass or mud | Noise lure; worms (food) on grass | A low-tide mission tool; comic | S |

### C. Opportunities for the two playable missions

**C1. Mission 1: A Chip Off the Old Block**
1. **The courier returns** (clock and third approach). He arrives by bicycle at about 6:00, buys chips at the bench and hangs his satchel on the handlebars. Snatch from the satchel while he argues with the gulls over his chips, or tail him (*Hitch* on the ferry) if you missed the table. If you fail, the dispatch leaves: **Compromised**, with a different debrief.
2. **The baker's shout**. Steal the pasty in her sight and she shrieks "THIEF!"; Borovsky leaves his post for 15 s to help. Risky food becomes a distraction tool.
3. **Sugar lumps**. Snatch the sugar from the field kitchen; Borovsky's tea is undrinkable, so he walks off to complain. A quiet, non-poop distraction.
4. **The Brixham Lass's line**. Tug her stern rope; she swings across the cove, and Borovsky has to wade out with a boathook. The big comic set piece and the longest window.
5. **Cap in the river** (Swoop). Knock his cap off at the river wall; he climbs down the slipway to fish it out.
6. **The mob**. Drop the clerk's chip by Borovsky's boots and Long Call: a dozen gulls, and one furious private.

**C2. Mission 2: The Inspection**
1. **The Wing strike** (existing, fixed per F3.3). The loud route.
2. **The Marshal's tea**. Poop in the samovar on the refreshment table; Voronova insists on fetching fresh tea herself (tagging reveals this) and leaves the lectern for 10 s. The quiet route.
3. **The banner**. Tug the guy-rope of the "СЛАВА СОВЕТСКОЙ АРМИИ" banner and it drops over the dignitaries. Voronova is caught underneath for 6 s.
4. **The paperweight** (heavy-lift on replay). Lift the bust that holds the Order down; the wind takes the pages across the Embankment. Snatch the one page that matters out of the air before the guards collect the rest. An aerial chase set piece using the real wind.
5. **The band**. Add three bandsmen at the back; a crust down the tuba stops the music, Grushkov explodes, and the formation falters. Combined with a Wing strike it breaks with 2 hits instead of 4.
6. **The Marshal's hat** (Swoop). Steal it and lead Voronova on a chase. Loud, but she is off the stand.

### D. Campaign through-line (six files, one spine)

- **Spine question:** *Operation PRIBOI will sweep the Dart for the Resistance. Who in Dartmouth is feeding the Kommandatura, and who is the friend at the lobster pot?*
- **The twist (Le Carré, comedy-safe):** the Committee has been quietly closing Section G down as "uneconomic"; the pantry ledger is the evidence. Mother defies them in File 6. The leak is the Committee's own budget memo, which Voronova has read. "The Committee has no preference, provided the result is the same" comes back as Mother's resignation line.
- **The friend at the lobster pot:** the Dorothy May's skipper, never seen, who leaves a mackerel head in exchange for each delivery. Captured in File 3, exchanged in File 5, at the wheel of the last ferry in File 6.

| File | Title | District (real map) | Story beat | New system or escalation | Specialist |
| --- | --- | --- | --- | --- | --- |
| 1 | A Chip Off the Old Block | Bayard's Cove | The dispatch names S-197 | Routine, distraction, courier clock | Standard |
| 2 | The Inspection | South Embankment | The Order; PRIBOI; Voronova's memo | The Wing, opportunities | Bomber |
| 3 | Low Tide | Boat Float (dries at low water) and Kingswear foreshore | PRIBOI begins at low water; the Dorothy May is stuck on the mud and the skipper is taken | Nets on roosts, spotters with binoculars, Paddle-stamp on the mud | Strafer (river skimming) |
| 4 | Das Boot, Das Gull | Sandquay, below the Naval College | S-197 is an ex-Kriegsmarine boat (German stencils); in through the open forward hatch during resupply | An interior stealth level, tight and comic; Heavy-lift steals the cipher wheel | Heavy-lift |
| 5 | The Dachshund Exchange | The Higher Ferry, mid-river | A Glienicke-style swap on the floating bridge: the skipper for the cipher wheel; the East German liaison's dachshund carries the real microfilm | The Dog archetype (smells food in your beak); Hitch on the ferry | Choice |
| 6 | The Last Ferry | Naval College (the Kommandatura) to the river mouth between Dartmouth Castle and St Petrox | Mother's last broadcast; the old harbour chain; S-197 trapped; Borovsky's ticket | Every verb, the whole Wing, Lockdown from the start | Squad |

**Side missions** that use the town: *Pantry Run* (time trial across the rooftops), *The Clerk's Revenge* (he sets traps for gulls on the bench), *Borovsky's Day Off* (follow him round the town, with comedic intel), *Landmarks of Dartmouth* (perch tour), *The Pirate Transmitter* (deliver valves to Mother's ship off the castle).

### E. Mission template (a checklist for File 3 onward)

- [ ] A district of the real map not used before, with 6 or more named perches and their sightlines.
- [ ] One primary target, with **3 or more approaches**: quiet, distraction, loud. Each found by scouting, not by the briefing.
- [ ] One **set piece** players will describe to a friend.
- [ ] One **new guard archetype or anti-gull measure** (Voronova's escalation) and one **new verb or specialist** moment.
- [ ] An alert ladder with world changes at each step, and a **Compromised** outcome with its own debrief.
- [ ] A clock that comes from the fiction (the courier, the tide, the ferry timetable).
- [ ] Beats for the recurring cast: Borovsky, Voronova, the Wing, Mother's reactive lines, the skipper.
- [ ] Intercept, then debrief, then review; 8–10 feats; 1–3 intercept collectibles.
- [ ] A pilot test that flies each approach with player inputs only.
