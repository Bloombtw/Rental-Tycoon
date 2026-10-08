import { describe, expect, it } from "vitest";
import type { Camera, ScreenRect } from "./camera";
import {
  CAMERA_AZIMUTH,
  CAMERA_DISTANCE,
  CAMERA_ELEVATION,
  RECEIVER_HEIGHT,
  SHADOW_MARGIN,
  cameraRig,
  groundPointOnScreen,
  lightBasis,
  projectedBounds,
  shadowFrustum,
  toViewPlane,
  viewPlaneToGround,
  type Point3,
} from "./iso";

const a = Math.PI / 6;
const e = Math.PI / 4;
const VIEW: ScreenRect = { x: 0, y: 130, width: 390, height: 650 };
const CAM: Camera = { zoom: 8, centerX: 3, centerY: -4 };

function finite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

describe("constants", () => {
  it("match the spec", () => {
    expect(CAMERA_AZIMUTH).toBeCloseTo(Math.PI / 6, 12);
    expect(CAMERA_ELEVATION).toBeCloseTo(Math.PI / 4, 12);
    expect(CAMERA_DISTANCE).toBe(200);
    expect(SHADOW_MARGIN).toBe(6);
    expect(RECEIVER_HEIGHT).toBe(12);
  });
});

describe("toViewPlane", () => {
  it("projects the axes with the spec basis (y down on screen)", () => {
    const o = toViewPlane({ x: 0, y: 0, z: 0 });
    expect(o.x).toBeCloseTo(0, 12);
    expect(o.y).toBeCloseTo(0, 12);
    const east = toViewPlane({ x: 1, y: 0, z: 0 });
    expect(east.x).toBeCloseTo(Math.cos(a), 12);
    expect(east.y).toBeCloseTo(Math.sin(a) * Math.sin(e), 12);
    const up = toViewPlane({ x: 0, y: 1, z: 0 });
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeCloseTo(-Math.cos(e), 12);
    const south = toViewPlane({ x: 0, y: 0, z: 1 });
    expect(south.x).toBeCloseTo(-Math.sin(a), 12);
    expect(south.y).toBeCloseTo(Math.cos(a) * Math.sin(e), 12);
  });

  it("height goes up the screen and the south edge goes down it", () => {
    expect(toViewPlane({ x: 0, y: 5, z: 0 }).y).toBeLessThan(toViewPlane({ x: 0, y: 0, z: 0 }).y);
    expect(toViewPlane({ x: 0, y: 0, z: 5 }).y).toBeGreaterThan(
      toViewPlane({ x: 0, y: 0, z: 0 }).y,
    );
  });

  it("is linear", () => {
    const p = { x: 3, y: 2, z: -7 };
    const q = { x: -1.5, y: 0.25, z: 11 };
    const s = toViewPlane({ x: p.x + q.x, y: p.y + q.y, z: p.z + q.z });
    const sum = { x: toViewPlane(p).x + toViewPlane(q).x, y: toViewPlane(p).y + toViewPlane(q).y };
    expect(s.x).toBeCloseTo(sum.x, 9);
    expect(s.y).toBeCloseTo(sum.y, 9);
  });
});

