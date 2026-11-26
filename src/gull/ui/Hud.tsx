import type { GameState, GullGame } from '../app/game';
import { fmtTime } from '../game/mission';
import { Keys } from './keys';

const TONE_CLASS: Record<string, string> = { good: 'gb-good', food: 'gb-food', warn: 'gb-warn', bad: 'gb-bad', info: 'gb-info' };
/** Each tone has a sign as well as a colour. */
const TONE_SIGN: Record<string, string> = { good: '✓', food: '+', warn: '?', bad: '!', info: '·' };

/** "Just a gull" and the three steps away from it: a shape and a tone for each, beside the words. */
const CONSPICUOUS: Record<string, { sign: string; tone: string }> = {
  'just a gull': { sign: '○', tone: 'good' },
  odd: { sign: '◇', tone: 'info' },
  conspicuous: { sign: '△', tone: 'warn' },
  'very conspicuous': { sign: '▲', tone: 'bad' },
};
/** The alert ladder's rungs above calm: a sign and a tone for each. */
const RUNGS = [
  { sign: '?', tone: 'warn' },
  { sign: '!', tone: 'bad' },
  { sign: '!!', tone: 'bad' },
];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Angles for marks on one ring, most important first, so that no two are closer than `gap`: a mark that would land on
 * one already placed moves to the nearest free place beside it.
 */
function spread(angles: number[], gap = 0.42): number[] {
  const placed: number[] = [];
  for (const want of angles) {
    let a = want;
    for (let k = 1; k < 14 && placed.some((p) => Math.abs(wrap(p - a)) < gap); k++) a = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap;
    placed.push(a);
  }
  return placed;
}

/**
 * The HUD in play. Every box has a fixed slot in one grid, so no two can meet (gull.css, "the HUD"):
 *
 *   top left      the gull: beak, payload, how it looks to a guard ("just a gull"), height and speed
 *   top centre    the watch: the operation's clock and the alert ladder; under it the stamp (one alert or banner)
 *   top right     orders, and under them the feed of small events (three at most)
 *   bottom        the prompt (one instruction), and under it the radio (one line)
 *   the ring      round the middle of the view: who is noticing the gull, by direction and strength, and the way to
 *                 the objective's marker when that is out of view
 *
 * Boxes marked `data-hud` are the fixed ones: labels pinned to the world keep clear of them (game.ts placeAnchors), and
 * the layout test measures them.
 */
