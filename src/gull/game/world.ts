/**
 * The solid world the gull flies in. DOM-free (src/gull/game is checked by tsconfig.game.json).
 *
 * The town is a height grid captured from what the scene draws (src/gull/view/heightCapture.ts): each cell holds the
 * top of whatever stands there (ground, quay, roof, chimney, tree), so collisions match the picture. It is 2.5-D:
 * every cell is solid from below up to its top. The mission's own props (a table, a lamp, a mast) are exact solids
 * added on top. Water lies at `waterLevel`.
 *
 * Frame: SailSim's local metres, e east and n north of the RDYC origin; h is height above Ordnance Datum Newlyn
 * (m ODN). The scene draws y = h − waterLevel (src/render/scene.ts).
 */

export interface V3 {
  e: number;
  n: number;
  h: number;
}

export const v3 = (e = 0, n = 0, h = 0): V3 => ({ e, n, h });
export const add = (a: V3, b: V3): V3 => ({ e: a.e + b.e, n: a.n + b.n, h: a.h + b.h });
export const sub = (a: V3, b: V3): V3 => ({ e: a.e - b.e, n: a.n - b.n, h: a.h - b.h });
export const scale = (a: V3, k: number): V3 => ({ e: a.e * k, n: a.n * k, h: a.h * k });
export const dot = (a: V3, b: V3): number => a.e * b.e + a.n * b.n + a.h * b.h;
export const len = (a: V3): number => Math.hypot(a.e, a.n, a.h);
export const dist = (a: V3, b: V3): number => Math.hypot(a.e - b.e, a.n - b.n, a.h - b.h);
export const dist2d = (a: { e: number; n: number }, b: { e: number; n: number }): number => Math.hypot(a.e - b.e, a.n - b.n);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 1, 0);
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => ({ e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t, h: a.h + (b.h - a.h) * t });

/** Unit vector for a compass heading (rad, 0 north, clockwise) and a pitch (rad, > 0 up). */
export function dirOf(yaw: number, pitch: number): V3 {
  const c = Math.cos(pitch);
  return { e: Math.sin(yaw) * c, n: Math.cos(yaw) * c, h: Math.sin(pitch) };
}

/** Compass heading of a direction (rad). */
export const headingOf = (d: { e: number; n: number }): number => Math.atan2(d.e, d.n);

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Closest point on segment ab to p. */
export function closestOnSegment(p: V3, a: V3, b: V3): V3 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return add(a, scale(ab, t));
}

export interface Grid {
  /** South-west corner of cell (0, 0) (m), cell size (m), counts east and north. */
  e0: number;
  n0: number;
  cell: number;
  nx: number;
  ny: number;
  /** Top of each cell (m ODN), row-major from the south (index j * nx + i). NaN: nothing drawn there. */
  h: Float32Array;
}

export interface BoxSolid {
  kind: 'box';
  e: number;
  n: number;
  /** Rotation of the box's local x (half-width hx) from east, anticlockwise from above (rad). */
  yaw: number;
  hx: number;
  hy: number;
  h0: number;
  h1: number;
  /** Whether it blocks a guard's view (tables and lamps do not). */
  sight?: boolean;
  tag?: string;
}

export interface CylSolid {
  kind: 'cyl';
  e: number;
  n: number;
  r: number;
  h0: number;
  h1: number;
  sight?: boolean;
  tag?: string;
}

export type Solid = BoxSolid | CylSolid;

export interface Contact {
  /** Outward normal of the surface touched. */
  normal: V3;
  floor: boolean;
  water: boolean;
}

export interface SphereResult {
  pos: V3;
  contacts: Contact[];
}

/** How far up a step counts as floor for the gull's sphere (m): the roofs' stair steps at the grid's cell size. */
export const STEP = 0.45;

