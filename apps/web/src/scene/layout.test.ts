import { describe, expect, it } from "vitest";
import { MAX_FLEET_SIZE } from "@rt/sim";
import * as layoutModule from "./layout";
import {
  AISLE_D,
  AGENCY_HEIGHT,
  LANE_OFFSET,
  LOT_PAD,
  SPOT_D,
  SPOT_W,
  TILE,
  computeLayout,
  exitPath,
  returnPath,
  tileCenter,
  type AgencyLayout,
  type GroundPoint,
  type GroundRect,
} from "./layout";
import { projectedBounds, toViewPlane } from "./iso";

const PORTRAIT = { width: 390, height: 650 };
const PORTRAIT_OPEN = { width: 390, height: 340 };
const DESKTOP = { width: 1060, height: 780 };
const USABLES = [PORTRAIT, PORTRAIT_OPEN, DESKTOP];
const HOSTILE = [
  { width: 0, height: 0 },
  { width: -50, height: -50 },
  { width: NaN, height: 100 },
  { width: 100, height: NaN },
  { width: Infinity, height: Infinity },
  { width: 1e-9, height: 1e-9 },
  { width: 1e12, height: 1e12 },
  { width: 1, height: 100000 },
];

function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) allNumbers(v, out);
  }
  return out;
}

function expectClean(l: AgencyLayout): void {
  for (const n of allNumbers(l)) expect(Number.isFinite(n)).toBe(true);
}

const cellOf = (p: GroundPoint) => ({ col: Math.floor(p.x / TILE), row: Math.floor(p.z / TILE) });
const inLot = (l: AgencyLayout, p: GroundPoint) => {
  const { col, row } = cellOf(p);
  return col >= 0 && col < l.lotCols && row >= 1 && row < 1 + 2 * l.rows;
};
const eps = 1e-9;
function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}
const within = (outer: GroundRect, p: GroundPoint) =>
  p.x >= outer.x - eps &&
  p.x <= outer.x + outer.width + eps &&
  p.z >= outer.z - eps &&
  p.z <= outer.z + outer.depth + eps;

describe("constants and tileCenter", () => {
  it("match the spec table", () => {
    expect([TILE, SPOT_W, SPOT_D, AISLE_D, LOT_PAD, LANE_OFFSET]).toEqual([6, 3, 5, 7, 0.75, 1.5]);
    expect(AGENCY_HEIGHT).toBe(9);
  });

  it("the city-life removals are really gone", () => {
    for (const gone of ["ROAD_EXTEND_TILES", "DECOR_RING_TILES"]) {
      expect(gone in layoutModule, gone).toBe(false);
    }
    expect("exitEndX" in computeLayout(5, PORTRAIT)).toBe(false);
  });

  it.each([
    [0, 0, 3, 3],
    [2, 5, 15, 33],
    [-2, -3, -9, -15],
  ])("tileCenter(%i, %i)", (col, row, x, z) => {
    expect(tileCenter(col, row)).toEqual({ x, z });
  });
});