describe("viewPlaneToGround", () => {
  const grid: number[] = [-500, -37.5, -1, 0, 0.001, 2, 123.456, 900];

  it("is the inverse of toViewPlane on the ground plane", () => {
    for (const x of grid) {
      for (const z of grid) {
        const g = viewPlaneToGround(toViewPlane({ x, y: 0, z }));
        expect(g).not.toBeNull();
        expect(g?.x).toBeCloseTo(x, 6);
        expect(g?.z).toBeCloseTo(z, 6);
      }
    }
  });

  it("works at another ground height", () => {
    for (const gy of [-3, 0, 1.6, 9, 250]) {
      for (const x of grid) {
        const g = viewPlaneToGround(toViewPlane({ x, y: gy, z: 4 }), gy);
        expect(g?.x).toBeCloseTo(x, 6);
        expect(g?.z).toBeCloseTo(4, 6);
      }
    }
  });

  it("the ground point lands back on the same view-plane point (from any plane point)", () => {
    for (const vx of [-300, -1, 0, 7.7, 400]) {
      for (const vy of [-250, -0.5, 0, 33, 800]) {
        const g = viewPlaneToGround({ x: vx, y: vy });
        expect(g).not.toBeNull();
        if (!g) continue;
        const back = toViewPlane({ x: g.x, y: 0, z: g.z });
        expect(back.x).toBeCloseTo(vx, 6);
        expect(back.y).toBeCloseTo(vy, 6);
      }
    }
  });

  it.each([NaN, Infinity, -Infinity])("a non-finite coordinate %s gives null", (bad) => {
    expect(viewPlaneToGround({ x: bad, y: 0 })).toBeNull();
    expect(viewPlaneToGround({ x: 0, y: bad })).toBeNull();
    expect(viewPlaneToGround({ x: 0, y: 0 }, bad)).toBeNull();
  });

  it("an astronomically large input gives null or a finite point, never NaN", () => {
    for (const big of [1e300, -1e300, Number.MAX_VALUE]) {
      const g = viewPlaneToGround({ x: big, y: big });
      if (g !== null) expect(finite(g.x, g.z)).toBe(true);
    }
  });
});

describe("projectedBounds", () => {
  const pts: Point3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 30, y: 0, z: 0 },
    { x: 0, y: 9, z: 24 },
    { x: -12, y: 4, z: 7 },
    { x: 30, y: 9, z: 24 },
  ];

  it("contains every projected point and is tight", () => {
    const r = projectedBounds(pts);
    const vs = pts.map(toViewPlane);
    for (const v of vs) {
      expect(v.x).toBeGreaterThanOrEqual(r.x - 1e-9);
      expect(v.x).toBeLessThanOrEqual(r.x + r.width + 1e-9);
      expect(v.y).toBeGreaterThanOrEqual(r.y - 1e-9);
      expect(v.y).toBeLessThanOrEqual(r.y + r.height + 1e-9);
    }
    expect(r.x).toBeCloseTo(Math.min(...vs.map((v) => v.x)), 9);
    expect(r.y).toBeCloseTo(Math.min(...vs.map((v) => v.y)), 9);
    expect(r.x + r.width).toBeCloseTo(Math.max(...vs.map((v) => v.x)), 9);
    expect(r.y + r.height).toBeCloseTo(Math.max(...vs.map((v) => v.y)), 9);
  });

  it("a single point is a zero-size rectangle at its projection", () => {
    const r = projectedBounds([{ x: 5, y: 1, z: 2 }]);
    const v = toViewPlane({ x: 5, y: 1, z: 2 });
    expect(r.width).toBeCloseTo(0, 12);
    expect(r.height).toBeCloseTo(0, 12);
    expect(r.x).toBeCloseTo(v.x, 12);
    expect(r.y).toBeCloseTo(v.y, 12);
  });

  it("empty input gives the zero rectangle", () => {
    expect(projectedBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("non-finite input gives the zero rectangle", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(projectedBounds([{ x: bad, y: bad, z: bad }])).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    }
  });

  it("mixing a bad point with good ones never yields NaN", () => {
    const r = projectedBounds([...pts, { x: NaN, y: 0, z: 0 }]);
    expect(finite(r.x, r.y, r.width, r.height)).toBe(true);
  });

  it("does not mutate its input", () => {
    const frozen = Object.freeze(pts.map((p) => Object.freeze({ ...p })));
    expect(() => projectedBounds(frozen)).not.toThrow();
  });
});

