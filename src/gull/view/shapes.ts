/**
 * Shapes for building models in code: lofted tubes (bodies, limbs, heads), thin slabs (feathers, peaks, paper), and
 * a few shortcuts for placing three.js's own primitives. Everything returns an ordinary BufferGeometry in the frame
 * it was asked for, ready for RigBuilder.add or mergeColoured.
 */
import * as THREE from 'three';

/**
 * One cross-section of a tube: where along the axis, the two radii, the centre's offset on the two cross axes, and
 * (optionally) a different radius on the negative side of the second cross axis (a deep belly under a flat back).
 * [at, r1, r2, c1 = 0, c2 = 0, r2neg = r2]
 */
export type Ring = readonly [at: number, r1: number, r2: number, c1?: number, c2?: number, r2neg?: number];

export interface TubeOptions {
  /** Sides round the tube. */
  seg?: number;
  /** Extra rings interpolated between each pair given (a smooth curve through them). */
  smooth?: number;
  /** Superellipse exponent: 2 is an ellipse, larger is boxier. */
  sq?: number;
  /** Leave an end open (no cap): 'start', 'end' or 'both'. */
  open?: 'start' | 'end' | 'both';
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function smoothRings(rings: readonly Ring[], extra: number): number[][] {
  const full = rings.map((r) => [r[0], r[1], r[2], r[3] ?? 0, r[4] ?? 0, r[5] ?? r[2]]);
  if (extra <= 0 || rings.length < 3) return full;
  const out: number[][] = [];
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[Math.max(0, i - 1)]!;
    const b = full[i]!;
    const c = full[i + 1]!;
    const d = full[Math.min(full.length - 1, i + 2)]!;
    for (let k = 0; k <= extra; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / (extra + 1);
      out.push(b.map((_, j) => (j === 1 || j === 2 || j === 5 ? Math.max(0, catmull(a[j]!, b[j]!, c[j]!, d[j]!, t)) : catmull(a[j]!, b[j]!, c[j]!, d[j]!, t))));
    }
  }
  out.push(full[full.length - 1]!);
  return out;
}

/**
 * A tube through cross-sections along `axis`, closed at both ends, smooth-shaded, facing outwards.
 * Cross axes: along z they are (x, y); along y, (x, z); along x, (z, y).
 */
export function tube(axis: 'x' | 'y' | 'z', rings: readonly Ring[], o: TubeOptions = {}): THREE.BufferGeometry {
  const seg = o.seg ?? 10;
  const sq = o.sq ?? 2;
  const rs = smoothRings(rings, o.smooth ?? 0);
  const pos: number[] = [];
  const idx: number[] = [];
  const put = (at: number, u: number, v: number) => {
    if (axis === 'z') pos.push(u, v, at);
    else if (axis === 'y') pos.push(u, at, v);
    else pos.push(at, v, u);
  };
  for (const r of rs) {
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      let c = Math.cos(th);
      let sn = Math.sin(th);
      if (sq !== 2) {
        c = Math.sign(c) * Math.pow(Math.abs(c), 2 / sq);
        sn = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / sq);
      }
      put(r[0]!, r[3]! + r[1]! * c, r[4]! + (sn >= 0 ? r[2]! : r[5]!) * sn);
    }
  }
  for (let i = 0; i < rs.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s;
      const b = i * seg + ((s + 1) % seg);
      const c = a + seg;
      const d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (ring: number, flip: boolean) => {
    const r = rs[ring]!;
    const centre = pos.length / 3;
    put(r[0]!, r[3]!, r[4]!);
    for (let s = 0; s < seg; s++) {
      const a = ring * seg + s;
      const b = ring * seg + ((s + 1) % seg);
      if (flip) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  };
  if (o.open !== 'start' && o.open !== 'both') cap(0, true);
  if (o.open !== 'end' && o.open !== 'both') cap(rs.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  faceOutwards(g);
  g.computeVertexNormals();
  return g;
}

/** Turn a closed mesh's triangles so that they face outwards (by the sign of its volume). */
export function faceOutwards(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const ix = g.index;
  if (!ix) return g;
  let vol = 0;
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i);
    const b = ix.getX(i + 1);
    const c = ix.getX(i + 2);
    vol += p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c)) - p.getY(a) * (p.getX(b) * p.getZ(c) - p.getZ(b) * p.getX(c)) + p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c));
  }
  if (vol < 0) {
    for (let i = 0; i < ix.count; i += 3) {
      const b = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, b);
    }
  }
  return g;
}

