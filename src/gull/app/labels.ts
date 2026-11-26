/**
 * Keeping labels that are pinned to things in the world (a guard's name, a speech bubble, ON TARGET, the distance on
 * the objective marker) off the fixed parts of the HUD and off each other.
 *
 * The fixed slots never move, so they cannot meet; a pinned label goes wherever its guard is on screen, which may be
 * under the orders card. Each frame the controller asks where each label may go: at its own place if that is clear,
 * else the nearest clear place beside whatever is in the way, else nowhere (it is hidden for that frame).
 *
 * Pure geometry: boxes are in CSS pixels from the top left of the view.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function intersects(a: Box, b: Box, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

const inside = (b: Box, view: { w: number; h: number }, margin: number) => b.x >= margin && b.y >= margin && b.x + b.w <= view.w - margin && b.y + b.h <= view.h - margin;

/**
 * Where a box that wants to be at `want` can go so that it is wholly on screen and clear of every obstacle by `gap`:
 * the place nearest to where it wants to be, or undefined when there is none within `reach` pixels.
 */
export function placeBox(want: Box, obstacles: readonly Box[], view: { w: number; h: number }, gap = 4, reach = 220, margin = 4): Box | undefined {
  if (want.w > view.w - 2 * margin || want.h > view.h - 2 * margin) return undefined;
  const clampX = (x: number) => Math.max(margin, Math.min(view.w - margin - want.w, x));
  const clampY = (y: number) => Math.max(margin, Math.min(view.h - margin - want.h, y));
  const start: Box = { x: clampX(want.x), y: clampY(want.y), w: want.w, h: want.h };
  const clear = (b: Box) => inside(b, view, margin - 0.01) && !obstacles.some((o) => intersects(b, o, gap - 0.01));
  if (clear(start)) return start;
  // Only what is near enough to matter.
  const near = obstacles.filter((o) => intersects({ x: start.x - reach, y: start.y - reach, w: start.w + 2 * reach, h: start.h + 2 * reach }, o));
  const xs = [start.x];
  const ys = [start.y];
  for (const o of near) {
    xs.push(clampX(o.x - want.w - gap), clampX(o.x + o.w + gap));
    ys.push(clampY(o.y - want.h - gap), clampY(o.y + o.h + gap));
  }
  let best: Box | undefined;
  let bd = reach * reach;
  for (const x of xs) {
    for (const y of ys) {
      const d = (x - want.x) * (x - want.x) + (y - want.y) * (y - want.y);
      if (d >= bd) continue;
      const b = { x, y, w: want.w, h: want.h };
      if (!clear(b)) continue;
      best = b;
      bd = d;
    }
  }
  return best;
}

/**
 * Place several labels, most important first: each one placed becomes an obstacle for those after it. Returns a place
 * for each, in the order given, or undefined where a label has to be hidden.
 */
export function placeAll(wants: readonly Box[], fixed: readonly Box[], view: { w: number; h: number }, gap = 4, reach = 220): (Box | undefined)[] {
  const obstacles = [...fixed];
  return wants.map((w) => {
    const at = placeBox(w, obstacles, view, gap, reach);
    if (at) obstacles.push(at);
    return at;
  });
}