describe("cameraRig", () => {
  const rig = cameraRig(CAM, VIEW);
  const d = {
    x: -(Math.sin(a) * Math.cos(e)),
    y: -Math.sin(e),
    z: -(Math.cos(a) * Math.cos(e)),
  };
  const u = { x: -Math.sin(a) * Math.sin(e), y: Math.cos(e), z: -Math.cos(a) * Math.sin(e) };

  it("targets the ground point under the view centre", () => {
    expect(rig.target.y).toBeCloseTo(0, 9);
    const v = toViewPlane(rig.target);
    expect(v.x).toBeCloseTo(CAM.centerX, 6);
    expect(v.y).toBeCloseTo(CAM.centerY, 6);
  });

  it("sits CAMERA_DISTANCE behind the target, looking along d, with up = u", () => {
    expect(rig.position.x).toBeCloseTo(rig.target.x - d.x * CAMERA_DISTANCE, 6);
    expect(rig.position.y).toBeCloseTo(rig.target.y - d.y * CAMERA_DISTANCE, 6);
    expect(rig.position.z).toBeCloseTo(rig.target.z - d.z * CAMERA_DISTANCE, 6);
    expect(rig.position.y).toBeGreaterThan(0); // camera above the ground
    expect(rig.up.x).toBeCloseTo(u.x, 9);
    expect(rig.up.y).toBeCloseTo(u.y, 9);
    expect(rig.up.z).toBeCloseTo(u.z, 9);
  });

  it("the camera sits south-east of the target (looks north-west)", () => {
    expect(rig.position.x).toBeGreaterThan(rig.target.x);
    expect(rig.position.z).toBeGreaterThan(rig.target.z);
  });

  it("frustum is +-(size / 2) / zoom", () => {
    expect(rig.right).toBeCloseTo(VIEW.width / 2 / CAM.zoom, 9);
    expect(rig.left).toBeCloseTo(-VIEW.width / 2 / CAM.zoom, 9);
    expect(rig.top).toBeCloseTo(VIEW.height / 2 / CAM.zoom, 9);
    expect(rig.bottom).toBeCloseTo(-VIEW.height / 2 / CAM.zoom, 9);
  });

  it("zooming in narrows the frustum proportionally", () => {
    const r2 = cameraRig({ ...CAM, zoom: CAM.zoom * 4 }, VIEW);
    expect(r2.right).toBeCloseTo(rig.right / 4, 9);
    expect(r2.top).toBeCloseTo(rig.top / 4, 9);
  });

  it("is finite for the phone, desktop and extreme valid cameras", () => {
    const views: ScreenRect[] = [VIEW, { x: 0, y: 100, width: 1060, height: 780 }];
    for (const v of views) {
      for (const c of [
        CAM,
        { zoom: 0.5, centerX: -400, centerY: 900 },
        { zoom: 40, centerX: 0, centerY: 0 },
      ]) {
        const r = cameraRig(c, v);
        const all = [
          ...Object.values(r.position),
          ...Object.values(r.target),
          ...Object.values(r.up),
          r.left,
          r.right,
          r.top,
          r.bottom,
        ];
        expect(finite(...all)).toBe(true);
        expect(r.right).toBeGreaterThan(r.left);
        expect(r.top).toBeGreaterThan(r.bottom);
      }
    }
  });
});

