// End-to-end: accessibility of the screens a player reads and operates, checked with axe-core.
//
//  h. No serious or critical violation on the title, settings, controls, briefing, Ready gate, pause (each page) and
//     review screens.
//
//   node tests/e2e/a11y.e2e.cjs <url>
const axe = require('@axe-core/playwright');
const { launch, openGame, tally, waitGate, waitScreen, waitFor, clickNow } = require('./lib.cjs');

const AxeBuilder = axe.AxeBuilder || axe.default || axe;
const url = process.argv[2] || 'http://127.0.0.1:4173/';
const { check, finish } = tally();

(async () => {
  const browser = await launch();
  const { page, errors } = await openGame(browser, url, { width: 1280, height: 720 });

  const scan = async (name) => {
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const minor = r.violations.length - bad.length;
    check(`h. ${name}: no serious or critical violation`, bad.length === 0, bad.length ? bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`).join(' | ') : `${r.passes.length} rules passed${minor ? `, ${minor} lesser: ${r.violations.map((v) => v.id).join(', ')}` : ''}`);
  };
  const shown = (sel) => waitFor(page, (s) => !!document.querySelector(s), sel, 15000);

  await scan('title');
  await clickNow(page, 'Settings');
  await shown('.gb-settings');
  await scan('settings');
  await clickNow(page, 'Back');
  await clickNow(page, 'Controls');
  await shown('.gb-controls-list');
  await scan('controls');
  await clickNow(page, 'Back');

  await clickNow(page, 'File 1');
  await waitScreen(page, 'briefing');
  await scan('briefing');
  await clickNow(page, 'Read full dossier');
  await shown('.gb-brief-full');
  await scan('briefing, full dossier');

  await clickNow(page, 'Begin operation');
  await waitGate(page, 'ready');
  await scan('Ready gate');
  await clickNow(page, 'Keyboard only');
  await waitGate(page, 'flying');
  await page.keyboard.press('Escape');
  await waitGate(page, 'paused');
  await shown('.gb-orders-page');
  await scan('pause: orders');
  for (const [tab, sel] of [
    ['Controls', '.gb-controls-list'],
    ['Radio log', '.gb-log'],
    ['Settings', '.gb-settings'],
  ]) {
    await clickNow(page, tab);
    await shown(sel);
    await scan(`pause: ${tab.toLowerCase()}`);
  }
  await clickNow(page, 'Restart operation');
  await shown('[role="alertdialog"]');
  await scan('pause: confirm restart');
  await clickNow(page, 'Cancel');

  // The reviews: the operation is ended for the test (its own flying is the missions suite's business). First lost,
  // then, after "Try again", won.
  const review = () =>
    page.evaluate(() => {
      const g = window.__gull.game;
      const buttons = [...document.querySelectorAll('.gb-results .gb-sheet-foot button')].map((b) => b.textContent.trim());
      return { screen: g.state.screen, outcome: g.state.results?.outcome, buttons, focus: document.activeElement?.textContent?.trim() ?? '', done: g.state.saved.done, best: Object.keys(g.state.saved.best), stamp: document.querySelector('.gb-results .gb-stamp')?.textContent ?? '', approach: document.querySelector('.gb-approach')?.textContent ?? '', stored: localStorage.getItem('gull-britannia.progress') };
    });
  await page.evaluate(() => {
    const g = window.__gull.game;
    g.resume();
    g.frozen = true;
    g.mission.compromise(0.2);
    for (let i = 0; i < 600 && g.state.screen !== 'results'; i++) g.step(1 / 60);
  });
  check('the Compromised review comes up', await waitScreen(page, 'results', 15000));
  await shown('.gb-results');
  let rv = await review();
  check('compromised: the review says so, and offers another go first', rv.outcome === 'compromised' && rv.stamp === 'Compromised' && rv.buttons[0] === 'Try again' && rv.focus === 'Try again', `${rv.stamp}: ${rv.buttons.join(' / ')}`);
  check('compromised: it is not filed as done, is not a best run, and opens no further file', rv.done.length === 0 && rv.best.length === 0 && !rv.buttons.some((b) => /File 2/.test(b)) && !/m1/.test(rv.stored ?? ''), `done ${JSON.stringify(rv.done)}, stored ${rv.stored}`);
  await scan('review, compromised');
  await clickNow(page, 'Try again');
  await waitGate(page, 'flying');
  await page.evaluate(() => {
    const g = window.__gull.game;
    g.frozen = true;
    const m = g.mission;
    m.skipTutorial();
    m.delivered = true;
    m.lunchDone = true;
    for (let i = 0; i < 600 && g.state.screen !== 'results'; i++) g.step(1 / 60);
  });
  check('the review comes up', await waitScreen(page, 'results', 15000));
  await shown('.gb-approach');
  rv = await review();
  check('complete: the review names the approach, files the operation and offers File 2', rv.outcome === 'complete' && /Approach: Ghost/.test(rv.approach) && rv.done.includes('m1') && /Proceed to File 2/.test(rv.buttons[0] ?? ''), `${rv.approach} | ${rv.buttons.join(' / ')}`);
  await scan('review');

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  process.exit(finish());
})();
