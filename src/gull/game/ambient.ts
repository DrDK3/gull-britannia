/**
 * The other gulls of Dartmouth: what the view needs to draw one. "To them you are just a gull" only works if there are
 * gulls to be one of. The simulation that moves them fills Mission.ambient; the view draws whatever is there.
 */
import type { V3 } from './world';

export interface AmbientGull {
  id: string;
  pos: V3;
  /** Heading (rad, 0 north, clockwise). */
  yaw: number;
  airborne: boolean;
  flapping: boolean;
  /** Wing-beat phase (cycles); advances while flapping. */
  flapPhase: number;
  /** Calling now (bill open, head back): drawn, and heard. */
  calling: boolean;
}
