/**
 * Jointed models in one draw call.
 *
 * A model (a gull, a soldier) is one merged geometry with vertex colours. Each vertex follows one bone, or blends
 * between two across a joint. Any number of models are merged into one `RigBatch`: a single three.js SkinnedMesh
 * whose bone matrices this code writes directly (there are no Bone objects), so a whole parade, or every gull in the
 * sky, is one draw call in every pass. Because it is three.js's own skinning, the shadow passes, the water's
 * reflection and the ambient-occlusion pass all pose the models correctly with their stock materials.
 *
 * Posing allocates nothing: a `RigPose` is scratch space that a solver fills (rotations about each bone's pivot),
 * `solve` turns into matrices and `write` copies into the batch.
 *
 * Model frame: forward −z, up +y, right +x (as three.js cameras). Bones are defined by a pivot in that frame and
 * have no rest rotation.
 */
import * as THREE from 'three';
import { shared } from '../../render/dispose';

export interface BoneDef {
  name: string;
  parent?: string;
  /** The joint, in the model's frame at rest. */
  at: readonly [number, number, number];
}

export class RigDef<B extends string = string> {
  readonly names: B[];
  readonly parent: Int16Array;
  readonly pivot: Float32Array;
  readonly index: Record<B, number>;
  readonly count: number;

  constructor(bones: readonly (BoneDef & { name: B; parent?: B })[]) {
    this.count = bones.length;
    this.names = bones.map((b) => b.name);
    this.parent = new Int16Array(bones.length).fill(-1);
    this.pivot = new Float32Array(bones.length * 3);
    this.index = {} as Record<B, number>;
    bones.forEach((b, i) => {
      this.index[b.name] = i;
      this.pivot.set(b.at, i * 3);
      if (b.parent !== undefined) {
        const p = this.index[b.parent];
        if (p === undefined) throw new Error(`rig: bone ${b.name} comes before its parent ${b.parent}`);
        this.parent[i] = p;
      }
    });
  }
}

const E = new THREE.Euler();
const LOCAL = new THREE.Matrix4();
const P = new THREE.Vector3();

/** Scratch pose for one model of a rig: set rotations, offsets and scales, then `solve` and `write`. */
export class RigPose<B extends string = string> {
  readonly q: THREE.Quaternion[] = [];
  /** Offset of the joint from its rest place, in the parent's frame. */
  readonly t: THREE.Vector3[] = [];
  readonly s: THREE.Vector3[] = [];
  readonly world: THREE.Matrix4[] = [];
  readonly root = new THREE.Matrix4();

  constructor(readonly def: RigDef<B>) {
    for (let i = 0; i < def.count; i++) {
      this.q.push(new THREE.Quaternion());
      this.t.push(new THREE.Vector3());
      this.s.push(new THREE.Vector3(1, 1, 1));
      this.world.push(new THREE.Matrix4());
    }
  }

  reset(): void {
    for (let i = 0; i < this.def.count; i++) {
      this.q[i]!.identity();
      this.t[i]!.set(0, 0, 0);
      this.s[i]!.set(1, 1, 1);
    }
  }

  /** Turn a bone about its joint (radians; applied in `order`). */
  rot(bone: B, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): void {
    this.q[this.def.index[bone]]!.setFromEuler(E.set(x, y, z, order));
  }

  move(bone: B, x: number, y: number, z: number): void {
    this.t[this.def.index[bone]]!.set(x, y, z);
  }

  scale(bone: B, x: number, y = x, z = x): void {
    this.s[this.def.index[bone]]!.set(x, y, z);
  }

  /** Work out every bone's matrix (in the frame `root` maps the model into). */
  solve(root?: THREE.Matrix4): void {
    const { def } = this;
    if (root) this.root.copy(root);
    else this.root.identity();
    for (let i = 0; i < def.count; i++) {
      const p = def.parent[i]!;
      const t = this.t[i]!;
      const px = def.pivot[i * 3]!;
      const py = def.pivot[i * 3 + 1]!;
      const pz = def.pivot[i * 3 + 2]!;
      if (p < 0) P.set(px + t.x, py + t.y, pz + t.z);
      else P.set(px - def.pivot[p * 3]! + t.x, py - def.pivot[p * 3 + 1]! + t.y, pz - def.pivot[p * 3 + 2]! + t.z);
      LOCAL.compose(P, this.q[i]!, this.s[i]!);
      this.world[i]!.multiplyMatrices(p < 0 ? this.root : this.world[p]!, LOCAL);
    }
  }

