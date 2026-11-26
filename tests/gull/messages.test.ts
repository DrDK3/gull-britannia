import { describe, expect, it } from 'vitest';
import { FEED_MAX, MessageBus, MIN_RADIO_S, READING_CPS, readingTime } from '../../src/gull/app/messages';

const DT = 1 / 60;

/** Step the bus for `seconds`, calling `each` after every step. */
function run(bus: MessageBus, seconds: number, each?: (t: number) => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    bus.step(DT);
    each?.((i + 1) * DT);
  }
}

const LONG = 'Good landing. Bayard’s Cove is south along the river, past the ferry slip. Find a roof with a view and scout the sentry.';

describe('radio at reading speed', () => {
  it('a line stays up for its length at 15 characters a second, and never less than three seconds', () => {
    expect(READING_CPS).toBe(15);
    expect(MIN_RADIO_S).toBe(3);
    expect(readingTime('Better.')).toBe(3);
    expect(readingTime(LONG)).toBeCloseTo(LONG.length / 15, 5);
    expect(readingTime('x'.repeat(140))).toBeCloseTo(9.33, 2);
    // The slower setting leaves it up longer.
    expect(readingTime(LONG, 1.5)).toBeCloseTo((LONG.length / 15) * 1.5, 5);
  });

  it('shows one line at a time, each for its full reading time, in the order said', () => {
    const bus = new MessageBus();
    const lines = ['Afternoon, Scrumpy. Mother here. You’re on the nest. Take off when ready.', LONG, 'Better.'];
    for (const l of lines) bus.radio('Mother', l);
    const upFor = new Map<string, number>();
    const order: string[] = [];
    run(bus, 30, () => {
      const r = bus.view.radio;
      if (!r) return;
      upFor.set(r.text, (upFor.get(r.text) ?? 0) + DT);
      if (order[order.length - 1] !== r.text) order.push(r.text);
    });
    expect(order).toEqual(lines);
    for (const l of lines) expect(upFor.get(l)!, l).toBeGreaterThanOrEqual(readingTime(l) - 2 * DT);
    expect(bus.view.radio).toBeUndefined();
    expect(bus.radioWaiting).toBe(0);
  });

  it('an urgent line is heard at once; the line it cut off is heard again afterwards', () => {
    const bus = new MessageBus();
    bus.radio('Mother', LONG);
    bus.radio('Mother', 'The bakery in the cove has a pasty cooling on its sill. Tastier. Riskier.', 'flavour');
    run(bus, 1);
    expect(bus.view.radio?.text).toBe(LONG);
    bus.radio('Mother', 'Pte. Borovsky has seen you. Break line of sight.', 'urgent');
    bus.step(0);
    expect(bus.view.radio?.text).toMatch(/has seen you/);
    const order: string[] = [bus.view.radio!.text];
    run(bus, 40, () => {
      const t = bus.view.radio?.text;
      if (t && order[order.length - 1] !== t) order.push(t);
    });
    expect(order.map((t) => t.slice(0, 12))).toEqual(['Pte. Borovsk', 'Good landing', 'The bakery i']);
  });

  it('urgent before normal before flavour, and flavour that waits twenty seconds is dropped', () => {
    const bus = new MessageBus();
    bus.radio('Mother', 'x'.repeat(140)); // on show for 9.3 s
    bus.radio('Mother', 'Flavour one, which will have gone stale.', 'flavour');
    bus.radio('Mother', 'Normal one.');
    bus.radio('Mother', 'y'.repeat(140)); // normal: another 9.3 s
    bus.radio('Mother', 'Urgent two.', 'urgent');
    bus.step(0);
    const order: string[] = [bus.view.radio!.text];
    run(bus, 60, () => {
      const t = bus.view.radio?.text;
      if (t && order[order.length - 1] !== t) order.push(t);
    });
    expect(order.map((t) => t.slice(0, 8))).toEqual(['Urgent t', 'xxxxxxxx', 'Normal o', 'yyyyyyyy']);
    // It was said, so it is in the log all the same.
    expect(bus.log.some((l) => l.text.startsWith('Flavour one'))).toBe(true);
  });

  it('repeats the last line on request, and logs every line once with its time', () => {
    const bus = new MessageBus();
    expect(bus.repeatLast()).toBe(false);
    bus.now = 2;
    bus.radio('Mother', 'First line.');
    run(bus, 4);
    bus.now = 6;
    bus.radio('Mother', 'Second line.');
    run(bus, 5);
    expect(bus.view.radio).toBeUndefined();
    expect(bus.repeatLast()).toBe(true);
    bus.step(0);
    expect(bus.view.radio).toMatchObject({ text: 'Second line.', repeat: true });
    run(bus, 4);
    expect(bus.view.radio).toBeUndefined();
    expect(bus.log.filter((l) => l.kind === 'radio').map((l) => [l.t, l.text])).toEqual([
      [2, 'First line.'],
      [6, 'Second line.'],
    ]);
  });

  it('holds everything while `hold` is set', () => {
    const bus = new MessageBus();
    bus.hold = true;
    bus.radio('Mother', 'Better.');
    bus.toast('Perched: Station roof');
    bus.alert('SPOTTED');
    run(bus, 60);
    expect(bus.view.radio?.text).toBe('Better.');
    expect(bus.view.feed).toHaveLength(1);
    expect(bus.view.stamp?.text).toBe('SPOTTED');
  });
});

