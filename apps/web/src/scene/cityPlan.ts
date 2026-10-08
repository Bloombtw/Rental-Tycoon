import {
  LANE_OFFSET,
  TILE,
  type AgencyLayout,
  type GroundPoint,
  type PropKind,
  type PropPlacement,
  type QuarterTurn,
  type RoadTileKind,
  type TilePlacement,
} from "./layout";
import { FAR_TINTS, SCENE_COLORS } from "./palette";
import { pathLength, roundCorners, sampleAt } from "./paths";
import { cellHash } from "./prng";
import { TRAFFIC_MODELS } from "./traffic";

/**
 * The neighbourhood around the agency (spec 2.1): a street grid, blocks, buildings, furniture,
 * parked cars and the background-traffic loops. Pure and deterministic: no three, no DOM, and the
 * only randomness is cellHash. Ground: x east, z south, tile (col, row) covers
 * [col * TILE, (col + 1) * TILE] x [row * TILE, (row + 1) * TILE].
 */

export const CITY_BLOCKS = 3,
  NEAR_RING = 2,
  MIN_TRAFFIC_GAP = 12,
  TURN_RADIUS = 2.5;

/** Inclusive cell range. */
export interface Extent {
  readonly colMin: number;
  readonly colMax: number;
  readonly rowMin: number;
  readonly rowMax: number;
}

export type BlockUse =
  "agency" | "park" | "carPark" | "construction" | "buildings" | "tall" | "far" | "farTall";

export interface Block {
  readonly i: number;
  readonly j: number;
  readonly cells: Extent;
  readonly use: BlockUse;
}

export interface TrafficLoop {
  /** Index into `plan.blocks`. */
  readonly block: number;
  /** Closed (the last point is not repeated), clockwise, right-hand lane, rounded corners. */
  readonly path: readonly GroundPoint[];
  readonly length: number;
  readonly speed: number;
  readonly capacity: number;
  readonly rank: number;
  readonly phase: number;
}

export interface CityPlan {
  readonly extent: Extent;
  readonly streetCols: readonly number[];
  readonly streetRows: readonly number[];
  readonly blocks: readonly Block[];
  /** No cell in common with layout.tiles. */
  readonly tiles: readonly TilePlacement[];
  /** Includes parkedCar (variant = index into TRAFFIC_MODELS). */
  readonly props: readonly PropPlacement[];
  /** Sorted by rank. */
  readonly loops: readonly TrafficLoop[];
}

