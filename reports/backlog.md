# Backlog

Bugs and gaps found while working on something else, with steps to reproduce. Each is outside the package in which it was found. Sizes: S is under a day, M is a few days, L is a week or more.

## Needs the owner's decision

| # | What | Detail | Size |
| --- | --- | --- | --- |
| D1 | **Mission 2's hour does not suit its tide** | File 2 is set at 10.55 BST on Wednesday 7 June 1967, the day before a new moon. With spring tides and high water in the early evening, the real river was probably near low water at that hour and the Boat Float nearly dry, which would strand the *Dorothy May*. The game uses an illustrative water level (`M2_CONDITIONS` in `src/gull/game/m2.ts`). Options: move The Inspection to an evening parade at about 18.30, which also gives low sun over the Embankment; keep 10.55 and move the drop to a boat in the river; or leave it as it is and say so. Needs a 1967 tide table to settle. | S once decided |
| D2 | **The `godot-v1` tag is not on GitHub** | Tag pushes are refused from the cloud session (HTTP 403). The Godot version is preserved as the branch `godot-v1-archive`. To add the tag: GitHub → Releases → Draft a new release → tag `godot-v1`, target `godot-v1-archive`. | 2 minutes |

## Mission 2

| # | What | Reproduce | Size |
| --- | --- | --- | --- |
| M2-1 | **The Wing's footprint is not drawn.** The marker shows only the leader's own drop. The Wing now lays a box around it (one rank short, level, and two ranks beyond, on each side), so the leader can aim the box by eye, but rings on the ground would make it plain. | File 2 → signal the Wing → fly along the column: one marker. | S–M |
| M2-2 | **A failed pass is expensive.** The Wing circles for 6 s, flies home and reloads for 14 s, and the leader has to fly back to the hotel roof to signal again. | File 2 → signal → release away from the column. | S |
| M2-3 | **The pass only counts in front of the stand**, and the column is there for about 26 s in every 71 s. Nothing on screen says when. | File 2 → strike when the column is at either end of the Embankment: "the formation held". | S |
| M2-4 | **Marchers step in fits.** A marcher walks at 1.4 m/s until he is within 5 cm of his slot, then stops for a few steps. Invisible at marching pace, but his walk cycle and his speed disagree. | Watch one soldier's feet closely in File 2. | S |
| M2-5 | **Mission 2 is a single route.** Scout, signal, strike, steal, deliver, with no second way in (design review F3.2). | Play File 2 twice. | M each |

## Mission 1 and the framework

| # | What | Reproduce | Size |
| --- | --- | --- | --- |
| F-1 | **The Ready gate's card covers the gull.** At the gate the card sits over the bottom third of the screen, where the gull stands. | File 1 → Begin operation. | S (package 3 rebuilds this screen) |
| F-2 | **Altitude reads 0 m on a rooftop.** The readout is height above whatever is underneath, so it is 0 on the nest, 16 m up. Clear in flight, odd on a roof. | File 1, before taking off. | S |
| F-3 | **Mission text names keys.** "Take off from the nest [Space]", "Press G to signal": wrong for any other binding or device. | Any objective. | Package 3 |
| F-4 | **The controls panel is 14 lines long** and shows on first play. | File 1, first run. | Package 3 |
| F-5 | **Losing the graphics context is handled but untested.** The game pauses and rebuilds the sky and water when the browser takes the context away. No automated test forces a loss. | In Chrome DevTools: `canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`. | S |
| F-6 | **Pre-compiling shaders during the briefing is unmeasured.** It was added to remove the hitch at the first frame of a mission; no before-and-after timing was taken on real hardware. | Profile File 1's first second on a laptop with integrated graphics. | S |
| F-7 | **The setup script of the cloud environment is unproven.** It runs `npm ci` when a session starts; it has not yet been through a fresh session. | Start a new cloud session on the `gull-britannia` environment. | — |

## Dartmouth in 1967: known to be wrong, not yet fixed

Sources for each: `reports/Dartmouth and the Dart in 1967.md`.

| # | What is drawn | What stood there in June 1967 | Size |
| --- | --- | --- | --- |
| E-1 | The 2009 Higher Ferry (cable ferry) | A paddle-driven floating bridge, Philip & Son's No. 7 of 1960 | M |
| E-2 | A modern passenger launch and a dark blue river boat | British Railways' passenger ferry; five white-hulled river boats of the River Dart Steamboat Co. | M |
| E-3 | No paddle steamers | Three lay idle: *Kingswear Castle* in Old Mill Creek, *Totnes Castle* with sailing-school sheds on deck, *Duke of Devonshire* below the Higher Ferry | M |
| E-4 | The river boats' modern pontoon off the North Embankment (kept so that the river boat has somewhere to call) | A roofed pontoon of about 1889 at the Embankment "station", reached by a steel bridge of 1928; river boats against the quay wall beside it | M |
| E-5 | No train at Kingswear (the heritage steam train is now left out) | A three-car Class 116 diesel unit in plain green with small yellow warning panels | M |
| E-6 | College Way on the hillside | Not built until 1969. There is no way yet to remove a road: the roads are drawn from one mask | M |
| E-7 | Today's Embankment | Up to 6 m narrower and lower | L |
| E-8 | Darthaven's ground at Kingswear, cleared of the marina | British Railways' idle goods yard and sidings, a ship-sized timber jetty | M |
| E-9 | Noss, cleared of the marina's lettering | Philip & Son's working shipyard | M |
| E-10 | Dart Marina's piers as they are today | A smaller marina of 1965, a cream three-storey hotel with a red roof, pink and yellow sheds, a masonry chimney | M |
| E-11 | The Dartmouth Clinic (1990), left standing | "The Cinema" on Mayor's Avenue at Zion Place | S–M |
| E-12 | Bare ground where the filling station and the Marks & Spencer block were removed | A 1960s garage on Townstal Road; Western National's bus park with green buses | S each |
| E-13 | Greenway Halt (2012) in the railway data | Nothing. It lies outside the playable area | S |
| E-14 | Modern cars, yachts, street furniture and pedestrians (SailSim's models; the cars are repainted) | 1960s shapes | L |
| E-15 | Unverified: the real tide for either mission; every buoy and light; the old Kingswear lighthouse | Needs a 1967 tide table, a chart and the 1960s Ordnance Survey sheets (the National Library of Scotland's viewer sits behind a CAPTCHA) | Owner or a library visit |

## Performance

| # | What | Measure | Size |
| --- | --- | --- | --- |
| P-1 | **Loading is still nine to ten seconds on a software renderer**: about 4.6 s building the scene and 3.5 s compiling shaders. Baking the collision grids took about two seconds off. Anything that animates during the load costs dearly there: a moving loading bar took the load from 9 s to 17 s. | `node tools/measure-load.cjs <url> 3` | M |
| P-3 | **No budget in CI.** Load time is measured by hand. A regression of several seconds went unnoticed for three commits. A check that fails above, say, twice the usual time on the CI machine would have caught it. | — | S |
| P-2 | **Characters cost about 2,000 draw calls** in Mission 2: each figure is many small meshes (engine review R1). | `?debug` in File 2 | M |
