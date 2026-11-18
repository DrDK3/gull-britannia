/**
 * SailSim's River Dart as it is today, taken back to June 1967 (Gull Britannia's alternative 1967). The land, the
 * town, the quays and the river are the same; what came later is taken out:
 *
 * - The marinas (Darthaven, Dart Marina, Noss on Dart) and their berths, and the visitor and service pontoons out in
 *   the river. Fixed jetties, steps and slips stay, as do the landing stages for the ferries and the river boats.
 * - Buildings put up after 1967 that stand out from the river: the supermarkets, filling station, leisure centre and
 *   park-and-ride out at Townstal; the apartment blocks on the North Embankment and at Kingswear; the arts centre; the
 *   lifeboat station (the Dart station opened in 2007); the toilet block and pumping station by Coronation Park.
 * - The Noss on Dart ferry (it serves the marina).
 * - Most of the yachts on the trots: fewer, smaller boats then. (The models are SailSim's; shapes are modern.)
 *
 * The superyacht on the ship buoys and the marina's lettering are left out in src/render/dart.ts (`era: '1967'`),
 * and the street's cars get a period palette there. Sources and what remains approximate: SOURCES.md.
 */
import type { DartData, DartFeatures } from '../../app/geoLoader';

/** Buildings by name (OpenStreetMap) that were not there in 1967. */
export const MODERN_BUILDINGS = new Set([
  "Sainsbury's",
  'Lidl',
  'Spar',
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
]);

/** Floating stages that stay: the ferries' and the river boats' landings. */
const KEEP_FLOATING = new Set(['Riverboat Pontoon', 'Double Steps Pontoon']);

/** Kingswear's passenger ferry landing (unnamed in the data): kept. */
const KINGSWEAR_FERRY = { e: 202, n: 359, r: 25 };

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
  const piers = f.piers.filter((p) => {
    if (!p.floating) return true;
    if (p.name && KEEP_FLOATING.has(p.name)) return true;
    const [e, n] = centre('line' in p ? p.line : p.poly);
    return Math.hypot(e - KINGSWEAR_FERRY.e, n - KINGSWEAR_FERRY.n) < KINGSWEAR_FERRY.r;
  });
  const moorings = f.moorings.filter((m, i) => {
    const keep = m.k === 'motor' ? MOORINGS_KEPT * 0.4 : MOORINGS_KEPT;
    return hash01(i) < keep;
  });
  return {
    ...f,
    buildings: f.buildings.filter((b) => !(b.n && MODERN_BUILDINGS.has(b.n))),
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
