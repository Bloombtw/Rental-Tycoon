import { describe, expect, it } from "vitest";
import { fitCamera, planeToScreen } from "./camera";
import { isStreetCell, type CityPlan } from "./cityPlan";
import {
  PORTRAIT,
  angDiff,
  at,
  cellInExtent,
  deepFreeze,
  densify,
  layoutFor,
  planFor,
  rightOfAxis,
} from "./cityKit.test";
import { CAR_BOX } from "./carMotion";
import { toViewPlane } from "./iso";
import {
  LANE_OFFSET,
  TILE,
  computeLayout,
  exitPath,
  returnPath,
  type AgencyLayout,
  type GroundPoint,
} from "./layout";
import { ROUTE_PATTERNS, carRoutes, type Turn } from "./routes";

const L50 = layoutFor(50);
const P50 = planFor(L50);
const R50 = carRoutes(L50, P50);

const inLot = (l: AgencyLayout, p: GroundPoint) => {
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.z / TILE);
  return c >= 0 && c < l.lotCols && r >= 1 && r < 1 + 2 * l.rows;
};
const onAllowed = (l: AgencyLayout, plan: CityPlan, p: GroundPoint) => {
  if (inLot(l, p)) return true;
  const { col, row } = cellInExtent(plan, p);
  return isStreetCell(plan, col, row);
};

/** Crossroad cells in order of visit, and the manoeuvre taken at each one. */
function manoeuvres(plan: CityPlan, route: readonly GroundPoint[]): { cell: string; turn: Turn }[] {
  const pts = densify(route, 0.25, false);
  const visits: { cell: string; first: number; last: number }[] = [];
  pts.forEach((p, k) => {
    const { col, row } = cellInExtent(plan, p);
    if (!(plan.streetCols.includes(col) && plan.streetRows.includes(row))) return;
    const cell = `${col},${row}`;
    const v = visits[visits.length - 1];
    if (v && v.cell === cell) v.last = k;
    else visits.push({ cell, first: k, last: k });
  });
  const dir = (a: GroundPoint, b: GroundPoint) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  };
  return visits.map((v) => {
    const before = at(pts, Math.max(0, v.first - 12));
    const enter = at(pts, Math.max(0, v.first - 1));
    const exit = at(pts, Math.min(pts.length - 1, v.last + 1));
    const after = at(pts, Math.min(pts.length - 1, v.last + 12));
    const din = dir(before, enter);
    const dout = dir(exit, after);
    let turn: Turn = "S";
    if (din.x !== dout.x || din.z !== dout.z) {
      // right of (dx, dz) is (-dz, dx)
      turn = dout.x === -din.z && dout.z === din.x ? "R" : "L";
    }
    return { cell: v.cell, turn };
  });
}

describe("ROUTE_PATTERNS", () => {
  it("are the six patterns of the spec", () => {
    expect(ROUTE_PATTERNS).toEqual([["S"], ["R"], ["L"], ["S", "R"], ["R", "L"], ["L", "R"]]);
  });
});

describe("carRoutes: shape", () => {
  it("one departure and one arrival per place, for 0 to 50 cars", () => {
    for (const n of [0, 1, 7, 50]) {
      const l = layoutFor(n);
      const r = carRoutes(l, planFor(l));
      expect(r.departure).toHaveLength(l.spots.length);
      expect(r.arrival).toHaveLength(l.spots.length);
    }
  });

  it("is deterministic, does not mutate and works on frozen input", () => {
    expect(carRoutes(L50, P50)).toEqual(R50);
    const r = carRoutes(deepFreeze(structuredClone(L50)), deepFreeze(structuredClone(P50)));
    expect(r).toEqual(R50);
  });

  it("departure starts with exitPath, arrival ends with returnPath", () => {
    for (let i = 0; i < 50; i++) {
      const d = at(R50.departure, i);
      const a = at(R50.arrival, i);
      const out = exitPath(L50, i);
      const back = returnPath(L50, i);
      expect(d.slice(0, out.length)).toEqual(out);
      expect(a.slice(a.length - back.length)).toEqual(back);
    }
  });

  it("all numbers are finite and there are no zero-length legs", () => {
    for (const path of [...R50.departure, ...R50.arrival]) {
      for (let k = 0; k < path.length; k++) {
        const p = at(path, k);
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
        if (k > 0) {
          const q = at(path, k - 1);
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(1e-9);
        }
      }
    }
  });
});