export class World {
  readonly grids: Grid[];
  waterLevel: number;
  readonly solids: Solid[] = [];
  /** Ground where no grid reaches (m ODN), e.g. SailSim's terrain function. */
  private readonly beyond: (e: number, n: number) => number;
  /** Where the play area ends (soft limit, handled by the gull). */
  readonly bounds: { eMin: number; eMax: number; nMin: number; nMax: number };

  /** Bare ground where people walk (no roofs or tree crowns), m ODN. */
  private readonly ground?: (e: number, n: number) => number;

  constructor(o: { grids: Grid[]; waterLevel: number; beyond?: (e: number, n: number) => number; ground?: (e: number, n: number) => number; bounds?: World['bounds'] }) {
    // Finest first: cellTop and cellBox take the first grid that covers a point.
    this.grids = [...o.grids].sort((a, b) => a.cell - b.cell);
    this.waterLevel = o.waterLevel;
    this.beyond = o.beyond ?? (() => -50);
    this.ground = o.ground;
    const g = this.grids[this.grids.length - 1];
    this.bounds = o.bounds ?? (g ? { eMin: g.e0, eMax: g.e0 + g.nx * g.cell, nMin: g.n0, nMax: g.n0 + g.ny * g.cell } : { eMin: -1e4, eMax: 1e4, nMin: -1e4, nMax: 1e4 });
  }

  /** The highest top within `r` of (e, n): where to put a perch on a narrow wall or a ridge. */
  highestNear(e: number, n: number, r = 1.5): V3 {
    let best = v3(e, n, this.cellTop(e, n));
    const step = 0.25;
    for (let de = -r; de <= r; de += step) {
      for (let dn = -r; dn <= r; dn += step) {
        if (de * de + dn * dn > r * r) continue;
        const h = this.cellTop(e + de, n + dn);
        if (h > best.h + 0.05) best = v3(e + de, n + dn, h);
      }
    }
    return best;
  }

  /** The ground people stand on at (e, n) (m ODN): the bare ground where it is known, else the top of the cell. */
  groundAt(e: number, n: number): number {
    return this.ground ? this.ground(e, n) : this.cellTop(e, n);
  }

  addSolid(s: Solid): Solid {
    this.solids.push(s);
    return s;
  }

  removeSolid(s: Solid): void {
    const i = this.solids.indexOf(s);
    if (i >= 0) this.solids.splice(i, 1);
  }

  /** Top of the scenery in the cell holding (e, n) (m ODN): the finest grid that covers it, else the terrain. */
  cellTop(e: number, n: number): number {
    for (const g of this.grids) {
      const i = Math.floor((e - g.e0) / g.cell);
      const j = Math.floor((n - g.n0) / g.cell);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
      const v = g.h[j * g.nx + i]!;
      return Number.isNaN(v) ? this.beyond(e, n) : v;
    }
    return this.beyond(e, n);
  }

  /** The grid cell (as a box in e/n) that holds (e, n), and its size. */
  private cellBox(e: number, n: number): { e0: number; n0: number; cell: number } {
    for (const g of this.grids) {
      const i = Math.floor((e - g.e0) / g.cell);
      const j = Math.floor((n - g.n0) / g.cell);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
      return { e0: g.e0 + i * g.cell, n0: g.n0 + j * g.cell, cell: g.cell };
    }
    const c = 2;
    return { e0: Math.floor(e / c) * c, n0: Math.floor(n / c) * c, cell: c };
  }

  /** The highest surface at (e, n): scenery, a solid's top, or the water (whichever is highest). */
  surfaceAt(e: number, n: number): { h: number; water: boolean } {
    let h = this.cellTop(e, n);
    for (const s of this.solids) if (insideSolid2d(s, e, n)) h = Math.max(h, s.h1);
    if (this.waterLevel > h) return { h: this.waterLevel, water: true };
    return { h, water: false };
  }

  /** Is (e, n) over open water (the scenery there lies below the water's surface)? */
  isWater(e: number, n: number): boolean {
    return this.surfaceAt(e, n).water;
  }

