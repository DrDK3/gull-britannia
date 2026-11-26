/**
 * The story as data. Everything the campaign says lives under `src/gull/game/story/`: plain objects, no logic beyond
 * small look-ups, no DOM. The reference for what it all means is `docs/story/bible.md`; the level briefs are in
 * `docs/story/missions/`.
 *
 * Rules the content keeps (tests/gull/story.test.ts checks them):
 *  - A control is named by its action, `{flap}`, `{scout}` (ids in ../actions.ts). Never a key.
 *  - A radio line is 140 characters at most. A longer thought is two lines in the same beat.
 *  - Mother, the Committee, the Wing and the skipper never use an exclamation mark. The garrison may shout.
 */

export type FileId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6';

/** Everyone who speaks, is spoken of, or has a file. `CAST` in cast.ts has one entry for each. */
export type CastId =
  // Section G and the town
  | 'scrumpy'
  | 'mother'
  | 'committee'
  | 'skipper'
  | 'clerk'
  | 'baker'
  | 'custodian'
  // The Bomber Wing
  | 'gristle'
  | 'wimbush'
  | 'nelson'
  | 'padre'
  // The garrison
  | 'borovsky'
  | 'voronova'
  | 'grushkov'
  | 'marshal'
  | 'utkin'
  | 'pirogov'
  | 'kulik'
  | 'osipov'
  | 'sorokin'
  | 'garrison'
  // S-197
  | 'chaikin'
  | 'golubev'
  | 'krull'
  | 'oberst'
  | 'crew';

export type Side = 'section-g' | 'wing' | 'town' | 'garrison' | 'boat';

export interface CastMember {
  id: CastId;
  /** Full name and rank, as a file would give it. */
  name: string;
  /** The label on a radio line or a speech caption. */
  tag: string;
  side: Side;
  /** One line: who this is. */
  role: string;
  wants: string;
  flaw: string;
  /** How they change from File 1 to File 6. */
  arc: string;
  /** How to write them. */
  voice: string;
  /** Three lines that could be nobody else's. Empty for those who never speak. */
  samples: string[];
  /** The files they appear in. */
  files: FileId[];
}

/**
 * Which line wins when two want the radio: danger interrupts, an objective waits its turn, colour is dropped if the
 * queue is busy or its moment has passed.
 */
export type Priority = 'danger' | 'objective' | 'colour';

export interface RadioLine {
  speaker: CastId;
  priority: Priority;
  /** 140 characters at most, `{action}` tokens allowed. */
  text: string;
}

/** One moment of a mission: what sets it off, in words, and what is said. A builder calls it by `id`. */
export interface RadioBeat {
  id: string;
  /** The condition, in words. */
  when: string;
  lines: RadioLine[];
}

export const TIERS = ['calm', 'suspicious', 'alarmed', 'afterwards'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * What one character says aloud in one file, by how worried they are. `calm` is the routine; `suspicious` is a question
 * mark; `alarmed` is seeing, chasing and searching; `afterwards` is the walk back and the rest of the mission.
 * `extra` holds lines for one named occasion each (a hit, a theft, a set piece), keyed by a short name.
 */
export interface BarkPool {
  who: CastId;
  /** A guard can spot the gull and has six lines or more a tier; anyone else has three or more. */
  role: 'guard' | 'npc';
  calm: string[];
  suspicious: string[];
  alarmed: string[];
  afterwards: string[];
  extra?: Record<string, string[]>;
}

export interface Briefing {
  /** 'SECTION G / FILE 3' */
  file: string;
  dateline: string;
  /** The card shown before play: 80 words at most. */
  brief: string;
  /** One line each, in order. */
  orders: string[];
  /** The whole dossier, for those who open it. */
  dossier: string;
  signed: string;
}

export interface ObjectiveText {
  id: string;
  text: string;
  optional?: boolean;
}

export interface Debrief {
  /** The operation went as intended. Ends on the next file's hook. */
  standard: string;
  /** The operation was Compromised: it still ends, the story still moves, and somebody is unbearable about it. */
  compromised: string;
  /** Other endings, each with its condition in words. */
  alt?: { when: string; text: string }[];
}

/** An overheard memorandum, letter or telephone call: the other side's account of what the player just did. */
export interface Intercept {
  id: string;
  heading: string;
  /** One paragraph or entry a line. */
  body: string[];
  /** A note added by another hand. */
  footnote?: string;
  /** Lines that replace or follow the body in particular cases. */
  alt?: { when: string; body: string[] }[];
}

/** A remark by the Committee on the performance review. */
export interface CommitteeRemark {
  when: string;
  text: string;
}

/** An entry the review can add to the operative's personnel file. */
export interface PersonnelEntry {
  id: string;
  kind: 'citation' | 'reprimand';
  title: string;
  /** As it reads in the file. */
  text: string;
  /** What earns it, in words. */
  when: string;
}

export interface FileStory {
  id: FileId;
  number: number;
  title: string;
  district: string;
  /** One line for the list of operations. */
  blurb: string;
  /** The day and hour of the fiction, British Summer Time. */
  date: string;
  hour: string;
  briefing: Briefing;
  objectives: ObjectiveText[];
  radio: RadioBeat[];
  barks: BarkPool[];
  debrief: Debrief;
  intercept: Intercept;
  committee: CommitteeRemark[];
  personnel: PersonnelEntry[];
  /** The line this file adds to Private Borovsky's record. */
  borovskyFile: string;
  /** What the skipper leaves in the lobster pot. */
  pot: string;
  /** What Mother adds, by hand, to the operative's file. */
  mothersNote: string;
  /** How the Kommandatura's own file describes the gull after this. */
  garrisonNote: string;
}

/** Something the player did that nobody asked for, and that somebody noticed. */
export interface ReactiveMoment {
  id: string;
  /** The condition, in words. */
  when: string;
  /** once: once a campaign. file: once a file. cooldown: again after a decent interval. */
  repeat: 'once' | 'file' | 'cooldown';
  /** The files it can happen in; all of them if absent. */
  files?: FileId[];
  /** Two or three ways of saying it. Pick one; do not repeat it next time. */
  variants: RadioLine[];
}

/** A radio line, briefly: `say('mother', 'Noted.')`. An objective unless told otherwise. */
export function say(speaker: CastId, text: string, priority: Priority = 'objective'): RadioLine {
  return { speaker, priority, text };
}