describe("computeLayout", () => {
  it.each(USABLES)("0 to 51 cars stay valid at %j", (usable) => {
    for (let n = 0; n <= 51; n++) {
      const l = computeLayout(n, usable);
      expectClean(l);
      const count = Math.min(n, MAX_FLEET_SIZE);
      expect([5, 10]).toContain(l.columns);
      expect(l.spots).toHaveLength(count);
      expect(l.rows).toBe(Math.max(1, Math.ceil(count / l.columns)));
      expect(l.lotCols).toBe(l.columns === 5 ? 4 : 7);
      expect(l.streetRow).toBe(1 + 2 * l.rows);
      expect(l.aisleZs).toHaveLength(l.rows);
      expect(l.spotLines).toHaveLength((l.columns + 1) * l.rows);
      expect(l.bounds.width).toBeGreaterThan(0);
      expect(l.bounds.height).toBeGreaterThan(0);
    }
  });

  it("spots follow the row / column rule, centred in the first lotCols - 1 tiles", () => {
    for (const n of [1, 5, 6, 10, 11, 37, 50, 51]) {
      const l = computeLayout(n, PORTRAIT);
      const mid = ((l.lotCols - 1) * TILE) / 2;
      l.spots.forEach((s, i) => {
        const row = Math.floor(i / l.columns);
        const col = i % l.columns;
        expect(s.x).toBeCloseTo(mid + (col - (l.columns - 1) / 2) * SPOT_W, 9);
        expect(s.z).toBeCloseTo(TILE + 12 * row + SPOT_D / 2, 9);
      });
      l.aisleZs.forEach((z, r) => expect(z).toBeCloseTo(TILE + 12 * r + SPOT_D + AISLE_D / 2, 9));
    }
  });

  it("spots are distinct, do not overlap, and sit inside the lot slab", () => {
    for (const usable of USABLES) {
      for (let n = 0; n <= 51; n++) {
        const l = computeLayout(n, usable);
        l.spots.forEach((s, i) => {
          expect(within(l.lot, s)).toBe(true);
          expect(inLot(l, s)).toBe(true);
          l.spots.forEach((o, j) => {
            if (j <= i) return;
            const overlapX = Math.abs(s.x - o.x) < SPOT_W - eps;
            const overlapZ = Math.abs(s.z - o.z) < SPOT_D - eps;
            expect(overlapX && overlapZ, `spots ${i} and ${j} overlap at n=${n}`).toBe(false);
          });
        });
      }
    }
  });

  it("the slab is on whole tiles and contains every spot line", () => {
    for (const n of [0, 1, 7, 50]) {
      const l = computeLayout(n, PORTRAIT);
      for (const v of [l.lot.x, l.lot.z, l.lot.width, l.lot.depth]) {
        expect(Number.isInteger(v / TILE)).toBe(true);
      }
      expect(l.lot.width).toBeGreaterThan(0);
      expect(l.lot.depth).toBeGreaterThan(0);
      expect(l.lot.x).toBeGreaterThanOrEqual(0);
      expect(l.lot.x + l.lot.width).toBeLessThanOrEqual(l.lotCols * TILE + eps);
      expect(l.lot.z).toBeGreaterThanOrEqual(TILE - eps);
      expect(l.lot.z + l.lot.depth).toBeLessThanOrEqual(l.streetRow * TILE + eps);
    }
  });

  it("spot lines never overlap each other nor a parked car", () => {
    for (const n of [0, 1, 5, 6, 23, 50]) {
      const l = computeLayout(n, PORTRAIT);
      l.spotLines.forEach((a, i) => {
        expect(a.width).toBeGreaterThan(0);
        expect(a.depth).toBeGreaterThan(0);
        l.spotLines.forEach((b, j) => {
          if (j <= i) return;
          const sep =
            a.x + a.width <= b.x + eps ||
            b.x + b.width <= a.x + eps ||
            a.z + a.depth <= b.z + eps ||
            b.z + b.depth <= a.z + eps;
          expect(sep, `lines ${i} and ${j} overlap`).toBe(true);
        });
        for (const s of l.spots) {
          const hit =
            a.x < s.x + 1.05 &&
            a.x + a.width > s.x - 1.05 &&
            a.z < s.z + 1.8 &&
            a.z + a.depth > s.z - 1.8;
          expect(hit).toBe(false);
        }
      });
    }
  });

  it("exit lane and street geometry", () => {
    for (const n of [0, 3, 6, 50]) {
      const l = computeLayout(n, PORTRAIT);
      expect(l.exitLaneX).toBeCloseTo((l.lotCols - 0.5) * TILE, 9);
      expect(l.laneOutZ).toBeCloseTo((l.streetRow + 0.5) * TILE + LANE_OFFSET, 9);
      expect(l.laneInZ).toBeCloseTo((l.streetRow + 0.5) * TILE - LANE_OFFSET, 9);
      for (const s of l.spots) expect(s.x).toBeLessThan(l.exitLaneX - TILE / 2);
    }
  });

  it("columns: 5 on a tie, and always 5 for at most 5 cars", () => {
    expect(computeLayout(3, { width: 1e6, height: 1e6 }).columns).toBe(5);
    expect(computeLayout(50, { width: 1e6, height: 1e6 }).columns).toBe(5);
    for (const usable of [...USABLES, ...HOSTILE]) {
      for (let n = 0; n <= 5; n++) expect(computeLayout(n, usable).columns).toBe(5);
    }
  });

  it("a very wide and short screen picks 10 columns for a full fleet", () => {
    expect(computeLayout(50, { width: 3000, height: 200 }).columns).toBe(10);
  });

  it("is deterministic and keeps existing spots when a car is added", () => {
    expect(computeLayout(17, PORTRAIT)).toEqual(computeLayout(17, PORTRAIT));
    for (let n = 0; n < 50; n++) {
      const a = computeLayout(n, PORTRAIT);
      const b = computeLayout(n + 1, PORTRAIT);
      if (a.columns !== b.columns) continue;
      a.spots.forEach((s, i) => expect(b.spots[i]).toEqual(s));
    }
  });

  it.each(HOSTILE)("hostile usable area %j never throws or yields NaN", (usable) => {
    for (const n of [0, 1, 6, 50]) {
      const l = computeLayout(n, usable);
      expectClean(l);
      expect(l.spots).toHaveLength(n);
    }
  });

  it("hostile car counts are clamped", () => {
    const len = (n: number) => computeLayout(n, PORTRAIT).spots.length;
    expect(len(NaN)).toBe(0);
    expect(len(-5)).toBe(0);
    expect(len(-0.5)).toBe(0);
    expect(len(1e9)).toBe(MAX_FLEET_SIZE);
    expect(len(2 ** 53)).toBe(MAX_FLEET_SIZE);
    expect(len(Number.MAX_VALUE)).toBe(MAX_FLEET_SIZE);
    expect(len(Infinity)).toBeLessThanOrEqual(MAX_FLEET_SIZE);
    expect(len(Infinity)).toBeGreaterThanOrEqual(0);
    expect(len(2.7)).toBeGreaterThanOrEqual(2);
    expect(len(2.7)).toBeLessThanOrEqual(3);
    expect(len(-Infinity)).toBe(0);
    expectClean(computeLayout(NaN, PORTRAIT));
  });

  it("bounds contain the projected agency box and stay inside the extended box", () => {
    for (const n of [0, 4, 12, 50]) {
      const l = computeLayout(n, PORTRAIT);
      const corners = (zEnd: number) => {
        const pts = [];
        for (const x of [0, l.lotCols * TILE]) {
          for (const z of [0, zEnd]) for (const y of [0, AGENCY_HEIGHT]) pts.push({ x, y, z });
        }
        return pts;
      };
      const inner = projectedBounds(corners((l.streetRow + 1) * TILE));
      const outer = projectedBounds(corners((l.streetRow + 2) * TILE));
      const b = l.bounds;
      expect(b.x).toBeLessThanOrEqual(inner.x + 1e-6);
      expect(b.y).toBeLessThanOrEqual(inner.y + 1e-6);
      expect(b.x + b.width).toBeGreaterThanOrEqual(inner.x + inner.width - 1e-6);
      expect(b.y + b.height).toBeGreaterThanOrEqual(inner.y + inner.height - 1e-6);
      expect(b.x + b.width).toBeLessThanOrEqual(outer.x + outer.width + 1e-6);
      expect(b.y + b.height).toBeLessThanOrEqual(outer.y + outer.height + 1e-6);
      for (const s of l.spots) {
        const v = toViewPlane({ x: s.x, y: 0, z: s.z });
        expect(v.x).toBeGreaterThanOrEqual(b.x);
        expect(v.x).toBeLessThanOrEqual(b.x + b.width);
        expect(v.y).toBeGreaterThanOrEqual(b.y);
        expect(v.y).toBeLessThanOrEqual(b.y + b.height);
      }
    }
  });
});