  /** Copy the solved pose into a batch's matrices, starting at bone `offset`. */
  write(out: Float32Array, offset: number): void {
    const { def } = this;
    for (let i = 0; i < def.count; i++) {
      const e = this.world[i]!.elements;
      const o = (offset + i) * 16;
      const px = def.pivot[i * 3]!;
      const py = def.pivot[i * 3 + 1]!;
      const pz = def.pivot[i * 3 + 2]!;
      for (let k = 0; k < 12; k++) out[o + k] = e[k]!;
      // world × translate(−pivot): the vertices are stored in the model's frame, not the bone's.
      out[o + 12] = e[12]! - (e[0]! * px + e[4]! * py + e[8]! * pz);
      out[o + 13] = e[13]! - (e[1]! * px + e[5]! * py + e[9]! * pz);
      out[o + 14] = e[14]! - (e[2]! * px + e[6]! * py + e[10]! * pz);
      out[o + 15] = 1;
    }
  }

  /** Where a point of the model at rest (model frame), carried by `bone`, is now (in the root's frame). */
  point(bone: B, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const i = this.def.index[bone];
    return out.set(x - this.def.pivot[i * 3]!, y - this.def.pivot[i * 3 + 1]!, z - this.def.pivot[i * 3 + 2]!).applyMatrix4(this.world[i]!);
  }
}

/** Which bones a vertex follows: `a` wholly, or `b` by the share `w`. */
export interface SkinOut {
  a: number;
  b: number;
  w: number;
}
export type Skin = (x: number, y: number, z: number, out: SkinOut) => void;

export interface RigGeometry<B extends string = string> {
  def: RigDef<B>;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
}

export interface AddOptions {
  /** A colour for each face, by its centre (undefined keeps the part's colour). Faces get their own vertices. */
  paint?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number | undefined;
  /** Faceted rather than smooth. */
  flat?: boolean;
  /** Leave this part out of the outline shell. */
  noOutline?: boolean;
}

const C = new THREE.Color();
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Builds a rig's merged geometry from ordinary three.js geometries placed in the model's frame. */
export class RigBuilder<B extends string = string> {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly si: number[] = [];
  private readonly sw: number[] = [];
  private readonly idx: number[] = [];
  private readonly outlined: boolean[] = [];
  private readonly so: SkinOut = { a: 0, b: 0, w: 0 };

  constructor(readonly def: RigDef<B>) {}

  /** A skin that blends from bone `a` to bone `b` as `f` (of the vertex's place) goes from 0 to 1. */
  mix(a: B, b: B, f: (x: number, y: number, z: number) => number): Skin {
    const ia = this.def.index[a];
    const ib = this.def.index[b];
    return (x, y, z, out) => {
      out.a = ia;
      out.b = ib;
      out.w = smooth01(f(x, y, z));
    };
  }

  /** A blend along one axis: wholly `a` at `from`, wholly `b` at `to`. */
  along(a: B, b: B, axis: 'x' | 'y' | 'z', from: number, to: number): Skin {
    const k = 1 / (to - from);
    return this.mix(a, b, axis === 'x' ? (x) => (x - from) * k : axis === 'y' ? (_x, y) => (y - from) * k : (_x, _y, z) => (z - from) * k);
  }

