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
export const AGENCY_HEIGHT = 9;

const LINE_W = 0.12;
const ROW_D = SPOT_D + AISLE_D;
const COLUMN_CHOICES = [5, 10] as const;
/** Parasols keep this distance (x) from the agency centre. */
const PARASOL_CLEARANCE = 6;

/** rotation.y = turn * PI / 2 (plus a per-asset offset, see assets.ts). */
export type QuarterTurn = 0 | 1 | 2 | 3;
/** straight: turn 0 = east-west, 1 = north-south. driveway: turn 0 = open to the north. */
export type RoadTileKind =
  "straight" | "crossroad" | "crossing" | "driveway" | "sidewalk" | "asphalt";

export interface TilePlacement {
  readonly kind: RoadTileKind;
  readonly col: number;
  readonly row: number;
  readonly turn: QuarterTurn;
}

export type PropKind =
  | "agency"
  | "awning"
  | "sign"
  | "parasol"
  | "lamp"
  | "building"
  | "backdrop"
  | "lowBuilding"
  | "streetLamp"
  | "trafficLight"
  | "streetSign"
  | "construction"
  | "dumpster"
  | "tree"
  | "parkedCar";

export interface PropPlacement {
  readonly kind: PropKind;
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  /** Yaw in radians; 0 = front towards the south (+z). */
  readonly heading: number;
  /** Multiplier of the kit scale (1 by default). */
  readonly scale: number;
  /** Index into FAR_TINTS / treeLeaves; -1 keeps the original colour. */
  readonly tint: number;
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
  /** The agency block only: the rest of the neighbourhood is in cityPlan.ts. */
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
  // Agency block only: the sidewalk around the lot and the driveway. Streets are in cityPlan.ts.
  for (let c = -1; c <= lotCols; c++) put("sidewalk", c, 0, 0);
  for (let r = 1; r < streetRow; r++) {
    put("sidewalk", -1, r, 0);
    put("sidewalk", lotCols, r, 0);
  }
  put("driveway", lotCols - 1, streetRow, 0);
  return [...map.values()];
}

function buildProps(lotCols: number, streetRow: number): PropPlacement[] {
  const props: PropPlacement[] = [];
  const agencyX = (lotCols * TILE) / 2;
  const front = TILE;
  const put = (kind: PropKind, variant: number, x: number, z: number, heading: number): void => {
    props.push({ kind, variant, x, z, heading, scale: 1, tint: -1 });
  };

  put("agency", 0, agencyX, TILE / 2, 0);
  put("awning", 0, agencyX, front, 0);
  put("sign", 0, agencyX, front, 0);
  for (let c = 0; c < lotCols; c++) {
    const p = tileCenter(c, 0);
    if (Math.abs(p.x - agencyX) >= PARASOL_CLEARANCE) put("parasol", c, p.x, p.z, 0);
  }
  // Parking corner lamps; the arm (the "front" of the model) points into the lot.
  const lotX1 = lotCols * TILE;
  for (const x of [0.4, lotX1 - 0.4]) {
    put("lamp", 0, x, TILE + 0.4, 0);
    put("lamp", 0, x, streetRow * TILE - 0.4, Math.PI);
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

/** Departure route: spot -> aisle -> exit lane -> (exitLaneX, laneOutZ). Empty if no such spot. */
export function exitPath(layout: AgencyLayout, index: number): readonly GroundPoint[] {
  const s = spotAndAisle(layout, index);
  if (!s) return [];
  return [
    { x: s.spot.x, z: s.spot.z },
    { x: s.spot.x, z: s.aisleZ },
    { x: layout.exitLaneX, z: s.aisleZ },
    { x: layout.exitLaneX, z: layout.laneOutZ },
  ];
}

/** Return route: (exitLaneX, laneInZ) -> aisle -> spot. */
export function returnPath(layout: AgencyLayout, index: number): readonly GroundPoint[] {
  const s = spotAndAisle(layout, index);
  if (!s) return [];
  return [
    { x: layout.exitLaneX, z: layout.laneInZ },
    { x: layout.exitLaneX, z: s.aisleZ },
    { x: s.spot.x, z: s.aisleZ },
    { x: s.spot.x, z: s.spot.z },
  ];
}