describe("tiles", () => {
  const layouts = [0, 1, 6, 11, 50].map((n) => computeLayout(n, PORTRAIT));

  it("have whole columns / rows, a valid turn and no duplicate cell", () => {
    for (const l of layouts) {
      const seen = new Map<string, string>();
      for (const t of l.tiles) {
        expect(Number.isInteger(t.col) && Number.isInteger(t.row)).toBe(true);
        expect([0, 1, 2, 3]).toContain(t.turn);
        expect(["driveway", "sidewalk"]).toContain(t.kind);
        expect(t.col).toBeGreaterThanOrEqual(-1);
        expect(t.col).toBeLessThanOrEqual(l.lotCols);
        const key = `${t.col},${t.row}`;
        expect(seen.get(key), `cell ${key} used twice (${seen.get(key)} and ${t.kind})`).toBe(
          undefined,
        );
        seen.set(key, t.kind);
      }
    }
  });

  it("never sit on the parking slab", () => {
    for (const l of layouts) {
      for (const t of l.tiles) {
        const onLot = t.col >= 0 && t.col < l.lotCols && t.row >= 1 && t.row < 1 + 2 * l.rows;
        expect(onLot, `${t.kind} at ${t.col},${t.row} is under the lot`).toBe(false);
      }
    }
  });

  it("hold the agency block only: one driveway on the street row, no street tile", () => {
    for (const l of layouts) {
      const driveways = l.tiles.filter((t) => t.kind === "driveway");
      expect(driveways).toEqual([
        { kind: "driveway", col: l.lotCols - 1, row: l.streetRow, turn: 0 },
      ]);
      for (const t of l.tiles)
        expect(t.row).toBeLessThan(l.streetRow + (t.kind === "driveway" ? 1 : 0));
    }
  });

  it("have sidewalks on columns -1 and lotCols beside the lot", () => {
    for (const l of layouts) {
      const kinds = (col: number, row: number) =>
        l.tiles.find((t) => t.col === col && t.row === row)?.kind;
      expect(kinds(-1, 1)).toBe("sidewalk");
      expect(kinds(l.lotCols, 1)).toBe("sidewalk");
    }
  });
});