describe("shadowFrustum", () => {
  const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const sunAt = (azDeg: number, elDeg: number): Point3 => {
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
  };
  /** The 8 points the spec says must be covered: screen corners on y = 0 and y = RECEIVER_HEIGHT. */
  const covered = (cam: Camera, view: ScreenRect): Point3[] => {
    const out: Point3[] = [];
    for (const sx of [view.x, view.x + view.width]) {
      for (const sy of [view.y, view.y + view.height]) {
        const plane = {
          x: cam.centerX + (sx - view.x - view.width / 2) / cam.zoom,
          y: cam.centerY + (sy - view.y - view.height / 2) / cam.zoom,
        };
        for (const y of [0, RECEIVER_HEIGHT]) {
          const g = viewPlaneToGround(plane, y);
          if (g) out.push({ x: g.x, y, z: g.z });
        }
      }
    }
    return out;
  };
  const VIEWS: ScreenRect[] = [
    VIEW,
    { x: 0, y: 0, width: 390, height: 844 },
    { x: 0, y: 0, width: 1280, height: 800 },
    { x: 0, y: 0, width: 2560, height: 1080 },
  ];
  const CAMS: Camera[] = [
    CAM,
    { zoom: 0.5, centerX: -40, centerY: 70 },
    { zoom: 2, centerX: 0, centerY: 0 },
    { zoom: 15, centerX: 30, centerY: -10 },
    { zoom: 40, centerX: 5, centerY: 5 },
  ];

  it("covers the 8 projected screen corners in the light's axes at every zoom and sun direction", () => {
    for (const view of VIEWS) {
      for (const cam of CAMS) {
        const pts = covered(cam, view);
        expect(pts).toHaveLength(8);
        for (let az = 100; az <= 290; az += 30) {
          for (const el of [12, 30, 60]) {
            const sun = sunAt(az, el);
            const f = shadowFrustum(cam, view, sun);
            const { right, up } = lightBasis(sun);
            expect(finite(f.center.x, f.center.z, f.halfWidth, f.halfHeight)).toBe(true);
            expect(f.halfWidth).toBeGreaterThan(0);
            expect(f.halfHeight).toBeGreaterThan(0);
            expect(f.up.x).toBeCloseTo(up.x, 9);
            expect(f.up.y).toBeCloseTo(up.y, 9);
            expect(f.up.z).toBeCloseTo(up.z, 9);
            const c: Point3 = { x: f.center.x, y: 0, z: f.center.z };
            for (const p of pts) {
              const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
              expect(Math.abs(dot(d, right))).toBeLessThanOrEqual(f.halfWidth + 1e-6);
              expect(Math.abs(dot(d, up))).toBeLessThanOrEqual(f.halfHeight + 1e-6);
            }
          }
        }
      }
    }
  });

  it("grows when zooming out and keeps a margin even at max zoom", () => {
    const sun = sunAt(160, 55);
    const far = shadowFrustum({ ...CAM, zoom: 2 }, VIEW, sun);
    const near = shadowFrustum({ ...CAM, zoom: 40 }, VIEW, sun);
    expect(far.halfWidth).toBeGreaterThan(near.halfWidth);
    expect(far.halfHeight).toBeGreaterThan(near.halfHeight);
    expect(near.halfWidth).toBeGreaterThanOrEqual(SHADOW_MARGIN);
    expect(near.halfHeight).toBeGreaterThanOrEqual(SHADOW_MARGIN);
  });

  it("follows the camera centre without changing the size", () => {
    const sun = sunAt(115, 30);
    const f1 = shadowFrustum(CAM, VIEW, sun);
    const f2 = shadowFrustum({ ...CAM, centerX: CAM.centerX + 20 }, VIEW, sun);
    expect(Math.hypot(f2.center.x - f1.center.x, f2.center.z - f1.center.z)).toBeGreaterThan(1);
    expect(f2.halfWidth).toBeCloseTo(f1.halfWidth, 6);
    expect(f2.halfHeight).toBeCloseTo(f1.halfHeight, 6);
  });

  it("a low sun needs a longer frustum than a high one (tall receivers)", () => {
    const low = shadowFrustum(CAM, VIEW, sunAt(250, 12));
    const high = shadowFrustum(CAM, VIEW, sunAt(160, 60));
    expect(low.halfWidth * low.halfHeight).toBeGreaterThan(0);
    expect(Math.max(low.halfWidth, low.halfHeight)).toBeGreaterThan(
      Math.min(high.halfWidth, high.halfHeight),
    );
  });

  it.each([
    [{ zoom: NaN, centerX: 0, centerY: 0 }, VIEW],
    [{ zoom: 0, centerX: 0, centerY: 0 }, VIEW],
    [{ zoom: -3, centerX: 0, centerY: 0 }, VIEW],
    [{ zoom: Infinity, centerX: 0, centerY: 0 }, VIEW],
    [{ zoom: 5, centerX: NaN, centerY: Infinity }, VIEW],
    [CAM, { x: 0, y: 0, width: 0, height: 0 }],
    [CAM, { x: 0, y: 0, width: NaN, height: NaN }],
    [CAM, { x: 0, y: 0, width: -10, height: -10 }],
    [CAM, { x: NaN, y: 0, width: 100, height: 100 }],
  ] as [Camera, ScreenRect][])(
    "hostile camera / view %j %j stays finite and positive",
    (cam, view) => {
      const f = shadowFrustum(cam, view, sunAt(160, 55));
      expect(finite(f.center.x, f.center.z, f.halfWidth, f.halfHeight)).toBe(true);
      expect(f.halfWidth).toBeGreaterThan(0);
      expect(f.halfHeight).toBeGreaterThan(0);
    },
  );
});

