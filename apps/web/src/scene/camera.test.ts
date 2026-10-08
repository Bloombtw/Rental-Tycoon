import { describe, expect, it } from "vitest";
import {
  clampCamera,
  fitCamera,
  MAX_FIT_ZOOM,
  MIN_MAX_ZOOM,
  panBy,
  planeToScreen,
  screenToPlane,
  wheelZoomFactor,
  zoomAt,
  zoomBounds,
  type Camera,
  type ScreenRect,
} from "./camera";
import { computeLayout, type Rect } from "./layout";
import { toViewPlane, viewPlaneToGround } from "./iso";

const PHONE: ScreenRect = { x: 0, y: 130, width: 390, height: 650 };
const DESK: ScreenRect = { x: 0, y: 100, width: 1060, height: 780 };
const B: Rect = { x: -40, y: -30, width: 90, height: 70 };
const boundsFor = (n: number, v: ScreenRect) => computeLayout(n, v).bounds;

function finite(c: Camera): boolean {
  return Number.isFinite(c.zoom) && Number.isFinite(c.centerX) && Number.isFinite(c.centerY);
}

describe("constants", () => {
  it("match the spec", () => {
    expect(MAX_FIT_ZOOM).toBe(27);
    expect(MIN_MAX_ZOOM).toBe(40);
  });
});

describe("fitCamera / zoomBounds", () => {
  it("fit zoom is min(width ratio, height ratio, 27) and the centre is the bounds centre", () => {
    const cam = fitCamera(B, PHONE);
    expect(cam.zoom).toBeCloseTo(Math.min(PHONE.width / B.width, PHONE.height / B.height), 9);
    expect(cam.centerX).toBeCloseTo(B.x + B.width / 2, 9);
    expect(cam.centerY).toBeCloseTo(B.y + B.height / 2, 9);
    const tiny: Rect = { x: 0, y: 0, width: 1, height: 1 };
    expect(fitCamera(tiny, PHONE).zoom).toBe(MAX_FIT_ZOOM);
  });

  it("min zoom is the fit zoom and max is max(40, fit)", () => {
    const b = zoomBounds(B, PHONE);
    expect(b.min).toBe(fitCamera(B, PHONE).zoom);
    expect(b.max).toBe(Math.max(MIN_MAX_ZOOM, b.min));
    expect(b.max).toBe(40);
  });

  it.each([PHONE, DESK])("the overview shows the whole agency, facade included (%j)", (view) => {
    for (const n of [0, 1, 3, 12, 20, 50, 51]) {
      const l = computeLayout(n, view);
      const cam = fitCamera(l.bounds, view);
      expect(cam.zoom).toBeLessThanOrEqual(MAX_FIT_ZOOM);
      const tl = planeToScreen(cam, view, { x: l.bounds.x, y: l.bounds.y });
      const br = planeToScreen(cam, view, {
        x: l.bounds.x + l.bounds.width,
        y: l.bounds.y + l.bounds.height,
      });
      expect(tl.x).toBeGreaterThanOrEqual(view.x - 1e-6);
      expect(tl.y).toBeGreaterThanOrEqual(view.y - 1e-6);
      expect(br.x).toBeLessThanOrEqual(view.x + view.width + 1e-6);
      expect(br.y).toBeLessThanOrEqual(view.y + view.height + 1e-6);
      // the building top (y = AGENCY_HEIGHT) on the north edge is visible too
      const roof = planeToScreen(cam, view, toViewPlane({ x: 0, y: 9, z: 0 }));
      expect(roof.y).toBeGreaterThanOrEqual(view.y - 1e-6);
    }
  });

  it("the overview is centred on the agency box", () => {
    const l = computeLayout(8, PHONE);
    const cam = fitCamera(l.bounds, PHONE);
    const centre = planeToScreen(cam, PHONE, {
      x: l.bounds.x + l.bounds.width / 2,
      y: l.bounds.y + l.bounds.height / 2,
    });
    expect(centre.x).toBeCloseTo(PHONE.x + PHONE.width / 2, 6);
    expect(centre.y).toBeCloseTo(PHONE.y + PHONE.height / 2, 6);
  });

  it("a fleet change never makes the overview exceed the bounds of zoom", () => {
    for (let n = 0; n <= 51; n++) {
      const b = zoomBounds(boundsFor(n, PHONE), PHONE);
      expect(b.min).toBeGreaterThan(0);
      expect(b.min).toBeLessThanOrEqual(b.max);
      expect(b.max).toBeGreaterThanOrEqual(MIN_MAX_ZOOM);
    }
  });

  it.each([
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: NaN, height: 100 },
    { x: 0, y: 0, width: -50, height: -50 },
    { x: 0, y: 0, width: Infinity, height: Infinity },
  ])("degenerate view %j never yields NaN", (view) => {
    const cam = fitCamera(B, view);
    expect(finite(cam)).toBe(true);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(finite(clampCamera({ zoom: 2, centerX: 1, centerY: 1 }, B, view))).toBe(true);
    const z = zoomBounds(B, view);
    expect(Number.isFinite(z.min) && Number.isFinite(z.max)).toBe(true);
  });

  it.each([
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: NaN, height: 10 },
    { x: NaN, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: Infinity, height: 10 },
    { x: 0, y: 0, width: -5, height: 10 },
  ])("degenerate bounds %j never yield NaN", (bounds) => {
    const cam = fitCamera(bounds, PHONE);
    expect(finite(cam)).toBe(true);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(finite(clampCamera({ zoom: 5, centerX: 3, centerY: 3 }, bounds, PHONE))).toBe(true);
    const z = zoomBounds(bounds, PHONE);
    expect(Number.isFinite(z.min) && Number.isFinite(z.max)).toBe(true);
    expect(z.min).toBeGreaterThan(0);
  });
});