  /**
   * Add a part: a geometry in the model's frame, its colour (null to keep the geometry's own `color` attribute), and
   * the bone (or blend) it follows. Consumes `geo`.
   */
  add(geo: THREE.BufferGeometry, colour: number | null, skin: B | Skin, opts: AddOptions = {}): this {
    let g = geo;
    if (opts.flat) {
      g = geo.index ? geo.toNonIndexed() : geo;
      g.computeVertexNormals();
    } else if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const own = colour === null ? g.getAttribute('color') : undefined;
    if (colour === null && !own) throw new Error('rig: a part with no colour needs its own color attribute');
    const index = g.index;
    const base = this.pos.length / 3;
    const so = this.so;
    const fixed = typeof skin === 'string' ? this.def.index[skin] : -1;
    if (typeof skin === 'string' && fixed === undefined) throw new Error(`rig: no bone ${skin}`);
    const push = (i: number, r: number, gg: number, b: number) => {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(r, gg, b);
      if (typeof skin === 'string') {
        this.si.push(fixed, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      } else {
        skin(x, y, z, so);
        this.si.push(so.a, so.b, 0, 0);
        this.sw.push(1 - so.w, so.w, 0, 0);
      }
      this.outlined.push(!opts.noOutline);
    };
    C.setHex(colour ?? 0xffffff, THREE.SRGBColorSpace);
    const r0 = C.r;
    const g0 = C.g;
    const b0 = C.b;
    const tris = index ? index.count / 3 : p.count / 3;
    if (opts.paint) {
      for (let t = 0; t < tris; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        const cx = (p.getX(i0) + p.getX(i1) + p.getX(i2)) / 3;
        const cy = (p.getY(i0) + p.getY(i1) + p.getY(i2)) / 3;
        const cz = (p.getZ(i0) + p.getZ(i1) + p.getZ(i2)) / 3;
        const hex = opts.paint(cx, cy, cz, (n.getX(i0) + n.getX(i1) + n.getX(i2)) / 3, (n.getY(i0) + n.getY(i1) + n.getY(i2)) / 3, (n.getZ(i0) + n.getZ(i1) + n.getZ(i2)) / 3);
        if (hex === undefined) C.setRGB(r0, g0, b0);
        else C.setHex(hex, THREE.SRGBColorSpace);
        const v = this.pos.length / 3;
        push(i0, C.r, C.g, C.b);
        push(i1, C.r, C.g, C.b);
        push(i2, C.r, C.g, C.b);
        this.idx.push(v, v + 1, v + 2);
      }
    } else {
      if (own) for (let i = 0; i < p.count; i++) push(i, own.getX(i), own.getY(i), own.getZ(i));
      else for (let i = 0; i < p.count; i++) push(i, r0, g0, b0);
      if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
      else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  /**
   * A thin dark shell round the model (the same triangles turned inside out and pushed out along their normals), so
   * that only its rim shows: an outline that costs no draw call. `width` in metres.
   */
  outline(width: number, colour: number): this {
    C.setHex(colour, THREE.SRGBColorSpace);
    const n0 = this.pos.length / 3;
    const map = new Int32Array(n0).fill(-1);
    const tris = this.idx.length / 3;
    const copy = (i: number): number => {
      if (map[i]! >= 0) return map[i]!;
      const v = this.pos.length / 3;
      const nx = this.nor[i * 3]!;
      const ny = this.nor[i * 3 + 1]!;
      const nz = this.nor[i * 3 + 2]!;
      this.pos.push(this.pos[i * 3]! + nx * width, this.pos[i * 3 + 1]! + ny * width, this.pos[i * 3 + 2]! + nz * width);
      this.nor.push(-nx, -ny, -nz);
      this.col.push(C.r, C.g, C.b);
      for (let k = 0; k < 4; k++) {
        this.si.push(this.si[i * 4 + k]!);
        this.sw.push(this.sw[i * 4 + k]!);
      }
      this.outlined.push(false);
      map[i] = v;
      return v;
    };
    for (let t = 0; t < tris; t++) {
      const a = this.idx[t * 3]!;
      const b = this.idx[t * 3 + 1]!;
      const c = this.idx[t * 3 + 2]!;
      if (!this.outlined[a] || !this.outlined[b] || !this.outlined[c]) continue;
      this.idx.push(copy(a), copy(c), copy(b));
    }
    return this;
  }

  get triangles(): number {
    return this.idx.length / 3;
  }

  build(): RigGeometry<B> {
    return {
      def: this.def,
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      color: new Float32Array(this.col),
      skinIndex: new Uint16Array(this.si),
      skinWeight: new Float32Array(this.sw),
      index: new Uint32Array(this.idx),
    };
  }
}

const DUMMY_BONE = new THREE.Bone();
const IDENTITY = new THREE.Matrix4();

/** A skeleton with no bones behind it: the matrices are written straight into its texture. */
class DirectSkeleton extends THREE.Skeleton {
  constructor(count: number) {
    super(new Array<THREE.Bone>(count).fill(DUMMY_BONE), new Array<THREE.Matrix4>(count).fill(IDENTITY));
    this.computeBoneTexture();
  }

  override update(): void {
    /* nothing to gather: see RigBatch.commit */
  }
}

/**
 * How much of the sky's light reaches every face of a rigged model whichever way it faces: feathers and cloth pass
 * and scatter light, and a white gull seen from below should not go as dark as a slate roof. It scales with the
 * scene's hemisphere light, so it fades with the day.
 */
export const RIG_WRAP = { value: 0.5 };

/** One material for every rigged model: vertex colours, matt. Shared; never disposed with a batch. */
let RIG_MATERIAL: THREE.MeshStandardMaterial | undefined;
export function rigMaterial(): THREE.MeshStandardMaterial {
  if (RIG_MATERIAL) return RIG_MATERIAL;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRigWrap = RIG_WRAP;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRigWrap;').replace(
      '#include <lights_fragment_end>',
      /* glsl */ `#include <lights_fragment_end>
#if ( NUM_HEMI_LIGHTS > 0 )
	float rigDown = 0.5 - 0.5 * dot( normal, hemisphereLights[ 0 ].direction );
	reflectedLight.indirectDiffuse += hemisphereLights[ 0 ].skyColor * uRigWrap * mix( 0.3, 1.0, rigDown ) * BRDF_Lambert( material.diffuseColor );
#endif`,
    );
  };
  m.customProgramCacheKey = () => 'rig-wrap-2';
  RIG_MATERIAL = shared(m);
  return m;
}

export interface BatchSlot {
  /** First bone of this model in the batch. */
  bone: number;
  count: number;
}

/**
 * Several models drawn as one skinned mesh. `models` lists each geometry and how many copies of it; `slots` gives,
 * in the same order (copies of the first, then of the second…), where each copy's bones are.
 */
export class RigBatch {
  readonly mesh: THREE.SkinnedMesh;
  readonly slots: BatchSlot[] = [];
  readonly matrices: Float32Array;
  private readonly skeleton: DirectSkeleton;
  readonly triangles: number;

