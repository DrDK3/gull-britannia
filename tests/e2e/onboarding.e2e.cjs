// End-to-end: the first sixty seconds of Mission 1, through the real buttons and keys.
//
//  a. Under ten seconds from clicking "File 1" to the moment the player's first input is possible.
//  b. A briefing of about 80 words; the full dossier behind a button; Begin always in view.
//  c. One prompt at a time, each up until the player has done the thing: take off, steer, flap, land, look, snatch.
//     No controls panel on the HUD; the full list is in the pause menu. The opening is flown with the keyboard alone.
//  d. Radio: one line at a time at reading speed; a log on L, the last line again on V.
//  e. Text names actions and is drawn with the current binding: rebind a key and the prompt, and the key, change.
//
//   node tests/e2e/onboarding.e2e.cjs <url>
//
// The keys are real key events. The game's clock, in the flown part, is stepped by the script: a software renderer
// draws a frame every second or more and the game advances at most a tenth of a second a frame, so a flight in real
// time would take minutes. Where the test waits for the screen to show something, it waits for a real frame.
const { launch, openGame, tally, waitGate, waitScreen, waitFor, clickNow } = require('./lib.cjs');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const { check, finish } = tally();

/** What the HUD shows now, read from the page as a player sees it. */
const hud = (page) =>
  page.evaluate(() => {
    const g = window.__gull.game;
    const prompts = [...document.querySelectorAll('[data-hud="prompt"]')];
    const radios = [...document.querySelectorAll('[data-hud="radio"]')];
    const p = prompts[0];
    return {
      gate: g.state.gate,
      prompts: prompts.length,
      prompt: p ? p.dataset.prompt : '',
      promptText: p ? p.textContent : '',
      keys: p ? [...p.querySelectorAll('kbd')].map((k) => k.textContent) : [],
      radios: radios.length,
      radioText: radios[0] ? radios[0].textContent : '',
      orders: document.querySelector('[data-hud="orders"]') ? document.querySelector('[data-hud="orders"]').textContent : '',
      controlsPanel: !!document.querySelector('.gb-controls'),
      lesson: g.coach ? g.coach.lessonId() : '',
      learned: g.coach ? g.coach.learned() : [],
      beak: g.mission && g.mission.beak ? g.mission.beak.kind : '',
      airborne: g.mission ? g.mission.gull.isAirborne() : false,
    };
  });
/** Wait until the prompt on screen is this one (a real frame has to be drawn for it). */
const waitPrompt = (page, id, ms = 90000) => waitFor(page, (want) => document.querySelector('[data-hud="prompt"]')?.dataset.prompt === want, id, ms);
const canFly = () => {
  const g = window.__gull.game;
  return g.state.screen === 'playing' && g.state.gate === 'flying' && g.mission.running && g.mission.gull.controlsEnabled;
};
/**
 * Step the game's clock until a condition holds (an expression over `g`, the game, and `m`, the mission), for at most
 * `seconds` of game time. Whatever keys the test is holding stay held. Returns whether it came true, and after how long.
 */
const stepUntil = (page, code, seconds) =>
  page.evaluate(
    ([src, max]) => {
      const g = window.__gull.game;
      g.frozen = true;
      const cond = new Function('g', 'm', `return (${src});`);
      let n = 0;
      while (n < max * 60 && !cond(g, g.mission)) {
        g.step(1 / 60);
        n++;
      }
      return { ok: !!cond(g, g.mission), t: n / 60 };
    },
    [code, seconds],
  );

