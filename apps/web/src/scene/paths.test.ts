import { describe, expect, it } from "vitest";
import type { GroundPoint } from "./layout";
import { laneOffset, pathLength, roundCorners, sampleAt } from "./paths";

const P = (x: number, z: number): GroundPoint => ({ x, z });
const finitePts = (pts: readonly GroundPoint[]) =>
  pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
const angDiff = (a: number, b: number) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};
const noDuplicates = (pts: readonly GroundPoint[], closed: boolean) => {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a && b && Math.hypot(a.x - b.x, a.z - b.z) < 1e-9) return false;
  }
  return true;
};

describe("laneOffset (right of the direction of travel)", () => {
  it.each([
    ["east", [P(0, 0), P(10, 0)], [P(0, 1.5), P(10, 1.5)]],
    ["west", [P(10, 0), P(0, 0)], [P(10, -1.5), P(0, -1.5)]],
    ["south", [P(0, 0), P(0, 10)], [P(-1.5, 0), P(-1.5, 10)]],
    ["north", [P(0, 10), P(0, 0)], [P(1.5, 10), P(1.5, 0)]],
  ])("straight %s", (_n, line, expected) => {
    const out = laneOffset(line, 1.5);
    expect(out).toHaveLength(expected.length);
    out.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i]?.x ?? NaN, 9);
      expect(p.z).toBeCloseTo(expected[i]?.z ?? NaN, 9);
    });
  });

  it("mitres right and left corners", () => {
    const r = laneOffset([P(0, 0), P(10, 0), P(10, 10)], 1.5);
    expect(r[1]?.x).toBeCloseTo(8.5, 9);
    expect(r[1]?.z).toBeCloseTo(1.5, 9);
    const l = laneOffset([P(0, 0), P(10, 0), P(10, -10)], 1.5);
    expect(l[1]?.x).toBeCloseTo(11.5, 9);
    expect(l[1]?.z).toBeCloseTo(1.5, 9);
  });

  it("negative offset is the left side, zero changes nothing", () => {
    expect(laneOffset([P(0, 0), P(10, 0)], -1.5)[0]?.z).toBeCloseTo(-1.5, 9);
    expect(laneOffset([P(0, 0), P(10, 0)], 0)).toEqual([P(0, 0), P(10, 0)]);
  });

  it("never yields NaN for degenerate input", () => {
    const cases: GroundPoint[][] = [
      [],
      [P(1, 1)],
      [P(1, 1), P(1, 1)],
      [P(0, 0), P(0, 0), P(5, 0)],
      [P(0, 0), P(10, 0), P(0, 0)],
      [P(0, 0), P(10, 0), P(20, 0)],
    ];
    for (const c of cases) {
      for (const off of [1.5, 0, -2, NaN, Infinity])
        expect(finitePts(laneOffset(c, off))).toBe(true);
    }
  });
});

