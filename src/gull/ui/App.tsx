import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PRESET_LABELS, type GraphicsPreset } from '../../render/graphics';
import { OPERATIONS } from '../app/briefings';
import type { GameState, GullGame } from '../app/game';
import type { Settings } from '../app/settings';
import { fmtTime } from '../game/mission';
import { CAMERA_LABEL, GULL_CAMERAS } from '../view/gullScene';
import { useDialog } from './dialog';

export function App({ game }: { game: GullGame }) {
  const host = useRef<HTMLDivElement>(null);
  const st = useSyncExternalStore(
    (fn) => game.subscribe(fn),
    () => game.state,
  );
  useEffect(() => {
    const el = host.current;
    if (!el || el.dataset.attached) return;
    el.dataset.attached = '1';
    void game.attach(el);
  }, [game]);
  const playing = st.screen === 'playing';
  return (
    <div className="gb-root">
      <div ref={host} className="gb-canvas" />
      {playing && <Hud game={game} st={st} />}
      {playing && st.gate === 'ready' && !st.contextLost && <ReadyGate game={game} st={st} />}
      {playing && st.gate === 'paused' && !st.contextLost && <PauseMenu game={game} st={st} />}
      {playing && st.contextLost && (
        <div className="gb-overlay" role="alert">
          <div className="gb-card">
            <div className="gb-stamp">Signal lost</div>
            <h2>The picture has gone</h2>
            <p>Your browser lost its graphics. The operation is paused and nothing has been lost. It usually comes back by itself in a moment.</p>
            <div className="gb-actions">
              <button className="gb-primary" onClick={() => location.reload()}>
                Reload the game
              </button>
            </div>
          </div>
        </div>
      )}
      {st.screen === 'title' && <Title game={game} st={st} />}
      {st.screen === 'briefing' && <BriefingCard game={game} st={st} />}
      {st.screen === 'results' && <ResultsCard game={game} st={st} />}
      {st.screen === 'loading' && <Loading st={st} />}
      {st.screen === 'error' && <ErrorCard st={st} />}
    </div>
  );
}

