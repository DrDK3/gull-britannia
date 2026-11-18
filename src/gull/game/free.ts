/** Free flight: the harbour with nothing to do but fly, perch and poop. */
import { Mode } from './gull';
import { Mission } from './mission';
import { v3, type World } from './world';

export class FreeFlight extends Mission {
  constructor(world: World) {
    super(world, 1);
  }

  protected setup(): void {
    this.id = 'free';
    this.title = 'Free flight';
    // Over the river off the Embankment, heading for the old town.
    this.gull.spawn(v3(-200, 230, 28), -1.75, -0.12);
    this.gull.setMode(Mode.Air);
    this.gull.flyDir = this.gull.lookDir();
    this.gull.airSpeed = 12;
    this.addPerch('station', v3(-277, 372, this.world.cellTop(-277, 372)), 'Station roof');
    this.addPerch('fort', this.world.highestNear(-290, -8.2, 1.5), 'Fort parapet');
  }

  protected override onStart(): void {
    this.music('free');
  }
}