/** Painted stall of the neighbourhood car park; heading = direction the nose points. */
export interface CarParkStall {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export const STALL_W = 3,
  STALL_D = 5;

/** Salts for cellHash, one per purpose. */
const SALT = {
  variant: 11,
  tint: 12,
  tree: 13,
  treeX: 14,
  treeZ: 15,
  treeScale: 16,
  dumpster: 17,
  parked: 18,
  parkedModel: 19,
  speed: 20,
  phase: 21,
  count: 22,
  courtyard: 23,
} as const;

/** Extra rows of street south of the last street row, so the edge stays off screen. */
export const SOUTH_EXTRA_ROWS = 6;
const SKYSCRAPER_SCALE = 0.72;
const FENCE_LEN = 2.25;
const PARKED_STEP = 7;
const PARKED_CURB_SHIFT = 0.6;
const PARKED_MIN_DIST = 3.5;
/** Models used for cars parked in the neighbourhood car park (no trucks). */
const CAR_PARK_MODELS: readonly string[] = [
  "taxi",
  "suv",
  "van",
  "suv",
  "delivery",
  "taxi",
  "van",
  "police",
];

const HALF_PI = Math.PI / 2;

function modelIndex(name: string): number {
  return Math.max(0, TRAFFIC_MODELS.indexOf(name as (typeof TRAFFIC_MODELS)[number]));
}

function at(list: readonly number[], index: number): number {
  return list[index] ?? 0;
}

function int(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function sorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function key(col: number, row: number): string {
  return `${col},${row}`;
}

function blockUse(i: number, j: number): BlockUse {
  const ring = Math.max(Math.abs(i), Math.abs(j));
  if (i === 0 && j === 0) return "agency";
  if (i === 0 && j === 1) return "park";
  if (i === -1 && j === 1) return "construction";
  if (i === 1 && j === 1) return "carPark";
  if (ring <= NEAR_RING) return j <= -1 ? "tall" : "buildings";
  return j === -CITY_BLOCKS ? "farTall" : "far";
}

/** Stall centres of a car park block: two rows of stalls facing a central aisle. */
export function carParkStalls(block: Block): readonly CarParkStall[] {
  const x0 = block.cells.colMin * TILE;
  const z0 = block.cells.rowMin * TILE;
  const x1 = (block.cells.colMax + 1) * TILE;
  const z1 = (block.cells.rowMax + 1) * TILE;
  const n = Math.max(0, Math.floor((x1 - x0) / STALL_W));
  const margin = (x1 - x0 - n * STALL_W) / 2;
  const out: CarParkStall[] = [];
  for (let k = 0; k < n; k++) {
    const x = x0 + margin + (k + 0.5) * STALL_W;
    out.push({ x, z: z0 + 1 + STALL_D / 2, heading: Math.PI });
    out.push({ x, z: z1 - 1 - STALL_D / 2, heading: 0 });
  }
  return out;
}

/** The right-hand lane around a block, clockwise, before corner rounding. */
function laneRect(cells: Extent): GroundPoint[] {
  const xW = (cells.colMin - 0.5) * TILE + LANE_OFFSET;
  const xE = (cells.colMax + 1.5) * TILE - LANE_OFFSET;
  const zN = (cells.rowMin - 0.5) * TILE + LANE_OFFSET;
  const zS = (cells.rowMax + 1.5) * TILE - LANE_OFFSET;
  return [
    { x: xW, z: zN },
    { x: xE, z: zN },
    { x: xE, z: zS },
    { x: xW, z: zS },
  ];
}

function distToSegment(p: GroundPoint, a: GroundPoint, b: GroundPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

function distToClosedPath(p: GroundPoint, path: readonly GroundPoint[]): number {
  let best = Infinity;
  for (let k = 0; k < path.length; k++) {
    const a = path[k];
    const b = path[(k + 1) % path.length];
    if (a && b) best = Math.min(best, distToSegment(p, a, b));
  }
  return best;
}

export function computeCityPlan(layout: AgencyLayout): CityPlan {
  const L = Math.max(1, int(layout.lotCols, 6));
  const sr = Math.max(3, int(layout.streetRow, 3));

  const cols: number[] = [];
  const rows: number[] = [];
  for (let k = 0; k <= CITY_BLOCKS; k++) {
    cols.push(-2 - 4 * k, L + 1 + 4 * k);
    rows.push(sr + 4 * k, -3 - 4 * k);
  }
  const streetCols = sorted(cols);
  const streetRows = sorted(rows);
  const extent: Extent = {
    colMin: at(streetCols, 0) - 1,
    colMax: at(streetCols, streetCols.length - 1) + 1,
    rowMin: at(streetRows, 0) - 1,
    // The south side is longer: the camera looks from the south-east, so its screen corners
    // reach much further south than north on a tall lot.
    rowMax: at(streetRows, streetRows.length - 1) + 1 + SOUTH_EXTRA_ROWS,
  };

  // Hash coordinates that do not move when the agency block grows (more columns / rows).
  const hc = (c: number): number => (c >= L ? c - L + 50 : c);
  const hr = (r: number): number => (r >= sr ? r - sr + 100 : r);
  const hash = (c: number, r: number, salt: number): number => cellHash(hc(c), hr(r), salt);

  // ---- blocks ----
  const blocks: Block[] = [];
  for (let b = 0; b + 1 < streetRows.length; b++) {
    for (let a = 0; a + 1 < streetCols.length; a++) {
      const i = a - CITY_BLOCKS;
      const j = b - CITY_BLOCKS;
      blocks.push({
        i,
        j,
        cells: {
          colMin: at(streetCols, a) + 1,
          colMax: at(streetCols, a + 1) - 1,
          rowMin: at(streetRows, b) + 1,
          rowMax: at(streetRows, b + 1) - 1,
        },
        use: blockUse(i, j),
      });
    }
  }

  // ---- tiles ----
  const layoutCells = new Set(layout.tiles.map((t) => key(t.col, t.row)));
  const tileMap = new Map<string, TilePlacement>();
  const putTile = (kind: RoadTileKind, col: number, row: number, turn: QuarterTurn): void => {
    const k = key(col, row);
    if (layoutCells.has(k)) return;
    tileMap.set(k, { kind, col, row, turn });
  };

  for (const R of streetRows) {
    for (let c = extent.colMin; c <= extent.colMax; c++) {
      putTile(streetCols.includes(c) ? "crossroad" : "straight", c, R, 0);
    }
  }
  for (const C of streetCols) {
    for (let r = extent.rowMin; r <= extent.rowMax; r++) {
      if (!streetRows.includes(r)) putTile("straight", C, r, 1);
    }
  }
  // Pedestrian crossings on the four arms of the near crossings of the main street.
  for (const C of streetCols.slice(1, streetCols.length - 1)) {
    putTile("crossing", C - 1, sr, 0);
    putTile("crossing", C + 1, sr, 0);
    putTile("crossing", C, sr - 1, 1);
    putTile("crossing", C, sr + 1, 1);
  }

  for (const blk of blocks) {
    const { cells, use } = blk;
    for (let r = cells.rowMin; r <= cells.rowMax; r++) {
      for (let c = cells.colMin; c <= cells.colMax; c++) {
        if (use === "agency") {
          if (r <= -1) putTile("sidewalk", c, r, 0);
        } else if (use === "park") {
          if (r === cells.rowMin) putTile("sidewalk", c, r, 0);
        } else if (use === "carPark") {
          putTile("asphalt", c, r, 0);
        } else if (use !== "construction") {
          putTile("sidewalk", c, r, 0);
        }
      }
    }
  }

  // ---- props ----
  const props: PropPlacement[] = [];
  const add = (
    kind: PropKind,
    variant: number,
    x: number,
    z: number,
    heading: number,
    scale = 1,
    tint = -1,
  ): void => {
    props.push({ kind, variant, x, z, heading, scale, tint });
  };

  // Buildings: one per perimeter cell, facade to the nearest street, east-west streets win at corners.
  interface Candidate {
    readonly kind: "building" | "backdrop" | "lowBuilding";
    readonly col: number;
    readonly row: number;
    readonly heading: number;
  }
  const candidates: Candidate[] = [];
  // Nearest street side of the block; ties go to the east-west streets (north / south facades).
  const facing = (cells: Extent, c: number, r: number): number => {
    const dN = r - cells.rowMin;
    const dS = cells.rowMax - r;
    const dW = c - cells.colMin;
    const dE = cells.colMax - c;
    const best = Math.min(dN, dS, dW, dE);
    if (dN === best) return Math.PI;
    if (dS === best) return 0;
    return dW === best ? 3 * HALF_PI : HALF_PI;
  };
  for (const blk of blocks) {
    const { cells, use } = blk;
    if (use === "agency") {
      for (let c = cells.colMin; c <= cells.colMax; c++) {
        for (const row of [-2, -1]) {
          candidates.push({ kind: "building", col: c, row, heading: facing(cells, c, row) });
        }
      }
      for (const col of [cells.colMin, cells.colMax]) {
        candidates.push({ kind: "building", col, row: 0, heading: facing(cells, col, 0) });
      }
      continue;
    }
    const kind =
      use === "buildings"
        ? "building"
        : use === "tall" || use === "farTall"
          ? "backdrop"
          : use === "far"
            ? "lowBuilding"
            : null;
    if (!kind) continue;
    for (let r = cells.rowMin; r <= cells.rowMax; r++) {
      for (let c = cells.colMin; c <= cells.colMax; c++) {
        const perimeter =
          r === cells.rowMin || r === cells.rowMax || c === cells.colMin || c === cells.colMax;
        if (perimeter) candidates.push({ kind, col: c, row: r, heading: facing(cells, c, r) });
      }
    }
  }
  const variantCount = { building: 13, backdrop: 5, lowBuilding: 16 } as const;
  candidates.sort((p, q) => p.row - q.row || p.col - q.col);
  const assigned = new Map<string, number>();
  for (const cand of candidates) {
    const n = variantCount[cand.kind];
    let v = Math.floor(hash(cand.col, cand.row, SALT.variant) * n) % n;
    const clash = (variant: number): boolean =>
      [
        [cand.col - 1, cand.row],
        [cand.col - 2, cand.row],
        [cand.col, cand.row - 1],
        [cand.col, cand.row - 2],
      ].some(([c, r]) => assigned.get(`${cand.kind}:${String(c)},${String(r)}`) === variant);
    for (let tries = 0; tries < n && clash(v); tries++) v = (v + 1) % n;
    assigned.set(`${cand.kind}:${String(cand.col)},${String(cand.row)}`, v);
    const x = (cand.col + 0.5) * TILE;
    const z = (cand.row + 0.5) * TILE;
    if (cand.kind === "backdrop") add("backdrop", v, x, z, cand.heading, SKYSCRAPER_SCALE);
    else if (cand.kind === "lowBuilding") {
      const tint = Math.floor(hash(cand.col, cand.row, SALT.tint) * FAR_TINTS.length);
      add("lowBuilding", v, x, z, cand.heading, 1, tint % FAR_TINTS.length);
    } else add("building", v, x, z, cand.heading);
  }

  const leafCount = SCENE_COLORS.treeLeaves.length;
  const addTree = (c: number, r: number, n: number): void => {
    const x = (c + 0.2 + 0.6 * hash(c, r, SALT.treeX + n * 7)) * TILE;
    const z = (r + 0.2 + 0.6 * hash(c, r, SALT.treeZ + n * 7)) * TILE;
    const tint = Math.floor(hash(c, r, SALT.tree + n * 7) * leafCount) % leafCount;
    add("tree", 0, x, z, 0, 0.85 + 0.4 * hash(c, r, SALT.treeScale + n * 7), tint);
  };

  for (const blk of blocks) {
    const { cells, use } = blk;
    const cx = Math.floor((cells.colMin + cells.colMax) / 2);
    const cy = Math.floor((cells.rowMin + cells.rowMax) / 2);
    const x0 = cells.colMin * TILE;
    const x1 = (cells.colMax + 1) * TILE;
    const z0 = cells.rowMin * TILE;
    const z1 = (cells.rowMax + 1) * TILE;

    if (use === "buildings" || use === "tall") {
      const trees = use === "buildings" ? 1 + Math.floor(hash(cx, cy, SALT.count) * 3) : 0;
      for (let n = 0; n < trees; n++) addTree(cx, cy, n);
      if (hash(cx, cy, SALT.dumpster) < 1 / 3) {
        const turns = Math.floor(hash(cx, cy, SALT.courtyard) * 4);
        add("dumpster", 0, (cx + 0.5) * TILE, (cy + 0.5) * TILE, turns * HALF_PI);
      }
    } else if (use === "park") {
      for (let c = cells.colMin; c <= cells.colMax; c++) {
        if ((c - cells.colMin) % 2 === 0) {
          add("parasol", c - cells.colMin, (c + 0.5) * TILE, (cells.rowMin + 0.5) * TILE, 0);
        }
      }
      for (let r = cells.rowMin + 1; r <= cells.rowMax; r++) {
        for (let c = cells.colMin; c <= cells.colMax; c++) {
          addTree(c, r, 0);
          addTree(c, r, 1);
        }
      }
    } else if (use === "construction") {
      const inset = 0.6;
      const nx = Math.max(1, Math.floor((x1 - x0) / FENCE_LEN));
      const nz = Math.max(1, Math.floor((z1 - z0) / FENCE_LEN));
      for (let k = 0; k < nx; k++) {
        const x = x0 + ((k + 0.5) * (x1 - x0)) / nx;
        add("construction", 0, x, z0 + inset, HALF_PI);
        add("construction", 0, x, z1 - inset, HALF_PI);
      }
      for (let k = 0; k < nz; k++) {
        const z = z0 + ((k + 0.5) * (z1 - z0)) / nz;
        add("construction", 0, x0 + inset, z, 0);
        add("construction", 0, x1 - inset, z, 0);
      }
      for (const [x, z] of [
        [x0 + 2, z0 + 2],
        [x1 - 2, z0 + 2],
        [x0 + 2, z1 - 2],
        [x1 - 2, z1 - 2],
      ] as const) {
        add("construction", 2, x, z, 0);
      }
      add("construction", 1, (x0 + x1) / 2 - 3, z1 - 2.2, 0);
      add("construction", 1, (x0 + x1) / 2 + 3, z1 - 2.2, 0);
      add("construction", 3, x0 + 2, (z0 + z1) / 2, 0);
      add("construction", 3, x1 - 2, (z0 + z1) / 2, 0);
      add("dumpster", 0, x0 + 4, z0 + 4, HALF_PI);
      add("parkedCar", modelIndex("truck"), (x0 + x1) / 2, (z0 + z1) / 2 - 1, 0.4);
    } else if (use === "carPark") {
      carParkStalls(blk).forEach((s, k) => {
        if (hash(Math.floor(s.x / TILE) * 3 + k, Math.floor(s.z / TILE), SALT.parked) < 0.6) {
          const pick = Math.floor(
            hash(Math.floor(s.x), Math.floor(s.z), SALT.parkedModel) * CAR_PARK_MODELS.length,
          );
          add(
            "parkedCar",
            modelIndex(CAR_PARK_MODELS[pick % CAR_PARK_MODELS.length] ?? "suv"),
            s.x,
            s.z,
            s.heading,
          );
        }
      });
      add("lamp", 0, x0 + 0.4, (z0 + z1) / 2, HALF_PI);
      add("lamp", 0, x1 - 0.4, (z0 + z1) / 2, 3 * HALF_PI);
    }
  }

  // Street furniture, near rings only.
  const nearCols = streetCols.slice(1, streetCols.length - 1);
  const nearRows = streetRows.slice(1, streetRows.length - 1);
  const nearColMin = at(nearCols, 0);
  const nearColMax = at(nearCols, nearCols.length - 1);
  const nearRowMin = at(nearRows, 0);
  const nearRowMax = at(nearRows, nearRows.length - 1);
  const CURB = 0.3;
  for (const R of nearRows) {
    let k = 0;
    for (let c = nearColMin; c <= nearColMax; c += 2) {
      if (streetCols.includes(c) || layoutCells.has(key(c, R))) continue;
      const x = (c + 0.5) * TILE;
      if (k++ % 2 === 0) add("streetLamp", 0, x, R * TILE + CURB, 0);
      else add("streetLamp", 0, x, (R + 1) * TILE - CURB, Math.PI);
    }
  }
  for (const C of nearCols) {
    let k = 0;
    for (let r = nearRowMin; r <= nearRowMax; r += 2) {
      if (streetRows.includes(r)) continue;
      const z = (r + 0.5) * TILE;
      if (k++ % 2 === 0) add("streetLamp", 0, C * TILE + CURB, z, HALF_PI);
      else add("streetLamp", 0, (C + 1) * TILE - CURB, z, 3 * HALF_PI);
    }
  }
  for (const C of nearCols) {
    const left = C * TILE;
    const right = (C + 1) * TILE;
    const top = sr * TILE;
    const bottom = (sr + 1) * TILE;
    add("trafficLight", 0, right - 1.4, top + 0.4, -Math.PI / 4);
    add("trafficLight", 0, left + 1.4, bottom - 0.4, (3 * Math.PI) / 4);
    if (C === -2 || C === L + 1) {
      add("streetSign", 0, left + 0.4, top + 0.4, Math.PI / 4);
      add("streetSign", 0, right - 0.4, top + 0.4, -Math.PI / 4);
      add("streetSign", 0, left + 0.4, bottom - 0.4, (3 * Math.PI) / 4);
      add("streetSign", 0, right - 0.4, bottom - 0.4, (-3 * Math.PI) / 4);
    }
  }

  // ---- traffic loops ----
  const agencyCenter: GroundPoint = { x: (L * TILE) / 2, z: TILE / 2 };
  const loopBlocks: { index: number; dist: number }[] = [];
  blocks.forEach((blk, index) => {
    const ring = Math.max(Math.abs(blk.i), Math.abs(blk.j));
    if (ring > NEAR_RING || blk.use === "agency" || blk.use === "park") return;
    const mx = ((blk.cells.colMin + blk.cells.colMax + 1) / 2) * TILE;
    const mz = ((blk.cells.rowMin + blk.cells.rowMax + 1) / 2) * TILE;
    loopBlocks.push({ index, dist: Math.hypot(mx - agencyCenter.x, mz - agencyCenter.z) });
  });
  loopBlocks.sort((p, q) => p.dist - q.dist || p.index - q.index);
  const loops: TrafficLoop[] = [];
  loopBlocks.forEach(({ index }, rank) => {
    const blk = blocks[index];
    if (!blk) return;
    const path = roundCorners(laneRect(blk.cells), TURN_RADIUS, true);
    const length = pathLength(path, true);
    loops.push({
      block: index,
      path,
      length,
      speed: 7 + 3 * cellHash(blk.i, blk.j, SALT.speed),
      capacity: Math.max(1, Math.min(3, Math.floor(length / MIN_TRAFFIC_GAP))),
      rank,
      phase: cellHash(blk.i, blk.j, SALT.phase) * length,
    });
  });

  // ---- cars parked along the right-hand lanes of the agency and park blocks ----
  const exitX = layout.exitLaneX;
  const routeX = (L + 1.5) * TILE;
  const mainZ = (sr + 0.5) * TILE;
  for (const blk of blocks) {
    if (blk.use !== "agency" && blk.use !== "park") continue;
    const corners = laneRect(blk.cells);
    const path = roundCorners(corners, TURN_RADIUS, true);
    const length = pathLength(path, true);
    for (let d = PARKED_STEP / 2; d < length; d += PARKED_STEP) {
      const s = sampleAt(path, d, true);
      const onRoute =
        Math.abs(s.x - routeX) < 5 ||
        (Math.abs(s.z - mainZ) < 5 && (!Number.isFinite(exitX) || s.x > exitX - 4));
      if (onRoute) continue;
      if (corners.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 5)) continue;
      // Shift towards the kerb: to the right of the direction of travel.
      const pos = {
        x: s.x - Math.cos(s.heading) * PARKED_CURB_SHIFT,
        z: s.z + Math.sin(s.heading) * PARKED_CURB_SHIFT,
      };
      if (loops.some((lp) => distToClosedPath(pos, lp.path) < PARKED_MIN_DIST)) continue;
      // Street parking holds ordinary cars only (no trucks, ambulances or bin lorries).
      const pick = Math.floor(
        cellHash(Math.floor(pos.x), Math.floor(pos.z), SALT.parkedModel) * CAR_PARK_MODELS.length,
      );
      add(
        "parkedCar",
        modelIndex(CAR_PARK_MODELS[pick % CAR_PARK_MODELS.length] ?? "suv"),
        pos.x,
        pos.z,
        s.heading,
      );
    }
  }

  return {
    extent,
    streetCols,
    streetRows,
    blocks,
    tiles: [...tileMap.values()],
    props,
    loops,
  };
}

/** True if the cell lies on a street of the grid (including the agency driveway cell). */
export function isStreetCell(plan: CityPlan, col: number, row: number): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  const e = plan.extent;
  if (col < e.colMin || col > e.colMax || row < e.rowMin || row > e.rowMax) return false;
  return plan.streetCols.includes(col) || plan.streetRows.includes(row);
}
