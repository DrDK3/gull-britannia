// End-to-end: the HUD's layout, at 1024×768, 1280×720 and 1920×1080.
//
//  g. In the busiest state that can be staged (a radio line of full length, three toasts, an alert, a prompt, a change
//     of orders, the orders card, the gull's status, the stealth readouts, a tagged guard's label and the pointer to an
//     objective out of view) no two HUD boxes intersect and every one is wholly on screen. Text is on a solid plate and
//     at least 16 px on a 1080-line screen.
//  i. At the Ready gate the card does not cover the gull (backlog F-1), and on the nest the readout gives a height
//     that makes sense on a roof (F-2).
//
//   node tests/e2e/layout.e2e.cjs <url>
const { launch, openGame, tally, waitGate, waitFor } = require('./lib.cjs');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const { check, finish } = tally();
const SIZES = [
  [1024, 768],
  [1280, 720],
  [1920, 1080],
];

/** Wait for the game to have drawn `n` more frames (labels are placed, and the HUD published, with the frame). */
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

/** Put the game into the busiest state there is. The mission's own calls are used, so the boxes are the real ones. */
function stage() {
  const g = window.__gull.game;
  g.frozen = true;
  g.messages.hold = true;
  const m = g.mission;
  m.skipTutorial();
  const gp = m.gutterPerch.pos;
  m.gull.spawn({ e: gp.e, n: gp.n, h: gp.h + 0.35 }, Math.PI / 2, -0.4);
  // Perched there, so that the coach has something to say (its "closer look" lesson).
  m.gull.perch = m.gutterPerch;
  m.sentry.tagged = true;
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  m.toast('Snatched: The clerk’s chips', 'food');
  m.toast('+10 FOOD — Chip eaten', 'food');
  m.toast('Perched: Custom House gutter', 'info');
  m.banner('LINE OF SIGHT BROKEN', 'warn', 2);
  // The longest line the rules allow: 140 characters.
  m.say('Mother', 'Private Borovsky. Creature of habit: post, tea, river, fort, and round again. Note when his back is turned. Note also: he loves his tea. Do.');
  for (let i = 0; i < 3; i++) g.step(1 / 60);
  return true;
}

/** Every HUD box on screen: the fixed ones and the labels pinned to the world. */
function measure() {
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0;
  };
  const alpha = (colour) => {
    const m = /rgba?\(([^)]+)\)/.exec(colour);
    if (!m) return 1;
    const parts = m[1].split(/[,/]/).map((x) => parseFloat(x));
    return parts.length > 3 ? parts[3] : 1;
  };
  const boxes = [];
  for (const el of document.querySelectorAll('[data-hud], [data-label]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    let smallest = Infinity;
    let hasText = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      hasText = true;
      smallest = Math.min(smallest, parseFloat(getComputedStyle(n.parentElement).fontSize));
    }
    // The plate behind the text: the box itself, or for a label its parts.
    const plates = el.dataset.hud ? [el] : [...el.children];
    boxes.push({
      name: el.dataset.hud ? el.dataset.hud : `label:${el.dataset.label}`,
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      text: el.textContent.slice(0, 40),
      smallest: hasText ? smallest : null,
      plate: hasText ? Math.min(...plates.map((p) => alpha(getComputedStyle(p).backgroundColor))) : null,
    });
  }
  return { boxes, width: window.innerWidth, height: window.innerHeight };
}