  /**
   * Resolve a sphere (centre p, radius r) against the world: walls (cells and solids rising more than `step` above
   * its feet) push it sideways, floors (and the water) push it up. Returns the corrected centre and the contacts.
   */
  collideSphere(p: V3, r: number, step = STEP): SphereResult {
    const pos = { ...p };
    const contacts: Contact[] = [];
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const feet = pos.h - r;
      // Walls first: the cells around the sphere's footprint.
      const reach = r + 0.01;
      let support = -Infinity;
      // The cells under the footprint (each once): sampled at its centre and edges, which reaches every cell
      // a disc of this size can overlap when cells are at least as wide as the disc's radius.
      const seen = new Set<string>();
      const cells: { e0: number; n0: number; cell: number; top: number }[] = [];
      for (const de of [-reach, 0, reach]) {
        for (const dn of [-reach, 0, reach]) {
          const box = this.cellBox(pos.e + de, pos.n + dn);
          const key = `${box.e0},${box.n0},${box.cell}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cells.push({ ...box, top: this.cellTop(box.e0 + box.cell * 0.5, box.n0 + box.cell * 0.5) });
        }
      }
      {
        for (const box of cells) {
          const top = box.top;
          // Closest point of the cell's square to the centre (2-D).
          const qe = Math.max(box.e0, Math.min(pos.e, box.e0 + box.cell));
          const qn = Math.max(box.n0, Math.min(pos.n, box.n0 + box.cell));
          const d2 = Math.hypot(pos.e - qe, pos.n - qn);
          if (d2 > r) continue;
          if (top <= feet + step) {
            // Floor under the footprint: the sphere rests on the highest one (within the disc at the contact height).
            const lift = Math.sqrt(Math.max(0, r * r - d2 * d2));
            support = Math.max(support, top + lift - r);
            continue;
          }
          // A wall: push out sideways.
          if (d2 > 1e-6) {
            const k = (r - d2 + 1e-4) / d2;
            pos.e += (pos.e - qe) * k;
            pos.n += (pos.n - qn) * k;
            contacts.push({ normal: norm(v3(pos.e - qe, pos.n - qn, 0)), floor: false, water: false });
          } else {
            // Inside the column: out by the nearest side, or up if the top is near.
            if (top - feet < 0.9) {
              pos.h = top + r;
              contacts.push({ normal: v3(0, 0, 1), floor: true, water: false });
            } else {
              const opts = [
                [box.e0 - r - pos.e, 0],
                [box.e0 + box.cell + r - pos.e, 0],
                [0, box.n0 - r - pos.n],
                [0, box.n0 + box.cell + r - pos.n],
              ].sort((a, b) => Math.hypot(a[0]!, a[1]!) - Math.hypot(b[0]!, b[1]!));
              const [oe, on] = opts[0]!;
              pos.e += oe!;
              pos.n += on!;
              contacts.push({ normal: norm(v3(oe!, on!, 0)), floor: false, water: false });
            }
          }
          moved = true;
        }
      }
      // Solids.
      for (const s of this.solids) {
        const c = collideSolid(s, pos, r, step);
        if (c) {
          pos.e = c.pos.e;
          pos.n = c.pos.n;
          pos.h = c.pos.h;
          contacts.push(c.contact);
          if (!c.contact.floor) moved = true;
        }
      }
      // Floors and water.
      const water = this.waterLevel;
      if (support > -Infinity && pos.h - r < support) {
        const n = this.floorNormal(pos.e, pos.n);
        pos.h = support + r;
        contacts.push({ normal: n, floor: true, water: false });
      }
      if (pos.h - r < water && water >= support) {
        pos.h = water + r;
        contacts.push({ normal: v3(0, 0, 1), floor: true, water: true });
      }
      if (!moved) break;
    }
    return { pos, contacts };
  }

  /** Normal of the scenery's surface at (e, n), from the slope of the cell tops (for landing on roofs). */
  floorNormal(e: number, n: number): V3 {
    const d = 0.5;
    const he = this.cellTop(e + d, n) - this.cellTop(e - d, n);
    const hn = this.cellTop(e, n + d) - this.cellTop(e, n - d);
    // Steps taller than a step are walls, not slope.
    const ge = Math.abs(he) > 2 * STEP ? 0 : he / (2 * d);
    const gn = Math.abs(hn) > 2 * STEP ? 0 : hn / (2 * d);
    return norm(v3(-ge, -gn, 1));
  }

  /** The support height under a sphere at p (for walking and standing), or -Infinity. */
  supportUnder(p: V3, r: number, step = STEP): { h: number; water: boolean } {
    let best = -Infinity;
    let water = false;
    const feet = p.h - r;
    for (const [de, dn] of [[0, 0], [r * 0.6, 0], [-r * 0.6, 0], [0, r * 0.6], [0, -r * 0.6]] as const) {
      const top = this.cellTop(p.e + de, p.n + dn);
      if (top <= feet + step && top > best) best = top;
    }
    for (const s of this.solids) {
      if (insideSolid2d(s, p.e, p.n) && s.h1 <= feet + step && s.h1 > best) best = s.h1;
    }
    if (this.waterLevel > best) {
      best = this.waterLevel;
      water = true;
    }
    return { h: best, water };
  }

  /** Whether a straight line from a to b is clear of the scenery and of solids that block sight. */
  lineOfSight(a: V3, b: V3): boolean {
    const d = dist(a, b);
    const steps = Math.max(2, Math.ceil(d / 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      // The last half metre at each end is the eye and the target themselves.
      if (t * d < 0.5 || (1 - t) * d < 0.5) continue;
      const p = lerp3(a, b, t);
      if (this.cellTop(p.e, p.n) > p.h + 0.05) return false;
    }
    for (const s of this.solids) if (s.sight !== false && segmentHitsSolid(s, a, b)) return false;
    return true;
  }

  /** First point on the segment a→b inside the scenery, a solid or the water, or undefined. */
  raycast(a: V3, b: V3): { point: V3; normal: V3; water: boolean; solid?: Solid } | undefined {
    const d = dist(a, b);
    const steps = Math.max(1, Math.ceil(d / 0.2));
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const p = lerp3(a, b, i / steps);
      for (const s of this.solids) {
        if (segmentHitsSolid(s, prev, p)) return { point: { ...p, h: Math.min(p.h, s.h1) }, normal: v3(0, 0, 1), water: false, solid: s };
      }
      const top = this.cellTop(p.e, p.n);
      if (p.h <= top && top >= this.waterLevel) return { point: { ...p, h: top }, normal: this.floorNormal(p.e, p.n), water: false };
      if (p.h <= this.waterLevel) return { point: { ...p, h: this.waterLevel }, normal: v3(0, 0, 1), water: true };
      prev = p;
    }
    return undefined;
  }
}

/** Is (e, n) inside the solid's footprint? */
export function insideSolid2d(s: Solid, e: number, n: number): boolean {
  if (s.kind === 'cyl') return Math.hypot(e - s.e, n - s.n) <= s.r;
  const c = Math.cos(-s.yaw);
  const sn = Math.sin(-s.yaw);
  const de = e - s.e;
  const dn = n - s.n;
  const x = de * c - dn * sn;
  const y = de * sn + dn * c;
  return Math.abs(x) <= s.hx && Math.abs(y) <= s.hy;
}

/** Closest point of a solid's footprint to (e, n), and whether (e, n) is inside. */
function closest2d(s: Solid, e: number, n: number): { e: number; n: number; inside: boolean } {
  if (s.kind === 'cyl') {
    const de = e - s.e;
    const dn = n - s.n;
    const d = Math.hypot(de, dn);
    if (d <= s.r) return { e, n, inside: true };
    return { e: s.e + (de / d) * s.r, n: s.n + (dn / d) * s.r, inside: false };
  }
  const c = Math.cos(-s.yaw);
  const sn = Math.sin(-s.yaw);
  const de = e - s.e;
  const dn = n - s.n;
  const x = de * c - dn * sn;
  const y = de * sn + dn * c;
  const qx = Math.max(-s.hx, Math.min(s.hx, x));
  const qy = Math.max(-s.hy, Math.min(s.hy, y));
  const inside = qx === x && qy === y;
  // Back to e/n.
  const c2 = Math.cos(s.yaw);
  const s2 = Math.sin(s.yaw);
  return { e: s.e + qx * c2 - qy * s2, n: s.n + qx * s2 + qy * c2, inside };
}

function collideSolid(s: Solid, p: V3, r: number, step: number): { pos: V3; contact: Contact } | undefined {
  if (p.h - r > s.h1 || p.h + r < s.h0) return undefined;
  const q = closest2d(s, p.e, p.n);
  const d = Math.hypot(p.e - q.e, p.n - q.n);
  if (!q.inside && d > r) return undefined;
  const feet = p.h - r;
  if (s.h1 <= feet + step || (q.inside && s.h1 - feet < 0.6)) {
    // On top of it.
    const lift = q.inside ? r : Math.sqrt(Math.max(0, r * r - d * d));
    const h = s.h1 + lift;
    if (p.h >= h) return undefined;
    return { pos: { ...p, h }, contact: { normal: v3(0, 0, 1), floor: true, water: false } };
  }
  if (q.inside) {
    // Inside: out the nearest way sideways (rare: only at speed).
    if (s.kind === 'cyl') {
      const de = p.e - s.e || 1e-3;
      const dn = p.n - s.n;
      const l = Math.hypot(de, dn);
      const k = (s.r + r) / l;
      const pos = { e: s.e + de * k, n: s.n + dn * k, h: p.h };
      return { pos, contact: { normal: norm(v3(de, dn, 0)), floor: false, water: false } };
    }
    const c = Math.cos(-s.yaw);
    const sn = Math.sin(-s.yaw);
    const x = (p.e - s.e) * c - (p.n - s.n) * sn;
    const y = (p.e - s.e) * sn + (p.n - s.n) * c;
    const ox = s.hx - Math.abs(x);
    const oy = s.hy - Math.abs(y);
    let nx = 0;
    let ny = 0;
    let lx = x;
    let ly = y;
    if (ox < oy) {
      nx = Math.sign(x) || 1;
      lx = nx * (s.hx + r);
    } else {
      ny = Math.sign(y) || 1;
      ly = ny * (s.hy + r);
    }
    const c2 = Math.cos(s.yaw);
    const s2 = Math.sin(s.yaw);
    const pos = { e: s.e + lx * c2 - ly * s2, n: s.n + lx * s2 + ly * c2, h: p.h };
    return { pos, contact: { normal: norm(v3(nx * c2 - ny * s2, nx * s2 + ny * c2, 0)), floor: false, water: false } };
  }
  const k = (r - d + 1e-4) / Math.max(d, 1e-6);
  const pos = { e: p.e + (p.e - q.e) * k, n: p.n + (p.n - q.n) * k, h: p.h };
  return { pos, contact: { normal: norm(v3(p.e - q.e, p.n - q.n, 0)), floor: false, water: false } };
}

/** Does the segment a→b pass through the solid? (Sampled: the segments here are short.) */
export function segmentHitsSolid(s: Solid, a: V3, b: V3): boolean {
  const d = dist(a, b);
  const steps = Math.max(1, Math.ceil(d / 0.1));
  for (let i = 0; i <= steps; i++) {
    const p = lerp3(a, b, i / steps);
    if (p.h >= s.h0 && p.h <= s.h1 && insideSolid2d(s, p.e, p.n)) return true;
  }
  return false;
}