  constructor(models: readonly { geo: RigGeometry; copies: number }[], material: THREE.Material = rigMaterial(), name = 'rig') {
    let verts = 0;
    let indices = 0;
    let bones = 0;
    for (const m of models) {
      verts += (m.geo.position.length / 3) * m.copies;
      indices += m.geo.index.length * m.copies;
      bones += m.geo.def.count * m.copies;
    }
    const position = new Float32Array(verts * 3);
    const normal = new Float32Array(verts * 3);
    const color = new Float32Array(verts * 3);
    const skinIndex = new Uint16Array(verts * 4);
    const skinWeight = new Float32Array(verts * 4);
    const index = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let v = 0;
    let ix = 0;
    let bone = 0;
    for (const m of models) {
      const g = m.geo;
      const n = g.position.length / 3;
      for (let c = 0; c < m.copies; c++) {
        position.set(g.position, v * 3);
        normal.set(g.normal, v * 3);
        color.set(g.color, v * 3);
        skinWeight.set(g.skinWeight, v * 4);
        for (let i = 0; i < g.skinIndex.length; i++) skinIndex[v * 4 + i] = g.skinIndex[i]! + bone;
        for (let i = 0; i < g.index.length; i++) index[ix + i] = g.index[i]! + v;
        this.slots.push({ bone, count: g.def.count });
        v += n;
        ix += g.index.length;
        bone += g.def.count;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.triangles = indices / 3;
    this.skeleton = new DirectSkeleton(Math.max(1, bones));
    this.matrices = this.skeleton.boneMatrices!;
    // Until posed, nothing is drawn (all-zero matrices collapse every triangle).
    this.mesh = new THREE.SkinnedMesh(geo, material);
    this.mesh.name = name;
    this.mesh.bindMode = THREE.DetachedBindMode;
    this.mesh.bind(this.skeleton, IDENTITY);
    // The models move far from where their vertices are stored: culling by the stored bounds would be wrong.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  /** Collapse a model so that it is not drawn. */
  hide(slot: BatchSlot): void {
    this.matrices.fill(0, slot.bone * 16, (slot.bone + slot.count) * 16);
  }

  /** After writing poses: send them to the GPU with the next frame. */
  commit(): void {
    if (this.skeleton.boneTexture) this.skeleton.boneTexture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.skeleton.dispose();
  }
}
