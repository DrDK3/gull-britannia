// End-to-end: load the game in Chromium (software WebGL is fine), and fly both missions on the real, captured town.
// The flying is done by an autopilot that steers the gull's view and presses the same controls a player does.
//
//   npm run build && npm run e2e            (serves dist/ itself and runs every suite)
//   node tests/e2e/missions.e2e.cjs <url>    (this suite alone, against a server already running)
//
// Exits non-zero on any failure. Takes a minute or two (most of it loading under software rendering).
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:4173/';

/** Runs in the page. */
function suite() {
  const { game } = window.__gull;
  const results = [];
  const check = (name, ok, info = '') => results.push({ name, ok: !!ok, info: String(info) });
  const DT = 1 / 60;
  const NO = { forward: false, back: false, left: false, right: false, flap: false, dive: false, land: false, scout: false };
  const step = (n, c = {}) => {
    for (let i = 0; i < n; i++) {
      game.mission.step(DT, { ...NO, ...c }, false);
      game.world.waterLevel = game.waterLevel();
    }
  };
  const until = (sec, fn, c = {}) => {
    for (let i = 0; i < sec * 60; i++) {
      step(1, c);
      if (fn()) return true;
    }
    return false;
  };
  /** Autopilot: look at the target, cruise over the roofs, then come down; land with R when asked. */
  const flyTo = (t, radius, sec, land = false) => {
    const m = game.mission;
    const g = m.gull;
    for (let i = 0; i < sec * 60; i++) {
      const flat0 = Math.hypot(t.e - g.pos.e, t.n - g.pos.n);
      const aimH = flat0 > 35 ? Math.max(t.h + 4, 34) : t.h + (land ? 1.5 : 0);
      const de = t.e - g.pos.e;
      const dn = t.n - g.pos.n;
      const dh = aimH - g.pos.h;
      const flat = Math.hypot(de, dn);
      const d3 = Math.hypot(flat, t.h - g.pos.h);
      if (land ? g.mode === 0 && d3 < radius : d3 < radius) return true;
      g.yaw = Math.atan2(de, dn);
      g.pitch = Math.max(-0.9, Math.min(0.6, Math.atan2(dh, Math.max(flat, 0.1))));
      const c = { ...NO };
      if (g.mode !== 1) c.flap = i % 20 < 10;
      else {
        c.forward = flat > 25 || g.airSpeed < 9;
        c.flap = dh > 2 && g.airSpeed < 14;
        c.back = flat < 12 && g.airSpeed > 8;
        c.land = land && flat < 20;
      }
      m.step(DT, c, false);
    }
    return false;
  };

  // ---------------------------------------------------------------- the real town
  const w = game.world;
  const roofs = { 'nest roof': [-330, 298], 'station roof': [-277, 372], 'Custom House': [-326, 60], 'fort parapet': [-290, -8.2], 'Royal Castle Hotel': [-372, 390] };
  for (const [k, [e, n]] of Object.entries(roofs)) {
    const top = w.highestNear(e, n, 1.5).h;
    check(`captured: ${k} stands above the quay`, top > w.groundAt(e, n) + 3, top.toFixed(1));
  }
  check('captured: the Boat Float is water', w.isWater(-318, 392));
  check('captured: Bayard’s Cove quay is dry', !w.isWater(-314, 56));
  check('people stand on the quay as drawn', Math.abs(w.groundAt(-314, 56) - w.cellTop(-314, 56)) < 0.05, `${w.groundAt(-314, 56).toFixed(2)} / ${w.cellTop(-314, 56).toFixed(2)}`);

  // ---------------------------------------------------------------- Mission 1, flown
  game.startOperation('m1');
  game.frozen = true;
  let m = game.mission;
  check('m1: starts on the nest', m.gull.mode === 0 && m.gull.pos.h > 15, m.gull.pos.h.toFixed(1));
  check('m1: takes off', until(2, () => m.objectiveState('takeoff') === 'done', { flap: true }));
  const st = m.stationPerch.pos;
  check('m1: flies to the station', flyTo({ e: st.e, n: st.n, h: st.h + 5 }, 7, 60));
  check('m1: lands on the station roof with R', until(10, () => m.gull.perch === m.stationPerch, { land: true, back: true }));
  check('m1: lunch and the dispatch open up', m.objectiveState('dispatch') === 'active' && m.objectiveState('lunch') === 'active');
  // To the Custom House gutter, and wait there for his back.
  const gp = m.gutterPerch.pos;
  m.gull.takeOff(m);
  check('m1: flies to the Custom House', flyTo({ e: gp.e + 6, n: gp.n, h: gp.h + 6 }, 8, 90));
  m.gull.spawn({ e: gp.e, n: gp.n, h: gp.h + 0.35 }, Math.PI / 2, -0.4);
  const s = m.sentry;
  check('m1: the sentry walks his routine to the river wall', until(60, () => s.stepIndex() === 2 && !s.moving && Math.hypot(s.pos.e - s.routine[2].e, s.pos.n - s.routine[2].n) < 0.4));
  check('m1: he never noticed the gull on the gutter', m.stats.spotted === 0 && s.state === 0, s.stateName);
  m.gull.spawn({ e: m.dispatch.pos.e + 0.9, n: m.dispatch.pos.n, h: m.dispatch.pos.h - 0.4 }, -Math.PI / 2);
  step(20);
  m.interact();
  check('m1: snatches the dispatch', m.beak === m.dispatch, m.beak && m.beak.name);
  m.gull.takeOff(m);
  const pot = m.pot.pos;
  check('m1: flies the dispatch to the Boat Float', flyTo({ e: pot.e, n: pot.n, h: pot.h + 2.5 }, 3, 120));
  m.interact();
  check('m1: delivers it to the Dorothy May', m.delivered, m.prompt());
  check('m1: unseen all the way', m.stats.spotted === 0, m.stats.spotted);
  const chip = m.chips[0];
  m.gull.takeOff(m);
  check('m1: flies to the clerk’s chips', flyTo({ e: chip.pos.e + 1.5, n: chip.pos.n, h: chip.pos.h + 1.2 }, 2.4, 60));
  // The last metre: onto the bench beside the chips.
  m.gull.spawn({ e: chip.pos.e, n: chip.pos.n + 0.9, h: chip.pos.h + 0.3 }, Math.PI);
  step(20);
  m.interact();
  check('m1: snatches a chip', m.beak && m.beak.kind === 'chip');
  m.eat();
  step(80);
  check('m1: eats it', m.lunchDone);
  let screen = '';
  for (let i = 0; i < 300 && screen !== 'results'; i++) {
    game.step(DT);
    screen = game.state.screen;
  }
  const r = game.state.results;
  check('m1: the performance review', screen === 'results' && r && r.total > 0, r && `${r.grade} ${r.total}`);
  check('m1: stealth and clean escape bonuses', r && r.lines.some((l) => l[0].startsWith('Stealth: never') && l[1] === 300) && r.lines.some((l) => l[0].startsWith('Clean escape: never') && l[1] === 200));

  // ---------------------------------------------------------------- Mission 1, the tea
  game.startOperation('m1');
  m = game.mission;
  m.skipTutorial();
  m.sentry.jumpToStep(0);
  const mug = m.mug.pos;
  m.gull.spawn({ e: mug.e, n: mug.n, h: mug.h + 7 }, 0);
  m.gull.setMode(1);
  m.gull.airSpeed = 0.5;
  m.gull.flyDir = { e: 0, n: 1, h: 0 };
  m.gull.vel = { e: 0, n: 0, h: 0 };
  m.gull.poop(m);
  check('m1 tea: a drop in his tea sends him for a refill', until(3, () => m.sentry.distractionKind() === 'tea', { back: true, flap: true }));
  check('m1 tea: he gets to the field kitchen up the lane', until(40, () => m.sentry.isBusy()), `${m.sentry.pos.e.toFixed(1)},${m.sentry.pos.n.toFixed(1)}`);

  // ---------------------------------------------------------------- Mission 2
  game.startOperation('m2');
  m = game.mission;
  check('m2: Bomber lead, six drops', m.gull.profile.maxPayload === 6);
  // From the mooring pile behind the stand (from the station roof its own turret is in the way; from the pavement
  // beside the stand, its deck).
  const pile = m.perches.find((p) => p.id === 'pile').pos;
  m.gull.spawn({ e: pile.e, n: pile.n, h: pile.h + 0.35 }, -Math.PI / 2);
  step(30);
  const head = m.voronova.headPosition();
  m.gull.yaw = Math.atan2(head.e - m.gull.pos.e, head.n - m.gull.pos.n);
  m.gull.pitch = Math.atan2(head.h - m.gull.eye().h, Math.hypot(head.e - m.gull.pos.e, head.n - m.gull.pos.n));
  check('m2: tags Voronova from the mooring pile', until(3, () => m.voronova.tagged, { scout: true }));
  const ro = m.roostPerch.pos;
  m.gull.takeOff(m);
  check('m2: flies to the Royal Castle Hotel', flyTo({ e: ro.e, n: ro.n, h: ro.h + 4 }, 6, 60));
  check('m2: lands on the roost', until(10, () => m.gull.perch === m.roostPerch, { land: true, back: true }));
  m.signal();
  check('m2: the Wing scrambles', m.allies.every((a) => a.state === 1));
  m.setParade(316, -1);
  for (let i = 0; i < 4; i++) {
    const sd = m.marchers[i];
    m.spawnPoop({ e: sd.pos.e, n: sd.pos.n, h: sd.pos.h + 4 }, { e: 0, n: 0, h: -1 }, true);
    step(36);
  }
  check('m2: four hits in front of the stand break the formation', m.brokenCount === 1);
  check('m2: Voronova leaves the lectern', until(8, () => m.voronova.isBusy()));
  m.gull.spawn({ e: m.document.pos.e + 0.6, n: m.document.pos.n, h: m.document.pos.h + 0.25 }, -Math.PI / 2);
  m.gull.setMode(1);
  m.interact();
  check('m2: takes the Inspection Order', m.beak === m.document);
  const p2 = m.pot.pos;
  check('m2: flies it to the Dorothy May', flyTo({ e: p2.e, n: p2.n, h: p2.h + 2.5 }, 3, 90));
  m.interact();
  check('m2: delivered', m.delivered);
  screen = '';
  for (let i = 0; i < 300 && screen !== 'results'; i++) {
    game.step(DT);
    screen = game.state.screen;
  }
  check('m2: the performance review', screen === 'results' && game.state.results.lines.some((l) => l[0].startsWith('Formation broken') && l[1] === 400), game.state.results && game.state.results.total);

  // ---------------------------------------------------------------- restart
  game.startOperation('m1');
  m = game.mission;
  check('restart: a fresh mission', m.stats.drops === 0 && m.objectiveState('takeoff') === 'active' && m.dispatch.state === 0 && m.sentry.state === 0);
  game.toTitle();
  check('back to the title', game.state.screen === 'title');
  return results;
}

(async () => {
  const fs = require('fs');
  // A preinstalled Chromium (CHROMIUM_PATH, or a Playwright install at /opt/pw-browsers) when this Playwright has no
  // browser of its own.
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  let browser;
  try {
    browser = await chromium.launch({ args });
  } catch (e) {
    if (!exe) throw e;
    browser = await chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
  }
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => ['title', 'error'].includes(window.__gull?.game.state.screen), null, { timeout: 360000, polling: 1000 });
  const screen = await page.evaluate(() => window.__gull.game.state.screen);
  if (screen !== 'title') {
    console.log('FAIL load:', await page.evaluate(() => window.__gull.game.state.error));
    process.exit(1);
  }
  const results = await page.evaluate(`(${suite.toString()})()`);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.info ? `  (${r.info})` : ''}`);
    if (!r.ok) failed++;
  }
  for (const e of errors) console.log('PAGE ERROR', e);
  console.log(`${results.length - failed} of ${results.length} passed`);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
