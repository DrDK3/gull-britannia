/**
 * Sound, made in the browser (Web Audio): every effect is synthesised, and the music is an original spy-jazz score
 * played by a little sequencer (walking bass, brushes, vibraphone; brass stabs when the chase is on). No audio files.
 */
import type { V3 } from '../game/world';

type Voice = (ctx: AudioContext, out: AudioNode, t: number, rate: number) => void;

const dB = (g: number) => Math.pow(10, g / 20);
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function env(ctx: AudioContext, out: AudioNode, t: number, a: number, d: number, peak = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

export class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private fxBus?: GainNode;
  private musicBus?: GainNode;
  private noise?: AudioBuffer;
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }>();
  private vol = { master: 0.8, music: 0.6, effects: 0.9 };
  private track = '';
  private nextBeat = 0;
  private beat = 0;
  private timer?: ReturnType<typeof setInterval>;
  /** The listener (the camera), for distance. */
  listener: V3 = { e: 0, n: 0, h: 0 };

  /** Start (or resume) on a user gesture: browsers keep sound off until then. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.fxBus = ctx.createGain();
      this.fxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (s / 0x7fffffff) * 2 - 1;
      }
      this.applyVolumes();
      this.timer = setInterval(() => this.schedule(), 40);
      const t = this.track;
      this.track = '';
      if (t) this.music(t);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, music: number, effects: number): void {
    this.vol = { master, music, effects };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus!.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
    this.fxBus!.gain.setTargetAtTime(this.vol.effects, t, 0.05);
  }

  private noiseSrc(t: number, dur: number, out: AudioNode, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise!;
    s.playbackRate.value = rate;
    s.connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  private filter(type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(out);
    return b;
  }

  /** Play an effect; `at` (game position) makes it quieter with distance. */
  play(name: string, at?: V3, gainDb = 0, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let g = dB(gainDb);
    if (at) {
      const d = Math.hypot(at.e - this.listener.e, at.n - this.listener.n, at.h - this.listener.h);
      g *= 1 / (1 + d / 10);
      if (g < 0.01) return;
    }
    const out = ctx.createGain();
    out.gain.value = g;
    out.connect(this.fxBus!);
    const t = ctx.currentTime + 0.005;
    const v = this.voices[name];
    if (v) v(ctx, out, t, rate);
    setTimeout(() => out.disconnect(), 2500);
  }

  private readonly voices: Record<string, Voice> = {
    flap: (ctx, out, t, r) => {
      const f = this.filter('bandpass', 700 * r, 1.2, env(ctx, out, t, 0.01, 0.12, 0.5));
      this.noiseSrc(t, 0.14, f);
    },
    land: (ctx, out, t) => {
      osc(ctx, 'sine', 140, 60, t, 0.12, env(ctx, out, t, 0.005, 0.12, 0.6));
      this.noiseSrc(t, 0.08, this.filter('lowpass', 900, 0.7, env(ctx, out, t, 0.005, 0.08, 0.3)));
    },
    splash: (ctx, out, t) => {
      const f = this.filter('lowpass', 2500, 0.8, env(ctx, out, t, 0.01, 0.45, 0.6));
      f.frequency.exponentialRampToValueAtTime(400, t + 0.45);
      this.noiseSrc(t, 0.5, f);
      osc(ctx, 'sine', 500, 150, t, 0.15, env(ctx, out, t, 0.005, 0.15, 0.25));
    },
    plop: (ctx, out, t, r) => {
      osc(ctx, 'sine', 900 * r, 250 * r, t, 0.09, env(ctx, out, t, 0.003, 0.09, 0.4));
    },
    bonk: (ctx, out, t, r) => {
      osc(ctx, 'square', 320 * r, 110 * r, t, 0.16, this.filter('lowpass', 1400, 1, env(ctx, out, t, 0.003, 0.16, 0.35)));
      this.noiseSrc(t, 0.05, env(ctx, out, t, 0.002, 0.05, 0.3));
    },
    skim: (ctx, out, t) => {
      this.noiseSrc(t, 0.35, this.filter('highpass', 2500, 0.7, env(ctx, out, t, 0.02, 0.3, 0.3)));
    },
    poop: (ctx, out, t) => {
      osc(ctx, 'sine', 950, 480, t, 0.06, env(ctx, out, t, 0.003, 0.06, 0.25));
    },
    splat: (ctx, out, t, r) => {
      this.noiseSrc(t, 0.16, this.filter('lowpass', 1100 * r, 1, env(ctx, out, t, 0.002, 0.15, 0.7)));
      osc(ctx, 'sine', 220 * r, 70, t, 0.12, env(ctx, out, t, 0.002, 0.12, 0.5));
    },
    grab: (ctx, out, t, r) => {
      osc(ctx, 'triangle', 520 * r, 920 * r, t, 0.08, env(ctx, out, t, 0.003, 0.08, 0.35));
    },
    gulp: (ctx, out, t, r) => {
      const o = osc(ctx, 'sine', 320 * r, 110 * r, t, 0.28, env(ctx, out, t, 0.01, 0.27, 0.5));
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 18;
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.3);
    },
    deliver: (ctx, out, t) => {
      [660, 990].forEach((f, i) => osc(ctx, 'triangle', f, f, t + i * 0.12, 0.4, env(ctx, out, t + i * 0.12, 0.005, 0.4, 0.4)));
    },
    objective: (ctx, out, t) => {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => osc(ctx, 'triangle', f, f, t + i * 0.08, 0.35, env(ctx, out, t + i * 0.08, 0.005, 0.35, 0.3)));
    },
    tag: (ctx, out, t) => {
      [1200, 1600].forEach((f, i) => osc(ctx, 'sine', f, f, t + i * 0.09, 0.07, env(ctx, out, t + i * 0.09, 0.003, 0.07, 0.3)));
    },
    alert: (ctx, out, t) => {
      for (const n of [58, 61, 65, 70]) osc(ctx, 'sawtooth', midi(n), midi(n), t, 0.5, this.filter('lowpass', 1800, 1, env(ctx, out, t, 0.01, 0.5, 0.18)));
    },
    lost: (ctx, out, t) => {
      osc(ctx, 'triangle', 620, 300, t, 0.45, env(ctx, out, t, 0.01, 0.45, 0.35));
    },
    huh: (ctx, out, t, r) => {
      const f = this.filter('bandpass', 900, 3, env(ctx, out, t, 0.02, 0.28, 0.6));
      osc(ctx, 'sawtooth', 150 * r, 230 * r, t, 0.3, f);
    },
    whistle: (ctx, out, t) => {
      const g = env(ctx, out, t, 0.01, 0.6, 0.25);
      const o = osc(ctx, 'sine', 2600, 2600, t, 0.62, g);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 26;
      lg.gain.value = 180;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.65);
    },
    throw: (ctx, out, t) => {
      const f = this.filter('bandpass', 400, 2, env(ctx, out, t, 0.05, 0.3, 0.5));
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
      this.noiseSrc(t, 0.35, f);
    },
    tea: (ctx, out, t) => {
      osc(ctx, 'sine', 2100, 2100, t, 0.15, env(ctx, out, t, 0.002, 0.15, 0.25));
      this.noiseSrc(t + 0.03, 0.25, this.filter('bandpass', 1600, 1, env(ctx, out, t + 0.03, 0.01, 0.25, 0.3)));
    },
    squawk: (ctx, out, t, r) => {
      // A herring gull's "kyow-kyow-kyow".
      for (let i = 0; i < 3; i++) {
        const t0 = t + i * 0.19;
        const f = this.filter('bandpass', 1500 * r, 2.5, env(ctx, out, t0, 0.015, 0.15, 0.5));
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(800 * r, t0);
        o.frequency.linearRampToValueAtTime(1350 * r, t0 + 0.05);
        o.frequency.exponentialRampToValueAtTime(700 * r, t0 + 0.17);
        o.connect(f);
        o.start(t0);
        o.stop(t0 + 0.2);
      }
    },
    flock: (ctx, out, t) => {
      for (let i = 0; i < 4; i++) this.voices.squawk!(ctx, out, t + i * 0.13, 0.85 + i * 0.09);
    },
    stomp: (ctx, out, t) => {
      this.noiseSrc(t, 0.06, this.filter('lowpass', 600, 0.7, env(ctx, out, t, 0.002, 0.06, 0.4)));
    },
  };

  /** A looping bed: 'water' (lapping) and 'wind' (rush, with speed). */
  loop(name: string, on: boolean, gainDb = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cur = this.loops.get(name);
    if (!on) {
      if (cur) {
        cur.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => cur.src.stop(), 800);
        this.loops.delete(name);
      }
      return;
    }
    if (cur) {
      cur.gain.gain.setTargetAtTime(dB(gainDb), ctx.currentTime, 0.1);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = name === 'wind' ? 'bandpass' : 'lowpass';
    filter.frequency.value = name === 'wind' ? 500 : 420;
    filter.Q.value = name === 'wind' ? 0.6 : 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(dB(gainDb), ctx.currentTime, 0.3);
    src.connect(filter).connect(gain).connect(this.fxBus!);
    src.start();
    this.loops.set(name, { src, gain, filter });
  }

  /** Wind with airspeed (m/s). */
  setWind(speed: number): void {
    const l = this.loops.get('wind');
    if (!l || !this.ctx) {
      if (this.ctx) this.loop('wind', true, -40);
      return;
    }
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / 30);
    l.gain.gain.setTargetAtTime(0.02 + 0.22 * k * k, t, 0.15);
    l.filter.frequency.setTargetAtTime(350 + 1400 * k, t, 0.15);
  }

  // ------------------------------------------------------------------ music

  music(name: string): void {
    if (name === this.track) return;
    this.track = name;
    this.beat = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.track || ctx.state !== 'running') return;
    const tempo = { title: 92, mission: 116, free: 100, chase: 152, results: 96 }[this.track] ?? 110;
    const spb = 60 / tempo / 2; // eighth notes
    while (this.nextBeat < ctx.currentTime + 0.15) {
      this.playStep(this.nextBeat, this.beat, spb);
      // Swing the off-beats a little.
      this.nextBeat += spb * (this.beat % 2 === 0 ? 1.18 : 0.82);
      this.beat++;
    }
  }

  private playStep(t: number, b: number, spb: number): void {
    const ctx = this.ctx!;
    const out = this.musicBus!;
    const track = this.track;
    const bar = Math.floor(b / 8);
    const step = b % 8;
    // E minor walking bass, two bars a phrase; the chase keeps to an ostinato.
    const walk = [[40, 43, 45, 46, 47, 45, 43, 42], [40, 38, 36, 35, 36, 38, 39, 40]];
    const chase = [40, 40, 43, 40, 46, 45, 43, 38];
    const bassNote = track === 'chase' ? chase[step]! : step % 2 === 0 ? walk[bar % 2]![step]! : -1;
    if (bassNote > 0) {
      const g = env(ctx, out, t, 0.01, spb * (track === 'chase' ? 0.9 : 1.7), track === 'results' ? 0.25 : 0.38);
      osc(ctx, 'triangle', midi(bassNote), midi(bassNote), t, spb * 2, this.filter('lowpass', 700, 0.8, g));
    }
    // Brushes on the off-beats; a snare on 2 and 4 when chasing.
    if (track !== 'title' || bar % 4 > 0) {
      if (step % 2 === 1) this.noiseSrc(t, 0.05, this.filter('highpass', 6500, 0.7, env(ctx, out, t, 0.002, 0.05, track === 'chase' ? 0.12 : 0.07)));
      if (track === 'chase' && (step === 2 || step === 6)) this.noiseSrc(t, 0.12, this.filter('bandpass', 1800, 0.8, env(ctx, out, t, 0.002, 0.12, 0.22)));
    }
    // Vibraphone: a minor-major seventh, and a little motif on the title and in free flight.
    if (track !== 'chase' && step === 0 && bar % 2 === 0) {
      for (const n of [64, 67, 71, 75]) this.vibe(t, midi(n), spb * 6, 0.06);
    }
    if ((track === 'title' || track === 'free') && bar % 4 === 1) {
      const motif = [76, -1, 79, 83, 84, -1, 83, 79];
      const n = motif[step]!;
      if (n > 0) this.vibe(t, midi(n), spb * 1.6, 0.09);
    }
    if (track === 'mission' && bar % 8 === 6 && step % 3 === 0) this.vibe(t, midi([71, 74, 76][step / 3]!), spb * 2, 0.07);
    // Brass stabs in the chase.
    if (track === 'chase' && bar % 2 === 1 && (step === 0 || step === 3)) {
      for (const n of [58, 64, 67, 70]) osc(ctx, 'sawtooth', midi(n), midi(n), t, spb * 0.9, this.filter('lowpass', 2200, 1, env(ctx, out, t, 0.01, spb * 0.9, 0.06)));
    }
  }

  private vibe(t: number, f: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const g = env(ctx, this.musicBus!, t, 0.005, dur, peak);
    const trem = ctx.createGain();
    trem.connect(g);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    osc(ctx, 'sine', f, f, t, dur, trem);
    osc(ctx, 'sine', f * 4, f * 4, t, dur * 0.3, env(ctx, g, t, 0.002, dur * 0.3, 0.15));
  }

  stopAll(): void {
    for (const k of [...this.loops.keys()]) this.loop(k, false);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
  }
}