describe("carRoutes: where the cars drive (acceptance 3)", () => {
  it("every point and every segment, both ways, stays on the lot or a street (index 0..49)", () => {
    for (let i = 0; i < 50; i++) {
      for (const path of [at(R50.departure, i), at(R50.arrival, i)]) {
        for (const p of densify(path, 0.25, false)) {
          expect(onAllowed(L50, P50, p), `car ${i} at ${p.x},${p.z}`).toBe(true);
        }
      }
    }
  });

  it("in the city every straight stretch is in the right-hand lane of its street", () => {
    for (let i = 0; i < 50; i++) {
      for (const path of [at(R50.departure, i), at(R50.arrival, i)]) {
        for (let k = 0; k + 1 < path.length; k++) {
          const a = at(path, k);
          const b = at(path, k + 1);
          if (inLot(L50, a) || inLot(L50, b)) continue;
          const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
          const axisAligned = Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6;
          if (!axisAligned) continue;
          // the driveway column is not a north-south street
          const off = rightOfAxis(P50, mid, b.x - a.x, b.z - a.z, 3);
          if (off === null) continue;
          expect(off, `car ${i} segment ${k}`).toBeCloseTo(LANE_OFFSET, 6);
        }
      }
    }
  });

  it("they only change direction at crossroads (or inside the parking)", () => {
    for (let i = 0; i < 50; i++) {
      for (const path of [at(R50.departure, i), at(R50.arrival, i)]) {
        for (let k = 1; k + 1 < path.length; k++) {
          const a = at(path, k - 1);
          const b = at(path, k);
          const c = at(path, k + 1);
          const h1 = Math.atan2(b.x - a.x, b.z - a.z);
          const h2 = Math.atan2(c.x - b.x, c.z - b.z);
          if (Math.abs(angDiff(h1, h2)) < 0.01) continue;
          expect(Math.abs(angDiff(h1, h2)), "no U-turn").toBeLessThanOrEqual(Math.PI / 2 + 0.01);
          if (inLot(L50, b)) continue;
          const col = Math.floor(b.x / TILE);
          const row = Math.floor(b.z / TILE);
          // the first corner after the driveway belongs to the parking part
          if (col === L50.lotCols - 1 && row === L50.streetRow) continue;
          const nearCross = P50.streetCols.some((C) =>
            P50.streetRows.some(
              (R) =>
                Math.abs(b.x - (C + 0.5) * TILE) <= 4.5 && Math.abs(b.z - (R + 0.5) * TILE) <= 4.5,
            ),
          );
          expect(nearCross, `car ${i} turns at ${b.x},${b.z} away from a crossroad`).toBe(true);
        }
      }
    }
  });

  it("corners in the city are rounded: no sharp turn between consecutive points", () => {
    for (let i = 0; i < 50; i++) {
      const path = at(R50.departure, i);
      for (let k = 1; k + 1 < path.length; k++) {
        const b = at(path, k);
        if (
          inLot(L50, b) ||
          (Math.floor(b.z / TILE) === L50.streetRow && Math.floor(b.x / TILE) <= L50.lotCols)
        )
          continue;
        const a = at(path, k - 1);
        const c = at(path, k + 1);
        const d = Math.abs(
          angDiff(Math.atan2(b.x - a.x, b.z - a.z), Math.atan2(c.x - b.x, c.z - b.z)),
        );
        expect(d, `car ${i} sharp corner at ${b.x},${b.z}`).toBeLessThan(0.5);
      }
    }
  });

  it("the six patterns, in order, from E0 (index 0..49)", () => {
    for (let i = 0; i < 50; i++) {
      const pattern = at(ROUTE_PATTERNS, i % 6);
      const m = manoeuvres(P50, at(R50.departure, i));
      expect(m.length, `car ${i} crosses no crossroad`).toBeGreaterThanOrEqual(pattern.length);
      expect(m[0]?.cell).toBe(`${L50.lotCols + 1},${L50.streetRow}`);
      pattern.forEach((t, k) => expect(m[k]?.turn, `car ${i} manoeuvre ${k}`).toBe(t));
      for (const rest of m.slice(pattern.length))
        expect(rest.turn, `car ${i} after the pattern`).toBe("S");
    }
  });

  it("the six patterns are really different routes", () => {
    const ends = new Set(
      [0, 1, 2, 3, 4, 5].map((i) => {
        const p = at(R50.departure, i);
        const e = at(p, p.length - 1);
        return `${Math.round(e.x)},${Math.round(e.z)}`;
      }),
    );
    expect(ends.size).toBeGreaterThanOrEqual(5);
    expect(manoeuvres(P50, at(R50.departure, 6))).toEqual(manoeuvres(P50, at(R50.departure, 0)));
  });

  it("the return is the city trip reversed, on the opposite lane, ending westbound on laneInZ", () => {
    for (let i = 0; i < 50; i++) {
      const d = manoeuvres(P50, at(R50.departure, i)).map((m) => m.cell);
      const a = manoeuvres(P50, at(R50.arrival, i)).map((m) => m.cell);
      expect(a, `car ${i}`).toEqual([...d].reverse());
      const arr = at(R50.arrival, i);
      const back = returnPath(L50, i);
      expect(at(back, 0).z).toBeCloseTo(L50.laneInZ, 9);
      expect(arr.length).toBeGreaterThan(back.length);
    }
  });

  it("works for every lot size, not only the full fleet", () => {
    for (const n of [0, 1, 5, 6, 10, 11, 26, 50]) {
      const l = computeLayout(n, PORTRAIT);
      const plan = planFor(l);
      const r = carRoutes(l, plan);
      r.departure.forEach((path, i) => {
        for (const p of densify(path, 0.5, false))
          expect(onAllowed(l, plan, p), `n=${n} car ${i}`).toBe(true);
        const m = manoeuvres(plan, path);
        expect(m.map((x) => x.turn).slice(0, at(ROUTE_PATTERNS, i % 6).length)).toEqual(
          at(ROUTE_PATTERNS, i % 6),
        );
      });
    }
  });
});

