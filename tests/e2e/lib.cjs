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
  // In a context of its own (axe opens a second page beside the one it checks, which the default context forbids).
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
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
 * still over two frames, and a frame takes seconds on a software renderer: fine for a test's steps, not for timing
 * what a player waits for. The page itself answers at once: it is only the drawing that is slow.)
 */
async function clickNow(page, text, ms = 90000) {
  const h = await page
    .waitForFunction(
      (t) => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes(t) && !el.disabled);
        if (!b) return null;
        b.scrollIntoView({ block: 'nearest' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      text,
      { timeout: ms, polling: 20 },
    )
    .catch(async (e) => {
      // Say what was on the page instead: a bare timeout tells nothing.
      const seen = await page.evaluate(() => ({ screen: window.__gull?.game.state.screen, gate: window.__gull?.game.state.gate, visible: document.visibilityState, buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim().slice(0, 30)) })).catch(() => 'the page did not answer');
      throw new Error(`no button "${text}" to click after ${ms} ms: ${JSON.stringify(seen)} (${e.message.split('\n')[0]})`);
    });
  const at = await h.jsonValue();
  await page.mouse.click(at.x, at.y);
}

/**
 * Wait until the page has drawn `n` more frames. The first frame of a new screen compiles its shaders, and on a
 * software renderer that holds the page for seconds: a test that is about to time something, or to wait with a limit,
 * lets that pass first, as a player reading the screen does.
 */
const drawn = (page, n = 2) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve(true) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

module.exports = { launch, openGame, tally, waitGate, waitScreen, waitFor, click, clickNow, drawn };
