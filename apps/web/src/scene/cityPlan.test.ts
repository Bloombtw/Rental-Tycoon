/// <reference types="node" />
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_FLEET_SIZE } from "@rt/sim";
import { fitCamera, screenToPlane } from "./camera";
import {
  CITY_BLOCKS,
  MIN_TRAFFIC_GAP,
  NEAR_RING,
  SOUTH_EXTRA_ROWS,
  TURN_RADIUS,
  computeCityPlan,
  isStreetCell,
  type Block,
  type BlockUse,
  type CityPlan,
} from "./cityPlan";
import {
  PORTRAIT,
  WIDE,
  allNumbers,
  angDiff,
  at,
  axisOf,
  cellOfPoint,
  deepFreeze,
  densify,
  distToPolyline,
  distinctLayouts,
  layoutFor,
  planFor,
  rightOfAxis,
} from "./cityKit.test";
import { viewPlaneToGround } from "./iso";
import { LANE_OFFSET, TILE, computeLayout, type AgencyLayout, type PropPlacement } from "./layout";
import { PROP_ASSETS, TRAFFIC_ASSET, ROAD_TILE_ASSET } from "./assets";
import { carRoutes } from "./routes";
import { FAR_TINTS, SCENE_COLORS } from "./palette";
import { TRAFFIC_MODELS } from "./traffic";

const LAYOUTS = distinctLayouts();
const cellKey = (c: number, r: number) => `${c},${r}`;
const SOLID = ["building", "backdrop", "lowBuilding"] as const;
const assetName = (p: PropPlacement): string => {
  const list = PROP_ASSETS[p.kind];
  return list[p.variant % list.length]?.name ?? "";
};
const solids = (plan: CityPlan) =>
  plan.props.filter((p) => (SOLID as readonly string[]).includes(p.kind));
const blockAt = (plan: CityPlan, i: number, j: number): Block => {
  const b = plan.blocks.find((x) => x.i === i && x.j === j);
  if (!b) throw new Error(`no block ${i},${j}`);
  return b;
};
const inBlock = (b: Block, p: { x: number; z: number }) => {
  const { col, row } = cellOfPoint(p);
  return (
    col >= b.cells.colMin && col <= b.cells.colMax && row >= b.cells.rowMin && row <= b.cells.rowMax
  );
};
const expectedUse = (i: number, j: number): BlockUse => {
  const ring = Math.max(Math.abs(i), Math.abs(j));
  if (i === 0 && j === 0) return "agency";
  if (i === 0 && j === 1) return "park";
  if (i === -1 && j === 1) return "construction";
  if (i === 1 && j === 1) return "carPark";
  if (ring <= 2) return j <= -1 ? "tall" : "buildings";
  return j === -3 ? "farTall" : "far";
};

describe("constants", () => {
  it("match the contract", () => {
    expect([CITY_BLOCKS, NEAR_RING, MIN_TRAFFIC_GAP, TURN_RADIUS]).toEqual([3, 2, 12, 2.5]);
  });
});