describe("carRoutes: the end is off screen (acceptance 3, 2)", () => {
  const views = [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 2560, height: 1080 },
  ];
  it.each(views)("at %j both ends are outside the screen, car included", (v) => {
    const view = { x: 0, y: 0, width: v.width, height: v.height };
    const bad: string[] = [];
    for (const n of [1, 6, 20, 50]) {
      const l = computeLayout(n, v);
      const plan = planFor(l);
      const r = carRoutes(l, plan);
      const cam = fitCamera(l.bounds, view);
      const margin = (CAR_BOX.length / 2) * cam.zoom;
      r.departure.forEach((path, i) => {
        for (const [name, p] of [
          ["end", at(path, path.length - 1)],
          ["start of arrival", at(at(r.arrival, i), 0)],
        ] as const) {
          for (const y of [0, CAR_BOX.height]) {
            const s = planeToScreen(cam, view, toViewPlane({ x: p.x, y, z: p.z }));
            const inside =
              s.x > view.x - margin &&
              s.x < view.x + view.width + margin &&
              s.y > view.y - margin &&
              s.y < view.y + view.height + margin;
            if (inside) bad.push(`n=${n} car ${i} ${name} y=${y} at screen ${s.x | 0},${s.y | 0}`);
          }
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("the route ends at the border of the extent, on a street cell", () => {
    for (let i = 0; i < 50; i++) {
      const path = at(R50.departure, i);
      const e = at(path, path.length - 1);
      const { colMin, colMax, rowMin, rowMax } = P50.extent;
      const onBorder =
        Math.abs(e.x - colMin * TILE) < 0.1 ||
        Math.abs(e.x - (colMax + 1) * TILE) < 0.1 ||
        Math.abs(e.z - rowMin * TILE) < 0.1 ||
        Math.abs(e.z - (rowMax + 1) * TILE) < 0.1;
      expect(onBorder, `car ${i} ends at ${e.x},${e.z}`).toBe(true);
    }
  });
});
