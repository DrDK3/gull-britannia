/** The 1967 removal list, against the real map data (public/geo/features.json). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DartFeatures } from '../../src/app/geoLoader';
import { features1967 } from '../../src/gull/view/era1967';

const today = JSON.parse(readFileSync(new URL('../../public/geo/features.json', import.meta.url), 'utf8')) as DartFeatures;
const then = features1967(today);
const named = (f: DartFeatures, n: string) => f.buildings.filter((b) => b.n === n);
const centre = (r: readonly (readonly number[])[]) => [r.reduce((s, p) => s + p[0]!, 0) / r.length, r.reduce((s, p) => s + p[1]!, 0) / r.length] as const;

describe('the River Dart taken back to 1967', () => {
  it('removes the filling station’s Spar at Townstal, and leaves the two Spar shops in town', () => {
    expect(named(today, 'Spar')).toHaveLength(3);
    const left = named(then, 'Spar');
    expect(left).toHaveLength(2);
    for (const b of left) expect(centre(b.r)[0]).toBeGreaterThan(-1600);
  });

  it('removes what was built later', () => {
    for (const n of ['Hindostan', 'Marks & Spencer', 'Dartmouth Tourist Information Centre', 'Hoodown Depot - Dart Harbour and Navigation Authority', 'BP', 'The Flavel', 'Dart Lifeboat Station']) {
      expect(named(today, n).length, n).toBeGreaterThan(0);
      expect(named(then, n), n).toHaveLength(0);
    }
    expect(then.marinas).toHaveLength(0);
    expect(then.ferries.some((f) => f.name.includes('Noss'))).toBe(false);
  });

  it('keeps no modern pontoon but the river boats’ landing (until the station pontoon is built)', () => {
    const floating = then.piers.filter((p) => p.floating);
    expect(floating.map((p) => p.name)).toEqual(['Riverboat Pontoon']);
    expect(today.piers.filter((p) => p.floating).length).toBeGreaterThan(40);
  });

  it('keeps every fixed pier, Dart Marina’s (a marina since 1965) among them', () => {
    const fixed = (f: DartFeatures) => f.piers.filter((p) => !p.floating).length;
    expect(fixed(then)).toBe(fixed(today));
  });

  it('thins the moorings and leaves everything else alone', () => {
    expect(then.moorings.length).toBeLessThan(today.moorings.length * 0.5);
    expect(then.moorings.length).toBeGreaterThan(today.moorings.length * 0.2);
    expect(today.buildings.length - then.buildings.length).toBeLessThan(40);
    expect(then.landmarks).toBe(today.landmarks);
  });
});
