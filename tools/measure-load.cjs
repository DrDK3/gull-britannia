// Measures the time from opening the page to the title screen, in headless Chromium with software WebGL.
//
//   node tools/measure-load.cjs <url> [runs=3] [query]
//
// Prints each run's milestones (ms since navigation) and the medians. The page records the milestones itself
// (performance marks named "gb:<phase>"); the title time is also measured from outside.
const { chromium } = require('playwright');
const fs = require('fs');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const runs = +(process.argv[3] || 3);
const query = process.argv[4] || '';

(async () => {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const all = [];
  for (let i = 0; i < runs; i++) {
    let browser;
    try {
      browser = await chromium.launch({ args });
    } catch (e) {
      if (!exe) throw e;
      browser = await chromium.launch({ args: [...args, '--headless=new'], executablePath: exe });
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const t0 = Date.now();
    await page.goto(url + query);
    await page.waitForFunction(() => ['title', 'error'].includes(window.__gull?.game.state.screen), null, { timeout: 360000, polling: 100 });
    const title = Date.now() - t0;
    const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('gb:')).map((m) => [m.name.slice(3), Math.round(m.startTime)])));
    all.push({ title, ...marks });
    console.log(`run ${i + 1}:`, JSON.stringify({ title, ...marks }));
    await browser.close();
  }
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const keys = [...new Set(all.flatMap((r) => Object.keys(r)))];
  console.log('median:', JSON.stringify(Object.fromEntries(keys.map((k) => [k, median(all.map((r) => r[k] ?? NaN))]))));
})();
