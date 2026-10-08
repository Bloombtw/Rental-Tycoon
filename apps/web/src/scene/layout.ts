import { MAX_FLEET_SIZE } from "@rt/sim";
import { MAX_FIT_ZOOM } from "./camera";
import { projectedBounds, type Point3 } from "./iso";

/**
 * World geometry of the agency on a tile grid (spec 2.4). Pure: no three, no DOM.
 * Ground is y = 0, x points east, z points south (towards the camera), 1 unit is about 1 m.
 * Tile (col, row) covers [col * TILE, (col + 1) * TILE] x [row * TILE, (row + 1) * TILE].
 */

/** Screen / view-plane point. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** Ground rectangle; (x, z) is its minimum corner. */
export interface GroundRect {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export const TILE = 6;
export const SPOT_W = 3;
export const SPOT_D = 5;
export const AISLE_D = 7;
export const LOT_PAD = 0.75;
export const LANE_OFFSET = 1.5;
export const ROAD_EXTEND_TILES = 8;
export const DECOR_RING_TILES = 3;
export const AGENCY_HEIGHT = 9;

const LINE_W = 0.12;
const ROW_D = SPOT_D + AISLE_D;
const COLUMN_CHOICES = [5, 10] as const;
/** Parasols keep this distance (x) from the agency centre. */
const PARASOL_CLEARANCE = 6;

/** rotation.y = turn * PI / 2 (plus a per-asset offset, see assets.ts). */
export type QuarterTurn = 0 | 1 | 2 | 3;
/** straight: turn 0 = east-west, 1 = north-south. driveway: turn 0 = open to the north. */
export type RoadTileKind = "straight" | "crossroad" | "driveway" | "sidewalk";

export interface TilePlacement {
  readonly kind: RoadTileKind;
  readonly col: number;
  readonly row: number;
  readonly turn: QuarterTurn;
}

export type PropKind =
  "agency" | "awning" | "sign" | "parasol" | "building" | "backdrop" | "lowBuilding" | "lamp";

export interface PropPlacement {
  readonly kind: PropKind;
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  /** Yaw in radians; 0 = front towards the south (+z). */
  readonly heading: number;
}

export interface AgencyLayout {
  readonly columns: 5 | 10;
  readonly rows: number;
  readonly lotCols: number;
  readonly streetRow: number;
  readonly lot: GroundRect;
  /** Centre of each spot; length = min(carCount, MAX_FLEET_SIZE). */
  readonly spots: readonly GroundPoint[];
  /** Painted lines, (columns + 1) * rows. */
  readonly spotLines: readonly GroundRect[];
  /** Centre z of the aisle below each row; length = rows. */
  readonly aisleZs: readonly number[];
  readonly exitLaneX: number;
  /** z of the lane cars leave on (eastbound) and return on (westbound). */
  readonly laneOutZ: number;
  readonly laneInZ: number;
  /** x where cars leave / enter the visible area. */
  readonly exitEndX: number;
  readonly tiles: readonly TilePlacement[];
  readonly props: readonly PropPlacement[];
  /** The agency's box projected into the view plane (spec 2.5). */
  readonly bounds: Rect;
}

export function tileCenter(col: number, row: number): GroundPoint {
  return { x: (col + 0.5) * TILE, z: (row + 0.5) * TILE };
}

function sanitizeCount(carCount: number): number {
  if (typeof carCount !== "number" || !Number.isFinite(carCount)) return 0;
  return Math.min(MAX_FLEET_SIZE, Math.max(0, Math.floor(carCount)));
}

function dims(n: number, columns: 5 | 10) {
  const rows = Math.max(1, Math.ceil(n / columns));
  const lotCols = Math.ceil((columns * SPOT_W + 2 * LOT_PAD) / TILE) + 1;
  const streetRow = 1 + 2 * rows;
  return { rows, lotCols, streetRow };
}

function computeBounds(lotCols: number, streetRow: number): Rect {
  const x1 = lotCols * TILE;
  const z1 = (streetRow + 2) * TILE;
  const corners: Point3[] = [];
  for (const x of [0, x1]) {
    for (const z of [0, z1]) {
      for (const y of [0, AGENCY_HEIGHT]) corners.push({ x, y, z });
    }
  }
  return projectedBounds(corners);
}

function fitScale(n: number, columns: 5 | 10, usable: { width: number; height: number }): number {
  const { lotCols, streetRow } = dims(n, columns);
  const b = computeBounds(lotCols, streetRow);
  const s = Math.min(usable.width / b.width, usable.height / b.height, MAX_FIT_ZOOM);
  return Number.isFinite(s) && s > 0 ? s : 0;
}

function quarter(n: number): QuarterTurn {
  return (((n % 4) + 4) % 4) as QuarterTurn;
}

function buildTiles(lotCols: number, streetRow: number): TilePlacement[] {
  const map = new Map<string, TilePlacement>();
  const put = (kind: RoadTileKind, col: number, row: number, turn: number): void => {
    map.set(`${col},${row}`, { kind, col, row, turn: quarter(turn) });
  };
  const crossW = -2;
  const crossE = lotCols + 1;

  // Sidewalks first so that roads override them where they meet.
  for (let c = -1; c <= lotCols; c++) {
    put("sidewalk", c, 0, 0);
    put("sidewalk", c, streetRow + 1, 0);
  }
  for (let r = 1; r < streetRow; r++) {
    put("sidewalk", -1, r, 0);
    put("sidewalk", lotCols, r, 0);
  }
  for (const c of [crossW, crossE]) {
    for (let r = -2; r <= streetRow + DECOR_RING_TILES; r++) put("straight", c, r, 1);
  }
  for (let c = crossW - ROAD_EXTEND_TILES; c <= crossE + ROAD_EXTEND_TILES; c++) {
    put("straight", c, streetRow, 0);
  }
  put("crossroad", crossW, streetRow, 0);
  put("crossroad", crossE, streetRow, 0);
  put("driveway", lotCols - 1, streetRow, 0);
  return [...map.values()];
}

function buildProps(lotCols: number, streetRow: number): PropPlacement[] {
  const props: PropPlacement[] = [];
  const crossW = -2;
  const crossE = lotCols + 1;
  const colFrom = crossW - DECOR_RING_TILES;
  const colTo = crossE + DECOR_RING_TILES;
  const isCross = (c: number): boolean => c === crossW || c === crossE;
  const agencyX = (lotCols * TILE) / 2;
  const front = TILE;

  props.push({ kind: "agency", variant: 0, x: agencyX, z: TILE / 2, heading: 0 });
  props.push({ kind: "awning", variant: 0, x: agencyX, z: front, heading: 0 });
  props.push({ kind: "sign", variant: 0, x: agencyX, z: front, heading: 0 });
  for (let c = 0; c < lotCols; c++) {
    const p = tileCenter(c, 0);
    if (Math.abs(p.x - agencyX) >= PARASOL_CLEARANCE) {
      props.push({ kind: "parasol", variant: c, x: p.x, z: p.z, heading: 0 });
    }
  }

  let n = 0;
  const building = (c: number, r: number): void => {
    const p = tileCenter(c, r);
    props.push({ kind: "building", variant: n++, x: p.x, z: p.z, heading: 0 });
  };
  // North of the agency row, across the whole width.
  for (let r = -2; r <= -1; r++) {
    for (let c = colFrom; c <= colTo; c++) if (!isCross(c)) building(c, r);
  }
  // Neighbours of the agency and the rings beyond the cross streets, north of the street.
  // Only the agency row is built next to the lot, so the parking stays visible from the south-east.
  building(-1, 0);
  building(lotCols, 0);
  const ringCols: number[] = [];
  for (let k = 0; k < DECOR_RING_TILES; k++) ringCols.push(crossW - 1 - k, crossE + 1 + k);
  for (let r = 0; r < streetRow; r++) for (const c of ringCols) building(c, r);

  // Two rows of tall backdrop buildings.
  let b = 0;
  for (let r = -4; r <= -3; r++) {
    for (let c = colFrom; c <= colTo; c++) {
      const p = tileCenter(c, r);
      props.push({ kind: "backdrop", variant: b++, x: p.x, z: p.z, heading: 0 });
    }
  }
  // Low buildings only, south of the sidewalk.
  let l = 0;
  for (let r = streetRow + 2; r <= streetRow + DECOR_RING_TILES; r++) {
    for (let c = colFrom; c <= colTo; c++) {
      if (isCross(c)) continue;
      const p = tileCenter(c, r);
      props.push({ kind: "lowBuilding", variant: l++, x: p.x, z: p.z, heading: 0 });
    }
  }
  // Lamps: every second tile along the south sidewalk, and at the parking corners.
  const lampZ = (streetRow + 1) * TILE + 0.5;
  for (let c = -1; c <= lotCols; c += 2) {
    props.push({ kind: "lamp", variant: 0, x: tileCenter(c, 0).x, z: lampZ, heading: 0 });
  }
  const lotX1 = lotCols * TILE;
  for (const x of [0.4, lotX1 - 0.4]) {
    for (const z of [TILE + 0.4, streetRow * TILE - 0.4]) {
      props.push({ kind: "lamp", variant: 0, x, z, heading: 0 });
    }
  }
  return props;
}

function buildLayout(n: number, columns: 5 | 10): AgencyLayout {
  const { rows, lotCols, streetRow } = dims(n, columns);
  const offset = ((lotCols - 1) * TILE - columns * SPOT_W) / 2;
  const spots: GroundPoint[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    spots.push({
      x: offset + col * SPOT_W + SPOT_W / 2,
      z: TILE + ROW_D * row + SPOT_D / 2,
    });
  }
  const aisleZs: number[] = [];
  const spotLines: GroundRect[] = [];
  for (let r = 0; r < rows; r++) {
    aisleZs.push(TILE + ROW_D * r + SPOT_D + AISLE_D / 2);
    for (let c = 0; c <= columns; c++) {
      spotLines.push({
        x: offset + c * SPOT_W - LINE_W / 2,
        z: TILE + ROW_D * r,
        width: LINE_W,
        depth: SPOT_D,
      });
    }
  }
  const streetCenterZ = (streetRow + 0.5) * TILE;
  return {
    columns,
    rows,
    lotCols,
    streetRow,
    lot: { x: 0, z: TILE, width: lotCols * TILE, depth: 2 * rows * TILE },
    spots,
    spotLines,
    aisleZs,
    exitLaneX: (lotCols - 0.5) * TILE,
    laneOutZ: streetCenterZ + LANE_OFFSET,
    laneInZ: streetCenterZ - LANE_OFFSET,
    exitEndX: (lotCols + ROAD_EXTEND_TILES + 0.5) * TILE,
    tiles: buildTiles(lotCols, streetRow),
    props: buildProps(lotCols, streetRow),
    bounds: computeBounds(lotCols, streetRow),
  };
}

/** Never throws: a non-finite count counts as 0, and an unusable area picks 5 columns. */
export function computeLayout(
  carCount: number,
  usable: { width: number; height: number },
): AgencyLayout {
  const n = sanitizeCount(carCount);
  const s5 = fitScale(n, COLUMN_CHOICES[0], usable);
  const s10 = fitScale(n, COLUMN_CHOICES[1], usable);
  return buildLayout(n, s10 > s5 ? 10 : 5);
}

function spotAndAisle(
  layout: AgencyLayout,
  index: number,
): { spot: GroundPoint; aisleZ: number } | null {
  const spot = Number.isInteger(index) && index >= 0 ? layout.spots[index] : undefined;
  if (!spot) return null;
  const aisleZ = layout.aisleZs[Math.floor(index / layout.columns)];
  return aisleZ === undefined ? null : { spot, aisleZ };
}

/** Departure route: spot -> aisle -> exit lane -> out lane -> street end. Empty if no such spot. */
export function exitPath(layout: AgencyLayout, index: number): readonly GroundPoint[] {
  const s = spotAndAisle(layout, index);
  if (!s) return [];
  return [
    { x: s.spot.x, z: s.spot.z },
    { x: s.spot.x, z: s.aisleZ },
    { x: layout.exitLaneX, z: s.aisleZ },
    { x: layout.exitLaneX, z: layout.laneOutZ },
    { x: layout.exitEndX, z: layout.laneOutZ },
  ];
}

/** Return route: street end -> in lane -> exit lane -> aisle -> spot. */
export function returnPath(layout: AgencyLayout, index: number): readonly GroundPoint[] {
  const s = spotAndAisle(layout, index);
  if (!s) return [];
  return [
    { x: layout.exitEndX, z: layout.laneInZ },
    { x: layout.exitLaneX, z: layout.laneInZ },
    { x: layout.exitLaneX, z: s.aisleZ },
    { x: s.spot.x, z: s.aisleZ },
    { x: s.spot.x, z: s.spot.z },
  ];
}
