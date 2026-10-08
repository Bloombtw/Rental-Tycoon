import { describe, expect, it } from "vitest";
import type { Camera, ScreenRect } from "./camera";
import {
  CAMERA_AZIMUTH,
  CAMERA_DISTANCE,
  CAMERA_ELEVATION,
  SHADOW_MARGIN,
  cameraRig,
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
    expect(SHADOW_MARGIN).toBe(10);
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
  it("covers the four screen corners projected on the ground, plus the margin", () => {
    const f = shadowFrustum(CAM, VIEW);
    expect(f.halfExtent).toBeGreaterThan(0);
    const corners = [
      [VIEW.x, VIEW.y],
      [VIEW.x + VIEW.width, VIEW.y],
      [VIEW.x, VIEW.y + VIEW.height],
      [VIEW.x + VIEW.width, VIEW.y + VIEW.height],
    ] as const;
    for (const [sx, sy] of corners) {
      const plane = {
        x: CAM.centerX + (sx - VIEW.x - VIEW.width / 2) / CAM.zoom,
        y: CAM.centerY + (sy - VIEW.y - VIEW.height / 2) / CAM.zoom,
      };
      const g = viewPlaneToGround(plane);
      expect(g).not.toBeNull();
      if (!g) continue;
      expect(Math.abs(g.x - f.center.x)).toBeLessThanOrEqual(f.halfExtent - SHADOW_MARGIN + 1e-6);
      expect(Math.abs(g.z - f.center.z)).toBeLessThanOrEqual(f.halfExtent - SHADOW_MARGIN + 1e-6);
    }
  });

  it("grows when zooming out and keeps a margin even at max zoom", () => {
    const far = shadowFrustum({ ...CAM, zoom: 2 }, VIEW);
    const near = shadowFrustum({ ...CAM, zoom: 40 }, VIEW);
    expect(far.halfExtent).toBeGreaterThan(near.halfExtent);
    expect(near.halfExtent).toBeGreaterThanOrEqual(SHADOW_MARGIN);
  });

  it("follows the camera centre", () => {
    const f1 = shadowFrustum(CAM, VIEW);
    const f2 = shadowFrustum({ ...CAM, centerX: CAM.centerX + 20 }, VIEW);
    expect(f2.center.x).not.toBeCloseTo(f1.center.x, 3);
    expect(f2.halfExtent).toBeCloseTo(f1.halfExtent, 6);
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
      const f = shadowFrustum(cam, view);
      expect(finite(f.center.x, f.center.z, f.halfExtent)).toBe(true);
      expect(f.halfExtent).toBeGreaterThan(0);
    },
  );
});
