/**
 * One message system for everything the game says in play: six kinds of message, five fixed places on the screen, and
 * a rule for each place, so that nothing is ever drawn over anything else.
 *
 *   kind        slot     where                  rule
 *   radio       radio    bottom centre          one line at a time, at reading speed, queued by priority
 *   prompt      prompt   above the radio        one instruction, the coach's (coach.ts): set, not queued
 *   objective   order    in the orders card     a change of orders ("Done: …", "New order: …"), one at a time
 *   toast       feed     under the orders card  small events: three at most on show, repeats merge
 *   alert       stamp    top centre             SPOTTED and the like: shown at once, a banner gives way
 *   banner      stamp    top centre             announcements: wait for an alert to clear
 *
 * A slot holds one thing (the feed, three), so two messages can only meet in a queue, never on the screen. The
 * interface lays the slots out so that they cannot overlap each other (gull.css), and the browser layout test checks
 * that at three screen sizes.
 *
 * Pure: no DOM and no clock of its own. The controller calls step(dt) with real seconds while the player is flying,
 * so a paused game pauses its messages, and a slowed game (the game-speed assist) does not slow the reading.
 */
import type { Tone } from '../game/mission';

/** Radio is read at about this many characters a second while flying… */
export const READING_CPS = 15;
/** …and no line is up for less than this (seconds). */
export const MIN_RADIO_S = 3;
/** A pause between radio lines (seconds), so that a change of line is seen. */
export const RADIO_GAP_S = 0.35;
/** Toasts on show at once. */
export const FEED_MAX = 3;

export type RadioPriority = 'urgent' | 'normal' | 'flavour';
const RANK: Record<RadioPriority, number> = { urgent: 0, normal: 1, flavour: 2 };

/** How long a line stays up (seconds): reading time at `pace` (1 is normal; 1.5 is half as long again). */
export function readingTime(text: string, pace = 1): number {
  return Math.max(MIN_RADIO_S, text.length / READING_CPS) * pace;
}

export interface RadioView {
  id: number;
  speaker: string;
  text: string;
  /** Shown again at the player's request. */
  repeat: boolean;
}

export interface StampView {
  id: number;
  text: string;
  tone: Tone;
  kind: 'alert' | 'banner';
}

export interface OrderNotice {
  id: number;
  text: string;
  change: 'done' | 'new' | 'failed';
}

export interface ToastView {
  id: number;
  text: string;
  tone: Tone;
  /** How many times it has happened while on show ("×2"). */
  count: number;
}

export interface PromptView {
  id: string;
  /** Text with `{action}` tokens: the interface draws the bindings. */
  text: string;
  kind: 'lesson' | 'reminder' | 'action';
  nudged: boolean;
}

/** What is on show now. Replaced, never changed in place, so the interface can compare by identity. */
export interface MessageView {
  radio?: RadioView;
  prompt?: PromptView;
  order?: OrderNotice;
  feed: ToastView[];
  stamp?: StampView;
}

export interface LogEntry {
  id: number;
  /** Mission time (seconds) when it was said. */
  t: number;
  kind: 'radio' | 'alert' | 'banner' | 'objective';
  speaker?: string;
  text: string;
}

interface QueuedRadio extends RadioView {
  priority: RadioPriority;
  /** Seconds spent waiting in the queue. */
  waited: number;
}

interface Timed<T> {
  item: T;
  left: number;
}

export class MessageBus {
  /** Reading-time multiplier: 1 is 15 characters a second; 1.5 and 2 leave lines up longer. */
  pace = 1;
  /** Tests and screenshots: nothing times out while this is set. */
  hold = false;
  /** Mission time (seconds), stamped onto log entries: the controller keeps it current. */
  now = 0;
  /** How many characters of a text the player reads: the controller counts a `{token}` as the label drawn for it. */
  measure: (text: string) => number = (text) => text.length;
  /** Everything said on the radio and every alert, banner and change of orders, oldest first. */
  readonly log: LogEntry[] = [];
  view: MessageView = { feed: [] };

  private seq = 0;
  private radioNow: (Timed<QueuedRadio> & { total: number }) | undefined;
  private radioGap = 0;
  private readonly radioQueue: QueuedRadio[] = [];
  private lastRadio: QueuedRadio | undefined;
  private feed: Timed<ToastView>[] = [];
  private readonly feedQueue: ToastView[] = [];
  private stampNow: Timed<StampView> | undefined;
  private stampWaiting: (Timed<StampView> & { waited: number }) | undefined;
  private orderNow: Timed<OrderNotice> | undefined;
  private readonly orderQueue: OrderNotice[] = [];
  private prompt: PromptView | undefined;
  private dirty = false;

  // ------------------------------------------------------------------ radio