/**
 * A thin slab lying in the x–z plane: `outline` is its rim as [x, z] points (either way round), `t` its thickness,
 * centred on y = 0. `dome` lifts the middle of the top (a feather's slight camber).
 */
export function slab(outline: readonly (readonly [number, number])[], t: number): THREE.BufferGeometry {
  const pts = outline.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const faces = THREE.ShapeUtils.triangulateShape(pts, []);
  const n = pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  // Top and bottom have their own vertices (their normals differ from the rim's).
  for (const p of pts) pos.push(p.x, t / 2, p.y);
  for (const p of pts) pos.push(p.x, -t / 2, p.y);
  for (const f of faces) {
    idx.push(f[0]!, f[2]!, f[1]!);
    idx.push(n + f[0]!, n + f[1]!, n + f[2]!);
  }
  if (t > 0.004) {
    const base = pos.length / 3;
    for (const p of pts) pos.push(p.x, t / 2, p.y);
    for (const p of pts) pos.push(p.x, -t / 2, p.y);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(base + i, base + j, base + n + i, base + j, base + n + j, base + n + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Mirror a geometry in the plane x = 0 (left for right), keeping its faces outwards. */
export function mirrorX<T extends THREE.BufferGeometry>(g: T): T {
  g.scale(-1, 1, 1);
  const ix = g.index;
  if (ix) {
    for (let i = 0; i < ix.count; i += 3) {
      const b = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, b);
    }
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name);
      const n = a.itemSize;
      const arr = a.array as Float32Array;
      for (let i = 0; i + 2 < a.count; i += 3) {
        for (let k = 0; k < n; k++) {
          const t = arr[(i + 1) * n + k]!;
          arr[(i + 1) * n + k] = arr[(i + 2) * n + k]!;
          arr[(i + 2) * n + k] = t;
        }
      }
    }
  }
  return g;
}

/** Turn (x, y, z order) and then move a geometry; returns it. */
export function place<T extends THREE.BufferGeometry>(g: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
export const ball = (r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))).scale(sx, sy, sz).translate(x, y, z);
/** A cylinder standing on y from y0 to y1. */
export const post = (r0: number, r1: number, y0: number, y1: number, x = 0, z = 0, seg = 8) => new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(x, (y0 + y1) / 2, z);
/** A rod between two points. */
export function rod(r: number, a: readonly [number, number, number], b: readonly [number, number, number], seg = 6, r1 = r): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r1, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

const MC = new THREE.Color();

/** Merge coloured parts into one geometry with vertex colours (for props: one draw call with one material). */
export function mergeColoured(parts: readonly { geo: THREE.BufferGeometry; colour: number; flat?: boolean }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const part of parts) {
    let g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    if (part.flat || !g.getAttribute('normal')) {
      if (g === part.geo) g = g.clone();
      g.computeVertexNormals();
    }
    MC.setHex(part.colour, THREE.SRGBColorSpace);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(MC.r, MC.g, MC.b);
    }
    if (g !== part.geo) g.dispose();
    part.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** A list of coloured parts being collected for mergeColoured, with terse adders. */
export class Parts {
  readonly list: { geo: THREE.BufferGeometry; colour: number; flat?: boolean }[] = [];

  add(geo: THREE.BufferGeometry, colour: number, flat = false): this {
    this.list.push({ geo, colour, flat });
    return this;
  }

  box(colour: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(box(w, h, d, x, y, z, rx, ry, rz), colour);
  }

  post(colour: number, r0: number, r1: number, y0: number, y1: number, x = 0, z = 0, seg = 8): this {
    return this.add(post(r0, r1, y0, y1, x, z, seg), colour);
  }

  /** Move everything added so far (turn about y, then translate). */
  moved(x: number, y: number, z: number, ry = 0): this {
    for (const p of this.list) place(p.geo, x, y, z, 0, ry, 0);
    return this;
  }

  merge(): THREE.BufferGeometry {
    return mergeColoured(this.list);
  }
}
