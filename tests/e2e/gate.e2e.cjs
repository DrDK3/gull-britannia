// End-to-end: taking and giving up control, through the real buttons and keys.
//
// Nothing runs and the mission clock does not start until the player has control; Escape pauses and steps back; Resume
// gives control back; Restart puts the day, the tide and the sky back; T scouts; the fps readout stays out of sight
// unless the page is opened with ?debug.
//
//   node tests/e2e/gate.e2e.cjs <url>
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, info = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  (${info})` : ''}`);
};

async function openGame(browser, query = '') {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + query);
  await page.waitForFunction(() => ['title', 'error'].includes(window.__gull?.game.state.screen), null, { timeout: 360000, polling: 500 });
  return { page, errors };
}

const state = (page) =>
  page.evaluate(() => {
    const g = window.__gull.game;
    const m = g.mission;
    return {
      screen: g.state.screen,
      gate: g.state.gate,
      mode: g.state.inputMode,
      refused: g.state.captureRefused,
      elapsed: m ? m.elapsed : -1,
      running: m ? m.running : false,
      epoch: g.epochMs(),
      water: g.waterLevel(),
      locked: !!document.pointerLockElement,
      debugLine: !!document.querySelector('.gb-debug'),
      scouting: m ? m.gull.scouting : false,
      takeoff: m ? m.objectiveState('takeoff') : '',
      focus: document.activeElement ? document.activeElement.textContent.slice(0, 40) : '',
    };
  });
const waitGate = (page, gate, ms = 20000) => page.waitForFunction((g) => window.__gull.game.state.gate === g && window.__gull.game.state.screen === 'playing', gate, { timeout: ms, polling: 100 }).then(() => true, () => false);
const waitScreen = (page, s, ms = 30000) => page.waitForFunction((x) => window.__gull.game.state.screen === x, s, { timeout: ms, polling: 100 }).then(() => true, () => false);
const click = (page, text) => page.click(`button:has-text("${text}")`, { timeout: 20000 });