describe("clampCamera", () => {
  const l = computeLayout(20, PHONE);
  const bounds = l.bounds;
  const { min, max } = zoomBounds(bounds, PHONE);

  it("clamps zoom to [min, max]", () => {
    expect(clampCamera({ zoom: 0.0001, centerX: 0, centerY: 0 }, bounds, PHONE).zoom).toBe(min);
    expect(clampCamera({ zoom: 1e9, centerX: 0, centerY: 0 }, bounds, PHONE).zoom).toBe(max);
    expect(clampCamera({ zoom: max, centerX: 0, centerY: 0 }, bounds, PHONE).zoom).toBe(max);
  });

  it("an axis whose visible extent covers the bounds is locked to the middle", () => {
    const c = clampCamera({ zoom: min, centerX: -5000, centerY: 99999 }, bounds, PHONE);
    if (PHONE.width / c.zoom >= bounds.width - 1e-9)
      expect(c.centerX).toBeCloseTo(bounds.x + bounds.width / 2, 9);
    if (PHONE.height / c.zoom >= bounds.height - 1e-9)
      expect(c.centerY).toBeCloseTo(bounds.y + bounds.height / 2, 9);
  });

  it.each([-1e9, -1, 0, 100, 1e9])("a zoomed-in view never leaves the bounds (centre %s)", (cx) => {
    for (const cy of [-1e9, 0, 300, 1e9]) {
      for (const zoom of [max, (min + max) / 2, max * 0.999]) {
        const c = clampCamera({ zoom, centerX: cx, centerY: cy }, bounds, PHONE);
        const hw = PHONE.width / c.zoom / 2;
        const hh = PHONE.height / c.zoom / 2;
        if (hw * 2 < bounds.width) {
          expect(c.centerX - hw).toBeGreaterThanOrEqual(bounds.x - 1e-6);
          expect(c.centerX + hw).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-6);
        }
        if (hh * 2 < bounds.height) {
          expect(c.centerY - hh).toBeGreaterThanOrEqual(bounds.y - 1e-6);
          expect(c.centerY + hh).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-6);
        }
        expect(finite(c)).toBe(true);
      }
    }
  });

  it("is idempotent", () => {
    const once = clampCamera({ zoom: 22, centerX: -40, centerY: 9999 }, bounds, PHONE);
    expect(clampCamera(once, bounds, PHONE)).toEqual(once);
  });

  it.each([
    { zoom: NaN, centerX: 0, centerY: 0 },
    { zoom: 1, centerX: NaN, centerY: 0 },
    { zoom: 1, centerX: 0, centerY: Infinity },
    { zoom: -1, centerX: 0, centerY: 0 },
    { zoom: 0, centerX: 0, centerY: 0 },
    { zoom: Infinity, centerX: 0, centerY: 0 },
  ])("invalid camera %j falls back to the overview", (bad) => {
    expect(clampCamera(bad, bounds, PHONE)).toEqual(fitCamera(bounds, PHONE));
  });

  it("a resize re-bounds an out-of-range camera", () => {
    const wide = clampCamera({ zoom: 30, centerX: 10, centerY: 10 }, bounds, PHONE);
    const l2 = computeLayout(20, DESK);
    const c = clampCamera(wide, l2.bounds, DESK);
    expect(finite(c)).toBe(true);
    expect(c.zoom).toBeGreaterThanOrEqual(zoomBounds(l2.bounds, DESK).min);
  });

  it("buying a car (new bounds) re-bounds a camera that was valid before", () => {
    const small = computeLayout(5, PHONE).bounds;
    const big = computeLayout(50, PHONE).bounds;
    const cam = clampCamera({ zoom: 39, centerX: small.x, centerY: small.y }, small, PHONE);
    const after = clampCamera(cam, big, PHONE);
    expect(finite(after)).toBe(true);
    expect(after.zoom).toBeGreaterThanOrEqual(zoomBounds(big, PHONE).min);
  });
});

