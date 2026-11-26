/**
 * Things a gull can carry in its beak: food (chips, a pasty, crusts…) and mission papers. One beak slot.
 * DOM-free (src/gull/game is checked by tsconfig.game.json).
 */
import { World, add, scale, v3, type V3 } from './world';

export type ItemKind = 'chip' | 'pasty' | 'crust' | 'fishhead' | 'bun' | 'dispatch' | 'document';

/** Taken: gone for good with someone who is not a guard (the courier has his dispatch back). */
export const ItemState = { Placed: 0, Held: 1, Loose: 2, CarriedByGuard: 3, Delivered: 4, Consumed: 5, Taken: 6 } as const;
export type ItemStateId = (typeof ItemState)[keyof typeof ItemState];

export const ITEM_KINDS: Record<ItemKind, { name: string; food?: number; bonus?: number; bonusName?: string; mission?: boolean; heldScale: number }> = {
  chip: { name: 'Chip', food: 15, bonus: 25, bonusName: 'Chip bonus', heldScale: 1.3 },
  pasty: { name: 'Pasty', food: 30, bonus: 60, bonusName: 'Pasty bonus', heldScale: 0.75 },
  crust: { name: 'Bread crust', food: 6, heldScale: 1 },
  fishhead: { name: 'Mackerel head', food: 10, heldScale: 0.9 },
  bun: { name: 'Saffron bun', food: 12, heldScale: 0.8 },
  dispatch: { name: 'Courier’s dispatch', mission: true, heldScale: 0.55 },
  document: { name: 'Inspection Order', mission: true, heldScale: 0.5 },
};

export class Item {
  readonly kind: ItemKind;
  readonly name: string;
  readonly isMission: boolean;
  readonly isFood: boolean;
  readonly food: number;
  readonly bonus: number;
  readonly bonusName: string;
  readonly heldScale: number;
  state: ItemStateId = ItemState.Placed;
  pos: V3;
  yaw: number;
  readonly home: { pos: V3; yaw: number };
  vel: V3 = v3();
  spin = 0;
  onWater = false;
  timesDropped = 0;
  /** Somebody minds this (a pasty on its sill): a gull at it, or just away with it, is thieving. */
  watched = false;
  /** Something has been put on top of it: the first pull knocks that off, noisily; the second takes it. */
  covered = false;
  /** Where it was taken from, for the HUD ("the clerk's chips"). */
  sourceLabel: string;
  /** Seconds since the start (for bobbing on the water). */
  private t = 0;

  constructor(
    readonly id: string,
    kind: ItemKind,
    pos: V3,
    yaw = 0,
    sourceLabel = '',
  ) {
    const k = ITEM_KINDS[kind];
    this.kind = kind;
    this.name = k.name;
    this.isMission = !!k.mission;
    this.isFood = !k.mission;
    this.food = k.food ?? 0;
    this.bonus = k.bonus ?? 0;
    this.bonusName = k.bonusName ?? '';
    this.heldScale = k.heldScale;
    this.pos = { ...pos };
    this.yaw = yaw;
    this.home = { pos: { ...pos }, yaw };
    this.sourceLabel = sourceLabel;
  }

  isGrabbable(): boolean {
    return this.state === ItemState.Placed || this.state === ItemState.Loose;
  }

  hold(): void {
    this.state = ItemState.Held;
    this.onWater = false;
    this.vel = v3();
  }

  drop(vel: V3 = v3()): void {
    this.state = ItemState.Loose;
    this.vel = { ...vel };
    this.spin = (Math.sin(this.timesDropped * 12.9898 + this.pos.e) * 0.5) * 12;
    this.timesDropped++;
  }

  pickUpByGuard(): void {
    this.state = ItemState.CarriedByGuard;
    this.covered = false;
  }

  /** Someone who is not a guard walks off with it: the mission moves it with him from here on. */
  take(): void {
    this.state = ItemState.Taken;
    this.covered = false;
    this.onWater = false;
    this.vel = v3();
  }

  placeHome(): void {
    this.state = ItemState.Placed;
    this.onWater = false;
    this.pos = { ...this.home.pos };
    this.yaw = this.home.yaw;
    this.vel = v3();
  }

  consume(): void {
    this.state = ItemState.Consumed;
  }

  deliverTo(p: V3): void {
    this.state = ItemState.Delivered;
    this.pos = { ...p };
    this.vel = v3();
  }

  /** Loose items fall, slide to a stop and float; held ones follow `follow` (the beak or a hand). */
  step(dt: number, world: World, follow?: { pos: V3; yaw: number }): void {
    this.t += dt;
    if (this.state === ItemState.Held || this.state === ItemState.CarriedByGuard) {
      if (follow) {
        this.pos = { ...follow.pos };
        this.yaw = follow.yaw;
      }
      return;
    }
    if (this.state !== ItemState.Loose) return;
    if (this.onWater) {
      this.pos.h = world.waterLevel + 0.04 + Math.sin(this.t * 1.8) * 0.04;
      this.yaw += dt * 0.2;
      return;
    }
    if (this.vel.e === 0 && this.vel.n === 0 && this.vel.h === 0) {
      // Resting: check the ground is still there (a boat may have moved on).
      const s = world.supportUnder(this.pos, 0.02, 0.3);
      if (this.pos.h - s.h > 0.1) this.vel = v3(0, 0, -0.1);
      return;
    }
    this.vel.h -= 9.8 * dt;
    this.vel.e = moveToward(this.vel.e, 0, 1.5 * dt);
    this.vel.n = moveToward(this.vel.n, 0, 1.5 * dt);
    const from = add(this.pos, v3(0, 0, 0.05));
    const to = add(this.pos, scale(this.vel, dt));
    const hit = world.raycast(from, to);
    if (hit) {
      this.pos = add(hit.point, v3(0, 0, hit.water ? 0 : 0.02));
      this.onWater = hit.water;
      this.vel = v3();
      return;
    }
    this.pos = to;
    this.yaw += this.spin * dt;
    if (this.pos.h < world.waterLevel - 3) {
      this.pos.h = world.waterLevel;
      this.onWater = true;
      this.vel = v3();
    }
  }
}

function moveToward(a: number, b: number, d: number): number {
  return Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d;
}