export function Hud({ game, st }: { game: GullGame; st: GameState }) {
  const h = st.hud;
  const m = st.msg;
  const flying = st.gate === 'flying';
  const label = game.label;
  const active = st.objectives.filter((o) => o.state === 'active');
  const order = active.find((o) => !o.optional);
  const also = active.filter((o) => o !== order);
  const look = CONSPICUOUS[h.conspicuous.level] ?? CONSPICUOUS['just a gull']!;
  const rung = h.alert.level > 0 ? RUNGS[h.alert.level - 1] : undefined;
  const urgent = !!h.deadline && h.deadline.left < 60;
  // The radio's own keys are named while the first lines of an operation are up; after that they are in the pause menu.
  const radioHelp = game.messages.log.filter((l) => l.kind === 'radio').length <= 2;
  // The ring: the pointer to the marker first, then whoever is noticing, each in a place of its own.
  const angles = spread([...(h.offscreen !== undefined ? [h.offscreen] : []), ...h.noticers.map((n) => n.rel)]);
  const at = (a: number) => ({ left: `${(Math.sin(a) * 20).toFixed(2)}vh`, top: `${(-Math.cos(a) * 20).toFixed(2)}vh` });
  const first = h.offscreen !== undefined ? 1 : 0;
  return (
    <div className="gb-hudroot" aria-hidden={!flying}>
      <div className="gb-hudgrid">
        <div className="gb-col-left">
          <div className="gb-plate gb-status" data-hud="status">
            <div className="gb-beakrow">
              <span className="gb-beak">{h.beak ? `Beak: ${h.beak}` : 'Beak: empty'}</span>
              <span className="gb-payload" role="img" aria-label={`Payload ${h.payload} of ${h.maxPayload}`}>
                {Array.from({ length: h.maxPayload }, (_, i) => (
                  <i key={i} className={i < h.payload ? 'on' : ''} />
                ))}
              </span>
            </div>
            {/* How the gull looks to whoever thinks worst of it: the level, and the reason when there is one. */}
            <div className={`gb-chip ${TONE_CLASS[look.tone]}`} data-level={h.conspicuous.level}>
              <span aria-hidden="true">{look.sign}</span> {h.conspicuous.level.toUpperCase()}
              {h.conspicuous.reason !== h.conspicuous.level && <span className="gb-reason">: {h.conspicuous.reason}</span>}
            </div>
            <div className="gb-readout">
              Height <b>{Math.round(h.height)}</b> m · <b>{Math.round(h.speedKmh)}</b> km/h
            </div>
          </div>
          {st.debug && (
            <div className="gb-plate gb-debug" data-hud="debug">
              {st.cameraLabel} camera · {Math.round(st.fps)} fps · {h.mode} · heading {String(Math.round(h.heading) % 360).padStart(3, '0')}° · {Math.round(h.altitude)} m clear
            </div>
          )}
        </div>
        <div className="gb-col-mid">
          {(h.deadline || rung) && (
            <div className="gb-plate gb-watch" data-hud="watch">
              {h.deadline && (
                <div className={`gb-clock ${urgent ? 'gb-urgent gb-bad' : ''}`}>
                  {urgent && <span aria-hidden="true">! </span>}
                  {h.deadline.label} {h.deadline.clock} · <b>{fmtTime(h.deadline.left)}</b>
                </div>
              )}
              {rung && (
                <div className={`gb-ladder ${TONE_CLASS[rung.tone]}`} data-level={h.alert.level}>
                  <span aria-hidden="true">{rung.sign}</span> Alert: {h.alert.name}
                  <span className="gb-rungs" role="img" aria-label={`Rung ${h.alert.level} of 3`}>
                    {[1, 2, 3].map((i) => (
                      <i key={i}>
                        <b style={{ width: `${i < h.alert.level ? 100 : i === h.alert.level ? Math.max(12, Math.round(h.alert.progress * 100)) : 0}%` }} />
                      </i>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
          {m.stamp && (
            <div className={`gb-plate gb-stamp-hud ${TONE_CLASS[m.stamp.tone] ?? ''}`} key={m.stamp.id} data-hud="stamp" data-kind={m.stamp.kind} role="alert">
              <span aria-hidden="true">{TONE_SIGN[m.stamp.tone]}</span> {m.stamp.text}
            </div>
          )}
        </div>
        <div className="gb-col-right">
          {st.objectives.length > 0 && (
            <div className="gb-plate gb-orders" data-hud="orders">
              <div className="gb-orders-title">{st.operationTitle}</div>
              {m.order && (
                <div className={`gb-order-note gb-order-${m.order.change}`} key={m.order.id}>
                  <span aria-hidden="true">{m.order.change === 'done' ? '✓' : m.order.change === 'failed' ? '✗' : '▸'}</span> {m.order.change === 'done' ? 'Done: ' : m.order.change === 'failed' ? 'Failed: ' : 'New order: '}
                  <Keys text={m.order.text} label={label} />
                </div>
              )}
              {order && m.order?.change !== 'new' && (
                <div className="gb-order">
                  <Keys text={order.text} label={label} />
                  {h.distance !== undefined && h.distance > 8 && <span className="gb-distance"> · {Math.round(h.distance)} m</span>}
                </div>
              )}
              {also.map((o) => (
                <div key={o.id} className={`gb-also ${o.optional ? 'gb-opt' : ''}`}>
                  <Keys text={o.text} label={label} />
                </div>
              ))}
            </div>
          )}
          {m.feed.map((t) => (
            <div key={t.id} className={`gb-plate gb-toast ${TONE_CLASS[t.tone] ?? ''}`} data-hud="toast">
              <span aria-hidden="true">{TONE_SIGN[t.tone]}</span> <Keys text={t.text} label={label} />
              {t.count > 1 && ` ×${t.count}`}
            </div>
          ))}
        </div>
        <div className="gb-row-bottom">
          {flying && m.prompt && (
            <div className={`gb-plate gb-prompt gb-prompt-${m.prompt.kind} ${m.prompt.nudged ? 'gb-nudged' : ''}`} data-hud="prompt" data-prompt={m.prompt.id}>
              <Keys text={m.prompt.text} label={label} />
            </div>
          )}
          {flying && m.radio && (
            <div className="gb-plate gb-radio" key={m.radio.id} data-hud="radio" role="status">
              <span className="gb-radio-who">{m.radio.speaker}:</span> <Keys text={m.radio.text} label={label} />
              {radioHelp && (
                <span className="gb-radio-help">
                  <Keys text="{repeat} again · {log} log" label={label} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {flying && (
        <div className="gb-ring">
          {/* The way to the marker when it is out of view. */}
          {h.offscreen !== undefined && (
            <div className="gb-mark gb-arrow" data-hud="arrow" style={at(angles[0]!)}>
              <i style={{ transform: `rotate(${angles[0]}rad)` }} />
            </div>
          )}
          {/* Who is noticing: where from the gull's view, larger as the interest grows, "!" once he is sure. */}
          {h.noticers.map((n, i) => (
            <div key={n.id} className={`gb-mark gb-noticer ${n.alert ? 'gb-bad' : 'gb-warn'} ${n.sees ? '' : 'gb-unseen'}`} data-hud="noticer" style={{ ...at(angles[first + i]!), fontSize: `${(1 + 0.5 * n.strength).toFixed(2)}em` }}>
              {n.alert ? '!' : '?'}
            </div>
          ))}
        </div>
      )}
      {st.overlays.map((o) => {
        const onStep = o.routine && o.routineStep !== undefined && o.routineStep >= 0 ? o.routine[o.routineStep] : undefined;
        const next = o.routine && onStep !== undefined ? o.routine[(o.routineStep! + 1) % o.routine.length] : undefined;
        return (
          <div key={o.id} className="gb-guard" data-label={o.id} ref={(el) => game.setAnchor(o.id, el)}>
            {o.speech && <div className="gb-speech">{o.speech}</div>}
            {o.icon && <div className={`gb-icon gb-icon-${o.icon === '!' ? 'alert' : o.icon === '?' ? 'sus' : 'busy'}`}>{o.icon}</div>}
            {o.name && (
              <div className="gb-plate gb-tagname">
                {o.name} <span>· {o.state}</span>
                <div className="gb-meter" role="img" aria-label={`Suspicion ${Math.round(o.suspicion * 100)}%`}>
                  <i style={{ width: `${Math.round(o.suspicion * 100)}%` }} />
                </div>
                {onStep !== undefined && (
                  <div className="gb-routine">
                    <span className="on">
                      {onStep} · {Math.ceil(o.stepLeft ?? 0)} s
                    </span>
                    {next !== undefined && <span>then {next}</span>}
                  </div>
                )}
                {o.watching !== undefined && (
                  <div className={`gb-window ${o.watching ? 'gb-warn' : 'gb-good'}`}>
                    <span aria-hidden="true">{o.watching ? '●' : '○'}</span> {o.watching ? 'Watching' : 'Looking away'} · {Math.ceil(o.windowLeft ?? 0)} s
                  </div>
                )}
                {o.telling && <div className="gb-tell">About to turn: “{o.telling}”</div>}
              </div>
            )}
            {o.tag !== undefined && o.tag > 0 && (
              <div className="gb-plate gb-tagging">
                Tagging <i style={{ width: `${Math.round(Math.min(1, o.tag) * 100)}%` }} />
              </div>
            )}
          </div>
        );
      })}
      {h.drop && (
        <div className="gb-plate gb-drop" data-label="drop" ref={(el) => game.setAnchor('drop', el)}>
          ON TARGET
        </div>
      )}
      {st.tension === 2 && <div className="gb-vignette" />}
    </div>
  );
}
