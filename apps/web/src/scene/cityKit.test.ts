import { describe, expect, it } from "vitest";
import type { CityPlan } from "./cityPlan";
import { computeCityPlan } from "./cityPlan";
import { TILE, computeLayout, type AgencyLayout, type GroundPoint } from "./layout";

/**
 * Shared helpers of the city-life tests (a test file so that it stays inside the QA scope; it
 * carries one sanity test of its own, which also runs wherever it is imported).
 */

export const PORTRAIT = { width: 390, height: 650 };
export const WIDE = { width: 3000, height: 200 };

const layoutCache = new Map<string, AgencyLayout>();
const planCache = new Map<AgencyLayout, CityPlan>();

export function layoutFor(n: number, usable = PORTRAIT): AgencyLayout {
  const key = `${n}/${usable.width}x${usable.height}`;
  let l = layoutCache.get(key);
  if (!l) {
    l = computeLayout(n, usable);
    layoutCache.set(key, l);
  }
  return l;
}

export function planFor(l: AgencyLayout): CityPlan {
  let p = planCache.get(l);
  if (!p) {
    p = computeCityPlan(l);
    planCache.set(l, p);
  }
  return p;
}

/** One layout per distinct (columns, rows) size, with portrait and very wide screens. */
export function distinctLayouts(): AgencyLayout[] {
  const seen = new Map<string, AgencyLayout>();
  for (const usable of [PORTRAIT, WIDE]) {
    for (const n of [0, 1, 5, 6, 10, 11, 15, 16, 21, 26, 31, 36, 41, 46, 50]) {
      const l = layoutFor(n, usable);
      seen.set(`${l.columns}x${l.rows}`, l);
    }
  }
  return [...seen.values()];
}

export function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) allNumbers(v, out);
  }
  return out;
}

export const cellOfPoint = (p: { x: number; z: number }) => ({
  col: Math.floor(p.x / TILE),
  row: Math.floor(p.z / TILE),
});

/** Cell of a point, nudging the points that sit exactly on the outer border of the extent inwards. */
export function cellInExtent(plan: CityPlan, p: GroundPoint): { col: number; row: number } {
  const e = plan.extent;
  const one = (v: number, max: number): number => {
    const c = Math.floor(v / TILE);
    if (c === max + 1 && Math.abs(v - (max + 1) * TILE) < 1e-6) return max;
    return c;
  };
  return { col: one(p.x, e.colMax), row: one(p.z, e.rowMax) };
}

export const axisOf = (index: number): number => (index + 0.5) * TILE;

/** Points every `step` along an open or closed polyline, ends included. */
export function densify(
  points: readonly GroundPoint[],
  step: number,
  closed: boolean,
): GroundPoint[] {
  const out: GroundPoint[] = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = at(points, i);
    const b = at(points, (i + 1) % points.length);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      out.push({ x: a.x + ((b.x - a.x) * j) / k, z: a.z + ((b.z - a.z) * j) / k });
    }
  }
  if (!closed && points.length > 0) out.push(at(points, points.length - 1));
  return out;
}

export function distToPolyline(
  p: GroundPoint,
  pts: readonly GroundPoint[],
  closed: boolean,
): number {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = at(pts, i);
    const b = at(pts, (i + 1) % pts.length);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

export const angDiff = (from: number, to: number): number => {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * Right-hand traffic. For a point travelling in the axis-aligned direction (dx, dz) near a street of
 * that orientation, returns its offset from the street axis measured to the right of travel
 * (the lane rule says it is +1.5). Null if the direction is not axis-aligned or no street is near.
 */
export function rightOfAxis(
  plan: CityPlan,
  p: GroundPoint,
  dx: number,
  dz: number,
  band = 3.0001,
): number | null {
  const horizontal = Math.abs(dz) < 1e-6 && Math.abs(dx) > 0.5;
  const vertical = Math.abs(dx) < 1e-6 && Math.abs(dz) > 0.5;
  if (!horizontal && !vertical) return null;
  const axes = (horizontal ? plan.streetRows : plan.streetCols).map(axisOf);
  const coord = horizontal ? p.z : p.x;
  let best: number | null = null;
  for (const a of axes) {
    if (Math.abs(coord - a) <= band && (best === null || Math.abs(coord - a) < Math.abs(best))) {
      best = coord - a;
    }
  }
  if (best === null) return null;
  // The right of (dx, dz) is (-dz, dx): east -> +z, west -> -z, south -> -x, north -> +x.
  const sign = horizontal ? Math.sign(dx) : -Math.sign(dz);
  return best * sign;
}

describe("cityKit helpers", () => {
  it("rightOfAxis follows the right-hand rule", () => {
    const plan = planFor(layoutFor(6));
    const z = axisOf(at(plan.streetRows, 4));
    expect(rightOfAxis(plan, { x: 0, z: z + 1.5 }, 1, 0)).toBeCloseTo(1.5, 9);
    expect(rightOfAxis(plan, { x: 0, z: z - 1.5 }, -1, 0)).toBeCloseTo(1.5, 9);
    const x = axisOf(at(plan.streetCols, 4));
    expect(rightOfAxis(plan, { x: x - 1.5, z: 0 }, 0, 1)).toBeCloseTo(1.5, 9);
    expect(rightOfAxis(plan, { x: x + 1.5, z: 0 }, 0, -1)).toBeCloseTo(1.5, 9);
  });
});