describe("street grid and blocks (2.1)", () => {
  it.each(LAYOUTS.map((l) => [`${l.columns}x${l.rows}`, l] as const))("grid of %s", (_n, l) => {
    const plan = planFor(l);
    const L = l.lotCols;
    const sr = l.streetRow;
    expect(plan.streetCols).toEqual([-14, -10, -6, -2, L + 1, L + 5, L + 9, L + 13]);
    expect(plan.streetRows).toEqual([-15, -11, -7, -3, sr, sr + 4, sr + 8, sr + 12]);
    // The south side is extended by SOUTH_EXTRA_ROWS so the world edge never shows on a tall lot.
    expect(plan.extent).toEqual({
      colMin: -15,
      colMax: L + 14,
      rowMin: -16,
      rowMax: sr + 13 + SOUTH_EXTRA_ROWS,
    });
    expect(plan.blocks).toHaveLength(49);
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const matches = plan.blocks.filter((b) => b.i === i && b.j === j);
        expect(matches, `block ${i},${j}`).toHaveLength(1);
        expect(matches[0]?.use).toBe(expectedUse(i, j));
      }
    }
    const a = blockAt(plan, 0, 0);
    expect(a.cells).toEqual({ colMin: -1, colMax: L, rowMin: -2, rowMax: sr - 1 });
    // blocks tile the space between streets exactly: no street cell inside, no overlap
    const seen = new Set<string>();
    for (const b of plan.blocks) {
      for (let r = b.cells.rowMin; r <= b.cells.rowMax; r++) {
        for (let c = b.cells.colMin; c <= b.cells.colMax; c++) {
          expect(isStreetCell(plan, c, r)).toBe(false);
          expect(seen.has(cellKey(c, r)), `cell ${c},${r} in two blocks`).toBe(false);
          seen.add(cellKey(c, r));
        }
      }
    }
  });

  it("isStreetCell is exact and refuses hostile cells", () => {
    const l = layoutFor(6);
    const plan = planFor(l);
    expect(isStreetCell(plan, -2, 0)).toBe(true);
    expect(isStreetCell(plan, 0, l.streetRow)).toBe(true);
    expect(isStreetCell(plan, l.lotCols + 1, l.streetRow)).toBe(true);
    expect(isStreetCell(plan, 0, 0)).toBe(false);
    expect(isStreetCell(plan, -15, -16)).toBe(false); // extent margin corner
    for (const [c, r] of [
      [NaN, 0],
      [0, NaN],
      [Infinity, 0],
      [1.5, 0],
      [-2, 0.5],
      [1e9, l.streetRow],
      [-2, 1e9],
      [-2, -1e9],
    ] as const) {
      expect(isStreetCell(plan, c, r), `${c},${r}`).toBe(false);
    }
  });

  it("the streets form one connected grid holding the agency street and its two cross streets", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const { colMin, colMax, rowMin, rowMax } = plan.extent;
      const start = [-2, l.streetRow] as const;
      expect(isStreetCell(plan, start[0], start[1])).toBe(true);
      const seen = new Set<string>([cellKey(...start)]);
      const queue: (readonly [number, number])[] = [start];
      while (queue.length) {
        const [c, r] = queue.pop() ?? start;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = [c + dc, r + dr] as const;
          if (!isStreetCell(plan, ...n) || seen.has(cellKey(...n))) continue;
          seen.add(cellKey(...n));
          queue.push(n);
        }
      }
      let total = 0;
      for (let r = rowMin; r <= rowMax; r++) {
        for (let c = colMin; c <= colMax; c++) if (isStreetCell(plan, c, r)) total++;
      }
      expect(seen.size).toBe(total);
      for (const c of [-2, l.lotCols + 1])
        expect(isStreetCell(plan, c, l.streetRow - 1)).toBe(true);
    }
  });
});

describe("tiles", () => {
  it.each(LAYOUTS.map((l) => [`${l.columns}x${l.rows}`, l] as const))("%s", (_n, l) => {
    const plan = planFor(l);
    const seen = new Map<string, string>();
    for (const t of [...l.tiles, ...plan.tiles]) {
      expect(Number.isInteger(t.col) && Number.isInteger(t.row)).toBe(true);
      expect([0, 1, 2, 3]).toContain(t.turn);
      const k = cellKey(t.col, t.row);
      expect(seen.get(k), `cell ${k}: ${seen.get(k)} and ${t.kind}`).toBeUndefined();
      seen.set(k, t.kind);
      expect(ROAD_TILE_ASSET[t.kind]).toBeDefined();
      const street = isStreetCell(plan, t.col, t.row);
      if (street) expect(["straight", "crossroad", "crossing", "driveway"]).toContain(t.kind);
      else expect(["sidewalk", "asphalt"]).toContain(t.kind);
    }
    for (const t of plan.tiles) {
      const onLot = t.col >= 0 && t.col < l.lotCols && t.row >= 1 && t.row < 1 + 2 * l.rows;
      expect(onLot, `${t.kind} on the parking lot`).toBe(false);
    }
    // every street cell has exactly one tile, with the right orientation
    const { colMin, colMax, rowMin, rowMax } = plan.extent;
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        if (!isStreetCell(plan, c, r)) continue;
        const t = [...l.tiles, ...plan.tiles].find((x) => x.col === c && x.row === r);
        expect(t, `street cell ${c},${r} has no tile`).toBeDefined();
        const cross = plan.streetCols.includes(c) && plan.streetRows.includes(r);
        if (cross) expect(t?.kind).toBe("crossroad");
        else if (t?.kind === "straight") expect(t.turn).toBe(plan.streetRows.includes(r) ? 0 : 1);
      }
    }
    // asphalt only under the neighbourhood car park, fully
    const car = blockAt(plan, 1, 1);
    for (const t of plan.tiles.filter((x) => x.kind === "asphalt")) {
      expect(inBlock(car, { x: (t.col + 0.5) * TILE, z: (t.row + 0.5) * TILE })).toBe(true);
    }
    expect(plan.tiles.filter((x) => x.kind === "asphalt")).toHaveLength(9);
  });

  it("the arms of the two agency crossings have pedestrian crossings", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const all = [...l.tiles, ...plan.tiles];
      for (const c of [-2, l.lotCols + 1]) {
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const t = all.find((x) => x.col === c + dc && x.row === l.streetRow + dr);
          expect(t?.kind, `arm ${dc},${dr} of crossing ${c}`).toBe("crossing");
        }
      }
    }
  });
});

