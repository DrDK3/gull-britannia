# Gull Britannia: guide for anyone (or any agent) working in this repository

A free, single-player seagull stealth comedy that runs in the browser. You are Operative SCRUMPY, a herring gull of the Resistance's Section G, over a real, solid Dartmouth in an alternate June 1967 under a slapstick Soviet occupation. Live at https://drdk3.github.io/gull-britannia/ (every push to `main` deploys there).

**Where it is going.** The owner wants a best-in-class, extended, multi-level game, as a showcase of what can be built this way. Testers criticised the graphics, the gameplay and flight feel, the lack of story in play, the onboarding and the thin characters. The premise and the writing voice are liked. Judge every change by: would a stranger notice it, enjoy it, and finish the level?

## Rules that do not bend

1. **Free tools and assets only.** Nothing paid. Outside assets only if CC0, or CC-BY with credit added to `SOURCES.md` and the in-game credits. No new npm dependency without a strong reason; say so in your report.
2. **Nothing irreversible.** No force-push, no history rewrite, no deleting branches. Only the lead pushes to `main`.
3. **No third-party characters, logos or real people.** The satire is aimed at bureaucracy and authority on both sides, never at Russians as people. Guards are human, a bit bored, fond of tea.
4. **Game logic is deterministic and DOM-free.** Everything that affects play lives in `src/gull/game/` (no three.js, no DOM, no `Math.random`, no wall clock: use `Rng`), with Vitest tests in `tests/gull/`.
5. **Accessibility is a requirement.** HUD text sits on a solid plate at 4.5:1 contrast or better and is at least 16 px on a 1080-line screen. Every objective can be done with the keyboard alone and with a trackpad. Honour reduced motion.
6. **No key letters in player-facing text.** Write `{flap}`, `{scout}` (ids in `src/gull/game/actions.ts`); the interface fills in the binding.

## Stack and commands

TypeScript 6, three.js 0.186, React 19, Vite 8, Vitest 5, Playwright, ESLint 10.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Browser code, and separately that `src/gull/game/` is DOM-free |
| `npm run lint` | ESLint, including the purity rules for `src/gull/game/` |
| `npm test` | Vitest: game logic on a stand-in town, about 5 s |
| `npm run build` | Type check, then the static site into `dist/` |
| `npm run e2e` | Serves `dist/` and runs every browser suite in `tests/e2e/` (5 to 8 minutes here) |
| `npm run bake:collision` | Rebuilds the collision grids; needed after any change to fixed scenery (build, bake, build) |
| `node tools/shoot.cjs <url> <outdir> <steps.json>` | Screenshots with real input; read its header |
| `node tools/measure-load.cjs <url> 3` | Load time to the title screen |

**A change is not done because it compiles.** Run type check, lint and tests; for anything visible, look at a screenshot of it. Report what you ran and what you saw, including what failed.

## Map of the code

| Path | What lives there |
| --- | --- |
| `src/gull/game/` | The game, deterministic: `world.ts` (collision on height grids, sight lines), `gull.ts` (flight, walking, water, perching, poop), `guard.ts`, `items.ts`, `mission.ts` (objectives, scoring, tagging, events), `m1.ts`, `m2.ts`, `parade.ts`, `free.ts`, `operations.ts` (which missions exist), `actions.ts` (the player's actions by name), `ambient.ts` |
| `src/gull/view/` | three.js drawing: `gullScene.ts` (renderer, cameras), `missionView.ts` (people, props, splats; interpolated), `gullModel.ts`, `figures.ts`, `era1967.ts` (what is removed for 1967), `collisionData.ts` |
| `src/gull/app/` | `game.ts` (the controller: loading, the Ready/Flying/Paused gate, the frame loop, HUD state), `audio.ts` (all sound is synthesised), `briefings.ts`, settings, progress |
| `src/gull/ui/` | React screens and HUD (`App.tsx`, `gull.css`, `dialog.ts`) |
| `src/render`, `src/sim`, `src/app` | SailSim's River Dart, vendored. Change it only when you must, and mark the change with a `// Gull Britannia:` comment |
| `tests/gull/` | Unit tests. `pilot.ts` flies with the player's inputs only (no teleports): use it for acceptance tests |
| `tests/e2e/` | Browser suites against the real town |
| `reports/`, `research_notes/` | The foundation plan, three expert reviews, the 1967 research, the backlog |

Frame of reference: metres east (`e`) and north (`n`) of the Royal Dart Yacht Club, height `h` in metres above Ordnance Datum. Compass yaw: 0 is north, clockwise. In the scene, y = h − water level and z = −n.

The simulation runs at a fixed 60 Hz; the view draws between steps. A mission queues events (radio, toast, banner, sound, splat) and the controller drains them. `window.__gull.game` is the test hook in the browser.

## Things that will bite you

- **Chromium.** This Playwright has no browser of its own here; the tools fall back to `/opt/pw-browsers/chromium`. Never run `playwright install`.
- **Software rendering is slow.** A frame of the full town takes about a second at 1280×720; a screenshot can take a minute or two. Iterate at `W=640 H=360`. The machine has four cores and other agents share them: do not run two browsers at once, and prefer unit tests.
- **CI is your second machine.** Every pushed branch runs type check, lint, tests, build and both browser suites on GitHub (about 7 minutes). Check it with `gh api "repos/DrDK3/gull-britannia/actions/runs?branch=<branch>&per_page=1" --jq '.workflow_runs[0] | "\(.status) \(.conclusion)"'`. `gh` GraphQL commands (`gh pr`, `gh issue`) do not work here; use `gh api`.
- **Nothing may animate on the loading screen.** A moving bar took the load from 9 s to 17 s on a software renderer.
- **Fixed scenery changed? Bake.** The gull collides with baked grids in `public/geo/collision-*`. If buildings, quays or trees move, run build, `bake:collision`, build, and re-check perches.
- **Messages run on the frame clock.** When a script steps the game (`game.frozen = true`), toasts and radio lines do not advance.
- **The camera collides with the height grid.** Check any new perch from the chase camera, not just in a test.
- **Vendored code has its own lint rules** (`src/sim` must stay pure).

## Working in parallel

Several agents may be working at once, each in its own git worktree and on its own branch.

- Stay inside the files your brief gives you. If you need a change elsewhere, make the smallest one, mark it `// handoff:` with a line of explanation, and list it in your report.
- If `node_modules` is missing in your worktree: `ln -s /home/user/gull-britannia/node_modules node_modules`.
- Commit small and often on your branch, and push the branch after each verified step (`git push -u origin <branch>`), so the work survives the container. Never push to `main`.
- Do not start a dev server on a port another agent uses; your brief gives you one.
- Finish with a short note in `reports/agents/<your-name>.md`: what changed, the interfaces others need, how it was verified (with numbers), what is left, and anything the owner must decide.

## Writing for the player

British English. Dry, deadpan, and deadly serious about very silly things: memoranda, forms, tea, lunch. Mother is brisk and never explains a joke. Short sentences. No exclamation marks from Section G; the garrison may shout. A radio line is read at about 15 characters a second while flying, so keep each under 140 characters.
