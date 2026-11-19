# Gull Britannia: UI, UX, onboarding, input and accessibility review

19 November 2026 · build at commit `81bce0f` · read-only review (no repository file changed except this one)

## Method

- **Code read:** `src/gull/ui/App.tsx`, `gull.css`; `src/gull/app/game.ts`, `settings.ts`, `progress.ts`, `briefings.ts`, `audio.ts`; `src/gull/view/gullScene.ts`, `missionView.ts`; `src/gull/game/mission.ts`, `m1.ts`, `m2.ts`, `free.ts`, `gull.ts` (controls); `index.html`; `README.md`; the e2e harness.
- **Screenshots:** all six in `docs/screenshots/`. Also my own probes of the running build (headless Chromium, SwiftShader): title, settings, briefing, play, pause and results at 1280×720 and 1366×768. A forced "busy" HUD (three toasts, a banner, a two-line radio message, a speech bubble) at 1366×768, 1024×640 and 800×600. Probe images are in the session scratchpad, not the repo.
- **Measurements:**
  - axe-core 4.10 (WCAG 2.0–2.2 A/AA plus best practice) on five screens.
  - Computed font sizes of the HUD elements.
  - WCAG contrast ratios of HUD text over four sampled scene colours: white render 240,240,236; sky 200,215,230; slate roof 110,118,126; river teal 40,90,90.
  - The reading speed of every radio line that has an explicit duration.
- **Benchmark:** SailSim's `src/ui` (SettingsPanel, Welcome, Help, Controls, useModal, styles.css) and `docs/` (UX_REVIEW, JUNIORS_REPORT, DEVICE_CHECK, COMPREHENSIVE_REVIEW, UI_V2_REPORT). Much of SailSim's solution code is **already vendored in this repository** (`src/ui`, `src/app`, `src/render`) and unused.
- **Not done:** real GPUs, Safari, Firefox, a real trackpad or gamepad, players. Claims about browser behaviour that I did not test are marked *(verify)*.
- **Severity:**
  - **Critical:** excludes a group of players or breaks the core loop.
  - **High:** a major barrier or a major loss of quality.
  - **Medium:** noticeable friction, or a barrier for some players.
  - **Low:** polish.
- **Effort:** **S** ≤ 1 day, **M** 2–5 days, **L** more than a week.
- **Abbreviations:**
  - GAG: Game Accessibility Guidelines (gameaccessibilityguidelines.com; Basic, Intermediate and Advanced tiers).
  - XAG: Xbox Accessibility Guidelines.
  - APX: AbleGamers' Accessible Player Experience patterns.
  - WCAG: WCAG 2.2 success criteria.
  - NH: Nielsen heuristic, numbered 1–10.
  - Hodent: Celia Hodent's game UX framework (usability pillars, engagement).

---

## Verdict

Gull Britannia already has the hard-to-fake things: a funny, coherent premise, a dossier voice that is consistently dry, flight that forgives (no death, stall recovery, landing assist), two real approaches to the first objective, and some sound accessibility instincts:
- the drop marker is also labelled in words;
- `?` and `!` are shapes as well as colours;
- reduced motion exists and honours the OS setting;
- volumes are separate;
- the arrow keys can steer;
- settings persist.

**The UI around that core is a prototype, and it will not scale to four more missions as built.** Six structural problems stand out:

1. **Input is hard-wired:**
   - actions are bound to physical keys and mouse buttons;
   - key letters are baked into mission text (`[E]`, `[Space]`, `hold right mouse`, `release with Q`);
   - there is no remapping and no gamepad;
   - scouting, the first required objective of Mission 2, exists only on the right mouse button.
2. **The in-play HUD is four uncoordinated message channels**: radio, centre toasts, banners and world speech bubbles. On top of them sit a 14-line key list, a full objective list and guard tags.
   - They overlap at 1024 px and below.
   - The stealth alerts are close to invisible over Dartmouth's white render and sky: SPOTTED measures **1.1:1**, the green and yellow toasts **1.1–1.2:1**.
   - Text is **10–13 px**.
3. **Onboarding is radio lines that vanish** at **200–350 words a minute** while the player is learning to fly, plus a static key list. Rules the README explains (what `?` means, what makes a guard suspicious, the perches, the distractions) are never taught in the game.
4. **The stealth readout is missing where it matters.** Build-up of suspicion is shown only for *tagged*, *on-screen* guards within 90 m, as a 3 px bar. Nothing points to a guard behind you, sound is not panned, and the "to them you are just a gull" rule is never made visible.
5. **The menus are plain divs:**
   - no dialog semantics;
   - no focus management (focus falls to `<body>` on every screen change);
   - no Esc;
   - "Begin operation" sits below the fold at 1280×720;
   - destructive actions have no confirmation.
6. **The pointer-capture flow leaks:**
   - the simulation runs while the mouse is not captured;
   - Esc on the pause menu resumes play without recapturing the mouse;
   - a refused capture fails silently;
   - the mission clock and Mother start before the player has control.

None of this is hard, but three architectural pieces should exist **before Missions 3–6**: an **input action layer** with content tokens, a **message bus** with fixed HUD slots, and a **HUD/dialog component set** with tokens. Otherwise every new mission adds more hard-coded keys, more overlapping text and more one-off UI. SailSim already solved roughly a third of the list: focus-trapping dialogs, confirmations, an edge pointer with distance, stuck-hints, gamepad mapping, grouped settings, a camera-motion slider, on-device speech, a minimap, and a11y and layout tests. That code is in this repository.

| Area | Now | Exceptional looks like |
| --- | --- | --- |
| Onboarding and learnability | D | Flight school with persistent action cards, contextual hints, a help overlay, a first-run comfort and input setup |
| HUD and feedback | C− | One message bus and fixed slots; all text on plates; detection arcs and a stealth status; compass and distance |
| Input | D | Action layer, remapping, hold or toggle, gamepad, keyboard-only and trackpad profiles |
| Menus and flow | C | Accessible dialogs, sticky actions, "next file", confirmations, a notebook-style pause |
| Accessibility | D+ | Text and HUD scale, subtitle control, assists, comfort sliders, colour-independent coding, menu narration |
| Settings | C− | Seven grouped tabs, values shown, sensible defaults, reset and reload notices |
| Visual design | B− in menus, C in the HUD | One period design system that reaches into the HUD, with legibility rules |

### Keep these