describe("props: buildings", () => {
  it("never on a street, never on the lot, one solid building per cell, always inside a block", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const cells = new Map<string, string>();
      for (const p of solids(plan)) {
        const { col, row } = cellOfPoint(p);
        expect(isStreetCell(plan, col, row), `${p.kind} on street ${col},${row}`).toBe(false);
        const onLot = col >= 0 && col < l.lotCols && row >= 1 && row < 1 + 2 * l.rows;
        expect(onLot).toBe(false);
        expect(plan.blocks.some((b) => inBlock(b, p))).toBe(true);
        const k = cellKey(col, row);
        expect(cells.get(k), `two solid buildings in ${k}`).toBeUndefined();
        cells.set(k, p.kind);
      }
      // the agency building itself stands on its own cell
      for (const a of l.props.filter((p) => p.kind === "agency")) {
        const { col, row } = cellOfPoint(a);
        expect(cells.has(cellKey(col, row))).toBe(false);
      }
    }
  });

  it("every building faces the nearest street, east-west streets win at corners", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      for (const p of solids(plan)) {
        const { col, row } = cellOfPoint(p);
        const steps = (dc: number, dr: number): number => {
          for (let k = 1; k < 20; k++) if (isStreetCell(plan, col + dc * k, row + dr * k)) return k;
          return Infinity;
        };
        const dist = { N: steps(0, -1), S: steps(0, 1), E: steps(1, 0), W: steps(-1, 0) };
        const best = Math.min(...Object.values(dist));
        // heading 0 = south, PI/2 = east, PI = north, 3PI/2 = west
        const dir =
          Math.round(
            (((p.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2),
          ) % 4;
        expect(Math.abs(angDiff(p.heading, dir * (Math.PI / 2)))).toBeLessThan(1e-6);
        const facing = (["S", "E", "N", "W"] as const)[dir] ?? "S";
        expect(
          dist[facing],
          `${p.kind} at ${col},${row} faces ${facing}: ${JSON.stringify(dist)}`,
        ).toBe(best);
        if (dist.N === best || dist.S === best) expect(["N", "S"]).toContain(facing);
      }
    }
  });

  it("two neighbours along the same street are never the same model", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const key = (p: PropPlacement) => `${p.kind}:${assetName(p)}:${p.tint}`;
      const byCell = new Map<string, PropPlacement>();
      for (const p of solids(plan)) byCell.set(cellKey(cellOfPoint(p).col, cellOfPoint(p).row), p);
      for (const p of solids(plan)) {
        const { col, row } = cellOfPoint(p);
        const along = Math.abs(Math.cos(p.heading)) > 0.5 ? [1, 0] : [0, 1];
        const next = byCell.get(cellKey(col + (along[0] ?? 0), row + (along[1] ?? 0)));
        if (!next || Math.abs(angDiff(next.heading, p.heading)) > 1e-6) continue;
        expect(key(next), `${key(p)} repeated at ${col},${row}`).not.toBe(key(p));
      }
    }
  });

  it("uses at least 10 different building models, never the agency's building-h", () => {
    for (const l of LAYOUTS) {
      const names = new Set(
        planFor(l)
          .props.filter((p) => p.kind === "building")
          .map(assetName),
      );
      expect(names.size).toBeGreaterThanOrEqual(10);
      expect(names.has("building-h")).toBe(false);
    }
  });

  it("zoning: nothing in the south blocks, skyscrapers only in blocks j <= -1 and north of the agency", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      for (const [i, j] of [
        [-1, 1],
        [0, 1],
        [1, 1],
      ] as const) {
        const b = blockAt(plan, i, j);
        expect(
          solids(plan).filter((p) => inBlock(b, p)),
          `block ${i},${j}`,
        ).toEqual([]);
      }
      for (const p of plan.props.filter((x) => x.kind === "backdrop")) {
        const b = plan.blocks.find((x) => inBlock(x, p));
        expect(b?.j ?? 99).toBeLessThanOrEqual(-1);
        expect(["tall", "farTall"]).toContain(b?.use);
        expect(p.z).toBeLessThan(0);
      }
      for (const p of plan.props.filter((x) => x.kind === "building")) {
        expect(["agency", "buildings"]).toContain(plan.blocks.find((x) => inBlock(x, p))?.use);
      }
      for (const p of plan.props.filter((x) => x.kind === "lowBuilding")) {
        expect(plan.blocks.find((x) => inBlock(x, p))?.use).toBe("far");
      }
    }
  });

  it("the agency block keeps its buildings north of the lot and beside the agency row", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const cells = new Set(
        plan.props
          .filter((p) => p.kind === "building")
          .map((p) => cellKey(cellOfPoint(p).col, cellOfPoint(p).row)),
      );
      for (let c = -1; c <= l.lotCols; c++) {
        for (const r of [-2, -1]) expect(cells.has(cellKey(c, r)), `${c},${r}`).toBe(true);
      }
      expect(cells.has(cellKey(-1, 0))).toBe(true);
      expect(cells.has(cellKey(l.lotCols, 0))).toBe(true);
    }
  });

  it("far blocks are tinted warm and never grey: every low building has a valid tint", () => {
    for (const l of LAYOUTS) {
      for (const p of planFor(l).props.filter((x) => x.kind === "lowBuilding")) {
        expect(Number.isInteger(p.tint) && p.tint >= 0 && p.tint < FAR_TINTS.length).toBe(true);
      }
    }
  });
});

