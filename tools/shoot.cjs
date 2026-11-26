// Screenshots of the running game (or any page it serves), with real input, in headless Chromium.
//
//   node tools/shoot.cjs <url> <outdir> <steps.json>
//
// The steps file is a JSON array; each step may have any of:
//   { "early": "name" }            a shot taken as soon as the page opens (the loading screen)
//   { "eval": "js" }               run in the page; a returned value is printed
//   { "click": "css or text=…" }   a real click
//   { "press": "Escape" }          a key press;  { "down": "KeyW" } / { "up": "KeyW" } to hold one
//   { "wait": 1500 }               milliseconds
//   { "shot": "name" }             writes <outdir>/<name>.png
// Steps run in order; within a step: eval, click, press, down, up, wait, shot.
//
// By default it waits for the game's title screen first; add NOWAIT=1 for pages that are not the game (a studio page).
// Size: W and H (default 1280×720). QUERY is appended to the URL ("?debug", "?quality=high").
//
// Under software rendering one frame of the full town takes about a second at 1280×720, so a shot can take a minute
// or two. Use W=640 H=360 while iterating. To pose a scene, step the game from "eval" with game.frozen = true
// (see tests/e2e/missions.e2e.cjs for the hooks on window.__gull).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [url, out, stepsFile] = process.argv.slice(2);
if (!url || !out || !stepsFile) {
  console.error('usage: node tools/shoot.cjs <url> <outdir> <steps.json>');
  process.exit(2);
}
const steps = JSON.parse(fs.readFileSync(path.resolve(stepsFile), 'utf8'));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  let browser;
  try {
    browser = await chromium.launch({ args });
  } catch (e) {
    if (!exe) throw e;
    browser = await chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
  }
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: 1 });
  const t0 = Date.now();
  const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
  page.on('console', (m) => {
    const t = m.text();
    if (/toNonIndexed|GPU stall/.test(t)) return;
    if (m.type() === 'error' || m.type() === 'warning') log('[console]', m.type(), t.slice(0, 300));
  });
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  await page.goto(url + (process.env.QUERY || ''));
  const early = steps.find((s) => s.early);
  if (early) {
    try {
      await page.screenshot({ path: path.join(out, `${early.early}.png`), timeout: 120000 });
      log('shot', early.early);
    } catch {
      log('early shot failed');
    }
  }
  if (!process.env.NOWAIT) {
    await page.waitForFunction(() => ['title', 'error'].includes(window.__gull?.game.state.screen), null, { timeout: 360000, polling: 250 });
    log('ready:', await page.evaluate(() => window.__gull.game.state.screen));
  }
  let failed = 0;
  for (const s of steps) {
    try {
      if (s.eval) {
        const r = await page.evaluate(s.eval);
        if (r !== undefined) log('eval', JSON.stringify(r).slice(0, 3000));
      }
      if (s.click) {
        await page.click(s.click, { timeout: 15000 });
        log('click', s.click);
      }
      if (s.press) await page.keyboard.press(s.press);
      if (s.down) await page.keyboard.down(s.down);
      if (s.up) await page.keyboard.up(s.up);
      if (s.wait) await page.waitForTimeout(s.wait);
      if (s.shot) {
        await page.screenshot({ path: path.join(out, `${s.shot}.png`), timeout: 240000 });
        log('shot', s.shot);
      }
    } catch (e) {
      failed++;
      log('STEP FAILED', JSON.stringify(s).slice(0, 120), String(e.message).split('\n')[0]);
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