describe("props", () => {
  const l = computeLayout(12, PORTRAIT);
  const of = (kind: string) => l.props.filter((p) => p.kind === kind);

  it("are finite with a non-negative integer variant", () => {
    for (const n of [0, 12, 50]) {
      for (const p of computeLayout(n, PORTRAIT).props) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.heading)).toBe(
          true,
        );
        expect(Number.isInteger(p.variant) && p.variant >= 0).toBe(true);
      }
    }
  });

  it("one agency, awning and sign on the north facade, centred on the lot", () => {
    for (const kind of ["agency", "awning", "sign"]) {
      expect(of(kind), kind).toHaveLength(1);
      const p = at(of(kind), 0);
      expect(Math.abs(p.x - (l.lot.x + l.lot.width / 2))).toBeLessThan(TILE);
      expect(p.z).toBeLessThanOrEqual(l.lot.z + eps); // the awning sits on the facade line
    }
  });

  it("only the agency block kinds remain; the neighbourhood moved to cityPlan", () => {
    const allowed = ["agency", "awning", "sign", "parasol", "lamp"];
    for (const n of [0, 12, 50]) {
      for (const p of computeLayout(n, PORTRAIT).props) {
        expect(allowed, `${p.kind} must come from cityPlan`).toContain(p.kind);
        expect(p.scale).toBeGreaterThan(0);
        expect(Number.isFinite(p.scale)).toBe(true);
        expect(Number.isInteger(p.tint) && p.tint >= -1).toBe(true);
      }
    }
  });

  it("has parking lamps and keeps parasols away from the agency", () => {
    expect(of("lamp").length).toBeGreaterThanOrEqual(2);
    for (const p of of("parasol"))
      expect(Math.abs(p.x - l.lot.width / 2)).toBeGreaterThanOrEqual(6);
    for (const p of of("lamp"))
      expect(inLot(l, p) || Math.floor(p.z / TILE) <= l.streetRow).toBe(true);
  });
});