describe("props: validity, furniture, parked cars", () => {
  it("every prop is finite, in the extent, with an existing asset and valid indexes", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const e = plan.extent;
      for (const p of plan.props) {
        expect([p.x, p.z, p.heading, p.scale].every(Number.isFinite), p.kind).toBe(true);
        expect(p.scale).toBeGreaterThan(0);
        expect(Number.isInteger(p.variant) && p.variant >= 0).toBe(true);
        expect(p.x).toBeGreaterThan(e.colMin * TILE);
        expect(p.x).toBeLessThan((e.colMax + 1) * TILE);
        expect(p.z).toBeGreaterThan(e.rowMin * TILE);
        expect(p.z).toBeLessThan((e.rowMax + 1) * TILE);
        if (p.kind === "parkedCar") {
          expect(p.variant).toBeLessThan(TRAFFIC_MODELS.length);
          expect(TRAFFIC_ASSET[TRAFFIC_MODELS[p.variant] ?? "taxi"]).toBeDefined();
        } else if (p.kind === "tree") {
          expect(p.tint).toBeGreaterThanOrEqual(0);
          expect(p.tint).toBeLessThan(SCENE_COLORS.treeLeaves.length);
        } else if (p.kind !== "sign") {
          expect(PROP_ASSETS[p.kind].length, p.kind).toBeGreaterThan(0);
        }
      }
      expect(plan.props.some((p) => p.kind === "agency" || p.kind === "awning")).toBe(false);
    }
  });

  it("furniture stays out of the far ring; trees stay off streets and buildings", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const far = plan.blocks.filter((b) => b.use === "far" || b.use === "farTall");
      const built = new Set(
        solids(plan).map((p) => cellKey(cellOfPoint(p).col, cellOfPoint(p).row)),
      );
      for (const p of plan.props) {
        if (["streetLamp", "trafficLight", "streetSign", "dumpster", "tree"].includes(p.kind)) {
          expect(
            far.some((b) => inBlock(b, p)),
            `${p.kind} in a far block`,
          ).toBe(false);
        }
        if (p.kind === "tree") {
          const { col, row } = cellOfPoint(p);
          expect(isStreetCell(plan, col, row)).toBe(false);
          expect(built.has(cellKey(col, row))).toBe(false);
        }
      }
    }
  });

  it("street lamps stand next to a street and face the roadway", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const rows = plan.streetRows.map(axisOf);
      const cols = plan.streetCols.map(axisOf);
      for (const p of plan.props.filter((x) => x.kind === "streetLamp")) {
        const dz = rows
          .map((a) => a - p.z)
          .reduce((m, v) => (Math.abs(v) < Math.abs(m) ? v : m), 1e9);
        const dx = cols
          .map((a) => a - p.x)
          .reduce((m, v) => (Math.abs(v) < Math.abs(m) ? v : m), 1e9);
        const toward = Math.abs(dz) <= Math.abs(dx) ? { x: 0, z: dz } : { x: dx, z: 0 };
        expect(Math.hypot(toward.x, toward.z)).toBeLessThanOrEqual(TILE / 2 + 1e-6);
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        expect(fx * toward.x + fz * toward.z, `lamp at ${p.x},${p.z}`).toBeGreaterThan(0);
      }
    }
  });

  it("both agency crossings carry traffic lights on opposite corners and 4 street signs", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      for (const c of [-2, l.lotCols + 1]) {
        const cx = axisOf(c);
        const cz = axisOf(l.streetRow);
        const near = (kind: string) =>
          plan.props.filter(
            (p) => p.kind === kind && Math.abs(p.x - cx) <= TILE && Math.abs(p.z - cz) <= TILE,
          );
        const lights = near("trafficLight");
        expect(lights.length).toBeGreaterThanOrEqual(2);
        const opposite = lights.some((a) =>
          lights.some(
            (b) =>
              Math.abs(a.x - cx + (b.x - cx)) < 0.5 &&
              Math.abs(a.z - cz + (b.z - cz)) < 0.5 &&
              a !== b,
          ),
        );
        expect(opposite, `crossing ${c}`).toBe(true);
        const signs = near("streetSign");
        expect(signs.length).toBeGreaterThanOrEqual(4);
        expect(
          new Set(signs.map((s) => `${Math.sign(s.x - cx)},${Math.sign(s.z - cz)}`)).size,
        ).toBe(4);
      }
    }
  });

  it("the square is a planted park; the building site and the car park are dressed", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const park = blockAt(plan, 0, 1);
      expect(
        plan.props.filter((p) => p.kind === "tree" && inBlock(park, p)).length,
      ).toBeGreaterThanOrEqual(2);
      const site = blockAt(plan, -1, 1);
      expect(
        plan.props.filter((p) => p.kind === "construction" && inBlock(site, p)).length,
      ).toBeGreaterThan(4);
      expect(
        plan.props.some(
          (p) =>
            p.kind === "parkedCar" && inBlock(site, p) && TRAFFIC_MODELS[p.variant] === "truck",
        ),
      ).toBe(true);
      const car = blockAt(plan, 1, 1);
      const parked = plan.props.filter((p) => p.kind === "parkedCar" && inBlock(car, p));
      expect(parked.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("parked cars (decor) never sit on a crossroad, a building or another parked car", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const built = new Set(
        solids(plan).map((p) => cellKey(cellOfPoint(p).col, cellOfPoint(p).row)),
      );
      const cars = plan.props.filter((p) => p.kind === "parkedCar");
      cars.forEach((p, i) => {
        const { col, row } = cellOfPoint(p);
        expect(built.has(cellKey(col, row))).toBe(false);
        expect(
          plan.streetCols.includes(col) && plan.streetRows.includes(row),
          `car at crossroad ${col},${row}`,
        ).toBe(false);
        cars.forEach((q, j) => {
          if (j > i)
            expect(Math.hypot(p.x - q.x, p.z - q.z), `cars ${i}/${j}`).toBeGreaterThanOrEqual(3);
        });
      });
    }
  });

  it("kerbside parked cars: right-hand lane shifted 0.6 m to the kerb, on the agency and park blocks only", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      const kerb = plan.props.filter(
        (p) => p.kind === "parkedCar" && isStreetCell(plan, cellOfPoint(p).col, cellOfPoint(p).row),
      );
      expect(kerb.length).toBeGreaterThan(0);
      for (const p of kerb) {
        const dx = Math.sin(p.heading);
        const dz = Math.cos(p.heading);
        const off = rightOfAxis(
          plan,
          p,
          Math.abs(dx) > 0.5 ? Math.sign(dx) : 0,
          Math.abs(dz) > 0.5 ? Math.sign(dz) : 0,
        );
        expect(off, `car at ${p.x},${p.z} heading ${p.heading}`).not.toBeNull();
        expect(off ?? 0).toBeCloseTo(LANE_OFFSET + 0.6, 6);
        const { col, row } = cellOfPoint(p);
        const near = [-1, 0, 1].some((a) =>
          [-1, 0, 1].some((b) =>
            plan.blocks.some(
              (blk) =>
                (blk.use === "agency" || blk.use === "park") &&
                inBlock(blk, { x: (col + a + 0.5) * TILE, z: (row + b + 0.5) * TILE }),
            ),
          ),
        );
        expect(near).toBe(true);
      }
    }
  });

  it("no kerbside car within 3 m of any of our routes or background loops", () => {
    for (const n of [0, 6, 20, 50]) {
      const l = layoutFor(n);
      const plan = planFor(l);
      const routes = carRoutes(l, plan);
      const lines = [
        ...routes.departure.map((r) => densify(r, 0.5, false)),
        ...routes.arrival.map((r) => densify(r, 0.5, false)),
      ];
      const kerb = plan.props.filter(
        (p) => p.kind === "parkedCar" && isStreetCell(plan, cellOfPoint(p).col, cellOfPoint(p).row),
      );
      for (const p of kerb) {
        for (const line of lines) {
          for (const q of line) {
            if (Math.abs(q.x - p.x) > 3 || Math.abs(q.z - p.z) > 3) continue;
            expect(
              Math.hypot(q.x - p.x, q.z - p.z),
              `n=${n} car ${p.x},${p.z}`,
            ).toBeGreaterThanOrEqual(3 - 1e-6);
          }
        }
        for (const lp of plan.loops) {
          expect(
            distToPolyline(p, lp.path, true),
            `loop of block ${lp.block}`,
          ).toBeGreaterThanOrEqual(3 - 1e-6);
        }
      }
    }
  });
});

