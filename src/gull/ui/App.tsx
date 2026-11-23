import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameState, GullGame } from '../app/game';
import { OPERATIONS } from '../app/briefings';
import type { Settings } from '../app/settings';
import { fmtTime } from '../game/mission';
import { CAMERA_LABEL, GULL_CAMERAS } from '../view/gullScene';
import { PRESET_LABELS, type GraphicsPreset } from '../../render/graphics';

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
  return (
    <div className="gb-root">
      <div ref={host} className="gb-canvas" />
      {st.screen === 'playing' && <Hud st={st} />}
      {st.screen === 'playing' && !st.locked && !st.paused && (
        <button className="gb-prompt-lock" onClick={() => void game.lockPointer()}>
          Click to fly <span>(the mouse steers; Esc pauses)</span>
        </button>
      )}
      {st.screen === 'playing' && st.paused && <PauseMenu game={game} st={st} />}
      {st.screen === 'title' && <Title game={game} st={st} />}
      {st.screen === 'briefing' && <BriefingCard game={game} st={st} />}
      {st.screen === 'results' && <ResultsCard game={game} st={st} />}
      {st.screen === 'loading' && <Loading st={st} />}
      {st.screen === 'error' && (
        <div className="gb-overlay">
          <div className="gb-card">
            <h1>Gull Britannia</h1>
            <p className="gb-error">{st.error}</p>
            {st.issues.map((i) => (
              <p key={i} className="gb-small">
                {i}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Loading({ st }: { st: GameState }) {
  return (
    <div className="gb-overlay gb-loading">
      <div className="gb-card">
        <div className="gb-stamp">Top secret · Dartmouth station · 1967</div>
        <h1>Gull Britannia</h1>
        <p>{st.progress}</p>
      </div>
    </div>
  );
}

function Title({ game, st }: { game: GullGame; st: GameState }) {
  const [view, setView] = useState<'menu' | 'settings' | 'credits'>('menu');
  const settings = view === 'settings';
  const setSettings = (on: boolean) => setView(on ? 'settings' : 'menu');
  const done = st.saved.done;
  const unlocked = (i: number) => st.settings.unlockAll || i === 0 || done.includes(OPERATIONS[i - 1]!.id);
  const ops = OPERATIONS.filter((o) => o.playable);
  return (
    <div className="gb-overlay gb-title">
      <div className="gb-card gb-menu">
        <div className="gb-stamp">Section G · Most secret</div>
        <h1>Gull Britannia</h1>
        <p className="gb-tag">Dartmouth, Devon, 1967. The town is under occupation. The gulls are not.</p>
        {view === 'menu' && (
          <>
            <h3>Operations</h3>
            {ops.map((o, i) => {
              const best = st.saved.best[o.id];
              const open = unlocked(i);
              return (
                <button key={o.id} className={i === 0 ? 'gb-primary' : ''} disabled={!open} onClick={() => game.showBriefing(o.id)}>
                  <b>
                    File {OPERATIONS.indexOf(o) + 1}: {o.title}
                  </b>
                  <span className="gb-small"> — {open ? o.blurb : 'finish the previous operation to open this file'}</span>
                  {best && <span className="gb-best">Best: {best.grade} ({best.total})</span>}
                </button>
              );
            })}
            <button onClick={() => game.startOperation('free')}>
              <b>Free flight</b> <span className="gb-small">— the harbour, no orders</span>
            </button>
            <button onClick={() => setSettings(true)}>Settings</button>
            <button onClick={() => setView('credits')}>Credits and licences</button>
            <p className="gb-small gb-credits">
              Map data © OpenStreetMap contributors (ODbL). Terrain © Environment Agency (OGL v3). Contains modified Copernicus Sentinel data 2025. An original parody; any resemblance to real gulls is regrettable.
            </p>
          </>
        )}
        {view === 'credits' && (
          <>
            <Credits />
            <button onClick={() => setView('menu')}>Back</button>
          </>
        )}
        {settings && (
          <>
            <SettingsPanel game={game} s={st.settings} />
            <button onClick={() => setSettings(false)}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}

function Credits() {
  return (
    <div className="gb-credits-full">
      <h3>Credits and licences</h3>
      <p>
        Gull Britannia is an original parody. The characters, the occupation and the operations are invented. The gulls, people, props, sounds and music are made in code. The game's code is released under the MIT licence.
      </p>
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
      <p className="gb-small">Built with three.js, React and Vite. Sources, and what was changed for 1967, are in SOURCES.md in the repository.</p>
    </div>
  );
}

function BriefingCard({ game, st }: { game: GullGame; st: GameState }) {
  const b = st.briefing;
  if (!b) return null;
  return (
    <div className="gb-overlay">
      <div className="gb-card gb-dossier">
        <div className="gb-stamp">{b.file}</div>
        <div className="gb-dateline">{b.dateline}</div>
        <h2>{st.operationTitle}</h2>
        {b.body.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h3>Orders</h3>
        <ol>
          {b.orders.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ol>
        <p className="gb-signed">{b.signed}</p>
        <div className="gb-row">
          <button className="gb-primary" onClick={() => game.startOperation(st.operation!)}>
            Begin operation
          </button>
          <button onClick={() => game.toTitle()}>Back</button>
        </div>
      </div>
    </div>
  );
}

function ResultsCard({ game, st }: { game: GullGame; st: GameState }) {
  const r = st.results;
  if (!r) return null;
  return (
    <div className="gb-overlay">
      <div className="gb-card gb-dossier gb-results">
        <div className="gb-stamp">Performance review</div>
        <h2>{r.title}</h2>
        <div className="gb-grade">
          <span className="gb-grade-letter">{r.grade}</span>
          <span>
            {r.gradeTitle}
            <br />
            <span className="gb-small">
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
        <h3>Remarks of the Committee</h3>
        {r.remarks.map((x, i) => (
          <p key={i} className="gb-remark">
            {x}
          </p>
        ))}
        {r.debrief && <p className="gb-debrief">{r.debrief}</p>}
        <div className="gb-row">
          <button className="gb-primary" onClick={() => game.toTitle()}>
            Continue
          </button>
          <button onClick={() => game.restart()}>Try again</button>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = { good: '#8cf28c', food: '#ffd75a', warn: '#ffbf40', bad: '#ff5a4d', info: '#d9e6ff' };

function Hud({ st }: { st: GameState }) {
  const h = st.hud;
  const s = st.settings;
  return (
    <>
      <div className="gb-hud gb-hud-tl">
        <div className="gb-readout">
          <b>{Math.round(h.speedKmh)}</b> km/h · <b>{Math.round(h.altitude)}</b> m
        </div>
        <div className="gb-readout gb-small">
          {h.mode} · heading {String(Math.round(h.heading) % 360).padStart(3, '0')}°
        </div>
        <div className="gb-payload" title="Payload">
          {Array.from({ length: h.maxPayload }, (_, i) => (
            <span key={i} className={i < h.payload ? 'on' : ''} />
          ))}
          <span className="gb-beak">{h.beak ? `Beak: ${h.beak}` : 'Beak: empty'}</span>
        </div>
        {st.operation !== 'free' && <div className="gb-small">Score {st.score}</div>}
      </div>
      {st.objectives.length > 0 && (
        <div className="gb-hud gb-objectives">
          <div className="gb-obj-title">{st.operationTitle}</div>
          {st.objectives.map((o) => (
            <div key={o.id} className={`gb-obj gb-obj-${o.state} ${o.optional ? 'gb-obj-opt' : ''}`}>
              <span className="gb-obj-box">{o.state === 'done' ? '✔' : o.state === 'failed' ? '✘' : ''}</span>
              {o.text}
            </div>
          ))}
        </div>
      )}
      <div className="gb-hud gb-bottom">
        {st.radio && (
          <div className="gb-radio" key={st.radio.id}>
            <span className="gb-radio-who">{st.radio.speaker}:</span> {st.radio.text}
          </div>
        )}
        {st.prompt && <div className="gb-action">{st.prompt}</div>}
      </div>
      <div className="gb-hud gb-toasts">
        {st.toasts.map((t) => (
          <div key={t.id} className="gb-toast" style={{ color: TONE[t.tone] }}>
            {t.text}
          </div>
        ))}
      </div>
      {st.banner && (
        <div className="gb-hud gb-banner" key={st.banner.id} style={{ color: TONE[st.banner.tone], borderColor: TONE[st.banner.tone] }}>
          {st.banner.text}
        </div>
      )}
      {st.overlays.map((o) => (
        <div key={o.id} className="gb-guard" style={{ left: `${(o.x * 0.5 + 0.5) * 100}%`, top: `${(0.5 - o.y * 0.5) * 100}%` }}>
          {o.speech && <div className="gb-speech">{o.speech}</div>}
          {o.icon && <div className={`gb-icon gb-icon-${o.icon === '!' ? 'alert' : o.icon === '?' ? 'sus' : 'busy'}`}>{o.icon}</div>}
          {o.name && (
            <div className="gb-tagname">
              {o.name} <span>· {o.state}</span>
              <div className="gb-meter">
                <i style={{ width: `${Math.round(o.suspicion * 100)}%` }} />
              </div>
            </div>
          )}
          {o.tag !== undefined && o.tag > 0 && (
            <div className="gb-tagging">
              TAGGING <i style={{ width: `${Math.round(Math.min(1, o.tag) * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
      {h.drop && (
        <div className="gb-drop" style={{ left: `${(h.drop.x * 0.5 + 0.5) * 100}%`, top: `${(0.5 - h.drop.y * 0.5) * 100}%` }}>
          ON TARGET
        </div>
      )}
      {h.offscreen !== undefined && <div className="gb-arrow" style={{ transform: `translate(-50%, -50%) rotate(${h.offscreen}rad) translateY(-38vmin)` }} />}
      {st.tension === 2 && <div className="gb-vignette" />}
      <div className="gb-hud gb-hud-br gb-small">
        {st.cameraLabel} camera (C) · {Math.round(st.fps)} fps
      </div>
      {s.showControls && <ControlsPanel />}
    </>
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
  ['Right mouse', 'scout'],
  ['G', 'signal'],
  ['C', 'camera · wheel zooms'],
  ['Esc', 'pause · H hides this'],
];

function ControlsPanel() {
  return (
    <div className="gb-hud gb-controls gb-small">
      {CONTROLS.map(([k, v]) => (
        <div key={k}>
          <b>{k}</b> {v}
        </div>
      ))}
    </div>
  );
}

function PauseMenu({ game, st }: { game: GullGame; st: GameState }) {
  return (
    <div className="gb-overlay">
      <div className="gb-card gb-menu">
        <div className="gb-stamp">Paused</div>
        <h2>{st.operationTitle}</h2>
        <button className="gb-primary" onClick={() => game.resume()}>
          Resume
        </button>
        <button onClick={() => game.restart()}>Restart {st.operation === 'free' ? 'free flight' : 'operation'}</button>
        <button onClick={() => game.toTitle()}>Abandon to the title screen</button>
        <h3>Camera</h3>
        <div className="gb-row">
          {GULL_CAMERAS.map((c) => (
            <button key={c} className={st.camera === c ? 'on' : ''} onClick={() => game.setCamera(c)}>
              {CAMERA_LABEL[c]}
            </button>
          ))}
        </div>
        <SettingsPanel game={game} s={st.settings} />
      </div>
    </div>
  );
}

function SettingsPanel({ game, s }: { game: GullGame; s: Settings }) {
  const set = (p: Partial<Settings>) => game.updateSettings(p);
  const gfx = game.state.graphics;
  return (
    <div className="gb-settings">
      <h3>Settings</h3>
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
