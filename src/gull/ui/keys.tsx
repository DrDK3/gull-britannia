import type { ReactNode } from 'react';
import { actionGroups } from '../app/input';
import type { GullGame } from '../app/game';
import { ACTIONS, isAction, type ActionId, type ActionInfo } from '../game/actions';

const TABLE: Record<string, ActionInfo> = ACTIONS;

/**
 * Text that names actions as `{action}` tokens, with each token drawn as a key cap carrying the current binding's label
 * ("Hold {flap} to take off." → Hold [Space] to take off.). All player-facing text goes through this.
 */
export function Keys({ text, label }: { text: string; label: (id: ActionId) => string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(/\{([a-zA-Z]+)\}/g)) {
    const id = m[1]!;
    if (!isAction(id)) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <kbd key={n++} className="gb-key">
        {label(id)}
      </kbd>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/**
 * The full list of controls, straight from the actions table and the current bindings: every binding of every action,
 * in groups. It lives in the pause menu and on the title screen; in play the coach's prompts name one key at a time.
 */
export function ControlsList({ game }: { game: GullGame }) {
  return (
    <div className="gb-controls-list">
      {actionGroups().map((g) => (
        <section key={g.title}>
          <h3 className="gb-h">{g.title}</h3>
          <dl>
            {g.ids.map((id) => {
              const labels = TABLE[id]!.kind === 'axis' ? ['Mouse', 'Arrow keys'] : game.input.bindingLabels(id, 'keys');
              return (
                <div key={id} className="gb-control-row">
                  <dt>
                    {labels.map((l, i) => (
                      <span key={l}>
                        {i > 0 && ' or '}
                        <kbd className="gb-key">{l}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{TABLE[id]!.verb}</dd>
                </div>
              );
            })}
            {g.title === 'Interface' && (
              <div className="gb-control-row">
                <dt>
                  <kbd className="gb-key">Wheel</kbd>
                </dt>
                <dd>move the camera in or out</dd>
              </div>
            )}
          </dl>
        </section>
      ))}
    </div>
  );
}
