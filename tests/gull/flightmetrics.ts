/**
 * Prints the flight laboratory's numbers (tests/gull/flightlab.ts) as a table: `npx tsx tests/gull/flightmetrics.ts`.
 * Run it before and after a change to the flight model; reports/agents/flight.md keeps both columns.
 */
import { brake, climb, flapSpeed, glidePolar, snapTurnRate, stall, swoop, takeOff, turn180, wallTest } from './flightlab';

const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const rows: [string, string][] = [];
const row = (k: string, v: string) => rows.push([k, v]);

const p = glidePolar();
row('Best glide ratio (view pitch, speed)', `${f(p.best.ratio)}:1 (${f(p.best.pitchDeg)}°, ${f(p.best.speed)} m/s)`);
row('Slowest sink (view pitch, speed)', `${f(p.minSink.sink, 2)} m/s (${f(p.minSink.pitchDeg)}°, ${f(p.minSink.speed)} m/s)`);
row('Hands off, view level: speed, sink, ratio', `${f(p.level.speed)} m/s, ${f(p.level.sink, 2)} m/s, ${f(p.level.ratio)}:1`);
const s = stall();
row('Stall: lowest speed, fastest descent', `${f(s.minSpeed)} m/s, ${f(s.maxSink)} m/s`);
row('Stall: recovered, time from levelling, height lost', `${s.recovered}, ${f(s.recoverTime, 2)} s, ${f(s.heightLost)} m`);
for (const how of ['sweep', 'look', 'key'] as const) {
  const t = turn180(13, how, { forward: true });
  row(`180° turn at 13 m/s (${how}): time, radius, end speed, bank`, `${f(t.time, 2)} s, ${f(t.radius)} m, ${f(t.endSpeed)} m/s, ${f((t.maxRoll * 180) / Math.PI, 0)}°`);
}
for (const v of [8, 13, 20, 28]) {
  const t = turn180(v, 'look');
  row(`180° turn gliding from ${v} m/s (look): time, radius, end speed`, `${f(t.time, 2)} s, ${f(t.radius)} m, ${f(t.endSpeed)} m/s`);
}
row('Fastest path turn after a 90° flick at 3 m/s / 13 m/s', `${f(snapTurnRate(3), 2)} / ${f(snapTurnRate(13), 2)} rad/s`);
const sw = swoop();
row('Swoop (45° dive 2 s, zoom 40°): lost, regained, recovery, top speed', `${f(sw.lost)} m, ${f(sw.regained)} m, ${f(sw.recovery * 100, 0)}%, ${f(sw.topSpeed)} m/s`);
const sw2 = swoop(60, 3, 50);
row('Swoop (60° dive 3 s, zoom 50°): lost, regained, recovery, top speed', `${f(sw2.lost)} m, ${f(sw2.regained)} m, ${f(sw2.recovery * 100, 0)}%, ${f(sw2.topSpeed)} m/s`);
const fs = flapSpeed();
row('Flap for speed, level: after 3 s from 10 m/s, top speed', `${f(fs.after3)} m/s, ${f(fs.top)} m/s`);
const c = climb();
row('Climb: flap for height (view level); flap for speed (view 20° up)', `${f(c.flap, 2)} m/s at ${f(c.flapSpeed)} m/s; ${f(c.forward20, 2)} m/s at ${f(c.forward20Speed)} m/s`);
const b = brake();
row('Brake from 15 m/s to 4.5: time, distance; sink held; with flap', `${f(b.time, 2)} s, ${f(b.distance)} m; ${f(b.sink, 2)} m/s; ${f(b.hoverSink, 2)} m/s`);
const to = takeOff();
row('Take-off, still air: height after 1 s, 2 s; speed', `${f(to.h1)} m, ${f(to.h2)} m; ${f(to.speed)} m/s`);
const up = takeOff(8, 0);
const down = takeOff(8, 180);
row('Take-off in 8 m/s: into wind / downwind, height after 2 s', `${f(up.h2)} m / ${f(down.h2)} m`);
for (const [deg, v] of [[0, 32], [60, 32], [80, 32]] as const) {
  const r = wallTest((deg * Math.PI) / 180, v);
  row(`0.5 m wall at ${v} m/s, ${deg}° off square: furthest past the near face`, `${f(r.beyond, 2)} m (${r.tumbled ? 'tumbled' : 'slid'})`);
}

const w = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(`| ${k.padEnd(w)} | ${v} |`);