/** A card that takes the screen: a dialog for assistive technology, with the keyboard kept inside it. */
function Card({ label, className = '', overlay = '', onClose, children }: { label: string; className?: string; overlay?: string; onClose?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  return (
    <div className={`gb-overlay ${overlay}`}>
      <div ref={ref} className={`gb-card ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Loading({ st }: { st: GameState }) {
  return (
    <div className="gb-overlay gb-loading">
      <div className="gb-card" role="status" aria-live="polite">
        <div className="gb-stamp">Section G · Most secret</div>
        <h1>Gull Britannia</h1>
        <p>{st.progress}</p>
        {/*
          A bar that moves at each stage and is otherwise still. A continuously animated one keeps the compositor busy,
          which on a machine without a graphics card nearly doubled the load (9 s to 17 s, measured).
        */}
        <div className="gb-loadbar" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.loaded * 100)}>
          <i style={{ width: `${Math.round(st.loaded * 100)}%` }} />
        </div>
        <p className="gb-fine">The whole town is being laid out: about ten seconds. The bar moves in a few large steps.</p>
      </div>
    </div>
  );
}

function ErrorCard({ st }: { st: GameState }) {
  return (
    <Card label="The game could not start">
      <div className="gb-stamp">Operation scrubbed</div>
      <h1>Gull Britannia</h1>
      <p className="gb-error">{st.error}</p>
      {st.issues.length > 0 && (
        <details>
          <summary>Details</summary>
          {st.issues.map((i) => (
            <p key={i} className="gb-fine">
              {i}
            </p>
          ))}
        </details>
      )}
      <div className="gb-actions">
        <button className="gb-primary" data-autofocus onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </Card>
  );
}

function Title({ game, st }: { game: GullGame; st: GameState }) {
  const [view, setView] = useState<'menu' | 'settings' | 'credits'>('menu');
  const done = st.saved.done;
  const unlocked = (i: number) => st.settings.unlockAll || i === 0 || done.includes(OPERATIONS[i - 1]!.id);
  const ops = OPERATIONS.filter((o) => o.playable);
  return (
    <Card label="Gull Britannia" className="gb-menu" overlay="gb-title" onClose={view === 'menu' ? undefined : () => setView('menu')}>
      <div className="gb-stamp">Section G · Most secret</div>
      <h1>Gull Britannia</h1>
      <p className="gb-tag">Dartmouth, Devon, 1967. The town is under occupation. The gulls are not.</p>
      {view === 'menu' && (
        <>
          <h2 className="gb-h">Operations</h2>
          {ops.map((o, i) => {
            const best = st.saved.best[o.id];
            const open = unlocked(i);
            return (
              <button key={o.id} className={i === 0 ? 'gb-primary' : ''} data-autofocus={i === 0 ? true : undefined} disabled={!open} onClick={() => game.showBriefing(o.id)}>
                <b>
                  File {OPERATIONS.indexOf(o) + 1}: {o.title}
                </b>
                <span className="gb-fine"> — {open ? o.blurb : 'finish the previous operation to open this file'}</span>
                {best && (
                  <span className="gb-best">
                    Best: {best.grade} ({best.total})
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => {
              game.startOperation('free');
            }}
          >
            <b>Free flight</b> <span className="gb-fine">— the harbour, no orders</span>
          </button>
          <button onClick={() => setView('settings')}>Settings</button>
          <button onClick={() => setView('credits')}>Credits and licences</button>
          <p className="gb-fine gb-credits">
            Map data © OpenStreetMap contributors (ODbL). Terrain © Environment Agency (OGL v3). Contains modified Copernicus Sentinel data 2025. An original parody; any resemblance to real gulls is regrettable.
          </p>
        </>
      )}
      {view === 'settings' && (
        <>
          <SettingsPanel game={game} s={st.settings} />
          <button data-autofocus onClick={() => setView('menu')}>
            Back
          </button>
        </>
      )}
      {view === 'credits' && (
        <>
          <Credits />
          <button data-autofocus onClick={() => setView('menu')}>
            Back
          </button>
        </>
      )}
    </Card>
  );
}

function Credits() {
  return (
    <div className="gb-credits-full">
      <h2 className="gb-h">Credits and licences</h2>
      <p>Gull Britannia is an original parody. The characters, the occupation and the operations are invented. The gulls, people, props, sounds and music are made in code. The game's code is released under the MIT licence.</p>
      <p>
        The scenery is the River Dart from{' '}
        <a href="https://drdk3.github.io/SailSim/" target="_blank" rel="noreferrer">
          SailSim
        </a>
        , built from open data and taken back to 1967:
      </p>
      <ul>
        <li>
          Map data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors, Open Database Licence (ODbL) 1.0, via Overture Maps Foundation; Microsoft ML Building Footprints, ODbL.
        </li>
        <li>Terrain © Environment Agency copyright and/or database right 2015. All rights reserved. Open Government Licence v3.0, via Tilezen terrain tiles.</li>
        <li>Contains modified Copernicus Sentinel data 2025.</li>
      </ul>
      <p className="gb-fine">Built with three.js, React and Vite. Sources, and what was changed for 1967, are in SOURCES.md in the repository.</p>
    </div>
  );
}

function BriefingCard({ game, st }: { game: GullGame; st: GameState }) {
  const b = st.briefing;
  if (!b) return null;
  return (
    <Card label={`Briefing: ${st.operationTitle}`} className="gb-dossier gb-sheet" onClose={() => game.toTitle()}>
      <div className="gb-sheet-body">
        <div className="gb-stamp">{b.file}</div>
        <div className="gb-dateline">{b.dateline}</div>
        <h2>{st.operationTitle}</h2>
        {b.body.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h3 className="gb-h">Orders</h3>
        <ol>
          {b.orders.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ol>
        <p className="gb-signed">{b.signed}</p>
      </div>
      <div className="gb-actions gb-sheet-foot">
        <button className="gb-primary" data-autofocus onClick={() => game.startOperation(st.operation!)}>
          Begin operation
        </button>
        <button onClick={() => game.toTitle()}>Back</button>
      </div>
    </Card>
  );
}

/** Before the operation starts, and after Esc in the pause menu: the scene, and one action to take control. */
function ReadyGate({ game, st }: { game: GullGame; st: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref);
  const order = st.objectives.find((o) => o.state === 'active' && !o.optional)?.text;
  return (
    <div className="gb-ready">
      <div ref={ref} className="gb-plate gb-ready-card" role="dialog" aria-label="Ready to fly">
        <div className="gb-ready-title">{st.operationTitle}</div>
        {order && <div className="gb-ready-order">{order}</div>}
        <button className="gb-go" data-autofocus onClick={() => game.begin('mouse')}>
          {st.captureRefused > 0 ? 'Click again to fly' : 'Click to fly'}
        </button>
        <div className="gb-ready-note">{st.captureRefused > 1 ? 'The browser will not hand over the mouse here. Wait a second and try again, or fly with the keyboard alone.' : 'The mouse steers. Esc pauses.'}</div>
        <div className="gb-ready-row">
          <button onClick={() => game.begin('keys')}>Keyboard only (arrow keys look)</button>
          <button onClick={() => void game.toggleFullscreen()}>Full screen</button>
        </div>
      </div>
    </div>
  );
}

function ResultsCard({ game, st }: { game: GullGame; st: GameState }) {
  const r = st.results;
  if (!r) return null;
  const at = OPERATIONS.findIndex((o) => o.id === r.missionId);
  const next = at >= 0 ? OPERATIONS.slice(at + 1).find((o) => o.playable) : undefined;
  return (
    <Card label={`Performance review: ${r.title}`} className="gb-dossier gb-results gb-sheet" onClose={() => game.toTitle()}>
      <div className="gb-sheet-body">
        <div className="gb-stamp">Performance review</div>
        <h2>{r.title}</h2>
        <div className="gb-grade">
          <span className="gb-grade-letter">{r.grade}</span>
          <span>
            {r.gradeTitle}
            <br />
            <span className="gb-fine">
              {r.total} points · {fmtTime(r.time)}
            </span>
          </span>
        </div>
        <table>
          <tbody>
            {r.lines.map(([label, pts], i) => (
              <tr key={i}>
                <td>{label}</td>
                <td className="gb-pts">{pts}</td>
              </tr>
            ))}
            <tr className="gb-total">
              <td>Total</td>
              <td className="gb-pts">{r.total}</td>
            </tr>
          </tbody>
        </table>
        <h3 className="gb-h">Remarks of the Committee</h3>
        {r.remarks.map((x, i) => (
          <p key={i} className="gb-remark">
            {x}
          </p>
        ))}
        {r.debrief && <p className="gb-debrief">{r.debrief}</p>}
      </div>
      <div className="gb-actions gb-sheet-foot">
        {next ? (
          <button className="gb-primary" data-autofocus onClick={() => game.showBriefing(next.id)}>
            Proceed to File {OPERATIONS.indexOf(next) + 1}: {next.title}
          </button>
        ) : (
          <button className="gb-primary" data-autofocus onClick={() => game.toTitle()}>
            Back to the files
          </button>
        )}
        <button onClick={() => game.restart()}>Try again</button>
        {next && <button onClick={() => game.toTitle()}>Title screen</button>}
      </div>
    </Card>
  );
}

const TONE_CLASS: Record<string, string> = { good: 'gb-good', food: 'gb-food', warn: 'gb-warn', bad: 'gb-bad', info: 'gb-info' };

function Hud({ game, st }: { game: GullGame; st: GameState }) {
  const h = st.hud;
  const s = st.settings;
  const flying = st.gate === 'flying';
  return (
    <div className="gb-hudroot" aria-hidden={!flying}>
      <div className="gb-hud gb-plate gb-hud-tl">
        <div className="gb-readout">
          <b>{Math.round(h.speedKmh)}</b> km/h · <b>{Math.round(h.altitude)}</b> m
        </div>
        <div className="gb-payload" title="Payload">
          {Array.from({ length: h.maxPayload }, (_, i) => (
            <span key={i} className={i < h.payload ? 'on' : ''} />
          ))}
          <span className="gb-beak">{h.beak ? `Beak: ${h.beak}` : 'Beak: empty'}</span>
        </div>
        {st.operation !== 'free' && <div>Score {st.score}</div>}
      </div>
      {st.objectives.length > 0 && (
        <div className="gb-hud gb-plate gb-objectives">
          <div className="gb-obj-title">{st.operationTitle}</div>
          {st.objectives.map((o) => (
            <div key={o.id} className={`gb-obj gb-obj-${o.state} ${o.optional ? 'gb-obj-opt' : ''}`}>
              <span className="gb-obj-box">{o.state === 'done' ? '✔' : o.state === 'failed' ? '✘' : ''}</span>
              {o.text}
            </div>
          ))}
        </div>
      )}
      {flying && (
        <div className="gb-hud gb-bottom">
          {st.radio && (
            <div className="gb-plate gb-radio" key={st.radio.id} role="status">
              <span className="gb-radio-who">{st.radio.speaker}:</span> {st.radio.text}
            </div>
          )}
          {st.prompt && <div className="gb-plate gb-action">{st.prompt}</div>}
        </div>
      )}
      <div className="gb-hud gb-toasts">
        {st.toasts.map((t) => (
          <div key={t.id} className={`gb-plate gb-toast ${TONE_CLASS[t.tone] ?? ''}`}>
            {t.text}
          </div>
        ))}
      </div>
      {st.banner && (
        <div className={`gb-hud gb-plate gb-banner ${TONE_CLASS[st.banner.tone] ?? ''}`} key={st.banner.id} role="alert">
          {st.banner.text}
        </div>
      )}
      {st.overlays.map((o) => (
        <div key={o.id} className="gb-guard" ref={(el) => game.setAnchor(o.id, el)}>
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
        <div className="gb-plate gb-drop" ref={(el) => game.setAnchor('drop', el)}>
          ON TARGET
        </div>
      )}
      {h.offscreen !== undefined && <div className="gb-arrow" style={{ transform: `translate(-50%, -50%) rotate(${h.offscreen}rad) translateY(-38vmin)` }} />}
      {st.tension === 2 && <div className="gb-vignette" />}
      {st.debug && (
        <div className="gb-hud gb-plate gb-debug">
          {st.cameraLabel} camera · {Math.round(st.fps)} fps · {h.mode} · heading {String(Math.round(h.heading) % 360).padStart(3, '0')}°
        </div>
      )}
      {s.showControls && flying && <ControlsPanel />}
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ['Mouse', 'steer'],
  ['W', 'flap for speed'],
  ['Space', 'flap for height · take off'],
  ['S', 'brake'],
  ['Shift', 'dive'],
  ['A / D', 'bank'],
  ['R', 'landing assist'],
  ['E', 'snatch · set down · deliver'],
  ['F', 'eat'],
  ['Q / click', 'poop'],
  ['T / right mouse', 'scout'],
  ['G', 'signal'],
  ['C', 'camera · wheel zooms'],
  ['Esc', 'pause · H hides this'],
];

function ControlsPanel() {
  return (
    <div className="gb-hud gb-plate gb-controls">
      {CONTROLS.map(([k, v]) => (
        <div key={k}>
          <b>{k}</b> {v}
        </div>
      ))}
    </div>
  );
}

function PauseMenu({ game, st }: { game: GullGame; st: GameState }) {
  const [confirm, setConfirm] = useState<'restart' | 'abandon' | undefined>();
  const what = st.operation === 'free' ? 'free flight' : 'operation';
  return (
    <Card label="Paused" className="gb-menu" onClose={() => (confirm ? setConfirm(undefined) : game.toReady())}>
      <div className="gb-stamp">Paused</div>
      <h2>{st.operationTitle}</h2>
      {!confirm && (
        <>
          <button className="gb-primary" data-autofocus onClick={() => game.resume()}>
            Resume
          </button>
          <button onClick={() => setConfirm('restart')}>Restart {what}</button>
          <button onClick={() => setConfirm('abandon')}>Abandon to the title screen</button>
          <h3 className="gb-h">Camera</h3>
          <div className="gb-row">
            {GULL_CAMERAS.map((c) => (
              <button key={c} className={st.camera === c ? 'on' : ''} aria-pressed={st.camera === c} onClick={() => game.setCamera(c)}>
                {CAMERA_LABEL[c]}
              </button>
            ))}
          </div>
          <SettingsPanel game={game} s={st.settings} />
        </>
      )}
      {confirm && (
        <div role="alertdialog" aria-label={confirm === 'restart' ? `Restart the ${what}?` : `Abandon the ${what}?`}>
          <p>{confirm === 'restart' ? `Restart the ${what} from the beginning? This run’s progress will be lost.` : `Abandon the ${what} and go back to the title screen? This run’s progress will be lost.`}</p>
          <div className="gb-actions">
            <button className="gb-primary" data-autofocus onClick={() => (confirm === 'restart' ? game.restart() : game.toTitle())}>
              {confirm === 'restart' ? 'Restart' : 'Abandon'}
            </button>
            <button onClick={() => setConfirm(undefined)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SettingsPanel({ game, s }: { game: GullGame; s: Settings }) {
  const set = (p: Partial<Settings>) => game.updateSettings(p);
  const gfx = game.state.graphics;
  return (
    <div className="gb-settings">
      <h3 className="gb-h">Settings</h3>
      <label>
        Graphics
        <select value={gfx} onChange={(e) => game.setGraphicsPreset(e.target.value as GraphicsPreset)}>
          {gfx === 'custom' && <option value="custom">Custom</option>}
          {(['performance', 'balanced', 'ultra'] as const).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mouse sensitivity <input type="range" min={0.5} max={6} step={0.1} value={s.sensitivity} onChange={(e) => set({ sensitivity: +e.target.value })} />
      </label>
      <label>
        Field of view {s.fov}° <input type="range" min={55} max={95} step={1} value={s.fov} onChange={(e) => set({ fov: +e.target.value })} />
      </label>
      <label>
        Master volume <input type="range" min={0} max={1} step={0.05} value={s.master} onChange={(e) => set({ master: +e.target.value })} />
      </label>
      <label>
        Music <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => set({ music: +e.target.value })} />
      </label>
      <label>
        Effects <input type="range" min={0} max={1} step={0.05} value={s.effects} onChange={(e) => set({ effects: +e.target.value })} />
      </label>
      <label className="gb-check">
        <input type="checkbox" checked={s.invertY} onChange={(e) => set({ invertY: e.target.checked })} /> Invert mouse Y
      </label>
      <label className="gb-check">
        <input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> Reduced motion (no camera roll, bob or shake)
      </label>
      <label className="gb-check">
        <input type="checkbox" checked={s.dropMarker} onChange={(e) => set({ dropMarker: e.target.checked })} /> Drop marker
      </label>
      <label className="gb-check">
        <input type="checkbox" checked={s.showControls} onChange={(e) => set({ showControls: e.target.checked })} /> Controls panel
      </label>
      <label className="gb-check">
        <input type="checkbox" checked={s.unlockAll} onChange={(e) => set({ unlockAll: e.target.checked })} /> Unlock all operations
      </label>
    </div>
  );
}
