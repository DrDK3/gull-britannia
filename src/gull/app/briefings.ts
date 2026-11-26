/**
 * Briefing dossiers. Short, dry and deadly serious about very silly things.
 *
 * Each has three parts that can be replaced separately (the story's final text will be):
 *  - `short`: what the player must know before flying. With `orders` it comes to about 80 words, and it is all that
 *    the briefing card shows at first;
 *  - `orders`: the operation as a numbered list, a few words each;
 *  - `full`: the whole dossier, behind "Read full dossier".
 * Paragraphs are separated by a blank line. Name actions as `{action}` (actions.ts), never keys.
 */

export interface Briefing {
  file: string;
  dateline: string;
  short: string;
  orders: string[];
  full: string;
  signed: string;
}

export const BRIEFINGS: Record<string, Briefing> = {
  m1: {
    file: 'SECTION G / FILE 1',
    dateline: 'DARTMOUTH, DEVON · SATURDAY 3 JUNE 1967 · 13.20 HRS',
    short:
      'Each day a courier leaves a dispatch on a table outside the old Custom House on Bayard’s Cove while he takes his lunch. One sentry watches it: Private Borovsky, punctual, unimaginative and devoted to his tea.\n\nTo them you are just a gull. Behave like one, right up until you don’t.',
    orders: ['Take off, and land on the station roof.', 'Secure lunch.', 'Steal the dispatch: unseen, or by distraction.', 'Deliver it to the lobster pot on the Dorothy May.'],
    full: 'Operative SCRUMPY (Herring Gull, adult, unbanded),\n\nEach day a Kommandatura courier leaves a dispatch on a table outside the old Custom House on Bayard’s Cove while he takes his lunch. The table is watched by one sentry, Private G. Borovsky. Borovsky is punctual, unimaginative and devoted to his tea.\n\nYou will first demonstrate flight, perching and the acquisition of lunch, in that order. You will then take the dispatch and place it in the lobster pot aboard the crabber DOROTHY MAY, moored in the Boat Float, where a friend will collect it.\n\nThere are two ways to do this. Wait above him until his back is turned, or give him a reason to leave. The Committee has no preference, provided the result is the same.\n\nRemember: to them you are just a gull. Behave like one, right up until you don’t.',
    signed: 'MOTHER, for the Committee',
  },
  m2: {
    file: 'SECTION G / FILE 2',
    dateline: 'DARTMOUTH · WEDNESDAY 7 JUNE 1967 · 10.55 HRS',
    short:
      'The berthing orders of submarine S-197 lie on the lectern of the reviewing stand on the South Embankment while Colonel Grushkov reviews his garrison. His adjutant, Lieutenant Voronova, watches the lectern and misses nothing.\n\nYou lead the Bomber Wing: four veterans, waiting on the hotel roof. Break the parade and she will leave it.',
    orders: ['Scout the stand and tag Voronova.', 'Signal the Wing from the Royal Castle Hotel roof.', 'Lead a strike on the parade as it passes the stand.', 'Steal the Inspection Order and deliver it to the Dorothy May.'],
    full: 'Operative SCRUMPY,\n\nThe dispatch you recovered names a submarine, S-197, due to berth in the Dart. Her berthing orders are bound into the Commandant’s Inspection Order, which will lie on the lectern of the reviewing stand on the South Embankment this morning while Colonel Grushkov reviews his garrison.\n\nThe lectern is watched by his adjutant, Lieutenant Voronova, who misses nothing. Except, we hope, a sky full of gulls.\n\nFor this operation you are attached to the Bomber Wing. Four veterans of the Royal Dart Squadron are waiting on the roof of the Royal Castle Hotel. Signal them, lead them over the parade, and break the formation. In the confusion, take the Order and bring it to the drop on the Dorothy May in the Boat Float.\n\nAs bomber lead you will carry a larger payload and turn a little wider. Plan your run.',
    signed: 'MOTHER, for the Committee',
  },
};

/** The words a player sees before choosing to read on: the short text and the orders. */
export function briefingWords(b: Briefing): number {
  return [b.short, ...b.orders].join(' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export interface OperationInfo {
  id: string;
  title: string;
  blurb: string;
  playable: boolean;
}

/** The campaign. Only playable operations are offered on the title screen. */
export const OPERATIONS: OperationInfo[] = [
  { id: 'm1', title: 'A Chip Off the Old Block', blurb: 'Bayard’s Cove. One sentry, one dispatch, one lunch.', playable: true },
  { id: 'm2', title: 'The Inspection', blurb: 'The South Embankment. A parade, a lectern, a flock.', playable: true },
];