describe("lightBasis", () => {
  it("is orthonormal and follows right = Y x sun, up = sun x right", () => {
    for (let az = 0; az < 360; az += 25) {
      for (const el of [12, 30, 60, 85]) {
        const az0 = (az * Math.PI) / 180;
        const el0 = (el * Math.PI) / 180;
        const s = {
          x: Math.sin(az0) * Math.cos(el0),
          y: Math.sin(el0),
          z: -Math.cos(az0) * Math.cos(el0),
        };
        const { right, up } = lightBasis(s);
        const d = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
        expect(d(right, right)).toBeCloseTo(1, 9);
        expect(d(up, up)).toBeCloseTo(1, 9);
        expect(d(right, up)).toBeCloseTo(0, 9);
        expect(d(right, s)).toBeCloseTo(0, 9);
        expect(d(up, s)).toBeCloseTo(0, 9);
        expect(right.y).toBeCloseTo(0, 9);
        expect(up.y).toBeGreaterThan(0);
        expect(right.x).toBeCloseTo(s.z / Math.hypot(s.x, s.z), 9);
        expect(right.z).toBeCloseTo(-s.x / Math.hypot(s.x, s.z), 9);
      }
    }
  });

  it("sun due east at 45 degrees: right is north (-z), up leans west", () => {
    const k = Math.SQRT1_2;
    const { right, up } = lightBasis({ x: k, y: k, z: 0 });
    expect([right.x, right.y, right.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, -1]);
    expect(up.x).toBeCloseTo(-k, 9);
    expect(up.y).toBeCloseTo(k, 9);
    expect(up.z).toBeCloseTo(0, 9);
  });
});

describe("groundPointOnScreen", () => {
  const cam: Camera = { zoom: 10, centerX: 0, centerY: 0 };
  const screenOf = (p: Point3) => {
    const v = toViewPlane(p);
    return {
      x: VIEW.x + VIEW.width / 2 + (v.x - cam.centerX) * cam.zoom,
      y: VIEW.y + VIEW.height / 2 + (v.y - cam.centerY) * cam.zoom,
    };
  };
  it("agrees with an independent projection, with and without margin", () => {
    let checked = 0;
    for (let x = -80; x <= 80; x += 7) {
      for (let z = -80; z <= 80; z += 7) {
        for (const y of [0, 1.6, 12]) {
          const p = { x, y, z };
          const s = screenOf(p);
          for (const m of [0, 40]) {
            const dx = Math.min(s.x - (VIEW.x - m), VIEW.x + VIEW.width + m - s.x);
            const dy = Math.min(s.y - (VIEW.y - m), VIEW.y + VIEW.height + m - s.y);
            const edge = Math.min(Math.abs(dx), Math.abs(dy));
            if (edge < 1e-6) continue;
            expect(groundPointOnScreen(cam, VIEW, p, m)).toBe(dx > 0 && dy > 0);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("the margin makes a point just off screen count as on screen", () => {
    const p = { x: 0, y: 0, z: 0 };
    const v = toViewPlane(p);
    // Puts the point 20 px beyond the right edge of the view.
    const shifted: Camera = {
      zoom: cam.zoom,
      centerX: v.x - (VIEW.width / 2 + 20) / cam.zoom,
      centerY: v.y,
    };
    expect(groundPointOnScreen(shifted, VIEW, p, 0)).toBe(false);
    expect(groundPointOnScreen(shifted, VIEW, p, 40)).toBe(true);
    expect(groundPointOnScreen(shifted, VIEW, p, 10)).toBe(false);
  });

  it("hostile point, margin or camera never throws and never says yes to garbage", () => {
    expect(groundPointOnScreen(cam, VIEW, { x: NaN, y: 0, z: 0 }, 0)).toBe(false);
    expect(groundPointOnScreen(cam, VIEW, { x: 0, y: Infinity, z: 0 }, 0)).toBe(false);
    expect(groundPointOnScreen({ ...cam, zoom: NaN }, VIEW, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
    expect(groundPointOnScreen({ ...cam, zoom: 0 }, VIEW, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
    for (const m of [NaN, Infinity, -Infinity, -5, 1e12]) {
      expect(typeof groundPointOnScreen(cam, VIEW, { x: 0, y: 0, z: 0 }, m)).toBe("boolean");
    }
    expect(groundPointOnScreen(cam, VIEW, { x: 1e6, y: 0, z: 1e6 }, NaN)).toBe(false);
  });
});