describe("planeToScreen / screenToPlane / panBy", () => {
  const cam: Camera = { zoom: 17, centerX: 10, centerY: -20 };

  it("round-trips", () => {
    const p = { x: 33.3, y: -12 };
    const back = screenToPlane(cam, PHONE, planeToScreen(cam, PHONE, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("screen -> ground -> screen returns the same pixel (acceptance 7)", () => {
    for (const sx of [0, 1, 195, 389, 390]) {
      for (const sy of [130, 131, 455, 779, 780]) {
        const g = viewPlaneToGround(screenToPlane(cam, PHONE, { x: sx, y: sy }));
        expect(g).not.toBeNull();
        if (!g) continue;
        const s = planeToScreen(cam, PHONE, toViewPlane({ x: g.x, y: 0, z: g.z }));
        expect(s.x).toBeCloseTo(sx, 6);
        expect(s.y).toBeCloseTo(sy, 6);
      }
    }
  });

  it("the camera centre maps to the view centre", () => {
    const s = planeToScreen(cam, PHONE, { x: 10, y: -20 });
    expect(s).toEqual({ x: PHONE.x + PHONE.width / 2, y: PHONE.y + PHONE.height / 2 });
  });

  it("drag follows the finger: centre -= delta / zoom", () => {
    const c = panBy(cam, 17, -34);
    expect(c.centerX).toBeCloseTo(9);
    expect(c.centerY).toBeCloseTo(-18);
    expect(c.zoom).toBe(cam.zoom);
    const p = { x: 15, y: 15 };
    const before = planeToScreen(cam, PHONE, p);
    const after = planeToScreen(c, PHONE, p);
    expect(after.x - before.x).toBeCloseTo(17);
    expect(after.y - before.y).toBeCloseTo(-34);
  });

  it.each([NaN, Infinity, -Infinity])("pan by %s is ignored", (bad) => {
    expect(panBy(cam, bad, 5)).toEqual(cam);
    expect(panBy(cam, 5, bad)).toEqual(cam);
  });

  it("does not mutate", () => {
    const frozen = Object.freeze({ ...cam });
    expect(() => panBy(frozen, 1, 1)).not.toThrow();
    expect(() => zoomAt(frozen, PHONE, 2, { x: 1, y: 1 })).not.toThrow();
  });
});

describe("zoomAt", () => {
  const cam: Camera = { zoom: 13, centerX: 12, centerY: 5 };
  const anchors = [
    { x: 10, y: 140 },
    { x: 195, y: 455 },
    { x: 380, y: 770 },
  ];

  it.each([0.5, 0.9, 1, 1.01, 2, 3])(
    "factor %s keeps the plane point and the ground point under the finger",
    (factor) => {
      for (const anchor of anchors) {
        const before = screenToPlane(cam, PHONE, anchor);
        const groundBefore = viewPlaneToGround(before);
        const z = zoomAt(cam, PHONE, factor, anchor);
        expect(z.zoom).toBeCloseTo(cam.zoom * factor, 9);
        const after = screenToPlane(z, PHONE, anchor);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
        const groundAfter = viewPlaneToGround(after);
        expect(groundAfter?.x).toBeCloseTo(groundBefore?.x ?? NaN, 6);
        expect(groundAfter?.z).toBeCloseTo(groundBefore?.z ?? NaN, 6);
      }
    },
  );

  it("zooming at the view centre does not move the centre", () => {
    const z = zoomAt(cam, PHONE, 2, { x: 195, y: 455 });
    expect(z.centerX).toBeCloseTo(cam.centerX);
    expect(z.centerY).toBeCloseTo(cam.centerY);
  });

  it("zoom in then out at the same anchor returns to the start", () => {
    const a = { x: 50, y: 200 };
    const back = zoomAt(zoomAt(cam, PHONE, 2.5, a), PHONE, 1 / 2.5, a);
    expect(back.zoom).toBeCloseTo(cam.zoom);
    expect(back.centerX).toBeCloseTo(cam.centerX);
    expect(back.centerY).toBeCloseTo(cam.centerY);
  });

  it.each([NaN, 0, -1, Infinity, -Infinity])("bad factor %s leaves the camera unchanged", (f) => {
    expect(zoomAt(cam, PHONE, f, { x: 1, y: 1 })).toEqual(cam);
  });

  it("a NaN anchor leaves the camera unchanged", () => {
    expect(zoomAt(cam, PHONE, 2, { x: NaN, y: 1 })).toEqual(cam);
    expect(zoomAt(cam, PHONE, 2, { x: 1, y: Infinity })).toEqual(cam);
  });

  it("the pinch order pan, zoom, clamp keeps the result in bounds and finite", () => {
    const bounds = boundsFor(30, PHONE);
    const { min, max } = zoomBounds(bounds, PHONE);
    let c = fitCamera(bounds, PHONE);
    for (let i = 0; i < 500; i++) {
      const panned = panBy(c, ((i * 13) % 61) - 30, ((i * 7) % 41) - 20);
      const zoomed = zoomAt(panned, PHONE, i % 3 === 0 ? 0.5 : 2, {
        x: (i * 37) % 390,
        y: 130 + ((i * 91) % 650),
      });
      c = clampCamera(zoomed, bounds, PHONE);
      expect(finite(c)).toBe(true);
      expect(c.zoom).toBeGreaterThanOrEqual(min - 1e-9);
      expect(c.zoom).toBeLessThanOrEqual(max + 1e-9);
    }
  });

  it("an absurd factor is bounded by the clamp", () => {
    const bounds = boundsFor(10, PHONE);
    const huge = clampCamera(zoomAt(cam, PHONE, 1e12, { x: 1, y: 1 }), bounds, PHONE);
    expect(huge.zoom).toBe(zoomBounds(bounds, PHONE).max);
    expect(finite(huge)).toBe(true);
    // a factor that overflows the zoom to Infinity is ignored rather than propagated
    const overflow = clampCamera(zoomAt(cam, PHONE, 1e308, { x: 1, y: 1 }), bounds, PHONE);
    expect(finite(overflow)).toBe(true);
  });
});

describe("wheelZoomFactor", () => {
  it("is 1 for no scroll, >1 scrolling up, <1 scrolling down", () => {
    expect(wheelZoomFactor(0, 0)).toBe(1);
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(Math.exp(0.15), 9);
  });

  it("is bounded to [0.5, 2]", () => {
    expect(wheelZoomFactor(-1e9, 0)).toBe(2);
    expect(wheelZoomFactor(1e9, 0)).toBe(0.5);
    expect(wheelZoomFactor(-Number.MAX_VALUE, 0)).toBe(2);
    expect(wheelZoomFactor(Number.MAX_VALUE, 0)).toBe(0.5);
  });

  it.each([NaN, Infinity, -Infinity])("non-finite deltaY %s -> 1", (d) => {
    expect(wheelZoomFactor(d, 0)).toBe(1);
  });

  it("line and page delta modes scale by 16 and 400", () => {
    expect(wheelZoomFactor(-2, 1)).toBeCloseTo(wheelZoomFactor(-32, 0), 9);
    expect(wheelZoomFactor(-0.5, 2)).toBeCloseTo(wheelZoomFactor(-200, 0), 9);
  });

  it("unknown delta modes behave like pixels", () => {
    expect(wheelZoomFactor(-50, 7)).toBe(wheelZoomFactor(-50, 0));
    expect(wheelZoomFactor(-50, NaN)).toBe(wheelZoomFactor(-50, 0));
  });
});