  /** A line on the radio. Urgent lines are heard at once; the rest in turn. */
  radio(speaker: string, text: string, priority: RadioPriority = 'normal'): void {
    const line: QueuedRadio = { id: ++this.seq, speaker, text, repeat: false, priority, waited: 0 };
    this.log.push({ id: line.id, t: this.now, kind: 'radio', speaker, text });
    this.lastRadio = line;
    this.enqueueRadio(line);
  }

  private enqueueRadio(line: QueuedRadio): void {
    const cur = this.radioNow;
    if (!cur && this.radioGap <= 0 && !this.radioQueue.length) {
      this.showRadio(line);
      return;
    }
    if (cur && line.priority === 'urgent' && cur.item.priority !== 'urgent') {
      // Interrupt. A line cut off in its first two thirds is heard again afterwards.
      if (cur.left > cur.total / 3) this.insertRadio({ ...cur.item, waited: 0 }, true);
      this.showRadio(line);
      return;
    }
    this.insertRadio(line, false);
    // Too much waiting to be said: the least urgent, oldest line goes (it is still in the log).
    while (this.radioQueue.length > 5) {
      let drop = 0;
      for (let i = 1; i < this.radioQueue.length; i++) if (RANK[this.radioQueue[i]!.priority] > RANK[this.radioQueue[drop]!.priority]) drop = i;
      this.radioQueue.splice(drop, 1);
    }
  }

  /** Into the queue by priority, first come first served within one (or at the head of its priority). */
  private insertRadio(line: QueuedRadio, atHead: boolean): void {
    const rank = RANK[line.priority];
    let i = 0;
    while (i < this.radioQueue.length && (atHead ? RANK[this.radioQueue[i]!.priority] < rank : RANK[this.radioQueue[i]!.priority] <= rank)) i++;
    this.radioQueue.splice(i, 0, line);
  }

  private showRadio(line: QueuedRadio): void {
    const total = Math.max(MIN_RADIO_S, this.measure(line.text) / READING_CPS) * this.pace;
    this.radioNow = { item: line, left: total, total };
    this.radioGap = 0;
    this.dirty = true;
  }

  /** Say the last radio line again (the player asked). False when there has been none. */
  repeatLast(): boolean {
    const last = this.lastRadio;
    if (!last) return false;
    if (this.radioNow?.item.text === last.text && this.radioNow.item.speaker === last.speaker) {
      this.radioNow.left = this.radioNow.total;
      return true;
    }
    const again: QueuedRadio = { ...last, id: ++this.seq, repeat: true, priority: 'normal', waited: 0 };
    if (!this.radioNow) this.showRadio(again);
    else this.insertRadio(again, true);
    return true;
  }

  /** Lines waiting to be said (tests). */
  get radioWaiting(): number {
    return this.radioQueue.length;
  }

  // ------------------------------------------------------------------ feed, stamp, orders, prompt

  /** A small event: snatched, perched, +40 food. */
  toast(text: string, tone: Tone = 'info'): void {
    const same = this.feed.find((f) => f.item.text === text && f.item.tone === tone);
    if (same) {
      same.item = { ...same.item, count: same.item.count + 1 };
      same.left = this.toastTime(text);
      this.dirty = true;
      return;
    }
    const waiting = this.feedQueue.find((f) => f.text === text && f.tone === tone);
    if (waiting) {
      waiting.count++;
      return;
    }
    const t: ToastView = { id: ++this.seq, text, tone, count: 1 };
    if (this.feed.length < FEED_MAX) {
      this.feed.push({ item: t, left: this.toastTime(text) });
      this.dirty = true;
    } else {
      this.feedQueue.push(t);
      if (this.feedQueue.length > 6) this.feedQueue.shift();
    }
  }

  private toastTime(text: string): number {
    return Math.max(3.5, this.measure(text) / READING_CPS + 1.5) * this.pace;
  }

  /** A state the player must know about now: SPOTTED. Shown at once, for at least 2.5 s. */
  alert(text: string, tone: Tone = 'bad', dur = 2.5): void {
    const s: StampView = { id: ++this.seq, text, tone, kind: 'alert' };
    this.log.push({ id: s.id, t: this.now, kind: 'alert', text });
    const cur = this.stampNow;
    // A banner it interrupts comes back if it had time left.
    if (cur?.item.kind === 'banner' && cur.left > 1) this.stampWaiting = { ...cur, waited: 0 };
    this.stampNow = { item: s, left: Math.max(2.5, dur) * this.pace };
    this.dirty = true;
  }

  /** An announcement: FORMATION BROKEN. Waits for an alert to clear. */
  banner(text: string, tone: Tone = 'info', dur = 2.5): void {
    const s: StampView = { id: ++this.seq, text, tone, kind: 'banner' };
    this.log.push({ id: s.id, t: this.now, kind: 'banner', text });
    const timed = { item: s, left: Math.max(2, dur) * this.pace };
    if (this.stampNow?.item.kind === 'alert') this.stampWaiting = { ...timed, waited: 0 };
    else {
      this.stampNow = timed;
      this.dirty = true;
    }
  }