(async () => {
  const fs = require('fs');
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  let browser;
  try {
    browser = await chromium.launch({ args });
  } catch (e) {
    if (!exe) throw e;
    browser = await chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
  }

  const { page, errors } = await openGame(browser);
  check('loads to the title screen', (await state(page)).screen === 'title');

  // ---------------------------------------------------------------- the Ready gate
  await click(page, 'File 1');
  check('File 1 opens the dossier', await waitScreen(page, 'briefing'));
  await click(page, 'Begin operation');
  check('Begin operation shows the scene at the Ready gate', await waitGate(page, 'ready'));
  const t0 = await state(page);
  check('the day is Saturday 3 June 1967, 13.20 BST', new Date(t0.epoch).toISOString().startsWith('1967-06-03T12:20'), new Date(t0.epoch).toISOString());
  await page.waitForTimeout(1500);
  const t1 = await state(page);
  check('at the gate the mission has not started', t1.elapsed === 0 && !t1.running, `elapsed ${t1.elapsed}`);
  check('at the gate the clock and the tide stand still', t1.epoch === t0.epoch && t1.water === t0.water, `${t1.epoch - t0.epoch} ms`);
  check('no fps or camera readout without ?debug', !t1.debugLine);

  // ---------------------------------------------------------------- with the mouse
  await click(page, 'Click to fly');
  const mouse = await waitGate(page, 'flying', 6000);
  const tm = await state(page);
  if (mouse) {
    check('Click to fly captures the mouse and starts the mission', tm.locked && tm.running);
    await page.keyboard.press('Escape');
    check('Escape pauses', await waitGate(page, 'paused'));
    const p0 = await state(page);
    check('pausing lets the mouse go', !p0.locked);
    await page.waitForTimeout(1200);
    const p1 = await state(page);
    check('paused: the mission and the clock stand still', p1.elapsed === p0.elapsed && p1.epoch === p0.epoch, `${(p1.elapsed - p0.elapsed).toFixed(3)} s`);
    check('paused: focus is on Resume', p1.focus.startsWith('Resume'), p1.focus);
    await click(page, 'Resume');
    check('Resume captures the mouse again', (await waitGate(page, 'flying', 6000)) && (await state(page)).locked);
    await page.keyboard.press('Escape');
    await waitGate(page, 'paused');
    await page.keyboard.press('Escape');
    check('Escape from the pause menu steps back to the Ready gate, not into flight', await waitGate(page, 'ready', 5000));
  } else {
    // A browser that will not give the capture (some headless builds): the game must stay at the gate, not started.
    check('no capture given: the game stays at the gate and has not started', tm.gate === 'ready' && !tm.running && tm.elapsed === 0, `refusals shown: ${tm.refused}`);
  }

  // ---------------------------------------------------------------- with the keyboard alone
  await click(page, 'Keyboard only');
  check('Keyboard only starts the mission at once', await waitGate(page, 'flying', 6000));
  await page.waitForFunction(() => window.__gull.game.mission.elapsed > 0.3, null, { timeout: 30000, polling: 100 });
  const k0 = await state(page);
  check('flying: the mission runs and the clock moves', k0.running && k0.elapsed > 0.3 && k0.epoch > t0.epoch, `elapsed ${k0.elapsed.toFixed(2)}`);
  check('still no readout in play', !k0.debugLine);
  await page.keyboard.down('KeyT');
  const scout = await page.waitForFunction(() => window.__gull.game.mission.gull.scouting, null, { timeout: 15000, polling: 50 }).then(() => true, () => false);
  await page.keyboard.up('KeyT');
  check('T scouts', scout);
  await page.keyboard.down('Space');
  const off = await page.waitForFunction(() => window.__gull.game.mission.objectiveState('takeoff') === 'done', null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
  await page.keyboard.up('Space');
  check('Space takes off', off);

  // ---------------------------------------------------------------- restart puts the day back
  await page.waitForFunction(() => window.__gull.game.mission.elapsed > 4, null, { timeout: 120000, polling: 200 });
  await page.keyboard.press('Escape');
  check('Escape pauses (keyboard)', await waitGate(page, 'paused'));
  await click(page, 'Restart operation');
  await click(page, 'Restart');
  check('Restart goes straight back to flying', await waitGate(page, 'flying', 20000));
  const r = await state(page);
  check('restart: a fresh mission', r.elapsed < 2 && r.takeoff === 'active', `elapsed ${r.elapsed.toFixed(2)}`);
  check('restart: the clock is back at 13.20', Math.abs(r.epoch - t0.epoch) < 4000, `${((r.epoch - t0.epoch) / 1000).toFixed(1)} s from the start`);
  check('restart: the tide is back', Math.abs(r.water - t0.water) < 0.005, `${(r.water - t0.water).toFixed(4)} m`);

  // ---------------------------------------------------------------- each file has its own day
  const m2 = await page.evaluate(() => {
    const g = window.__gull.game;
    g.toTitle();
    g.startOperation('m2');
    const iso = new Date(g.epochMs()).toISOString();
    g.toTitle();
    return { iso, back: new Date(g.epochMs()).toISOString() };
  });
  check('File 2 is Wednesday 7 June 1967, 10.55 BST', m2.iso.startsWith('1967-06-07T09:55'), m2.iso);
  check('the title screen returns to File 1’s afternoon', m2.back.startsWith('1967-06-03T12:2'), m2.back);
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await page.close();

  // ---------------------------------------------------------------- ?debug
  const dbg = await openGame(browser, '?debug');
  await dbg.page.evaluate(() => {
    window.__gull.game.startOperation('free');
    window.__gull.game.begin('keys');
  });
  const shown = await dbg.page.waitForSelector('.gb-debug', { timeout: 20000 }).then(() => true, () => false);
  check('with ?debug the readout is shown', shown);
  await browser.close();

  const failed = results.filter((x) => !x).length;
  console.log(`${results.length - failed} of ${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
