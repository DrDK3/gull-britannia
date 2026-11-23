/**
 * SailSim's River Dart as it is today, taken back to June 1967 (Gull Britannia's alternative 1967). The land, the
 * town, the quays and the river are the same; what came later is taken out:
 *
 * - Darthaven Marina (about 1975) and Noss on Dart Marina (2023) with their berths, and the visitor and service
 *   pontoons out in the river. Fixed jetties, steps and slips stay. Dart Marina at Sandquay stays: Philip & Son's yard
 *   there became a marina in 1965 (smaller than today's; its fixed piers are kept as they are).
 * - Buildings put up after 1967 that stand out: the supermarkets, filling station, leisure centre and park-and-ride
 *   out at Townstal; the apartment blocks on the North Embankment and at Kingswear; the arts centre; the lifeboat
 *   station (2007); the toilet block and pumping station by Coronation Park; the tourist office (1993) and the
 *   Marks & Spencer block (1995-96, on what was the bus park) off Mayor's Avenue; the harbour authority's depot at
 *   Hoodown (the authority dates from 1975).
 * - The college's moored training ship Hindostan (the former HMS Cromer, commissioned in 1992).
 * - The Noss on Dart ferry (it serves the marina).
 * - Most of the yachts on the trots: fewer, smaller boats then. (The models are SailSim's; shapes are modern.)
 *
 * The superyacht on the ship buoys, the marina's lettering and the heritage steam train are left out in
 * src/render/dart.ts (`era: '1967'`), and the street's cars get a period palette there. Sources, and what is still
 * wrong for 1967: reports/Dartmouth and the Dart in 1967.md, SOURCES.md and reports/backlog.md.
 */
import type { DartData, DartFeatures } from '../../app/geoLoader';

/** Buildings by name (OpenStreetMap) that were not there in 1967. */
export const MODERN_BUILDINGS = new Set([
  "Sainsbury's",
  'Lidl',
  'BP',
  'Dartmouth Leisure Centre',
  'Dartmouth Park & Ride Toilets',
  'Dartmouth Health and Wellbeing Centre',
  'Marina View Apartments',
  'Clarence House',
  'Dartside Court',
  'Kings Quay House',
  'Lee Court',
  'Mayflower Court',
  'Sails',
  'Vavasour House',
  'Sewage Pumping Station',
  'Toilet and shower block',
  'Dartmouth Community Greenhouse',
  'Dart Lifeboat Station',
  'The Flavel',
  'Dartmouth Tourist Information Centre',
  'Marks & Spencer',
  'Hoodown Depot - Dart Harbour and Navigation Authority',
  // A ship that OpenStreetMap maps as a building (src/render/dart.ts draws her from it).
  'Hindostan',
]);

/**
 * Removed by name and place together, where the name alone also matches older premises: the filling station's shop at
 * Townstal is a Spar, and so are two shops in town (a Spar grocer traded in Dartmouth in the 1960s).
 */
const MODERN_AT: readonly { name: string; e: number; n: number; r: number }[] = [{ name: 'Spar', e: -1928, n: -32, r: 60 }];

/**
 * Floating stages that stay. The river boats' pontoon is not of 1967 (they lay against the quay wall by the station
 * pontoon then), but SailSim's river boat still calls there: it goes when the station pontoon is built
 * (reports/backlog.md).
 */
const KEEP_FLOATING = new Set(['Riverboat Pontoon']);

const MODERN_FERRIES = new Set(['Noss on Dart / Dartmouth Ferry']);

/** Share of the moored boats kept (by a fixed hash, so the same boats every time). */
export const MOORINGS_KEPT = 0.42;

function centre(pts: readonly (readonly [number, number])[]): [number, number] {
  let e = 0;
  let n = 0;
  for (const p of pts) {
    e += p[0];
    n += p[1];
  }
  return [e / pts.length, n / pts.length];
}

function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function features1967(f: DartFeatures): DartFeatures {
  const piers = f.piers.filter((p) => !p.floating || (!!p.name && KEEP_FLOATING.has(p.name)));
  const modern = (b: DartFeatures['buildings'][number]) => {
    if (!b.n) return false;
    if (MODERN_BUILDINGS.has(b.n)) return true;
    const [e, n] = centre(b.r as [number, number][]);
    return MODERN_AT.some((m) => m.name === b.n && Math.hypot(e - m.e, n - m.n) < m.r);
  };
  const moorings = f.moorings.filter((m, i) => {
    const keep = m.k === 'motor' ? MOORINGS_KEPT * 0.4 : MOORINGS_KEPT;
    return hash01(i) < keep;
  });
  return {
    ...f,
    buildings: f.buildings.filter((b) => !modern(b)),
    piers,
    marinas: [],
    moorings,
    ferries: f.ferries.filter((x) => !MODERN_FERRIES.has(x.name)),
  };
}

/** The data set as of 1967 (a shallow copy: grids and images are shared). */
export function data1967(d: DartData): DartData {
  return d.features ? { ...d, features: features1967(d.features) } : d;
}