  /** A change of orders: an objective done or failed, or a new one to act on. */
  objective(text: string, change: OrderNotice['change']): void {
    const n: OrderNotice = { id: ++this.seq, text, change };
    this.log.push({ id: n.id, t: this.now, kind: 'objective', text: `${change === 'done' ? 'Done' : change === 'failed' ? 'Failed' : 'New order'}: ${text}` });
    if (this.orderNow) {
      this.orderQueue.push(n);
      if (this.orderQueue.length > 3) this.orderQueue.shift();
    } else this.showOrder(n);
  }

  private showOrder(n: OrderNotice): void {
    this.orderNow = { item: n, left: (n.change === 'new' ? 4.5 : 3) * this.pace };
    this.dirty = true;
  }

  /** The one instruction on show (the coach's), or none. */
  setPrompt(p: PromptView | undefined): void {
    const cur = this.prompt;
    if (cur?.id === p?.id && cur?.text === p?.text && cur?.nudged === p?.nudged) return;
    this.prompt = p ? { id: p.id, text: p.text, kind: p.kind, nudged: p.nudged } : undefined;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ time

  /** Advance by `dt` real seconds. Returns true when what is on show has changed (the view is then a new object). */
  step(dt: number): boolean {
    if (!this.hold && dt > 0) {
      this.stepRadio(dt);
      this.stepFeed(dt);
      this.stepStamp(dt);
      this.stepOrder(dt);
    }
    return this.flush();
  }

  private stepRadio(dt: number): void {
    for (const q of this.radioQueue) q.waited += dt;
    // Flavour that has waited too long is no longer worth saying.
    for (let i = this.radioQueue.length - 1; i >= 0; i--) if (this.radioQueue[i]!.priority === 'flavour' && this.radioQueue[i]!.waited > 20) this.radioQueue.splice(i, 1);
    const cur = this.radioNow;
    if (cur) {
      cur.left -= dt;
      if (cur.left > 0) return;
      this.radioNow = undefined;
      this.radioGap = this.radioQueue.length ? RADIO_GAP_S : 0;
      this.dirty = true;
      return;
    }
    if (this.radioGap > 0) {
      this.radioGap -= dt;
      if (this.radioGap > 0) return;
    }
    const next = this.radioQueue.shift();
    if (next) this.showRadio(next);
  }

  private stepFeed(dt: number): void {
    let changed = false;
    for (const f of this.feed) f.left -= dt;
    if (this.feed.some((f) => f.left <= 0)) {
      this.feed = this.feed.filter((f) => f.left > 0);
      changed = true;
    }
    while (this.feed.length < FEED_MAX && this.feedQueue.length) {
      const t = this.feedQueue.shift()!;
      this.feed.push({ item: t, left: this.toastTime(t.text) });
      changed = true;
    }
    if (changed) this.dirty = true;
  }

  private stepStamp(dt: number): void {
    const w = this.stampWaiting;
    if (w) w.waited += dt;
    const cur = this.stampNow;
    if (cur) {
      cur.left -= dt;
      if (cur.left > 0) return;
      this.stampNow = undefined;
      this.dirty = true;
    }
    if (w && !this.stampNow) {
      this.stampWaiting = undefined;
      // Old news is not announced.
      if (w.waited < 6) {
        this.stampNow = { item: w.item, left: w.left };
        this.dirty = true;
      }
    }
  }

  private stepOrder(dt: number): void {
    const cur = this.orderNow;
    if (!cur) return;
    cur.left -= dt;
    if (cur.left > 0) return;
    this.orderNow = undefined;
    this.dirty = true;
    const next = this.orderQueue.shift();
    if (next) this.showOrder(next);
  }

  private flush(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const r = this.radioNow?.item;
    this.view = {
      radio: r ? { id: r.id, speaker: r.speaker, text: r.text, repeat: r.repeat } : undefined,
      prompt: this.prompt,
      order: this.orderNow?.item,
      feed: this.feed.map((f) => f.item),
      stamp: this.stampNow?.item,
    };
    return true;
  }

  /** Forget everything on show and waiting (a new operation). The log is emptied too unless `keepLog`. */
  clear(keepLog = false): void {
    this.radioNow = undefined;
    this.radioGap = 0;
    this.radioQueue.length = 0;
    this.lastRadio = undefined;
    this.feed = [];
    this.feedQueue.length = 0;
    this.stampNow = this.stampWaiting = undefined;
    this.orderNow = undefined;
    this.orderQueue.length = 0;
    this.prompt = undefined;
    if (!keepLog) this.log.length = 0;
    this.now = 0;
    this.view = { feed: [] };
    this.dirty = false;
  }
}