describe('the other slots', () => {
  it('the feed shows three toasts at most, merges repeats and lets the rest wait', () => {
    const bus = new MessageBus();
    for (const t of ['Snatched: Chip', '+10 FOOD', '+5 BONUS', 'Perched: Bench', 'Set down: Chip']) bus.toast(t, 'food');
    bus.toast('+10 FOOD', 'food');
    bus.step(0);
    expect(bus.view.feed).toHaveLength(FEED_MAX);
    expect(bus.view.feed.map((f) => [f.text, f.count])).toEqual([
      ['Snatched: Chip', 1],
      ['+10 FOOD', 2],
      ['+5 BONUS', 1],
    ]);
    let most = 0;
    const seen = new Set<string>();
    run(bus, 12, () => {
      most = Math.max(most, bus.view.feed.length);
      for (const f of bus.view.feed) seen.add(f.text);
    });
    expect(most).toBe(FEED_MAX);
    expect([...seen].sort()).toEqual(['+10 FOOD', '+5 BONUS', 'Perched: Bench', 'Set down: Chip', 'Snatched: Chip'].sort());
    expect(bus.view.feed).toHaveLength(0);
  });

  it('the stamp slot holds one thing: an alert pre-empts a banner, which comes back if it is still news', () => {
    const bus = new MessageBus();
    bus.banner('FORMATION BROKEN', 'good', 2.5);
    bus.step(0);
    expect(bus.view.stamp).toMatchObject({ text: 'FORMATION BROKEN', kind: 'banner' });
    run(bus, 0.5);
    bus.alert('SPOTTED', 'bad', 2);
    bus.step(0);
    expect(bus.view.stamp).toMatchObject({ text: 'SPOTTED', kind: 'alert' });
    run(bus, 2.6);
    expect(bus.view.stamp?.text).toBe('FORMATION BROKEN');
    run(bus, 3);
    expect(bus.view.stamp).toBeUndefined();
    // A banner that arrives during an alert waits its turn.
    bus.alert('SPOTTED', 'bad', 2);
    bus.banner('LATER NEWS', 'info');
    bus.step(0);
    expect(bus.view.stamp?.text).toBe('SPOTTED');
    run(bus, 2.6);
    expect(bus.view.stamp?.text).toBe('LATER NEWS');
    run(bus, 3);
    expect(bus.view.stamp).toBeUndefined();
    // An alert replaces an alert at once.
    bus.alert('SUSPICIOUS', 'warn', 1.2);
    bus.alert('SPOTTED', 'bad', 2);
    bus.step(0);
    expect(bus.view.stamp?.text).toBe('SPOTTED');
    // A banner that has waited too long behind alerts is old news.
    bus.banner('STALE', 'info');
    for (let i = 0; i < 4; i++) {
      run(bus, 2);
      bus.alert('SPOTTED', 'bad', 2.5);
    }
    run(bus, 3);
    expect(bus.view.stamp).toBeUndefined();
  });

  it('changes of orders are shown one at a time, and logged', () => {
    const bus = new MessageBus();
    bus.objective('Take off from the nest', 'done');
    bus.objective('Land on the station roof', 'new');
    bus.step(0);
    expect(bus.view.order).toMatchObject({ change: 'done', text: 'Take off from the nest' });
    run(bus, 3.1);
    expect(bus.view.order).toMatchObject({ change: 'new', text: 'Land on the station roof' });
    run(bus, 5);
    expect(bus.view.order).toBeUndefined();
    expect(bus.log.map((l) => l.text)).toEqual(['Done: Take off from the nest', 'New order: Land on the station roof']);
  });

  it('the prompt is set, not queued, and the view changes only when the prompt does', () => {
    const bus = new MessageBus();
    bus.setPrompt({ id: 'takeoff', text: 'Hold {flap} to take off.', kind: 'lesson', nudged: false });
    expect(bus.step(DT)).toBe(true);
    const view = bus.view;
    bus.setPrompt({ id: 'takeoff', text: 'Hold {flap} to take off.', kind: 'lesson', nudged: false });
    expect(bus.step(DT)).toBe(false);
    expect(bus.view).toBe(view);
    bus.setPrompt(undefined);
    expect(bus.step(DT)).toBe(true);
    expect(bus.view.prompt).toBeUndefined();
  });

  it('a new operation starts with nothing on show', () => {
    const bus = new MessageBus();
    bus.radio('Mother', 'Better.');
    bus.toast('x y');
    bus.alert('SPOTTED');
    bus.step(0);
    bus.clear();
    expect(bus.view).toEqual({ feed: [] });
    expect(bus.log).toHaveLength(0);
    expect(bus.step(1)).toBe(false);
  });
});