describe("exitPath / returnPath", () => {
  const sample = (a: GroundPoint, b: GroundPoint): GroundPoint[] => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    return Array.from({ length: steps + 1 }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / steps,
      z: a.z + ((b.z - a.z) * k) / steps,
    }));
  };
  const onRoadOrLot = (l: AgencyLayout, p: GroundPoint) => {
    if (inLot(l, p)) return true;
    const { col, row } = cellOf(p);
    const t = l.tiles.find((x) => x.col === col && x.row === row);
    return t !== undefined && t.kind === "driveway";
  };

  it.each(USABLES)("every point and segment stays on lot / driveway / street (%j)", (usable) => {
    for (const n of [1, 4, 6, 10, 11, 33, 50, 51]) {
      const l = computeLayout(n, usable);
      for (let i = 0; i < l.spots.length; i++) {
        for (const path of [exitPath(l, i), returnPath(l, i)]) {
          expect(path.length).toBeGreaterThanOrEqual(3);
          for (let k = 0; k + 1 < path.length; k++) {
            const a = at(path, k);
            const b = at(path, k + 1);
            expect(a.x === b.x || a.z === b.z, `diagonal segment ${k} for car ${i}`).toBe(true);
            for (const p of sample(a, b)) {
              expect(onRoadOrLot(l, p), `car ${i} leaves the road at ${p.x},${p.z} (n=${n})`).toBe(
                true,
              );
            }
          }
        }
      }
    }
  });

  it("the exit goes from the spot to (exitLaneX, laneOutZ) through the exit lane", () => {
    const l = computeLayout(50, PORTRAIT);
    for (let i = 0; i < 50; i++) {
      const out = exitPath(l, i);
      expect(out[0]).toEqual(l.spots[i]);
      expect(out[out.length - 1]).toEqual({ x: l.exitLaneX, z: l.laneOutZ });
      const aisle = at(l.aisleZs, Math.floor(i / l.columns));
      expect(out).toContainEqual({ x: l.exitLaneX, z: aisle });
      expect(out).toContainEqual({ x: l.exitLaneX, z: l.laneOutZ });
      // first leg backs straight out of the spot toward the aisle (south)
      const second = at(out, 1);
      expect(second.x).toBe(at(l.spots, i).x);
      expect(second.z).toBeGreaterThan(at(l.spots, i).z);
    }
  });

  it("the return starts at (exitLaneX, laneInZ) and ends on the spot, entering from the aisle", () => {
    const l = computeLayout(50, PORTRAIT);
    for (let i = 0; i < 50; i++) {
      const back = returnPath(l, i);
      expect(back[0]).toEqual({ x: l.exitLaneX, z: l.laneInZ });
      expect(back[back.length - 1]).toEqual(l.spots[i]);
      const aisle = at(l.aisleZs, Math.floor(i / l.columns));
      expect(back).toContainEqual({ x: l.exitLaneX, z: aisle });
      const prev = at(back, back.length - 2);
      expect(prev.x).toBe(at(l.spots, i).x);
      expect(prev.z).toBeGreaterThan(at(l.spots, i).z);
    }
  });

  it("the two lanes differ (right-hand traffic: out on the south lane)", () => {
    const l = computeLayout(5, PORTRAIT);
    expect(l.laneOutZ).toBeGreaterThan(l.laneInZ);
  });

  it("no consecutive duplicate points (zero-length legs)", () => {
    const l = computeLayout(50, PORTRAIT);
    for (let i = 0; i < 50; i++) {
      for (const path of [exitPath(l, i), returnPath(l, i)]) {
        for (let k = 0; k + 1 < path.length; k++) {
          expect(path[k]).not.toEqual(path[k + 1]);
        }
      }
    }
  });

  it.each([-1, 50, 51, 3.5, NaN, Infinity, -Infinity, 2 ** 53, 1e9, Number.MIN_VALUE])(
    "index %s has no path",
    (i) => {
      const l = computeLayout(50, PORTRAIT);
      expect(exitPath(l, i)).toEqual([]);
      expect(returnPath(l, i)).toEqual([]);
    },
  );

  it("an index beyond the placed spots has no path", () => {
    const l = computeLayout(3, PORTRAIT);
    expect(exitPath(l, 3)).toEqual([]);
    expect(returnPath(l, 3)).toEqual([]);
    expect(exitPath(computeLayout(0, PORTRAIT), 0)).toEqual([]);
  });
});
