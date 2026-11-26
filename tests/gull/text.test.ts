/**
 * Player-facing text: no key letters (CLAUDE.md rule 6), radio lines short enough to read in flight, and a briefing
 * that is short up front.
 *
 * The check reads the source files: every string in a mission, in the coach and in the briefings is looked at, whether
 * or not a test happens to reach the line that says it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { BRIEFINGS, briefingWords } from '../../src/gull/app/briefings';
import { isAction } from '../../src/gull/game/actions';
import { tokenise } from '../../src/gull/game/coach';

const ROOT = join(__dirname, '../..');
const GAME = 'src/gull/game';

/** Files whose strings must be clean as written. */
function strictFiles(): string[] {
  const files = ['m1.ts', 'm2.ts', 'free.ts', 'coach.ts', 'parade.ts', 'guard.ts', 'items.ts', 'operations.ts', 'ambient.ts'].map((f) => `${GAME}/${f}`);
  files.push('src/gull/app/briefings.ts');
  // The story's own files, when they arrive.
  const story = join(ROOT, GAME, 'story');
  if (existsSync(story)) for (const f of readdirSync(story, { recursive: true }) as string[]) if (f.endsWith('.ts')) files.push(`${GAME}/story/${f}`);
  return files.filter((f) => existsSync(join(ROOT, f)));
}

/** The base mission still names a few default keys; they are translated on the way to the screen (coach.ts tokenise). */
const LEGACY = [`${GAME}/mission.ts`];

interface Found {
  file: string;
  line: number;
  text: string;
}

/** Every piece of literal text in a file that reads as prose (it has a space or a bracket in it). */
function strings(file: string): Found[] {
  const src = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  const out: Found[] = [];
  const add = (node: ts.Node, text: string) => {
    if (!/[ [\]]/.test(text.trim())) return;
    out.push({ file, line: src.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateExpression(node)) add(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('…'));
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

/** The keys a piece of text names, if any. */
function keyNames(text: string): string[] {
  const t = text
    .replace(/\{[a-zA-Z]+\}/g, ' ')
    .replace(/Section G\b/gi, 'Section')
    // An initial: "Private G. Borovsky".
    .replace(/\b[A-Z]\. (?=[A-Z][a-z])/g, '');
  const found: string[] = [];
  const all = (re: RegExp) => {
    for (const m of t.matchAll(re)) found.push(m[0].trim());
  };
  all(/\[(?:[A-Za-z]|Space|Shift|Esc|Tab|Enter|Ctrl|Alt)\]/g);
  all(/\b(?:Space ?bar|Space|Shift|Esc|Escape|Ctrl)\b/g);
  all(/\b(?:mouse|click|clicks|clicking|arrow keys?|keyboard|trackpad|gamepad)\b/gi);
  // A capital letter standing alone ("press G", "release with Q"). "A" and "I" are words, so they need a verb before.
  all(/(?<![\p{L}\p{N}’'.-])[B-HJ-Z](?![\p{L}\p{N}’'-])/gu);
  all(/\b(?:[Pp]ress|[Hh]old|[Tt]ap|[Hh]it)\s+(?:the\s+)?[AI]\b/g);
  return found;
}

describe('player-facing text', () => {
  it('the key detector knows a key when it sees one', () => {
    expect(keyNames('Take off from the nest [Space]')).toEqual(['[Space]', 'Space']);
    expect(keyNames('Press G to signal.')).toEqual(['G']);
    expect(keyNames('W to flap. Shift to dive, S to brake.')).toEqual(['Shift', 'W', 'S']);
    expect(keyNames('Hold right mouse, or T, on him.')).toEqual(['mouse', 'T']);
    expect(keyNames('Hold A to bank.')).toEqual(['Hold A']);
    expect(keyNames('release with Q')).toEqual(['Q']);
    // Not keys.
    expect(keyNames('Section G regulations: S-197 berths at Sandquay. A gull has… never mind.')).toEqual([]);
    expect(keyNames('The table is watched by one sentry, Private G. Borovsky.')).toEqual([]);
    expect(keyNames('Hold {scout} on him, then {interact}. I’m afraid so.')).toEqual([]);
  });

  it('no mission, coach or briefing string names a key', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of strictFiles()) {
      for (const s of strings(f)) {
        seen++;
        const keys = keyNames(s.text);
        if (keys.length) bad.push(`${s.file}:${s.line} names ${keys.join(', ')}: “${s.text.slice(0, 90)}”`);
      }
    }
    expect(seen).toBeGreaterThan(150);
    expect(bad).toEqual([]);
  });

  it('what the base mission still says about keys is translated into actions before it is shown', () => {
    const bad: string[] = [];
    let translated = 0;
    for (const f of LEGACY) {
      for (const s of strings(f)) {
        const shown = tokenise(s.text);
        if (shown !== s.text) translated++;
        const keys = keyNames(shown);
        if (keys.length) bad.push(`${s.file}:${s.line} names ${keys.join(', ')}: “${s.text.slice(0, 90)}”`);
      }
    }
    expect(bad).toEqual([]);
    // When mission.ts is rewritten with {action} tokens this count reaches zero and the translation can go.
    expect(translated).toBeGreaterThanOrEqual(0);
  });

  it('every {name} in the text is one of the player’s actions', () => {
    const bad: string[] = [];
    for (const f of [...strictFiles(), ...LEGACY]) {
      for (const s of strings(f)) {
        // Template placeholders (`${x}`) are code, not tokens: only whole {word} groups in literal text count.
        for (const m of tokenise(s.text).matchAll(/\{([a-zA-Z]+)\}/g)) if (!isAction(m[1]!)) bad.push(`${s.file}:${s.line} {${m[1]}}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a radio line is at most 140 characters: about nine seconds of reading in flight', () => {
    const long: string[] = [];
    let lines = 0;
    for (const f of [`${GAME}/m1.ts`, `${GAME}/m2.ts`, `${GAME}/mission.ts`]) {
      const src = ts.createSourceFile(f, readFileSync(join(ROOT, f), 'utf8'), ts.ScriptTarget.ES2022, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const name = node.expression.name.text;
          const arg = name === 'say' ? node.arguments[1] : name === 'sayOnce' ? node.arguments[2] : undefined;
          if (arg) {
            // A name put into the line ("Pte. Borovsky has seen you") is counted as twelve characters.
            const text = ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) ? arg.text : ts.isTemplateExpression(arg) ? [arg.head.text, ...arg.templateSpans.map((s) => s.literal.text)].join('x'.repeat(12)) : undefined;
            if (text !== undefined) {
              lines++;
              if (text.length > 140) long.push(`${f}:${src.getLineAndCharacterOfPosition(arg.getStart()).line + 1} is ${text.length} characters: “${text.slice(0, 60)}…”`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
    expect(lines).toBeGreaterThan(30);
    expect(long).toEqual([]);
  });

  it('a briefing shows about 80 words, with the full dossier behind it', () => {
    for (const [id, b] of Object.entries(BRIEFINGS)) {
      const words = briefingWords(b);
      expect(words, `${id}: ${words} words up front`).toBeGreaterThanOrEqual(60);
      expect(words, `${id}: ${words} words up front`).toBeLessThanOrEqual(95);
      expect(b.orders.length, id).toBeGreaterThanOrEqual(3);
      expect(b.orders.length, id).toBeLessThanOrEqual(5);
      expect(b.full.split(/\s+/).length, id).toBeGreaterThan(words);
      for (const text of [b.short, b.full, ...b.orders]) expect(keyNames(text), `${id}: “${text.slice(0, 60)}”`).toEqual([]);
    }
  });
});