(async () => {
  const browser = await launch();
  const { page, errors } = await openGame(browser, url, { width: 1024, height: 768 });
  // The picture is drawn coarse for this suite: it measures the HUD, and a full-size frame takes seconds to draw.
  await page.evaluate(() => window.__gull.game.view.setDynamicScale(0.3));

  for (const [w, hgt] of SIZES) {
    const at = `${w}×${hgt}`;
    await page.setViewportSize({ width: w, height: hgt });
    await page.evaluate(() => {
      const g = window.__gull.game;
      g.frozen = false;
      g.messages.hold = false;
      g.startOperation('m1');
    });
    await waitGate(page, 'ready');
    await drawn(page, 3);

    // ---------------------------------------------------------------- i. the Ready card and the gull
    const gate = await page.evaluate(() => {
      const g = window.__gull.game;
      const gull = g.mission.gull;
      const s = g.view.screenOf(gull.pos.e, gull.pos.n, gull.pos.h);
      const c = document.querySelector('.gb-ready-card').getBoundingClientRect();
      const go = [...document.querySelectorAll('.gb-ready-card button')].find((b) => b.textContent.includes('Click to fly')).getBoundingClientRect();
      return { x: (s.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - s.y * 0.5) * window.innerHeight, behind: s.behind, card: { x: c.left, y: c.top, w: c.width, h: c.height }, goInView: go.top >= 0 && go.bottom <= window.innerHeight, width: window.innerWidth, height: window.innerHeight };
    });
    // The gull with room about it: a twelfth of the screen's height each way.
    const pad = gate.height / 12;
    const clear = gate.x + pad < gate.card.x || gate.x - pad > gate.card.x + gate.card.w || gate.y + pad < gate.card.y || gate.y - pad > gate.card.y + gate.card.h;
    const onScreen = !gate.behind && gate.x > 0 && gate.x < gate.width && gate.y > 0 && gate.y < gate.height;
    check(`i. ${at}: at the Ready gate the gull is on screen and the card is clear of it`, onScreen && clear && gate.goInView, `gull at ${Math.round(gate.x)},${Math.round(gate.y)}; card ${Math.round(gate.card.x)},${Math.round(gate.card.y)} ${Math.round(gate.card.w)}×${Math.round(gate.card.h)}`);

    await page.evaluate(() => window.__gull.game.begin('keys'));
    await waitGate(page, 'flying');
    const readout = await page.evaluate(() => document.querySelector('.gb-readout')?.textContent ?? '');
    const height = +(/Height\s*(\d+)\s*m/.exec(readout)?.[1] ?? -1);
    check(`i. ${at}: on the nest the readout gives the roof's height, not zero`, height >= 10 && height <= 25, readout);

    // ---------------------------------------------------------------- g. the busiest state
    await page.evaluate(stage);
    const placed = await waitFor(page, () => getComputedStyle(document.querySelector('[data-label="borovsky"]') ?? document.body).visibility === 'visible' && !!document.querySelector('[data-label="borovsky"]'), null, 180000);
    await drawn(page, 2);
    const m = await page.evaluate(measure);
    const names = m.boxes.map((b) => b.name);
    const want = ['status', 'orders', 'stamp', 'prompt', 'radio', 'label:borovsky'];
    const missing = want.filter((n) => !names.includes(n));
    const toasts = names.filter((n) => n === 'toast').length;
    check(`g. ${at}: the busiest state is on screen`, placed && missing.length === 0 && toasts === 3, `${names.join(' ')}${missing.length ? ` — missing ${missing.join(' ')}` : ''}`);
    const off = m.boxes.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > m.width + 0.5 || b.y + b.h > m.height + 0.5);
    check(`g. ${at}: every HUD box is wholly on screen`, off.length === 0, off.map((b) => `${b.name} at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`).join('; '));
    const clashes = [];
    for (let i = 0; i < m.boxes.length; i++) {
      for (let j = i + 1; j < m.boxes.length; j++) {
        const a = m.boxes[i];
        const b = m.boxes[j];
        if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) clashes.push(`${a.name} × ${b.name}`);
      }
    }
    check(`g. ${at}: no two HUD boxes intersect`, clashes.length === 0, clashes.length ? clashes.join('; ') : `${m.boxes.length} boxes`);
    const floor = hgt >= 1080 ? 16 : 14;
    const small = m.boxes.filter((b) => b.smallest !== null && b.smallest < floor - 0.01);
    check(`g. ${at}: HUD text is at least ${floor} px`, small.length === 0, small.length ? small.map((b) => `${b.name} ${b.smallest}px`).join('; ') : `smallest ${Math.min(...m.boxes.filter((b) => b.smallest !== null).map((b) => b.smallest)).toFixed(1)} px`);
    const thin = m.boxes.filter((b) => b.plate !== null && b.plate < 0.85);
    check(`g. ${at}: HUD text sits on a solid plate`, thin.length === 0, thin.map((b) => `${b.name} ${b.plate}`).join('; '));

    await page.evaluate(() => {
      const g = window.__gull.game;
      g.frozen = false;
      g.messages.hold = false;
      g.toTitle();
    });
  }

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  process.exit(finish());
})();