(async () => {
  const browser = await launch();
  const { page, errors } = await openGame(browser, url);
  let most = { radios: 0, prompts: 0 };
  const look = async () => {
    const h = await hud(page);
    most = { radios: Math.max(most.radios, h.radios), prompts: Math.max(most.prompts, h.prompts) };
    return h;
  };

  // ---------------------------------------------------------------- a. time to the first possible input
  const t0 = Date.now();
  await clickNow(page, 'File 1');
  await clickNow(page, 'Begin operation');
  await waitGate(page, 'ready');
  const tGate = Date.now();
  await clickNow(page, 'Click to fly');
  let how = 'mouse captured';
  let flying = await waitFor(page, canFly, null, 4000);
  let ms = Date.now() - t0;
  if (!flying) {
    // A browser that will not hand over the mouse (some headless builds): the keyboard-only way in, timed the same.
    const tKeys = Date.now();
    await clickNow(page, 'Keyboard only');
    flying = await waitFor(page, canFly, null, 6000);
    ms = tGate - t0 + (Date.now() - tKeys);
    how = 'keyboard only';
  }
  check('a. from clicking File 1 to the first possible input: under 10 seconds', flying && ms < 10000, `${(ms / 1000).toFixed(1)} s, ${how}, software rendering at 800×450`);

  // ---------------------------------------------------------------- c. the first prompt
  check('c. the first thing on screen to do is one prompt: take off', await waitPrompt(page, 'takeoff'));
  let h = await look();
  check('c. it names the action by its current key, as a key cap', h.keys.length === 1 && h.keys[0] === 'Space' && /Hold\s*Space\s*to take off/.test(h.promptText), h.promptText);
  check('c. no controls panel on the HUD', !h.controlsPanel);
  check('e. the order on the HUD names no key', /Take off from the nest/.test(h.orders) && !/\[|Space/.test(h.orders), h.orders);
  await waitFor(page, () => !!document.querySelector('[data-hud="radio"]'), null, 60000);
  h = await look();
  check('d. Mother’s first line is on the radio, and names no key', /Mother:.*Take off when ready/.test(h.radioText) && !/Space to take off/.test(h.radioText), h.radioText.slice(0, 80));
  await page.waitForTimeout(2500);
  h = await look();
  check('c. the prompt stays until the player has done it', h.prompt === 'takeoff' && !h.airborne);

  // ---------------------------------------------------------------- b. the briefing
  await page.evaluate(() => window.__gull.game.toTitle());
  await waitScreen(page, 'title');
  const briefing = () =>
    page.evaluate(() => {
      const words = (sel) => (document.querySelector(sel)?.textContent ?? '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
      const begin = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Begin operation'));
      const r = begin.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        words: words('.gb-brief-short') + words('.gb-brief-orders'),
        full: !!document.querySelector('.gb-brief-full'),
        fullWords: words('.gb-brief-full'),
        beginInView: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth && (top === begin || begin.contains(top)),
        focus: document.activeElement?.textContent ?? '',
        text: document.querySelector('.gb-sheet-body')?.textContent ?? '',
      };
    });
  await page.setViewportSize({ width: 1280, height: 720 });
  await clickNow(page, 'File 1');
  await waitScreen(page, 'briefing');
  let b = await briefing();
  check('b. the briefing shows about 80 words', b.words >= 60 && b.words <= 95, `${b.words} words`);
  check('b. the full dossier is not shown until asked for', !b.full);
  check('b. Begin is in view, and has the focus', b.beginInView && b.focus.includes('Begin operation'), b.focus);
  check('e. the briefing names no key', !/\[[A-Z]\]|\bSpace\b|right mouse/.test(b.text));
  await clickNow(page, 'Read full dossier');
  await waitFor(page, () => !!document.querySelector('.gb-brief-full'), null, 10000);
  b = await briefing();
  check('b. "Read full dossier" opens the whole file', b.full && b.fullWords > 100, `${b.fullWords} words more`);
  check('b. Begin stays in view with the dossier open', b.beginInView);
  await page.setViewportSize({ width: 1024, height: 768 });
  check('b. Begin is in view at 1024×768', (await briefing()).beginInView);
  await page.setViewportSize({ width: 800, height: 450 });
  check('b. Begin is in view at 800×450', (await briefing()).beginInView);

  // ---------------------------------------------------------------- c. the opening, flown with the keyboard alone
  await clickNow(page, 'Begin operation');
  await waitGate(page, 'ready');
  await clickNow(page, 'Keyboard only');
  check('keys: Keyboard only starts the flight', await waitGate(page, 'flying', 8000));
  await page.keyboard.down('Space');
  let r = await stepUntil(page, "g.coach.lessonId() === 'steer'", 3);
  const steer = await waitPrompt(page, 'steer');
  h = await look();
  check('keys: holding Space takes off, and the take-off prompt goes', r.ok && steer && h.learned.includes('takeoff') && h.airborne, `after ${r.t.toFixed(2)} s`);
  check('c. next, one prompt: steer, named for the arrow keys', h.prompts === 1 && h.keys.join() === 'Arrow keys', h.promptText);
  // Climb a little, then let go: the next lessons are flown in a glide.
  await stepUntil(page, 'm.gull.pos.h > m.stationPerch.pos.h + 12', 6);
  await page.keyboard.up('Space');
  // Look away with the arrow keys, then bring the marker back ahead.
  const yaw0 = await page.evaluate(() => window.__gull.game.mission.gull.yaw);
  await page.keyboard.down('ArrowLeft');
  r = await stepUntil(page, `Math.abs(Math.atan2(Math.sin(m.gull.yaw - (${yaw0})), Math.cos(m.gull.yaw - (${yaw0})))) > 0.7`, 3);
  await page.keyboard.up('ArrowLeft');
  h = await look();
  check('keys: the left arrow turns the view', r.ok, `0.7 rad in ${r.t.toFixed(2)} s`);
  check('c. looking about is not yet steering to the marker: the prompt is still up', h.lesson === 'steer');
  await page.keyboard.down('ArrowRight');
  r = await stepUntil(page, '(() => { const t = m.currentTarget(); const d = Math.atan2(t.e - m.gull.pos.e, t.n - m.gull.pos.n) - m.gull.yaw; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.1; })()', 3);
  await page.keyboard.up('ArrowRight');
  const faced = await stepUntil(page, "g.coach.lessonId() === 'flap'", 2);
  const flap = await waitPrompt(page, 'flap');
  h = await look();
  check('keys: the right arrow brings the marker ahead, and the steering prompt goes', r.ok && faced.ok && flap && h.learned.includes('steer'), h.prompt);
  check('c. next, one prompt: flap, with its key', h.prompts === 1 && h.keys.join() === 'W', h.promptText);
  await page.keyboard.down('KeyW');
  r = await stepUntil(page, "g.coach.lessonId() === 'land'", 6);
  await page.keyboard.up('KeyW');
  const land = await waitPrompt(page, 'land');
  h = await look();
  check('keys: holding W flaps for speed, and the prompt goes', r.ok && land && h.learned.includes('flap'), `after ${r.t.toFixed(2)} s`);
  const far = await page.evaluate(() => Math.hypot(window.__gull.game.mission.stationPerch.pos.e - window.__gull.game.mission.gull.pos.e, window.__gull.game.mission.stationPerch.pos.n - window.__gull.game.mission.gull.pos.n));
  check('c. next: fly to the marker (the landing key is not named until the roof is close)', far < 25 ? h.keys.join() === 'R' : /yellow marker/.test(h.promptText) && h.keys.length === 0, `${h.promptText} at ${far.toFixed(0)} m`);

  // The rest of the way: the same keys (W, Space, S and R, through the input map), pressed by a script that also turns
  // the view, as the missions suite's autopilot does.
  const landed = await page.evaluate(() => {
    const g = window.__gull.game;
    const m = g.mission;
    const gull = m.gull;
    const keys = ['KeyW', 'Space', 'KeyS', 'KeyR'];
    const hold = (want) => {
      for (const k of keys) {
        if (want.includes(k)) g.input.press(k);
        else g.input.release(k);
      }
    };
    const t = m.stationPerch.pos;
    let near = '';
    for (let i = 0; i < 90 * 60 && gull.perch !== m.stationPerch; i++) {
      const de = t.e - gull.pos.e;
      const dn = t.n - gull.pos.n;
      const flat = Math.hypot(de, dn);
      const aimH = flat > 20 ? t.h + 6 : t.h + 1.5;
      gull.yaw = Math.atan2(de, dn);
      gull.pitch = Math.max(-0.9, Math.min(0.6, Math.atan2(aimH - gull.pos.h, Math.max(flat, 0.1))));
      const want = [];
      if (gull.mode !== 1) {
        if (i % 20 < 10) want.push('Space');
      } else {
        if (flat > 25 || gull.airSpeed < 9) want.push('KeyW');
        if (aimH - gull.pos.h > 2 && gull.airSpeed < 14) want.push('Space');
        if (flat < 20) want.push('KeyR', 'KeyS');
      }
      hold(want);
      if (flat < 20 && !near) near = g.coach.prompt()?.text ?? 'no prompt';
      g.step(1 / 60);
    }
    hold([]);
    return { perched: gull.perch === m.stationPerch, perch: m.objectiveState('perch'), nearText: near };
  });
  check('keys: W, Space, S and R bring the gull down on the station roof', landed.perched && landed.perch === 'done');
  check('c. close to the roof, the landing prompt names its key', /\{land\}/.test(landed.nearText), landed.nearText);
  await stepUntil(page, "g.coach.lessonId() === 'look'", 1);
  const looking = await waitPrompt(page, 'look');
  h = await look();
  check('c. on the roof, one prompt: look closer, with its key', looking && h.prompts === 1 && h.keys.join() === 'T' && h.learned.join() === 'takeoff,steer,flap,land', `${h.promptText} / learned ${h.learned.join()}`);
  check('e. the new orders on the HUD name no key', !/\[|right mouse|\bT\b/.test(h.orders), h.orders.slice(0, 120));
  await page.keyboard.down('KeyT');
  r = await stepUntil(page, "g.coach.learned().includes('look')", 3);
  await page.keyboard.up('KeyT');
  check('keys: holding T looks closer, and the prompt goes', r.ok && (await waitFor(page, () => document.querySelector('[data-hud="prompt"]')?.dataset.prompt !== 'look', null, 90000)), `after ${r.t.toFixed(2)} s`);

  // Snatch: beside the clerk's chips.
  await page.evaluate(() => {
    const g = window.__gull.game;
    const chip = g.mission.chips[0];
    g.mission.gull.spawn({ e: chip.pos.e, n: chip.pos.n + 0.9, h: chip.pos.h + 0.3 }, Math.PI);
  });
  await stepUntil(page, "g.coach.lessonId() === 'snatch'", 1);
  const snatch = await waitPrompt(page, 'snatch');
  h = await look();
  check('c. beside lunch, one prompt: snatch, with its key', snatch && h.prompts === 1 && h.keys.join() === 'E', h.promptText);
  await page.keyboard.press('KeyE');
  r = await stepUntil(page, "m.beak && m.beak.kind === 'chip'", 1);
  await stepUntil(page, 'false', 0.2);
  await waitPrompt(page, 'action');
  h = await look();
  check('keys: E snatches the chip', r.ok && h.learned.includes('snatch'));
  check('e. the mission’s own prompt is drawn with key caps, not bracketed letters', h.prompt === 'action' && h.keys.join() === 'F,E' && !/\[/.test(h.promptText), h.promptText);

  // ---------------------------------------------------------------- d. the radio
  await page.keyboard.press('KeyL');
  const logOpen = await waitGate(page, 'paused');
  await waitFor(page, () => document.querySelectorAll('.gb-log li').length > 0, null, 10000);
  const log = await page.evaluate(() => ({ tab: window.__gull.game.state.pauseTab, lines: [...document.querySelectorAll('.gb-log li')].map((li) => li.textContent) }));
  check('d. L opens the radio log, with everything said so far', logOpen && log.tab === 'log' && log.lines.length >= 3 && log.lines.some((l) => /Mother: Afternoon, Scrumpy/.test(l)) && log.lines.some((l) => /Good landing/.test(l)), `${log.lines.length} entries`);
  await clickNow(page, 'Controls');
  await waitFor(page, () => document.querySelectorAll('.gb-control-row').length > 0, null, 10000);
  const list = await page.evaluate(() => [...document.querySelectorAll('.gb-control-row')].map((row) => row.textContent));
  check('c. the full controls list is in the pause menu', list.length >= 18 && list.some((row) => /Space.*flap for height/.test(row)) && list.some((row) => /L.*radio log/.test(row)), `${list.length} rows`);
  await clickNow(page, 'Radio log');
  await waitFor(page, () => window.__gull.game.state.pauseTab === 'log', null, 10000);
  await page.keyboard.press('KeyL');
  check('d. L again goes back to the flight', await waitGate(page, 'flying', 8000));
  // Let every line run its time (the bus is stepped directly: the test does not wait a minute of real time), then say
  // two lines at once and time them.
  const timing = await page.evaluate(() => {
    const g = window.__gull.game;
    const bus = g.messages;
    for (let i = 0; i < 3000 && (bus.view.radio || bus.radioWaiting); i++) bus.step(0.1);
    const a = 'The station is the little building on the Embankment, by the Boat Float. Follow the marker, and come in slowly.';
    const b = 'Better.';
    g.mission.say('Mother', a);
    g.mission.say('Mother', b);
    g.step(1 / 60);
    const first = bus.view.radio?.text;
    let aFor = 0;
    let bFor = 0;
    for (let i = 0; i < 400; i++) {
      bus.step(0.05);
      const t = bus.view.radio?.text;
      if (t === a) aFor += 0.05;
      if (t === b) bFor += 0.05;
    }
    return { first, aFor, bFor, chars: a.length, left: !!bus.view.radio };
  });
  check('d. two lines said together are shown one after the other', !!timing.first && timing.first.startsWith('The station') && timing.aFor > 0 && timing.bFor > 0 && !timing.left);
  check('d. a line stays up at 15 characters a second', Math.abs(timing.aFor - timing.chars / 15) < 0.2, `${timing.chars} characters for ${timing.aFor.toFixed(1)} s`);
  check('d. and never less than three seconds', Math.abs(timing.bFor - 3) < 0.2, `“Better.” for ${timing.bFor.toFixed(1)} s`);
  await waitFor(page, () => !document.querySelector('[data-hud="radio"]'), null, 90000);
  await page.keyboard.press('KeyV');
  const again = await waitFor(page, () => /Mother:\s*Better\./.test(document.querySelector('[data-hud="radio"]')?.textContent ?? ''), null, 30000);
  check('d. V puts the last line up again', again && (await page.evaluate(() => window.__gull.game.messages.view.radio?.repeat === true)));
  await look();
  check('d. never more than one radio line, or one prompt, on screen', most.radios <= 1 && most.prompts <= 1, `most at once: ${most.radios} radio, ${most.prompts} prompt`);

  // ---------------------------------------------------------------- e. the current binding
  await page.evaluate(() => {
    const g = window.__gull.game;
    g.restart();
    g.input.bind('flap', 'keys', 0, 'KeyJ');
  });
  await waitGate(page, 'flying', 20000);
  const rebound = await waitFor(page, () => [...(document.querySelector('[data-hud="prompt"]')?.querySelectorAll('kbd') ?? [])].map((k) => k.textContent).join() === 'J', null, 90000);
  check('e. with take-off moved to another key, the prompt shows that key', rebound, (await look()).promptText);
  await page.keyboard.down('Space');
  r = await stepUntil(page, 'm.gull.isAirborne()', 1);
  await page.keyboard.up('Space');
  check('e. the old key no longer takes off', !r.ok);
  await page.keyboard.down('KeyJ');
  r = await stepUntil(page, 'm.gull.isAirborne()', 1);
  await page.keyboard.up('KeyJ');
  check('e. the new key does', r.ok, `after ${r.t.toFixed(2)} s`);
  await page.evaluate(() => window.__gull.game.input.reset());

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  process.exit(finish());
})();