- The dossier tone and the "Remarks of the Committee": the review is the best screen in the game (screenshot 06).
- No death, stall recovery, landing assist (R) and the floating gull: keep them as the baseline, so assists go *further*, never back.
- The drop prediction ring with the redundant **ON TARGET** label (WCAG 1.4.1 done right in spirit).
- `?` and `!` as shapes, the red vignette as a second channel for alert, and the music changing with tension.
- Contextual prompts at the bottom (`[E] Snatch chip`). The pattern is right; the hard-coded key letters are not.
- Two approaches in Mission 1 (autonomy, in Hodent's terms) and forgiving retries (the guard searches, then returns).
- Reduced motion that cuts camera blends and follows `prefers-reduced-motion`; FOV slider; invert Y; separate music and effects volumes.

---

## Findings by area

IDs: **O** onboarding, **I** input, **H** HUD and feedback, **M** menus and flow, **E** errors and robustness, **A** accessibility, **S** settings, **V** visual design, **T** tests.

### 1. Onboarding and learnability

**O-1 · The tutorial is Mother's radio, at 200–350 words a minute, while the player is learning to fly · High · M**
- **Evidence:**
  - `m1.ts:240`: the first instruction after take-off is 37 words in 8 s (278 wpm). It teaches W, mouse steering, Shift, S, R *and* a destination in one line, at the moment the player is airborne for the first time.
  - `m2.ts:266`: 41 words in 7 s (351 wpm).
  - Across all 33 radio lines with explicit durations: median about 227 wpm, range 86–351; 22 of the 33 run at 200 wpm or faster (Appendix A).
  - Lines are queued (`game.ts:577–580, 609–618`), so a backlog delays the next instruction, and there is no way to read a line again.
  - Comfortable reading for subtitles is about 160–180 wpm (BBC guidance) when the reader is doing nothing else.
- **Standard:** GAG Basic "Include tutorials" and "Allow players to progress through text prompts at their own pace"; XAG 116 Time limits; Hodent: teach one thing at a time, in context, with practice. Benchmarks: Pilotwings rings and licence lessons; Microsoft Flight Simulator lessons with checklists.
- **Fix:**
  - Separate *instruction* from *flavour*. Instructions become persistent **action cards**: one action, its key glyph, shown until done, with a nudge after 20 s.
  - Mother's lines become optional flavour beside them.
  - A staged flight school in Mission 1 (Spec 3).

**O-2 · The static key list is the help system · Medium · S–M**
- **Evidence:**
  - `App.tsx:278–305`: 14 lines at 11.5 px, on by default (`settings.ts:30`) and persisted. It covers roughly 200×250 px of the upper left (screenshots 02–04).
  - It lists G "signal" in Mission 1, where G does nothing useful.
  - It omits the arrow keys (the only keyboard steering) and P.
  - It is hidden under 640 px wide, with no replacement.
- **Standard:** GAG Intermediate "Indicate / allow reminder of controls during gameplay"; NH6 recognition rather than recall; NH8 minimalism.
- **Fix:**
  - Contextual prompts and action cards in play.
  - A full **Help overlay** on H or F1, with a diagram for the current input device, an icon legend and the rules of being a gull.
  - The panel defaults off after the flight school.

**O-3 · Rules exist only in the README · High · M**
- **Evidence:** the README explains things the game never says. Nothing in the HUD legends the icons:
  - `?` means suspicious and `!` means spotted;
  - suspicion builds near guarded things, when carrying papers, or right next to a guard;
  - a guard tidies papers back where they belong;
  - set the dispatch down to free the beak;
  - gulls float.
- The Mission 1 tactical perches (Custom House gutter, quay lamp, the *Brixham Lass*'s mast) and both distractions are hinted only *after* you have perched there (`m1.ts:301–302`).
- **Standard:** Hodent signs and feedback, and discoverability. Benchmark: Hitman's Intel and Mission Stories guidance levels, which give opportunities without solving them.
- **Fix:**
  - First-time contextual hints in SailSim's pattern (`src/app/hints.ts`: once per kind, dismissible, a setting).
  - Tagging a guard writes an **Intel** entry in a notebook, for example "Borovsky: post → tea → river wall → fort end. Back turned at the river wall and the fort end. Loves his tea."
  - An "Opportunity hints: Off / Nudge / Show me" setting.

**O-4 · No first-run setup or welcome · Medium · S–M**
- **Evidence:** the first screen is the operations list (screenshot 01). Nothing asks about input device, comfort or text size, and there is no "How to play".
- **Benchmark:** SailSim's first-visit question sets the interface level and steering (`src/ui/Welcome.tsx`). The Last of Us Part II opens with accessibility presets before play.
- **Fix:** a single skippable "Before you fly" card (Spec 3, step 2).

**O-5 · Loading: a blank page, then status text only · Medium · S**
- **Evidence:**
  - `index.html` has an empty `#root`, so nothing is drawn until 1.65 MB of JS (three.js 828 KB, game 638 KB, React 190 KB) has downloaded and run.
  - The Loading card (`App.tsx:52–62`) shows one status string with no bar.
  - "Compiling shaders…" can sit still for a long time on slow machines and looks frozen.
- **Fix:**
  - A static dossier card in `index.html`.
  - A three-phase progress bar: data, rooftops, shaders.
  - "Field manual" cards with the controls diagram and the gull rules. This is free onboarding time.

**O-6 · Assessment criteria are hidden until the review · Medium · S**
- **Evidence:** par time, the stealth bonus (300 / 120 / 0), the clean-escape bonus (200), tagging (50 each) and the grade bands (`mission.ts:1012–1034`) appear first on the results card. The briefing never mentions them.
- **Standard:** Hodent clarity of goals; NH1. Hitman and Mark of the Ninja show challenges up front.
- **Fix:** a "Committee's criteria" block in the briefing and the pause notebook, and on the results "Next time: …" plus the points to the next grade.

**O-7 · Free flight drops a new player mid-air with no guidance · Low · S**
- **Evidence:** `free.ts:17–21`: spawned at 28 m, airborne at 12 m/s, with no prompts.
- **Fix:** start perched. Add a one-line hint ("No guards here. Try R to land on any roof.") and optional practice rings.

### 2. Input and controls

**I-1 · Scouting exists only on the right mouse button, and Mission 2 requires it · Critical · S**
- **Evidence:**
  - `game.ts:364–371`: scout is set only by `mousedown` button 2, and only while the pointer is captured. No key does it.
  - `m2.ts:225`: the first objective of Mission 2 is a *required* "hold right mouse and tag Lt Voronova".
  - `m2.ts:450–456`: the signal objective opens only when she is tagged.
  - `mission.ts:345–352`: the objective marker stays on Voronova until then.
  - G at the roost works anyway (`m2.ts:403–425`), but nothing says so. Screenshot 05 shows scouting still unticked after the strike.
- **Who it locks out:** trackpad players (a held two-finger click while also moving), one-handed players, keyboard-only players, single-button Mac mice and some assistive pointers.
- **Standard:** GAG Basic "Allow controls to be remapped / reconfigured"; XAG 107 Input; APX Remapping.
- **Fix:**
  - Bind scout to a key (X) with hold or toggle.
  - Add tag assist: tag the guard nearest the reticle within 15°.
  - Let the Mission 2 marker fall through to "signal" if the player skips scouting.

**I-2 · No remapping; key letters baked into content · High · M**
- **Evidence:**
  - Bindings are fixed in `game.ts:114–123` and the `switch` at `394–414`.
  - The visible list is a constant (`App.tsx:278–293`).
  - Mission strings embed keys:
    - `mission.ts:963–972` ("[E] Snatch…", "[F] Eat…");
    - `m1.ts:220–223` ("[Space]", "hold R", "[F]", "hold right mouse");
    - `m2.ts:225–227` ("[G]", "release with Q", although left click also drops).
  - `mission.ts:336` strips `[…]` to build toasts.
  - Every new mission multiplies these strings.
- **Standard:** GAG Basic remapping; XAG 107; APX Remapping.
- **Fix:**
  - An action layer (Spec 1).
  - Content written as tokens (`{interact}`) and rendered as key-cap or pad glyphs for the active device.
  - Remap UI with conflict warnings and reset. Persist it.

**I-3 · Many holds and one chord, with no toggles · High · M**
- **Evidence:**
  - W must be held to keep flapping.
  - Hover is the chord Space + S (README).
  - Dive (Shift), landing assist (R) and scout (right mouse) are holds.
  - Tagging needs the view held within about 6° + 40/distance° of a head for 0.45 s (`mission.ts:518–524`).
  - Q or left click is held for repeated drops.
- **Standard:** GAG Intermediate "Avoid / provide alternatives to requiring buttons to be held down"; XAG 107; APX Hold to Toggle.
- **Fix:**
  - A Hold or Toggle choice for scout, landing assist, brake, dive and hover.
  - A **cruise** toggle for forward flapping.
  - A dedicated Hover action instead of the chord.
  - Tag assist.

**I-4 · Pointer capture: the game runs uncaptured, resumes without recapturing, and fails silently · High · M**
- **Evidence:**
  - `game.ts:503`: the mission steps whenever the screen is `playing` and not paused, whatever `locked` says. `uiTimers` (`620–641`) run the radio, banners and toasts while "Click to fly" is on screen.
  - Esc or P on the pause menu calls `setPaused(false)` only (`385–388`). Play resumes with the mouse free, the gull flies on unsteered, and "Click to fly" sits over the view.
  - `resume()` (`445–448`) unpauses *before* capture is granted, and `lockPointer()` swallows refusals (`426–434`). Chrome refuses a new lock for about a second after the player leaves it with Esc, and the spec needs a fresh gesture *(verify the timing)*. A quick "Resume" click can therefore leave play running uncaptured.
  - There is no `pointerlockerror` listener, which is how Safari and older Firefox report failures *(verify)*.
  - Mother's first line and the mission clock start at t = 0 on "Begin" (`m1.ts:230`).
  - Pages embedded in an iframe without `allow-pointer-lock` (for example on itch.io) can never capture.
- **Standard:** NH1 visibility of system status; NH3 user control; XAG 115 Errors and state changes.
- **Fix:** the state machine in Spec 2. Play advances only when captured (or in a keyboard-only or gamepad profile). Resume means capture. Mother waits for control.

**I-5 · No gamepad, though the helpers are vendored · High · M**
- **Evidence:** no Gamepad API use in `src/gull`. `src/app/gamepad.ts` (SailSim) already gives the standard mapping, a 15% dead zone, a 1.6 response curve, edge-detected presses and haptics.
- **Why it matters:** a flight game is natural on a pad. A pad also rescues trackpad laptops, and adaptive controllers such as the Xbox Adaptive Controller present as standard pads.
- **Standard:** GAG Intermediate "Support more than one input device"; XAG 107.
- **Fix:** Spec 1 layout, pad navigation in menus, glyphs that swap with the active device.

**I-6 · Trackpad laptops are effectively unsupported · Medium · S–M**
- **Evidence:**
  - Steering by pointer-locked mouse while holding keys.
  - libinput's "disable while typing" (the default on most Linux laptops) and some Windows touchpad drivers suppress touchpad *movement* while a key is held *(verify per driver)*.
  - Right-button hold means a held two-finger click.
  - The arrow-key look rate is fixed at 1.6 rad/s (`game.ts:553`), and the arrows are absent from the in-game key list.
- **Fix:**
  - "Keyboard only" and "Trackpad" input profiles: arrows or IJKL steer, auto-level when released, an adjustable look rate, no capture needed.
  - Detect the trackpad case on first run by asking, not by sniffing.

**I-7 · Key labels are wrong on AZERTY and QWERTZ · Medium · S**
- **Evidence:** keys are read by `ev.code`, which is physical position (good). The labels are US letters, though (`App.tsx:278–293`, mission strings). On AZERTY the physical W key is Z and the physical Q key is A, so "Q poop" is the A key and "A / D bank" is Q / D.
- **Fix:** label from `navigator.keyboard.getLayoutMap()` (Chromium), with a layout picker as fallback (QWERTY, AZERTY, QWERTZ) in Controls.

**I-8 · Browser hazards: Ctrl+W, Sticky Keys, no fullscreen, no unload guard · Medium · S**
- **Evidence:**
  - W is held constantly. A player who reaches for Ctrl ("down" or "crouch" in many games) closes the tab. A page cannot cancel Ctrl+W except through Keyboard Lock in fullscreen (Chromium).
  - Five quick Shift presses (dive) open Windows' Sticky Keys dialog, which takes focus and ends capture.
  - There is no fullscreen option and no `beforeunload` guard during an operation.
- **Fix:**
  - A "Fly in full screen" button (title, Ready gate, pause), with `navigator.keyboard.lock()` where supported.
  - A `beforeunload` guard while an operation is running.
  - An alternative dive binding, and a note about Sticky Keys in Help.

**I-9 · Thin mouse options · Low · S**
- **Evidence:** only sensitivity (a unitless 0.5–6 slider with no value shown) and invert Y (`settings.ts`).
- **Fix:** separate X and Y sensitivity with values; invert X; raw input (`requestPointerLock({ unadjustedMovement: true })` in Chromium); look speed for keys and stick; smoothing on or off.

**I-10 · Touch devices: a dead end without explanation · Medium · S (notice) / L (touch play)**
- **Evidence:**
  - No touch handling.
  - "Click to fly" asks for pointer capture, which mobile browsers do not offer.
  - Objectives are hidden at 760 px and below (`gull.css:635–639`) and controls at 640 px and below (`259–263`).
  - SailSim has `touchOnly()` (`src/app/prefs.ts`) and a phone layout.
- **Fix:**
  - Now: detect touch-only devices and say plainly "Section G needs a keyboard and mouse, or a game controller", with a gamepad path.
  - Later: a virtual stick and buttons, and tap a roof to glide to it.

### 3. HUD and feedback

**H-1 · Text over the scene is illegible in typical Dartmouth views · High · S–M**
- **Evidence:** computed WCAG ratios over sampled backgrounds (Appendix B).
  - **Toasts** have no plate. Green, yellow and pale-blue tones measure **1.1–1.2:1** on white render and sky; red measures 2.1–2.7:1.
  - **Banners** through their 35% black plate over a bright scene: SPOTTED in red **1.12:1**, LINE OF SIGHT BROKEN in amber 1.67:1.
  - **HUD panels** (55% black): body text 4.1:1 over white render, below 4.5. Done objectives at 55% opacity measure 2.4:1.
  - **Guard tags** (11.5 px) and **ON TARGET** (12 px, red, 2.5:1) have no plate.
  - The only aid is a 2 px text shadow (`gull.css:173–178`).
  - Visible in screenshot 05 (green toasts over white houses) and in the busy-HUD probes.
- **Standard:** WCAG 1.4.3 and 1.4.11; GAG Basic "Provide high contrast between text / UI and background"; XAG 102 Contrast; APX Clear Text.
- **Fix:**
  - Every HUD text sits on a plate of at least 85% opacity, with text at least 4.5:1 (7:1 preferred) against the *plate*, so the scene cannot break it.
  - A "HUD background opacity" setting (60–100%).
  - Rules in Spec 8.

**H-2 · Four message channels overlap each other and the panels · High · M**
- **Evidence:**
  - Radio sits bottom centre, toasts at 26% from the top, banners at 15%, and speech bubbles anchor to the world, up to 15 of them (`game.ts:752–758`). Prompts and guard tags add to that.
  - Each is placed on its own (`gull.css:487–512, 661–684`), with no collision handling.
  - At 1024×640 and 800×600 the banner sits on the objectives panel, toasts sit on speech bubbles and on each other, and the banner wraps (busy-HUD probes).
  - Screenshot 05: four speech bubbles stacked into a blur, toasts over the objective panel, and the radio cut off by the controls bar.
  - Toasts appear in the centre-top of the view, in the flight path.
- **Standard:** GAG Intermediate on keeping essential temporary information in the eye-line *without* obscuring play; NH8; Hodent signal-to-noise. SailSim learned "one message at a time" (COMPREHENSIVE_REVIEW §3).
- **Fix:**
  - A single message bus with priorities and fixed slots (Specs 4 and 7).
  - Toasts become a side feed of at most three.
  - Speech bubbles: at most three, nearest first, with collision offsets.

**H-3 · The stealth readout misses build-up, off-screen guards and the reason · High · M**
- **Evidence:**
  - Overlays are drawn only for guards on screen, in front and within 90 m (`game.ts:747`).
  - Untagged guards show `?` or `!` only, with no build-up.
  - The suspicion meter is a 3 px bar under an 11.5 px name, for *tagged* guards only (`App.tsx:251–253`, `gull.css:575–586`).
  - Nothing at all for a guard behind you. Sound is attenuated by distance but not panned (`audio.ts:111–120`), so you cannot locate it by ear.
  - The SUSPICIOUS banner lasts 1.2 s (`mission.ts:882`).
  - *Why* you are interesting is never shown: carrying papers (×1.4), a restricted area, closer than 4.5 m, fast within 9 m (`mission.ts:846–857`).
- **Standard:** Hodent signs and feedback, the core loop's readability; GAG Basic "Ensure no essential information is conveyed by sounds alone". Benchmarks: Hitman's suspicion arcs round the reticle and its Trespassing and Compromised status; Mark of the Ninja's drawn sight and noise; Assassin's Creed's edge detection markers.
- **Fix (Spec 4):**
  - An attention icon above *every* guard in range that fills as suspicion builds: hollow `?`, filled `?`, then `!`.
  - **Detection arcs** on a ring round the reticle for guards with suspicion above 0, pointing at them even when off screen.
  - A **status chip**: JUST A GULL / CONSPICUOUS: carrying papers / RESTRICTED: Custom House table / TOO CLOSE.
  - Stereo-panned guard barks and a rising "Hmm?" sting.

**H-4 · Bug: a tagged guard's routine is never displayed · Medium · S**
- **Evidence:** `game.ts:750` fills `GuardOverlay.routine`, but `App.tsx:248–255` renders only the name and state. The README promises "name, routine, suspicion and vision cone".
- **Fix:** show the routine on the tag while scouting, and in the notebook's Intel.

**H-5 · Screen-space overlays move at 10 Hz · Medium · S–M**
- **Evidence:** `publishHud` runs every 100 ms (`game.ts:719–722`). It drives the positions of guard tags, speech bubbles, ON TARGET and the off-screen arrow through React state, while the 3D view runs per frame. At 14 m/s the tags lag and jump.
- **Fix:** position per frame through refs and `transform` (or three's `CSS2DRenderer`, or sprites). Keep 10 Hz for text *content*.

**H-6 · The HUD hierarchy is upside down · Medium · M**
- **Evidence:**
  - The largest type is speed and altitude (`App.tsx:200`), plus a numeric heading.
  - Score is always on and reads 0 for most of a run (`liveScore` counts only food and hits, `mission.ts:977`).
  - A frame counter sits in the player HUD (`App.tsx:270–272`; "0 fps" in every screenshot).
  - The **beak slot**, which drives the whole loop, is 12 px at 85% opacity (`gull.css:417–424`).
  - The payload dots show no reload progress, although it is 20 s per drop (`gull.ts:69`).
- **Standard:** Hodent "form follows function" (show what the player decides with); NH8.
- **Fix:** Spec 4. A large beak slot with an icon; payload with a reload fill; the stealth status; a compass with the objective. Altitude shown as an **eyeline band** ("above the sentry's eyeline", which is the game's own rule). Speed small and optional. Score at the end only, or optional. Frame rate as a setting.

**H-7 · The objective tracker is an always-on list of instructions · Medium · M**
- **Evidence:**
  - `App.tsx:213–223`: done items stay, struck through at 55% opacity (`gull.css:461–464`; 2.4:1).
  - Objective text carries controls and directions: "Scout the stand: hold right mouse and tag Lt Voronova at the lectern (a mooring pile behind the stand has a clear view)".
  - The panel disappears at 760 px and below.
  - Optional objectives never get a marker (`mission.ts:347`).
  - The player cannot choose which objective the marker tracks. In Mission 1 it sits on lunch before the dispatch, and the lunch target hops between the chip and the pasty as you fly (`m1.ts:250–266`).
- **Standard:** GAG Intermediate "Indicate / allow reminder of current objectives during gameplay". Benchmark: Untitled Goose Game's on-demand notepad to-do list.
- **Fix:**
  - A one- or two-line **Current order** on the HUD.
  - A **notebook** (Tab) with all orders, intel, the map and the radio log.
  - Completed orders strike through once and then leave.
  - A "track this order" choice.

**H-8 · Navigation: compass words with no compass, local names with no labels, no distance · High · M**
- **Evidence:**
  - The marker is a yellow octahedron with no label or distance, hidden within 6 m (`missionView.ts:396–399, 548–559`).
  - The off-screen arrow (`App.tsx:268`) has no distance.
  - The heading is a bare number (`App.tsx:203`).
  - Mother gives "east of here", "north of you", "south along the river, past the ferry slip" and "across the Boat Float", and names St Saviour's, the Royal Castle Hotel, the Custom House and the Boat Float, which only locals know.
  - Place labels exist in the vendored scene but are switched off (`game.ts:716`, `showLabels: false`).
  - A minimap image ships (`public/geo/minimap.png`, 110 KB), and SailSim's `Minimap.tsx`, `minimapChart.ts`, `Compass.tsx` and `src/app/edgePointer.ts` (an arrow with distance that avoids panels) are vendored and unused.
- **Standard:** Hodent cognitive load (do not make players hold spatial instructions in memory); NH6.
- **Fix:**
  - A compass ribbon (N, E, S, W, the objective pip and its distance).
  - A labelled marker ("Station roof · 85 m").
  - An edge arrow with distance.
  - A 1967 Ordnance Survey-style **map** in the notebook, drawn from the vendored chart, showing orders, perches found and guards tagged.
  - Optional landmark labels in period signage as an assist.

**H-9 · The drop marker vanishes on the town's own colours · Medium · S**
- **Evidence:** a white ring that turns red `0xff5040` on target (`game.ts:696`). White disappears on render and paving; red disappears on Dartmouth's red tiles and on Mission 2's red reviewing stand (screenshots 02 and 04). The ON TARGET label is 12 px with no plate and updates at 10 Hz.
- **Fix:**
  - A dark outline on the ring.
  - A **shape change** on target: crosshair or filled centre.
  - A label on a plate.
  - An optional lock tick sound.
  - A size setting.

**H-10 · Guard states and toast tones rely on hue; cones wash out · Medium · S**
- **Evidence:**
  - Cone colours by state (`missionView.ts:322–331`): white routine, yellow suspicious, **red alert** and **orange search**. Red and orange cannot be told apart with protan or deutan vision.
  - Additive blending (`missionView.ts:317`) makes cones vanish on pale ground.
  - The toast tones food `#ffd75a` and warn `#ffbf40` are nearly identical for everyone (`App.tsx:191`).
- **Standard:** WCAG 1.4.1; GAG Basic "Ensure no essential information is conveyed by a colour alone"; XAG 103.
- **Fix:**
  - A pattern per cone state (solid edge, dashed, hatched, dotted) with normal blending and a dark rim.
  - An icon on every toast tone.
  - Check palettes with a colour-vision simulator. SailSim already letters red and green lights for this reason.

**H-11 · Mission 2's strike window is invisible · Medium · S**
- **Evidence:** `inZone()` is a north band from 288 to 322 (`m2.ts:250–252`), with no ground mark and no HUD cue. Players learn it by failing ("not in front of the stand", `m2.ts:397`).
- **Fix:** a diegetic chalked "SALUTING BASE" line with pennants, a HUD cue "COLUMN AT THE STAND" with a bar, and an assist that widens it.

**H-12 · Audio feedback gaps · Medium · S–M**
- **Evidence:**
  - Radio messages arrive silently (`game.ts:577–580`).
  - Effects are not panned.
  - No stall cue.
  - On pause, the music and the wind loop carry on at flight values (`setPaused` does not touch audio; `renderFrame` keeps `setWind`) *(verify by ear)*.
  - No mute key. SailSim uses U.
- **Fix:**
  - A radio squelch or Morse pip on each message.
  - A `StereoPannerNode` or `PannerNode` on positional effects.
  - Duck music under the radio.
  - Duck and stop loops on pause.
  - U to mute.

**H-13 · Polish: toast slide bug and CSS motion ignore reduced motion · Low · S**
- **Evidence:** the keyframes `gb-in` start from `translate(-50%, 6px)` (`gull.css:622–627`). `.gb-toast` has no transform of its own, so each toast slides sideways by half its width. The radio, toasts and banners animate with no `prefers-reduced-motion` rule.
- **Fix:** separate keyframes, and a reduced-motion media rule.

### 4. Menus and flow

**M-1 · Overlays are not dialogs: focus, Esc and inert background are missing · High · S**
- **Evidence (probe):**
  - After opening Settings and the briefing, `document.activeElement` is `<body>`.
  - Tab starts on the unlabelled canvas (`game.ts:349`, `tabIndex = 0`).
  - Esc on the briefing does nothing, because the keydown handler returns unless the screen is `playing` (`game.ts:384`).
  - On the pause screen, Esc is ignored while a slider has focus (`game.ts:383`); my probe confirmed it stays paused.
  - There is no `role="dialog"`, `aria-modal` or label, and the HUD and canvas stay focusable behind the pause card.
  - axe reports heading-order (h3 after h1) and region (no landmarks).
  - `src/ui/useModal.ts` (vendored, SailSim review UX-2) solves all of this.
- **Standard:** WCAG 2.1.1, 2.4.3, 4.1.2; XAG 112 UI navigation; GAG Basic "Ensure that all areas of the user interface can be accessed using the same input method as the gameplay".
- **Fix:**
  - `useModal` on Title, Briefing, Pause, Results and Settings.
  - Focus moves to the heading or the primary action on open.
  - Esc means Back, or Resume via the Ready gate.
  - The canvas gets `tabIndex = -1` and `aria-hidden`.

**M-2 · Primary actions sit below the fold · Medium · S**
- **Evidence (probe):** at 1280×720 the briefing's "Begin operation" is at y = 744, off screen inside a scrolling card (`gull.css:301–304`). Screenshot 06 cuts off the remarks with no buttons in view.
- **Fix:** a sticky action footer in every card, and a briefing that leads with its summary (Spec 6).

**M-3 · Restart and Abandon act at once · Medium · S**
- **Evidence:** `App.tsx:316–317`, `game.ts:323–332`. One mis-click loses five minutes of play. SailSim fixed the same thing (UX_REVIEW #6; `src/ui/Confirm.tsx`, vendored).
- **Standard:** NH5 error prevention.
- **Fix:** a confirmation with "Keep flying" focused.

**M-4 · Dead ends in the flow · Medium · S**
- **Evidence:** the results' primary button "Continue" goes to the title (`App.tsx:181`). The title's primary is always File 1 (`App.tsx:82`, `i === 0`). A newly opened file is not announced.
- **Fix:**
  - Results primary: "Open File 2" when it is unlocked, else "Try again".
  - Title primary: the next unfinished file.
  - Stamps on the files: NEW, CLASSIFIED (locked), and FILED with the grade.

**M-5 · The pause menu is one long column, with no orders, intel or radio log · Medium · M**
- **Evidence:** `App.tsx:307–330` puts actions, cameras and every setting in one column (the pause probe overflows at 720 px tall). There is nothing to re-read: Mother's lines, the orders or the controls.
- **Fix:** a pause screen styled as the **notebook**, with tabs (Spec 5).

**M-6 · Locked files are disabled buttons · Low · S**
- **Evidence:** a disabled button is skipped by Tab (probe), so keyboard and screen-reader users never hear *why* it is locked. At 50% opacity it measures 3.4:1 (`gull.css:285–288`).
- **Fix:** `aria-disabled` with focus kept, and a "CLASSIFIED — complete File 1" stamp.

**M-7 · Saving is silent and can fail silently · Low · S**
- **Evidence:** progress is saved in `onFinished` (`game.ts:334–339`) without telling the player. `saveProgress` swallows errors (`progress.ts:77–83`), so a private window loses progress unannounced. There is no way to reset the campaign.
- **Fix:** a "FILED" stamp on the results, a notice when storage is unavailable, and "Reset campaign" behind a confirmation.

### 5. Errors, loading and robustness

**E-1 · Unhandled failures freeze the loading card · Medium · S**
- **Evidence:** `attach()` guards only `new GullScene` (`game.ts:211–216`). An exception in `DartScene`, `captureHeights` or `World` becomes an unhandled rejection of `void game.attach(el)` (`App.tsx:19`), and the card stays on "Surveying the rooftops…" forever.
- **Fix:** wrap the whole of `attach()`, add a watchdog for each phase, and show an error screen with Retry.

**E-2 · Error screens: raw text, SailSim's sailing wording, no action, and partial failures pass silently · Medium · S–M**
- **Evidence:**
  - "WebGL could not start: \<exception message\>" (`game.ts:214`).
  - Data errors print SailSim's own effect strings, for example "River Dart unavailable: sailing on open water." and "No buildings, piers, moorings…" (`geoLoader.ts:144, 177`; `game.ts:228–231`).
  - There is no Retry or Reload button.
  - A partial failure (for example `features.json`) is only recorded, and the game starts with no buildings or roofs, so the missions break and nobody is told.
- **Standard:** NH9; XAG 115.
- **Fix:**
  - Plain-language causes and remedies: turn on hardware acceleration, update the browser, try Chrome, Edge or Firefox.
  - Retry and "Copy details" buttons.
  - Block the operations when essential data is missing.

**E-3 · A lost graphics context is silent while the game keeps running · Medium · S–M**
- **Evidence:** `gullScene.ts:182–189` sets a flag and stops drawing, but the loop keeps stepping (`game.ts:503`). The player flies blind and the guards keep looking.
- **Fix:** on `webglcontextlost`, pause and show "The graphics card was reset" with Resume, or Reload if the picture does not return. *(Verify what DartScene rebuilds on restore.)*

**E-4 · No pause on blur or a hidden tab while uncaptured · Low · S**
- **Evidence:** pausing depends only on `pointerlockchange` (`game.ts:354–358`).
- **Fix:** pause on `blur` and on `visibilitychange` while playing.

### 6. Accessibility (beyond the above)

**A-1 · Text is small and cannot be scaled · High · M**
- **Evidence:** computed sizes at 1366×768:

  | Element | Size |
  | --- | --- |
  | Key list | 11.5 px |
  | Guard tags | 11.5 px |
  | TAGGING label | 10.4 px |
  | Beak | 12 px |
  | Objective title | 12 px |
  | HUD small text | 12.8 px |
  | Speech bubbles | 12.8 px |
  | Objectives | 13.6 px |
  | Radio | 15.2 px |
  | Menu `.gb-small` (Courier New, thin on Windows) | 12.8 px |

  There is no text-size or HUD-scale setting.
- **Standard:** GAG Basic "Use an easily readable default font size" and Intermediate "Allow the font size to be adjusted"; XAG 101 Text display; WCAG 1.4.4. Microsoft's 1080p guidance for TV distance is around 26 px. Desk distance justifies a lower floor, but 10–13 px is below any game guidance.
- **Fix:**
  - Minimums at 100%: 16 px for HUD text, 14 px for labels, 18 px for radio.
  - Text size 100–200% and HUD scale 75–150%, separately.

**A-2 · Radio and subtitles cannot be controlled · High · M**
- **Evidence:**
  - Fixed durations at 200–350 wpm (O-1).
  - A first-in, first-out queue with no priority, so stale lines delay urgent ones (`game.ts:609–618`).
  - No history, size or background options. Mother is text only, with no voice.
  - Guard speech bubbles last 3–3.5 s at 12.8 px and overlap.
- **Standard:** GAG Basic "If any subtitles / captions are used, present them in a clear, easy to read way" and "Allow players to progress through text prompts at their own pace"; XAG 104 Subtitles and captions (size, background, speaker, at most two lines); XAG 116.
- **Fix (Spec 7):**
  - Duration based on reading time, with a reading-speed setting or "until dismissed".
  - A priority queue that drops stale lines.
  - A radio log, plus a key to repeat the last line.
  - Size and background options.
  - Optional "Read Mother aloud" through the vendored `src/render/speech.ts`, which uses on-device voices only.

**A-3 · No captions for sounds, and some information is sound only · Medium · S–M**
- **Evidence:** off-screen guard barks, the cook's and clerk's reactions, tea and splats are sound only. Radio arrival is silent. Nothing gives direction.
- **Standard:** GAG Intermediate "Provide visual cues for important sounds"; XAG 103 and 104. SailSim's `signalCaption.ts` pattern gives a caption for every sound.
- **Fix:** a "Sound captions" option on the message bus, for example "[Whistle, behind left]", with a direction arrow.

**A-4 · No difficulty or assist options · High · M**
- **Evidence:** none in `settings.ts`. The timing- and precision-sensitive tasks:
  - tagging: 0.45 s within about 6° (`mission.ts:518–523`);
  - Mission 2's strike: four hits within 4 s inside the zone (`m2.ts:286–294`);
  - the sentry's routine windows of 8–9 s (`m1.ts:190–193`);
  - a 20 s payload reload;
  - par time is scored.
- **Standard:** GAG Basic "Provide a choice of difficulty level" and Intermediate "Include an option to adjust the game speed"; XAG 106 Game difficulty options. Benchmarks: Celeste's Assist Mode; The Last of Us Part II.
- **Fix:**
  - An assist panel (Spec 5 §5).
  - Assists never lower the grade. If the review mentions them, it does so neutrally ("Assisted operations are graded as flown").

**A-5 · Motion comfort is one bundled switch, and first person rolls fully by default · Medium · S**
- **Evidence:**
  - Reduced motion removes roll, bob and shake and cuts blends (`gullScene.ts:332–333, 404–408`), which is good.
  - By default the first-person camera rolls up to ±0.38 rad (about 22°) with the turn rate (`gullScene.ts:448`); the chase camera rolls about ±11° (`434`).
  - Speed widens the FOV by up to 11° (`408`).
  - Scouting snaps the FOV to 30° (`437, 451`).
  - The wheel zoom is not saved (`339–341`).
  - The OS setting is read once at start (`114–118`). It is not shown on the checkbox and cannot be overridden.
  - SailSim already has a **Camera motion** slider (`cameraMotion` 0–1 in the vendored `graphics.ts`) and follows OS changes.
- **Standard:** GAG Intermediate on simulation-sickness triggers and adjustable FOV (done); XAG 117 Visual distractions and motion settings; APX Camera Comfort.
- **Fix:** separate sliders for roll, the speed FOV effect, shake, head bob and scout zoom; saved chase distance; listen for OS changes and allow an override.

**A-6 · Photosensitivity: low risk now, with no policy for later missions · Low · S**
- **Evidence:** no strobing. The pulsing marker and rings run below 1 Hz (`missionView.ts:552, 563`), and the red vignette is static. Missions 3–6 (a submarine, a ferry) invite explosions and flashes.
- **Standard:** WCAG 2.3.1; XAG 118 Photosensitivity.
- **Fix:**
  - A rule: at most 3 flashes a second, and no saturated-red flash over a quarter of the screen.
  - A "Reduce flashing" switch, wired from the start.
  - Run a Harding-style check on future effects.

**A-7 · Jokes, instructions and local knowledge are mixed in single lines · Medium · S**
- **Evidence:** instructions arrive inside comic lines that vanish ("Section G regulations: no operative works on an empty stomach. The clerk on the Embankment bench has chips. The bakery in the cove has a pasty…", 8 s). The briefing body runs to about 170 words of Courier.
- **Standard:** GAG Basic "Use simple clear language"; Hodent cognitive load.
- **Fix:** every instruction also exists in plain words in the current order or the notebook. Keep the jokes, but never as the only copy of what to do. The briefing leads with a two-line summary.

**A-8 · Menu semantics for screen readers and magnifiers · Medium · S**
- **Evidence:**
  - No live regions for loading, the radio, objectives or errors.
  - The volume sliders announce "0.8" (no `aria-valuetext`).
  - A file button's name runs together as "…one lunch.Best: A (1234)".
  - The canvas can be focused but has no name.
  - No landmarks.
  - The 3D game cannot be played blind, but its menus, briefing, settings and review must work with a screen reader. Low-vision players use one in menus; The Last of Us Part II narrates its menus.
- **Standard:** WCAG 1.3.1, 4.1.2, 4.1.3; GAG Advanced "Ensure screenreader support, including menus and installers".
- **Fix:**
  - `role="status"` for loading progress and `role="alert"` for errors.
  - Opt-in `aria-live` announcement of radio lines.
  - `aria-valuetext` with percentages.
  - A `<main>` landmark and correct heading order.
  - Optional menu narration through `speech.ts`.

**A-9 · Target sizes and native controls · Low · S**
- **Evidence:** native checkboxes are about 13 px (the label row is clickable, which is fine). Range thumbs are about 16 px, below WCAG 2.5.8's 24 px. Native blue sliders and checkboxes clash with the dossier (pause probe).
- **Fix:** styled controls with targets of at least 24 px (44 px for touch), as SailSim's tokens do.

### 7. Settings completeness

**S-1 · Settings cover about a third of what an inclusive game needs · High · M**
- **Evidence:** 11 items in one list (`App.tsx:332–381`): graphics preset, sensitivity, FOV, three volumes, invert Y, reduced motion, drop marker, controls panel, unlock all. Missing:
  - controls: remapping, hold or toggle, gamepad, input profile;
  - camera comfort sliders;
  - text and HUD scale, plate opacity;
  - subtitles: speed, size, log, voice;
  - colour vision;
  - assists;
  - mute, mono, ambience volume;
  - fullscreen;
  - frame-rate display, cap and battery saver;
  - resolution and automatic quality (`DynamicResolution` runs but has no UI);
  - reset to defaults.
- **Also:**
  - Graphics changes to scenery and shadows "apply on reload" according to a code comment (`game.ts:467`), but the UI neither says so nor offers Reload (SailSim does).
  - Sliders show no values, except FOV.
- **Fix:** Spec 5.

**S-2 · Persistence and defaults · Medium · S**
- **Evidence:**
  - Settings are validated and saved (`settings.ts:36–49`), which is good.
  - Graphics live under SailSim's storage key, separately.
  - The chase zoom is not saved.
  - The key list defaults on and persists.
  - No schema version, no "Reset this tab", no export.
- **Fix:** settings v2 with a version, defaults merged per tab, a reset per tab, and the comfort and input choices from the first-run card.

### 8. Visual design

**V-1 · Two visual languages · Medium · M–L**
- **Evidence:**
  - Menus: buff paper, Courier, a rotated red stamp. Coherent and charming (screenshots 01 and 06).
  - HUD: system sans in translucent rounded dark boxes, the generic modern web overlay (screenshots 02–05).
  - Native blue browser sliders and checkboxes sit inside the dossier (pause probe).
- **Fix:** one design system (Spec 8). HUD plates read as period objects (paper slips, signal plates, a compass ribbon) and keep the legibility rules.

**V-2 · Typography · Medium · M**
- **Evidence:**
  - Courier New is thin and light on Windows, and is used for 14.7 px body text in the briefing (`gull.css:306–310`).
  - There are twelve ad-hoc sizes, from 0.65 to 2.2 rem, with no scale.
  - The HUD uses the system sans.
- **Fix:**
  - A sturdier typewriter face for headings, stamps and short text, for example Courier Prime (OFL), or system Courier at bold.
  - A **Plain text** option for long reading: a sans face, 1.5 line height, no italics. This also helps dyslexic players.
  - HUD lettering in a period British signage style: Kinneir and Calvert's Transport, on the roads from 1965, or Rail Alphabet (1965). Both are period-true and built for legibility at speed. An open lookalike, or the system sans at semibold if no third-party fonts is a firm rule.
  - A type scale (Spec 8).

**V-3 · The spy parody stops at the menus · Medium · M–L**
- **Briefing:** a manila folder with tabs (Situation, Target, Map, Orders).
  - The Target tab has a grainy black-and-white **surveillance photograph** rendered from the scene.
  - The Map tab has a 1967 OS map with *Dad's Army*-style arrows.
  - An "ACCEPT ORDERS" stamp starts the operation.
- **Radio:** paper tape from a field set, with a squelch.
- **Alerts:** SPOTTED as a rubber stamp slammed onto a paper slip, with a thud.
- **Review:** the grade stamped with a sound, and a ribbon for the Distinguished Gull Cross.
- **Title and loading:** locked files stamped CLASSIFIED; a teleprinter loading screen.
- **Optional:** typewriter clacks on menu focus, off with reduced motion or effects at zero.
- **Rule:** theme never lowers contrast or size. The plates in Spec 8 make that possible.

**V-4 · Consistency and dead code · Low · S**
- **Evidence:**
  - Two button styles. `.gb-dossier button` has no hover or focus style of its own (`gull.css:312–324`).
  - `.gb-prompt` and `.gb-message` are unused (`153–171, 245–257`).
  - `.gb-controls` is defined twice (`200–213` and `650–659`).
  - Colours are hard-coded in TSX (`App.tsx:191`) and in `missionView.ts`.
  - The ✔ and ✘ glyphs depend on the font.
- **Fix:** tokens and components; remove the dead CSS.

### 9. Tests

**T-1 · Nothing tests the UI or input · Medium · M**
- **Evidence:**
  - `tests/e2e/missions.e2e.cjs` drives `mission.step()` directly: no real keys, no pointer capture, no UI.
  - `@axe-core/playwright` and `axe-core` are installed (`package.json`) but unused.
  - No layout, overlap, focus, contrast or reduced-motion tests.
  - SailSim has `a11y.spec.ts`: dialog focus trap, targets of at least 24 px, text of at least 12 px, a level horizon under reduced motion. It also has `layout.spec.ts` (no overlaps) and `phone.spec.ts`.
- **Fix:** Spec 9.

---

## Prioritised top 15

| # | Change | Findings | Severity | Effort | Why now |
| --- | --- | --- | --- | --- | --- |
| 1 | **Input action layer:** actions, bindings, remapping, hold or toggle, content tokens; scout on a key | I-1, I-2, I-3, I-7 | Critical / High | M | Every new mission adds hard-coded keys; fixing it later means rewriting all mission text |
| 2 | **Pointer-capture state machine:** Ready gate, play only when in control, resume means capture, error handling, fullscreen, unload guard | I-4, I-8, E-4 | High | M | Every session passes through it; today it leaks control |
| 3 | **Message bus** with priorities and fixed slots; reading-time durations; radio log and repeat key; speech-bubble declutter | H-2, A-2, A-7, O-1 | High | M | Missions 3–6 will add dialogue; the overlap is already visible |
| 4 | **HUD legibility:** opaque plates, 16 px minimums, text and HUD scale, per-frame anchoring | H-1, A-1, H-5 | High | M | Core alerts at 1.1:1 contrast; cheap once plates and tokens exist |
| 5 | **Stealth readout:** attention icons for all guards, detection arcs round the reticle, status chip, panned barks; show routines | H-3, H-4, H-12 | High | M | It is the game's core loop and currently unreadable |
| 6 | **Onboarding:** flight school with action cards, contextual hints, a Help overlay; key list off by default | O-1, O-2, O-3 | High | M–L | The first five minutes decide whether people stay |
| 7 | **Navigation:** compass ribbon, labelled marker and edge arrow with distance, notebook map, optional landmark labels | H-8, H-7 | High | M | Mother's directions assume a compass and local knowledge |
| 8 | **Dialogs and flow:** useModal everywhere, sticky actions, confirmations, "next file", a summary-first briefing, a first-run setup card | M-1 to M-4, O-4, O-6 | High / Medium | S–M | Largely reuse of vendored SailSim code |
| 9 | **Settings v2** in seven tabs, with values, reset and a reload notice | S-1, S-2 | High | M | The home for everything above |
| 10 | **Assists:** game speed, guard perception, tag and strike assists, cruise, auto-land, grab radius, aim assist; neutral grading | A-4, H-11 | High | M | Opens both missions to many more players; cheap with a tunables object |
| 11 | **Gamepad:** standard mapping, pad navigation in menus, glyphs | I-5, I-6 | High | M | Rescues trackpad and adaptive-controller players |
| 12 | **Motion comfort sliders:** roll, FOV kick, shake, bob, scout zoom; follow OS changes | A-5 | Medium | S | Half a day; first person is a sickness trigger by default |
| 13 | **Robustness:** a static HTML loader, a progress bar, a guarded `attach()`, readable errors with Retry, context-loss pause, a partial-data block | O-5, E-1 to E-3 | Medium | S–M | Silent failure is the worst first impression |
| 14 | **Colour-independent coding:** cone patterns, toast icons, drop-ring outline and shape | H-9, H-10 | Medium | S | Low cost; a Basic-tier GAG requirement |
| 15 | **Design system and tests:** tokens, period HUD components, Plain-text option; axe, layout, contrast and input tests | V-1, V-2, V-4, T-1, A-8, A-9 | Medium | M–L | Locks the gains in before more content arrives |

**Quick wins, under a day each, that can ship before the bigger pieces:**
- render guard routines (H-4);
- fix the toast slide (H-13);
- hide the frame counter (H-6);
- add an X key for scouting (I-1);
- `useModal` on the four overlays (M-1);
- sticky footers (M-2);
- confirm Restart and Abandon (M-3);
- "next file" buttons (M-4);
- guard `attach()` and add Retry (E-1, E-2);
- pause on context loss (E-3);
- a `beforeunload` guard (I-8);
- `aria-valuetext` and live regions (A-8);
- an OS reduced-motion listener (A-5);
- reading-time radio durations (A-2);
- plates behind toasts and banners (H-1);
- a static loader in `index.html` (O-5).

---

## Specifications

### Spec 1. Input architecture and default bindings

**Action layer.** A single `Action` enum. `bindings.ts` maps each action to up to two keyboard or mouse inputs and one pad input.
- Kinds: `hold`, `toggle`, `press`, `axis`.
- Per-action mode where it makes sense: scout, land, brake, dive and hover can be Hold or Toggle.
- `game.ts` keeps the physical `ev.code` and resolves it through the bindings.
- Mission text uses `{action}` tokens, for example `'Take off from the nest {flapUp}'`. The HUD renders them as key caps (KB+M) or pad glyphs, whichever device was used last.
- Toasts drop the tokens.

| Action | Kind | KB+M default | KB alternative | Gamepad (standard mapping) |
| --- | --- | --- | --- | --- |
| Steer (yaw and pitch) | axis | Mouse (captured) | Arrows, or IJKL in the keyboard-only profile | Left stick |
| Look around (camera only, re-centres) | axis | — | — | Right stick; R3 re-centres |
| Flap for speed | hold, or **cruise** toggle | W | — | RT (analogue: flap rate) |
| Flap for height / take off | hold | Space | — | A |
| Brake | hold or toggle | S | — | LT |
| **Hover** (replaces Space + S) | hold or toggle | Z | — | L3 (click the left stick), or LT + A |
| Dive | hold or toggle | Shift | V | B |
| Bank left / right | hold | A / D | — | LB / RB when the pad is in "bank" mode; otherwise the stick |
| Landing assist | hold or toggle | R | — | D-pad down |
| Snatch / set down / deliver | press | E | — | X |
| Eat | press | F | — | Y |
| Poop | press (hold repeats) | Q, left click | — | RB |
| **Scout** | hold or toggle | **right mouse, X** | — | LB |
| Signal the flock | press | G | — | D-pad up |
| Camera | press | C | — | D-pad right |
| Repeat the last radio line | press | T | — | D-pad left |
| Notebook (orders, intel, map, log) | press | Tab | — | View |
| Help overlay | press | H, F1 | — | Hold View |
| Pause | press | Esc, P | — | Menu |
| Mute | press | U (as SailSim) | — | — |

**Input profiles**, chosen on first run and changeable in Controls:
- **Mouse and keyboard:** pointer capture.
- **Keyboard only:** arrows or IJKL steer, auto-level when released, no capture, adjustable look rate.
- **Trackpad:** the keyboard-only steering plus scouting on X, with the right-button hints hidden.
- **Controller:** no capture; pad navigation in menus; glyphs.

**Remap UI** (Controls tab):
- Grouped Flight, Actions, Camera, Interface.
- Each row shows the action name, binding 1, binding 2, the pad binding and Hold/Toggle where it applies.
- "Press a key… (Esc cancels)".
- Conflicts are flagged with a swap offer.
- Reset per group.
- Esc, the Menu button and the pause action cannot be unbound.

Labels come from `navigator.keyboard.getLayoutMap()` where available, else the chosen layout.

### Spec 2. Pointer capture and session start

```
Briefing ──Begin──▶ READY GATE ──click / Space / pad A──▶ CAPTURING ──lock granted (or profile needs none)──▶ FLYING
                         ▲                                    │ refused / pointerlockerror                     │
                         │                                    ▼                                                │ lock lost / Esc / P / blur / context lost
                         └──────────── "Click again to fly" ◀─┘                                                ▼
                                                                                                             PAUSED ──Resume──▶ CAPTURING
```

- **The clock runs only in FLYING:** mission time, the radio, the banner and toast timers, and guard updates. At READY GATE, the scene renders with the gull on its start perch and ambient life running (or frozen, by option), and the mission is not started.
- **The Ready gate card** shows:
  - the operation title and the current order in one line;
  - "Click to fly. The mouse steers; Esc pauses" (text depends on the profile);
  - "Fly in full screen";
  - "Using a trackpad or keyboard only? Choose Keyboard only";
  - "H: help".
  - It also takes Space and pad A.
- **Mother's opening line** starts on the first FLYING frame.
- **Resume:** request capture, stay paused until `pointerlockchange` confirms, then optionally count down 3–2–1 (an accessibility option, off by default). On refusal, the button changes to "Click again to fly" (covers Chrome's re-lock cool-down) and explains if refusals repeat (for example in an iframe).
- **Esc or P inside the pause menu** returns to READY GATE, never to FLYING uncaptured.
- **Esc guard:** ignore an Escape keydown that arrives within 300 ms of the capture ending, so a browser that delivers both does not pause and then unpause.
- **Other triggers:** `visibilitychange`, `blur` and `webglcontextlost` lead to PAUSED.
- **`beforeunload`** asks before leaving while an operation is running.
- **Fullscreen:** `requestFullscreen()`, then `navigator.keyboard.lock(['KeyW','KeyA','KeyS','KeyD','Escape'])` where supported. Leaving fullscreen pauses.

### Spec 3. First run and onboarding sequence

0. **Instant:** a static dossier card in `index.html`, styled inline: "Gull Britannia · Loading the River Dart". It is replaced when React mounts.
1. **Loading:** a three-phase bar (Data 0–40%, Surveying rooftops 40–85%, Shaders 85–100%) with "First load can take up to a minute".
   - **Field Manual** cards rotate every 8 s, with buttons for the next and previous card.
   - In reduced motion, cards change only on a click.
   - Card titles: "To them you are just a gull", "One beak", "? and !", "R lands for you", "Lunch is not optional".
2. **First visit (one screen, every row optional, "Skip, use defaults"):**
   - Input: Mouse and keyboard / Keyboard only / Trackpad / Controller (shows a pad diagram when one is detected).
   - Comfort: Standard / Gentle (no first-person roll, no FOV kick, half chase roll) / Still (reduced motion).
   - Text: 100 / 125 / 150%.
   - Radio: Normal / Slower / Until I dismiss it.
   - "All accessibility settings…".
   - Inspired by The Last of Us Part II's presets and SailSim's welcome; the choices are saved to settings.
3. **Title:** the primary file is the next unfinished one. File 1 reads "Includes flying lessons, about 3 minutes". Help & controls is on the title.
4. **Briefing:** summary first (Spec 6), then the criteria. Begin is always visible.
5. **Flight school (Mission 1, before the station roof).** Each card persists until its check passes. Mother runs flavour beside it. A nudge comes after 20 s. "I've flown before" skips to card 5.
   1. "Take off: {flapUp}." Check: airborne for 0.3 s.
   2. "Steer with the mouse: look where you want to go. Fly through the three rings over the Boat Float." Rings are lifebuoys on a line, in the theme. Check: three rings passed.
   3. "Flap for speed: {flapFwd}. Let go to glide." Check: speed over 12 m/s, then glide for 2 s.
   4. "Slow down: {brake}. Hover: {hover}." Check: speed under 6 m/s in the air.
   5. "Land on the station roof: aim at it and hold {land}." The marker is labelled with its distance. Check: perched.
   6. On landing: "Scout: hold {scout} on the sentry to learn his routine (optional)." Check: tagged. The card can be dismissed.
6. **Contextual hints**, once per kind, dismissible, in SailSim's `hints.ts` pattern:
   - stalling;
   - the first tumble;
   - the first `?` above a guard, explaining what made him curious;
   - the first `!`, with how to break line of sight;
   - carrying papers within 15 m of a guard;
   - beak full next to food;
   - payload empty;
   - outside the area;
   - 45 s without progress, which offers **Show the way**: the marker pulses and the compass pings.
   - Settings has "Hints: Off / Nudge / Show me".
7. **Help overlay** (H or F1, pauses): the device diagram, the icon and colour legend (`?`, `!`, `…`, the cone patterns, the ring), the rules of being a gull, and links to Settings.
8. **Mission 2** introduces each new mechanic with an action card: signal at the roost {signal}; "fly along the column, drop {poop} when the column is at the stand" with the strike-window cue.

### Spec 4. HUD layout (reference 1280×720; 24 px safe margin; scales with HUD size)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [BEAK: ▢ dispatch]   ◄ W ··· N ··· E ·[◆ Station 85 m]· S ··· W ►   CURRENT ORDER │
│ ●●○ reload ▮▮▯       └──────────── compass ribbon (40% width) ───┘   Land on the  │
│ JUST A GULL          [ SPOTTED ]  ← alert stamp slot (one at a time) station roof│
│                                                                    Tab: notebook │
│                          ╭──── detection ring (r≈120 px) ────╮         ┌ feed ┐  │
│                          │   ◜ arc → guard behind-left     │         │ ✓ Done │  │
│                          │          + reticle / drop ring   │         │ +40 🍟 │  │
│                          ╰──────────────────────────────────╯         └───────┘  │
│ ALT 18 m ▓▓▓|eyeline                                                             │
│ 42 km/h GLIDING          [E] Snatch the chip   ← prompt / action card            │
│                     ┃ MOTHER: Bayard's Cove is south, past the ferry slip. ┃     │
│                     ┃ (two lines max · T repeats)                          ┃     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- **Slots:** top left gull status; top centre compass and alert stamp; top right current order; right edge event feed (at most three); bottom centre radio, with the prompt or action card above it; bottom left flight readout; centre reticle, drop ring and detection ring. Nothing else goes in the central 40% × 40% except world-anchored tags.
- **Gull status:**
  - the beak slot (40 px icon and name; "BEAK FULL" highlighted next to food);
  - payload pellets with a reload fill;
  - the **status chip**, highest rule wins: SEEN / CONSPICUOUS: carrying papers / RESTRICTED: \<zone\> / TOO CLOSE / JUST A GULL. Each has an icon and text.
- **Detection ring:**
  - one arc for each guard with suspicion above 0, centred on his bearing relative to the view;
  - the arc's length grows with suspicion;
  - an icon at its tip: hollow `?`, filled `?`, then `!`;
  - the arc blinks once (not continuously) when it turns into `!`;
  - a matching panned "Hmm?" sting rises in pitch with suspicion.
- **World tags:**
  - an attention icon above every guard within perception range, tagged or not;
  - the name and routine appear only when tagged *and* within 40 m, or while scouting;
  - speech bubbles: at most three, nearest first, offset to avoid each other, 14 px minimum;
  - all positioned per frame.
- **Compass ribbon:** cardinal letters, a heading tick, the objective pip with distance, and pips for tagged guards. The edge arrow (vendored `edgePointer.ts`) shows the distance and avoids panels.
- **Flight readout:** altitude with an **eyeline band** (the sentry's look-up limit drawn as a line, so "above it" is visible), speed, and the mode word. STALLING is shown in a different style, with a soft cue.
- **HUD presets:** Full / Standard (default) / Minimal (status, order, radio, prompts) / Off, plus individual toggles.
- **Every text sits on a plate** (Spec 8). No colour-only state. Two lines at most per slot.

### Spec 5. Pause (notebook) and settings structure

**Pause, styled as the notebook.** A left column holds Resume (primary), Restart (confirm) and Abandon (confirm). The tabs are:
- **Orders:** current orders, completed orders, the Committee's criteria and the points to the next grade.
- **Field notes:** intel on tagged guards (routine, habits, what distracts them) and the full radio log with mission times.
- **Map:** the 1967 chart, with the objective, perches found, tagged guards, the gull, and "track" buttons.
- **Controls:** the diagram for the current device, and remap.
- **Settings:** the same tabs as on the title.

**Settings tabs.** Each control shows its value. Each tab has "Reset this tab". Changes apply live. Settings that need a reload show a notice with a "Reload now" button.

1. **Controls:**
   - Input profile.
   - Remap (KB+M and pad).
   - Hold or Toggle: scout, land, brake, dive, hover.
   - Cruise flapping.
   - Mouse sensitivity X and Y (with a number); invert X and invert Y; raw mouse (Chromium).
   - Keyboard and stick look speed; stick dead zone 5–30% (default 15) and response curve.
   - Vibration (never the only channel; off with reduced motion, as in SailSim).
   - Keyboard layout labels.
2. **Camera and comfort:**
   - FOV 55–110 (default 75; the current maximum is 95).
   - Chase camera roll 0–100% (default 50). First-person roll 0–100% (default 0).
   - Speed FOV effect 0–100% (default 50). Camera shake 0–100% (default 100). Head bob on or off.
   - Scout zoom 30–60°.
   - Chase distance (saved). Camera transitions: blend or cut. Scenic drift on or off.
   - Reduced motion follows the system ("Your system asks for reduced motion: on"), with an override.
3. **Display and text:**
   - Text size 100–200%; HUD size 75–150%; plate opacity 60–100% (default 90).
   - HUD preset and element toggles: compass, flight readout, score, guard names, speech bubbles, key hints, frame rate.
   - Colour vision: Standard / Protan-Deutan / Tritan palettes. Patterns are always on.
   - High-contrast HUD.
   - Dossier typeface: Typewriter / Plain.
   - Reduce flashing.
   - Fullscreen.
4. **Audio and subtitles:**
   - Master, Music, Effects, Ambience (water and wind), Radio pips. Mute (U). Mono.
   - Radio speed 0.75–2× or "Until dismissed".
   - Subtitle size and background.
   - Sound captions with direction.
   - Read Mother aloud (on-device voice only, with the voice named; SailSim's `speech.ts`).
   - Duck music under the radio.
   - Menu typewriter sounds.
5. **Gameplay and assists.** Presets Off / Light / Full / Custom:
   - game speed 50–100%;
   - guard perception 50–150%;
   - suspicion fades faster;
   - distraction duration ×1–×2;
   - tag assist;
   - strike assist (three hits, wider zone);
   - auto-glide to a highlighted perch;
   - grab radius ×1–×2;
   - drop aim assist (the ring snaps to the nearest target within 2 m);
   - caps never knock items loose;
   - hints: Off / Nudge / Show me;
   - landmark labels;
   - objective marker: on / off / distance only;
   - time bonus counted on or off;
   - unlock all files.
6. **Graphics and performance:**
   - Preset (Smooth / Balanced / Ultra), with SailSim's one-line notes.
   - Automatic quality.
   - Resolution scale 50–100%.
   - Frame cap: 30 / 60 / unlimited.
   - Battery saver (on by default on touch-only devices).
   - "Check this device" (port SailSim's `deviceCheck`).
7. **Data:** reset settings; reset campaign (confirm); copy and paste settings for shared computers.

Defaults are those of the first-run choices. Store everything under one versioned key, `gull-britannia.settings.v2`.

### Spec 6. Menus, dialogs and flow

| Screen | Focus on open | Esc | Pad B | Primary (sticky footer) | Secondary |
| --- | --- | --- | --- | --- | --- |
| Title | Next unfinished file | Closes the open sub-panel | Same | Continue: File n | Free flight, Help & controls, Settings |
| Briefing | Heading (screen readers read from the top); Enter begins | Back to title | Same | Begin operation (Enter) | Back |
| Ready gate | "Click to fly" | Back to briefing (confirm only if the mission had started) | Same | Fly | Full screen, Keyboard only |
| Pause | Resume | To the Ready gate | Same | Resume | Restart (confirm), Abandon (confirm) |
| Results | Primary | — (does not skip) | — | Open File n+1, else Try again | Try again, Back to files |
| Confirm | The safe choice ("Keep flying") | Cancel | Cancel | — | — |
| Error | Retry | — | — | Retry or Reload | Copy details |

- Every overlay uses `useModal`: `inert` background, focus moved in, Tab wrapped, Esc handled, focus restored.
- Overlays have `role="dialog"`, `aria-modal` and `aria-labelledby`, and the canvas is `tabIndex = -1` with `aria-hidden`.
- Dossier buttons are at least 44 px tall with one shared style, a visible focus ring (2 px ink plus a 2 px paper offset) and a hover state.
- Pad navigation: the D-pad and stick move focus, A activates, B goes back, and LB and RB switch tabs.
- **Briefing order:**
  1. File stamp, dateline, title.
  2. **Summary** (at most 2 lines, plain words): "Steal the dispatch from the Custom House table and drop it in the lobster pot on the *Dorothy May*. Have lunch."
  3. Map thumbnail with the route.
  4. **New in this file**, with glyphs (Mission 2: signal {signal}, lead the flock).
  5. **Committee's criteria.**
  6. Orders.
  7. "Read the full file" (expands to the current prose).
  8. Sticky Begin.
- **Results order:**
  1. The grade stamp ("Filed" once saved).
  2. Total and time.
  3. **Next time:** the one most valuable missed criterion.
  4. Points to the next grade.
  5. Line items.
  6. Remarks.
  7. Debrief.
  8. Sticky actions.

### Spec 7. Message bus and timing

| Priority | Kind | Slot | Lifetime | Sound | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | State alert (SPOTTED, LINE OF SIGHT BROKEN, THEFT DISCOVERED) | Alert stamp | Until the state changes; at least 2.5 s | Sting | Replaces a lower alert; never queues behind radio |
| 2 | Instruction (action card, prompt) | Prompt | Until satisfied | Soft tick on appear | Plain words plus a glyph; also mirrored into the current order |
| 3 | Radio (Mother) | Radio | Reading time (below) | Squelch or pip | Queue of 2 at most. A line whose `validWhile()` is false is dropped. "Urgent" lines (dropped the papers, spotted) pre-empt flavour lines |
| 4 | Event (done, snatched, food, tagged) | Feed | 4 s × reading factor | Per-event cue | 3 at most; duplicates merge ("+40 FOOD ×2") |
| 5 | World speech | Bubbles | Reading time, at least 3 s | Panned bark | 3 at most, nearest first |

- **Reading time:** `t = clamp(1.5 s + words / (wpm / 60), 3 s, 14 s) × factor`, with default wpm 150 and factor 0.75–2 from settings. "Until dismissed" holds a line until T is pressed, or until it is replaced by a higher priority; play continues. An option pauses play for urgent radio.
- **Log:** priorities 1–4 go into a log with mission time, shown in Field notes. T repeats the last radio line.
- **Content rules:**
  - Instructions in plain words with action tokens. Directions name a compass point *and* a landmark that has a label or marker.
  - Jokes live in flavour lines, never as the only copy of an instruction.
  - At most about 25 words a line; split longer lines.
- **Screen readers:** the bus mirrors priorities 1–3 to an `aria-live="polite"` region when "Announce radio" is on.

### Spec 8. Visual system

- **Colour tokens:**

  | Token | Value |
  | --- | --- |
  | `--paper` | `#efe8d6` |
  | `--ink` | `#1d1c19` |
  | `--stamp` | `#a3261b` |
  | `--signal` (yellow) | `#e9c64a` |
  | `--admiralty` (navy) | `#13202b` |
  | `--chalk` | `#f3f1ea` |
  | `--khaki` | `#6f6b45` |

- **Semantic tones** always pair a colour with an icon:

  | Tone | Icon |
  | --- | --- |
  | good | ✓ |
  | food | 🍟-style drawn icon |
  | warn | `?` |
  | bad | `!` |
  | info | `i` |

- **Plates (solve contrast whatever the scene):**
  - **Paper slip:** `--paper` at 92% with `--ink` text, 13.9:1. Used for radio tape, toasts, the current order and action cards.
  - **Signal plate:** `--admiralty` at 88–92% with `--chalk` text, about 14:1. Used for the flight readout, the status chip and the compass.
  - **Stamp:** a red border with red text on a paper slip, 6.0:1. Used for alerts.
  - Non-text indicators (rings, arcs, cones) get a 2 px dark outline, at least 3:1 (WCAG 1.4.11).
- **Type scale** (ratio 1.25): 12 · 14 · 16 · 20 · 25 · 31 · 39 px at 100%.
  - HUD body 16, HUD labels 14, radio 18, alert stamp 28, menu body 16, headings 25 and 31, title 39.
  - Line height 1.4 for body and 1.2 for display.
  - Nothing smaller than 12 px, and nothing that carries information smaller than 14 px.
- **Typefaces:**
  - Typewriter (Courier Prime or bold system Courier) for stamps, headings and short text.
  - The **Plain** option, a sans face, for long reading.
  - HUD lettering in a 1960s British signage style (Transport or Rail Alphabet lineage), or the system sans at semibold.
- **Spacing** 4, 8, 12, 16, 24. **Radius** 2 px (paper), 4 px (plates). **Motion** 120 and 200 ms, all removed under reduced motion.
- **Components:** DossierCard, Stamp, PaperSlip, SignalPlate, KeyCap and PadGlyph (from the action layer), AttentionIcon, CompassRibbon, DetectionRing, ToastFeed, ActionCard and NotebookTabs. Remove the native control look: sliders and checkboxes styled as typewriter switches with targets of at least 24 px.

### Spec 9. Tests to add (Playwright, reusing SailSim's patterns)

1. **Accessibility (`a11y.spec`):**
   - axe on title, settings, briefing, Ready gate, pause, results and error: no serious or critical violations.
   - Tab stays inside each dialog; Esc behaves as in Spec 6; focus returns to its opener.
2. **Layout (`layout.spec`):** worst-case HUD content (three toasts, an alert, two-line radio, a prompt, three bubbles, the longest order) at 1920×1080, 1366×768, 1280×720, 1024×640 and 800×600.
   - The boxes do not intersect.
   - Nothing is clipped.
   - The primary action is in view on every card.
3. **Text:** computed sizes at 100% are at least 14 px for HUD labels and 16 px for body; at 200% the layout holds.
4. **Contrast probe:** in six scripted views (the quay in sun, the sky, the river, the red stand), read the canvas pixels under each HUD box and assert 4.5:1 or better for text against the plate. This also guards against plates being made transparent later.
5. **Input (`input.spec`):**
   - Mission time does not advance at the Ready gate or uncaptured.
   - Esc then Resume recaptures, or stays paused.
   - Scouting works from the keyboard.
   - A remap persists across a reload.
   - The keyboard-only profile completes the Mission 1 flight school with real key events.
   - A mocked pad drives flight and menus.
6. **Reduced motion:** the first-person camera's up vector stays level while banking (SailSim's test pattern), and the OS-change listener works.

---

## SailSim code already in this repository, to reuse

| Need | Vendored file | Use |
| --- | --- | --- |
| Accessible dialogs | `src/ui/useModal.ts` | Inert background, focus in, Tab wrap, Esc, focus restore (M-1) |
| Confirmations | `src/ui/Confirm.tsx` | Restart and Abandon (M-3) |
| Edge arrow with distance | `src/app/edgePointer.ts` | Off-screen objective (H-8) |
| Stuck hints | `src/app/hints.ts` (pattern) | Contextual first-time hints (O-3) |
| Gamepad | `src/app/gamepad.ts` | Standard mapping, dead zone, curve, haptics (I-5) |
| Touch detection, battery saver | `src/app/prefs.ts` (`touchOnly`) | Mobile notice, frame cap (I-10, S-1) |
| On-device speech | `src/render/speech.ts` | Read Mother aloud; menu narration (A-2, A-8) |
| Sound captions | `src/app/signalCaption.ts` (pattern) | Captions for sounds (A-3) |
| Map | `src/ui/Minimap.tsx`, `src/ui/minimapChart.ts`, `public/geo/minimap.png` | Notebook map (H-8) |
| Compass | `src/ui/Compass.tsx` | Ribbon or compass (H-8) |
| Place labels | `DartScene.labels` (`showLabels` is false at `game.ts:716`) | Landmark labels assist (H-8) |
| Camera motion slider | `src/render/graphics.ts` (`cameraMotion`) | Comfort sliders (A-5) |
| Device check | `src/app/deviceCheck.ts`, `deviceCheckRunner.ts` | Graphics tab (S-1) |
| Settings grouping, value labels, reload notice | `src/ui/SettingsPanel.tsx` | Settings v2 (S-1) |
| Tests | SailSim `tests/e2e/a11y.spec.ts`, `layout.spec.ts`, `phone.spec.ts` | Spec 9 |

---

## Appendix A. Radio reading speed (lines with explicit durations)

| Line (start) | Words | Seconds | wpm |
| --- | --- | --- | --- |
| m2 "Bomber lead, Mother. You're on St Saviour's roof…" | 41 | 7 | **351** |
| m1 "W to flap, look where you want to go…" | 37 | 8 | **278** |
| m2 "Voronova. She'll not leave that lectern…" | 32 | 7 | 274 |
| m1 "The station is the little building…" | 26 | 6 | 260 |
| m1 "Good landing. Bayard's Cove is south…" | 29 | 7 | 249 |
| m2 "The Wing is with you, in a tight box…" | 29 | 7 | 249 |
| m1 "Section G regulations: no operative…" | 33 | 8 | 248 |
| mission "…has seen you! Break line of sight…" | 21 | 5.5 | 229 |
| m1 "One beak, Scrumpy…" | 24 | 6.5 | 222 |
| m1 "Private Borovsky. Creature of habit…" | 24 | 7 | 206 |
| m1 "Ha! Into the tea…" | 17 | 5 | 204 |
| m1 "Morning, Scrumpy…" (the first line, at t = 0) | 14 | 6 | 140 |

All 33 lines: median about 227 wpm, range 86–351; 22 of the 33 at 200 wpm or faster. Comfortable passive reading is about 160–180 wpm, and much less while flying.

## Appendix B. Measured contrast (WCAG ratio)

| Text | Over white render | Over sky | Over river teal |
| --- | --- | --- | --- |
| Toast "good" `#8cf28c` (no plate) | 1.21 | 1.06 | 5.63 |
| Toast "food" `#ffd75a` | 1.22 | 1.06 | 5.60 |
| Toast "warn" `#ffbf40` | 1.44 | 1.12 | 4.73 |
| Toast "bad" `#ff5a4d` | 2.69 | 2.10 | 2.53 |
| ON TARGET `#ff6a55` | 2.47 | 1.92 | 2.76 |
| Banner SPOTTED through its 35% black plate | 1.12 | n/m | n/m |
| HUD panel body text (55% plate) | 4.10 | 4.87 | 12.2 |
| Done objective (55% opacity) | 2.36 | 2.64 | 4.81 |
| Menu ink on paper | 13.9 | | |
| Stamp red on paper | 6.0 | | |
| Disabled file button | 3.4 | | |

"n/m": not measured.