describe("traffic loops (data)", () => {
  it("23 loops: every block of ring <= 2 except the agency and the square, sorted by rank", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      expect(plan.loops).toHaveLength(23);
      const blocksUsed = new Set<number>();
      let prevRank = -Infinity;
      let prevDist = -Infinity;
      for (const lp of plan.loops) {
        const b = plan.blocks[lp.block];
        expect(b).toBeDefined();
        expect(blocksUsed.has(lp.block), "two loops on one block").toBe(false);
        blocksUsed.add(lp.block);
        expect(Math.max(Math.abs(b?.i ?? 9), Math.abs(b?.j ?? 9))).toBeLessThanOrEqual(NEAR_RING);
        expect(["agency", "park"]).not.toContain(b?.use);
        expect(lp.rank).toBeGreaterThanOrEqual(prevRank);
        prevRank = lp.rank;
        const centre = {
          x: (((b?.cells.colMin ?? 0) + (b?.cells.colMax ?? 0) + 1) / 2) * TILE,
          z: (((b?.cells.rowMin ?? 0) + (b?.cells.rowMax ?? 0) + 1) / 2) * TILE,
        };
        const d = Math.hypot(centre.x - (l.lotCols * TILE) / 2, centre.z - TILE / 2);
        expect(d).toBeGreaterThanOrEqual(prevDist - 1e-6);
        prevDist = d;
        expect(lp.speed).toBeGreaterThanOrEqual(7);
        expect(lp.speed).toBeLessThanOrEqual(10);
        expect(lp.capacity).toBe(Math.min(3, Math.floor(lp.length / MIN_TRAFFIC_GAP)));
        expect(lp.capacity).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(lp.phase)).toBe(true);
        expect(lp.length).toBeGreaterThan(0);
        expect(lp.length).toBeCloseTo(densify(lp.path, 0.01, true).length * 0.01, 0);
      }
      expect(blocksUsed.size).toBe(23);
    }
  });

  it("each loop is clockwise, on the right-hand lane, in street cells hugging its block", () => {
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      for (const lp of plan.loops) {
        const b = plan.blocks[lp.block] as Block;
        let area = 0;
        lp.path.forEach((p, k) => {
          const q = at(lp.path, (k + 1) % lp.path.length);
          area += p.x * q.z - q.x * p.z;
        });
        expect(area, "clockwise on screen (z down) means a positive shoelace sum").toBeGreaterThan(
          0,
        );
        const x0 = b.cells.colMin * TILE;
        const x1 = (b.cells.colMax + 1) * TILE;
        const z0 = b.cells.rowMin * TILE;
        const z1 = (b.cells.rowMax + 1) * TILE;
        for (const p of densify(lp.path, 0.5, true)) {
          const { col, row } = cellOfPoint(p);
          expect(isStreetCell(plan, col, row), `loop of block ${lp.block} at ${p.x},${p.z}`).toBe(
            true,
          );
          const dx = Math.max(x0 - p.x, 0, p.x - x1);
          const dz = Math.max(z0 - p.z, 0, p.z - z1);
          const d = Math.hypot(dx, dz);
          expect(d).toBeGreaterThanOrEqual(0.9);
          expect(d).toBeLessThanOrEqual(LANE_OFFSET + 1e-6);
        }
        for (let k = 0; k < lp.path.length; k++) {
          const a = at(lp.path, k);
          const c = at(lp.path, (k + 1) % lp.path.length);
          const off = rightOfAxis(
            plan,
            { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 },
            c.x - a.x,
            c.z - a.z,
          );
          if (off !== null && (Math.abs(c.x - a.x) < 1e-9 || Math.abs(c.z - a.z) < 1e-9)) {
            expect(off).toBeCloseTo(LANE_OFFSET, 6);
          }
        }
      }
    }
  });

  it("the loop headings are continuous (rounded corners with radius 2.5)", () => {
    const plan = planFor(layoutFor(6));
    for (const lp of plan.loops) {
      for (let k = 0; k < lp.path.length; k++) {
        const a = at(lp.path, k);
        const b = at(lp.path, (k + 1) % lp.path.length);
        const c = at(lp.path, (k + 2) % lp.path.length);
        const h1 = Math.atan2(b.x - a.x, b.z - a.z);
        const h2 = Math.atan2(c.x - b.x, c.z - b.z);
        expect(Math.abs(angDiff(h1, h2))).toBeLessThan(0.45);
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1e-6);
      }
    }
  });

  it("different loops never share a lane: at least ~3 m apart", () => {
    const plan = planFor(layoutFor(6));
    const dense = plan.loops.map((lp) => densify(lp.path, 1, true));
    for (let a = 0; a < plan.loops.length; a++) {
      for (let b = a + 1; b < plan.loops.length; b++) {
        const A = at(dense, a);
        const B = at(plan.loops, b).path;
        for (const p of A) {
          expect(distToPolyline(p, B, true), `loops ${a} and ${b}`).toBeGreaterThanOrEqual(2.9);
        }
      }
    }
  });
});

