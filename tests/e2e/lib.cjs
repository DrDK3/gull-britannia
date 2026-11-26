// Shared by the end-to-end suites: starting Chromium with software WebGL, opening the game, and a pass/fail tally.
const fs = require('fs');
const { chromium } = require('playwright');

/** Chromium: Playwright's own where it has one, else a preinstalled one (CHROMIUM_PATH, or /opt/pw-browsers). */
async function launch() {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch (e) {
    if (!exe) throw e;
    return chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
  }
}

/** Open the game and wait for its title screen. */
async function openGame(browser, url, viewport = { width: 800, height: 450 }, query = '') {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(url + query);
  await page.waitForFunction(() => ['title', 'error'].includes(window.__gull?.game.state.screen), null, { timeout: 360000, polling: 100 });
  return { page, errors, loadMs: Date.now() - t0 };
}

/** A tally: check(name, ok, info) prints PASS or FAIL; finish() prints the count and returns the exit code. */
function tally() {
  const results = [];
  return {
    check(name, ok, info = '') {
      results.push(!!ok);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  (${info})` : ''}`);
    },
    finish() {
      const failed = results.filter((x) => !x).length;
      console.log(`${results.length - failed} of ${results.length} passed`);
      return failed ? 1 : 0;
    },
  };
}

const waitGate = (page, gate, ms = 20000) => page.waitForFunction((g) => window.__gull.game.state.gate === g && window.__gull.game.state.screen === 'playing', gate, { timeout: ms, polling: 50 }).then(() => true, () => false);
const waitScreen = (page, s, ms = 30000) => page.waitForFunction((x) => window.__gull.game.state.screen === x, s, { timeout: ms, polling: 50 }).then(() => true, () => false);
const waitFor = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
const click = (page, text) => page.click(`button:has-text("${text}")`, { timeout: 20000 });

/**
 * A real mouse click on a button, sent the moment the button exists. (page.click first waits for the element to hold
 * still over two frames, and a frame takes up to a second on a software renderer: fine for a test's steps, not for
 * timing what a player waits for.)
 */
async function clickNow(page, text, ms = 20000) {
  const h = await page.waitForFunction((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t) && !b.disabled), text, { timeout: ms, polling: 20 });
  const box = await h.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

module.exports = { launch, openGame, tally, waitGate, waitScreen, waitFor, click, clickNow };