describe("roundCorners", () => {
  const corner = [P(0, 0), P(10, 0), P(10, 10)];

  it("replaces a right angle by a 4-segment arc of the radius, keeping the ends", () => {
    const out = roundCorners(corner, 2.5, false);
    expect(out).toHaveLength(2 + 5);
    expect(out[0]).toEqual(P(0, 0));
    expect(out[out.length - 1]).toEqual(P(10, 10));
    expect(out[1]?.x).toBeCloseTo(7.5, 9);
    expect(out[1]?.z).toBeCloseTo(0, 9);
    expect(out[5]?.x).toBeCloseTo(10, 9);
    expect(out[5]?.z).toBeCloseTo(2.5, 9);
    for (const p of out.slice(1, 6)) expect(Math.hypot(p.x - 7.5, p.z - 2.5)).toBeCloseTo(2.5, 9);
  });

  it("closed square: every corner is rounded and the loop stays closed and clean", () => {
    const sq = [P(0, 0), P(20, 0), P(20, 20), P(0, 20)];
    const out = roundCorners(sq, 2.5, true);
    expect(out).toHaveLength(20);
    for (const v of sq) expect(out.some((p) => p.x === v.x && p.z === v.z)).toBe(false);
    expect(pathLength(out, true)).toBeGreaterThan(72);
    expect(pathLength(out, true)).toBeLessThan(76.5);
    expect(noDuplicates(out, true)).toBe(true);
  });

  it("collinear points are not turned into arcs", () => {
    const out = roundCorners([P(0, 0), P(5, 0), P(10, 0)], 2.5, false);
    expect(out.every((p) => p.z === 0)).toBe(true);
    expect(out[0]).toEqual(P(0, 0));
    expect(out[out.length - 1]).toEqual(P(10, 0));
  });

  it("short legs (staircase, leg = 2 x radius) give no duplicate point and stay in the box", () => {
    for (const leg of [5, 4, 2, 0.5]) {
      const out = roundCorners([P(0, 0), P(leg, 0), P(leg, leg), P(2 * leg, leg)], 2.5, false);
      expect(finitePts(out)).toBe(true);
      expect(noDuplicates(out, false)).toBe(true);
      for (const p of out) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(2 * leg + 1e-9);
        expect(p.z).toBeGreaterThanOrEqual(-1e-9);
        expect(p.z).toBeLessThanOrEqual(leg + 1e-9);
      }
    }
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("radius %s is harmless", (r) => {
    const out = roundCorners(corner, r, false);
    expect(finitePts(out)).toBe(true);
    expect(out[0]).toEqual(P(0, 0));
    expect(out[out.length - 1]).toEqual(P(10, 10));
  });

  it("empty and tiny inputs do not throw", () => {
    for (const c of [[], [P(1, 2)], [P(1, 2), P(3, 4)]]) {
      expect(() => roundCorners(c, 2.5, false)).not.toThrow();
      expect(() => roundCorners(c, 2.5, true)).not.toThrow();
    }
  });
});

describe("pathLength", () => {
  it("open and closed", () => {
    expect(pathLength([P(0, 0), P(3, 4)], false)).toBe(5);
    expect(pathLength([P(0, 0), P(3, 0), P(3, 4)], false)).toBe(7);
    expect(pathLength([P(0, 0), P(3, 0), P(3, 4)], true)).toBe(12);
  });
  it("empty or single point is 0", () => {
    for (const closed of [false, true]) {
      expect(pathLength([], closed)).toBe(0);
      expect(pathLength([P(5, 5)], closed)).toBe(0);
    }
  });
});

describe("sampleAt", () => {
  const open = [P(0, 0), P(10, 0), P(10, 10)];
  const sq = [P(0, 0), P(20, 0), P(20, 20), P(0, 20)];

  it("headings follow the convention 0 = south, PI/2 = east", () => {
    expect(sampleAt(open, 5, false)).toMatchObject({ x: 5, z: 0 });
    expect(sampleAt(open, 5, false).heading).toBeCloseTo(Math.PI / 2, 9);
    expect(sampleAt(open, 15, false)).toMatchObject({ x: 10, z: 5 });
    expect(sampleAt(open, 15, false).heading).toBeCloseTo(0, 9);
    expect(sampleAt([P(0, 0), P(-10, 0)], 3, false).heading).toBeCloseTo(-Math.PI / 2, 9);
  });

  it("open paths clamp, closed paths wrap (including negative distances)", () => {
    expect(sampleAt(open, -50, false)).toMatchObject({ x: 0, z: 0 });
    expect(sampleAt(open, 1e9, false)).toMatchObject({ x: 10, z: 10 });
    const len = pathLength(sq, true);
    for (const d of [3, 25, 47, 79]) {
      const a = sampleAt(sq, d, true);
      for (const k of [-3, -1, 1, 7]) {
        const b = sampleAt(sq, d + k * len, true);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.z).toBeCloseTo(a.z, 6);
      }
    }
    const lastLeg = sampleAt(sq, len - 1, true);
    expect(lastLeg.x).toBeCloseTo(0, 9);
    expect(lastLeg.z).toBeCloseTo(1, 9);
    expect(lastLeg.heading).toBeCloseTo(Math.PI, 9);
  });

  it.each([NaN, Infinity, -Infinity, 1e300, -1e300, Number.MAX_VALUE])(
    "distance %s never gives NaN",
    (d) => {
      for (const closed of [false, true]) {
        for (const pts of [open, sq]) {
          const s = sampleAt(pts, d, closed);
          expect(Number.isFinite(s.x + s.z + s.heading)).toBe(true);
        }
      }
    },
  );

  it("degenerate paths never give NaN", () => {
    for (const pts of [[], [P(2, 3)], [P(2, 3), P(2, 3)], [P(0, 0), P(0, 0), P(4, 0)]]) {
      for (const closed of [false, true]) {
        for (const d of [-1, 0, 1, 100]) {
          const s = sampleAt(pts, d, closed);
          expect(Number.isFinite(s.x + s.z + s.heading)).toBe(true);
        }
      }
    }
  });

  it("the heading along a rounded loop is continuous (no sharp jump)", () => {
    const loop = roundCorners(sq, 2.5, true);
    const len = pathLength(loop, true);
    let prev = sampleAt(loop, 0, true);
    for (let d = 0.1; d <= len + 0.1; d += 0.1) {
      const s = sampleAt(loop, d, true);
      expect(Math.abs(angDiff(prev.heading, s.heading))).toBeLessThan(0.45);
      expect(Math.hypot(s.x - prev.x, s.z - prev.z)).toBeLessThan(0.11);
      prev = s;
    }
  });
});