describe("determinism and robustness", () => {
  it("same input, same plan, for every fleet size from 0 to 50", () => {
    for (let n = 0; n <= MAX_FLEET_SIZE; n++) {
      const l = computeLayout(n, PORTRAIT);
      expect(computeCityPlan(l)).toEqual(computeCityPlan(l));
      expect(computeCityPlan(computeLayout(n, PORTRAIT))).toEqual(computeCityPlan(l));
    }
  });

  it("depends on the lot size only, not on how many cars are parked", () => {
    const a = computeCityPlan(layoutFor(6));
    const b = computeCityPlan(layoutFor(10));
    expect(layoutFor(6).rows).toBe(layoutFor(10).rows);
    expect(layoutFor(6).columns).toBe(layoutFor(10).columns);
    expect(b).toEqual(a);
  });

  it("buying a car that adds a row rebuilds the south only: the north side is identical", () => {
    for (const [small, big] of [
      [5, 6],
      [10, 11],
      [45, 46],
    ] as const) {
      const a = layoutFor(small);
      const b = layoutFor(big);
      if (a.columns !== b.columns || a.rows === b.rows) continue;
      const north = (plan: CityPlan) =>
        JSON.stringify(
          plan.props.filter((p) => p.z < -3 * TILE).sort((p, q) => p.x - q.x || p.z - q.z),
        );
      expect(north(planFor(b))).toBe(north(planFor(a)));
    }
  });

  it("never mutates its input and works on a frozen layout", () => {
    const l = deepFreeze(structuredClone(layoutFor(11)));
    expect(() => computeCityPlan(l)).not.toThrow();
    expect(computeCityPlan(l)).toEqual(planFor(layoutFor(11)));
  });

  it("everything is finite for every size and for hostile screen sizes", () => {
    const hostile = [
      { width: 0, height: 0 },
      { width: NaN, height: 100 },
      { width: Infinity, height: Infinity },
      { width: -5, height: -5 },
      { width: 1e12, height: 1 },
    ];
    for (const usable of [PORTRAIT, WIDE, ...hostile]) {
      for (const n of [NaN, -3, 0, 1, 6, 50, 1e9]) {
        const plan = computeCityPlan(computeLayout(n, usable));
        for (const v of allNumbers(plan)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("the edge of the world is never visible (acceptance 2)", () => {
  const views = [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 2560, height: 1080 },
  ];
  it.each(views)("at %j, for every fleet size, the 4 screen corners stay 12 m inside", (v) => {
    const view = { x: 0, y: 0, width: v.width, height: v.height };
    const bad: string[] = [];
    for (let n = 0; n <= MAX_FLEET_SIZE; n++) {
      const l = computeLayout(n, v);
      const plan = planFor(l);
      const cam = fitCamera(l.bounds, view);
      const e = plan.extent;
      for (const sx of [0, v.width]) {
        for (const sy of [0, v.height]) {
          const g = viewPlaneToGround(screenToPlane(cam, view, { x: sx, y: sy }));
          const x = g?.x ?? NaN;
          const z = g?.z ?? NaN;
          const ok =
            x > e.colMin * TILE + 12 &&
            x < (e.colMax + 1) * TILE - 12 &&
            z > e.rowMin * TILE + 12 &&
            z < (e.rowMax + 1) * TILE - 12;
          if (!ok) bad.push(`n=${n} (${l.columns} cols) corner ${sx},${sy} -> ${x | 0},${z | 0}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("assets referenced by the plan exist on disk", () => {
  const root = ["apps/web/public/assets", "public/assets"].find((p) => existsSync(p)) ?? "";
  it("every kit asset of every tile and prop kind used", () => {
    expect(root).not.toBe("");
    const used = new Set<string>();
    for (const l of LAYOUTS) {
      const plan = planFor(l);
      for (const t of [...l.tiles, ...plan.tiles]) {
        const a = ROAD_TILE_ASSET[t.kind];
        used.add(`${a.kit}/${a.name}`);
      }
      for (const p of [...l.props, ...plan.props]) {
        if (p.kind === "parkedCar") {
          const a = TRAFFIC_ASSET[TRAFFIC_MODELS[p.variant] ?? "taxi"];
          used.add(`${a.kit}/${a.name}`);
          continue;
        }
        const list = PROP_ASSETS[p.kind];
        if (list.length === 0) continue;
        const a = list[p.variant % list.length];
        if (a) used.add(`${a.kit}/${a.name}`);
      }
    }
    expect(used.size).toBeGreaterThan(30);
    for (const u of used) expect(existsSync(`${root}/${u}.glb`), u).toBe(true);
  });
});

export type { AgencyLayout };
