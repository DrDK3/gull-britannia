import type { GameState, GullGame } from '../app/game';
import { Keys } from './keys';

const TONE_CLASS: Record<string, string> = { good: 'gb-good', food: 'gb-food', warn: 'gb-warn', bad: 'gb-bad', info: 'gb-info' };
/** Each tone has a sign as well as a colour. */
const TONE_SIGN: Record<string, string> = { good: '✓', food: '+', warn: '?', bad: '!', info: '·' };

/**
 * The HUD in play. Every box has a fixed slot in one grid, so no two can meet (gull.css, "the HUD"):
 *
 *   top left      the gull: beak, payload, how it looks to a guard, height and speed
 *   top centre    the stamp: an alert or a banner, one at a time
 *   top right     orders, and under them the feed of small events (three at most)
 *   bottom        the prompt (one instruction), and under it the radio (one line)
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
  const status = st.tension === 2 ? { text: 'SPOTTED', tone: 'bad' } : st.tension === 1 ? { text: 'WATCHED', tone: 'warn' } : h.beakIsMission ? { text: 'CARRYING PAPERS', tone: 'warn' } : { text: 'JUST A GULL', tone: 'good' };
  // The radio's own keys are named while the first lines of an operation are up; after that they are in the pause menu.
  const radioHelp = game.messages.log.filter((l) => l.kind === 'radio').length <= 2;
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
            <div className={`gb-chip ${TONE_CLASS[status.tone]}`}>
              <span aria-hidden="true">{TONE_SIGN[status.tone]}</span> {status.text}
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
      {st.overlays.map((o) => (
        <div key={o.id} className="gb-guard" data-label={o.id} ref={(el) => game.setAnchor(o.id, el)}>
          {o.speech && <div className="gb-speech">{o.speech}</div>}
          {o.icon && <div className={`gb-icon gb-icon-${o.icon === '!' ? 'alert' : o.icon === '?' ? 'sus' : 'busy'}`}>{o.icon}</div>}
          {o.name && (
            <div className="gb-plate gb-tagname">
              {o.name} <span>· {o.state}</span>
              <div className="gb-meter" role="img" aria-label={`Suspicion ${Math.round(o.suspicion * 100)}%`}>
                <i style={{ width: `${Math.round(o.suspicion * 100)}%` }} />
              </div>
              {o.routine && (
                <div className="gb-routine">
                  {o.routine.map((step, i) => (
                    <span key={i} className={i === o.routineStep ? 'on' : ''}>
                      {step}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {o.tag !== undefined && o.tag > 0 && (
            <div className="gb-plate gb-tagging">
              Tagging <i style={{ width: `${Math.round(Math.min(1, o.tag) * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
      {h.drop && (
        <div className="gb-plate gb-drop" data-label="drop" ref={(el) => game.setAnchor('drop', el)}>
          ON TARGET
        </div>
      )}
      {/* The way to the marker when it is out of view: on a ring inside the clear middle of the screen. */}
      {flying && h.offscreen !== undefined && (
        <div className="gb-arrow" data-hud="arrow" style={{ left: `calc(50% + ${(Math.sin(h.offscreen) * 15).toFixed(2)}vw)`, top: `calc(46% - ${(Math.cos(h.offscreen) * 22).toFixed(2)}vh)` }}>
          <i style={{ transform: `rotate(${h.offscreen}rad)` }} />
        </div>
      )}
      {st.tension === 2 && <div className="gb-vignette" />}
    </div>
  );
}
