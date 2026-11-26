import { describe, expect, it } from 'vitest';
import { intersects, placeAll, placeBox, type Box } from '../../src/gull/app/labels';

const VIEW = { w: 1280, h: 720 };
/** The fixed HUD at 1280×720, roughly: status, compass, orders with the feed, and the prompt with the radio. */
const HUD: Box[] = [
  { x: 16, y: 14, w: 220, h: 96 },
  { x: 420, y: 14, w: 440, h: 40 },
  { x: 944, y: 14, w: 320, h: 250 },
  { x: 320, y: 600, w: 640, h: 104 },
];

describe('placing labels pinned to the world', () => {
  it('leaves a label where it wants to be when that is clear', () => {
    const want = { x: 600, y: 300, w: 140, h: 60 };
    expect(placeBox(want, HUD, VIEW)).toEqual(want);
  });

  it('moves a label out from under the orders card by the shortest way', () => {
    const want = { x: 1000, y: 230, w: 140, h: 60 };
    const at = placeBox(want, HUD, VIEW)!;
    expect(at).toBeDefined();
    for (const o of HUD) expect(intersects(at, o)).toBe(false);
    // Down, just under the card: the shortest move.
    expect(at.x).toBe(1000);
    expect(at.y).toBeGreaterThanOrEqual(264);
    expect(at.y).toBeLessThan(280);
  });

  it('keeps a label on the screen', () => {
    const at = placeBox({ x: 1250, y: 400, w: 140, h: 60 }, HUD, VIEW)!;
    expect(at.x + at.w).toBeLessThanOrEqual(VIEW.w - 4);
    expect(placeBox({ x: -80, y: -30, w: 140, h: 60 }, [], VIEW)).toEqual({ x: 4, y: 4, w: 140, h: 60 });
  });

  it('hides a label that has nowhere near to go', () => {
    // Deep inside a card with a short reach.
    expect(placeBox({ x: 1040, y: 100, w: 140, h: 60 }, HUD, VIEW, 4, 40)).toBeUndefined();
    // Bigger than the screen.
    expect(placeBox({ x: 0, y: 0, w: 2000, h: 60 }, [], VIEW)).toBeUndefined();
  });

  it('labels do not land on each other: the first keeps its place, the next moves', () => {
    const wants: Box[] = [
      { x: 600, y: 300, w: 160, h: 60 },
      { x: 640, y: 310, w: 160, h: 60 },
      { x: 620, y: 320, w: 160, h: 60 },
    ];
    const placed = placeAll(wants, HUD, VIEW);
    expect(placed[0]).toEqual(wants[0]);
    const shown = placed.filter((b): b is Box => !!b);
    expect(shown.length).toBe(3);
    for (let i = 0; i < shown.length; i++) {
      for (const o of HUD) expect(intersects(shown[i]!, o)).toBe(false);
      for (let j = i + 1; j < shown.length; j++) expect(intersects(shown[i]!, shown[j]!)).toBe(false);
    }
  });

  it('never returns a place that touches an obstacle, over a sweep of the screen', () => {
    for (let x = -100; x < 1400; x += 37) {
      for (let y = -60; y < 800; y += 29) {
        const at = placeBox({ x, y, w: 150, h: 70 }, HUD, VIEW);
        if (!at) continue;
        for (const o of HUD) expect(intersects(at, o), `${x},${y}`).toBe(false);
        expect(at.x >= 4 && at.y >= 4 && at.x + at.w <= 1276 && at.y + at.h <= 716, `${x},${y}`).toBe(true);
      }
    }
  });
});
