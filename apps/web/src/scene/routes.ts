import { TURN_RADIUS, type CityPlan } from "./cityPlan";
import {
  LANE_OFFSET,
  TILE,
  exitPath,
  returnPath,
  type AgencyLayout,
  type GroundPoint,
} from "./layout";
import { laneOffset, roundCorners } from "./paths";

/**
 * Routes of our cars through the neighbourhood (spec 2.2). Pure: no three, no DOM.
 * Right-hand traffic: a lane is the street axis moved LANE_OFFSET to the right of the travel direction.
 */

export type Turn = "S" | "R" | "L";

export const ROUTE_PATTERNS: readonly (readonly Turn[])[] = Object.freeze([
  Object.freeze(["S"] as const),
  Object.freeze(["R"] as const),
  Object.freeze(["L"] as const),
  Object.freeze(["S", "R"] as const),
  Object.freeze(["R", "L"] as const),
  Object.freeze(["L", "R"] as const),
]);

export interface CarRoutes {
  /** Index = parking place. Parking part, then the city part up to the edge of the plan. */
  readonly departure: readonly (readonly GroundPoint[])[];
  /** Reverse trip on the opposite lanes, ending in the place. */
  readonly arrival: readonly (readonly GroundPoint[])[];
}

/** Just inside the outer edge of the plan (still on a street tile). */
const EDGE_INSET = 0.01;

interface Dir {
  readonly dx: number;
  readonly dz: number;
}

function turned(d: Dir, turn: Turn): Dir {
  if (turn === "S") return d;
  // The right of (dx, dz) is (-dz, dx).
  return turn === "R" ? { dx: -d.dz, dz: d.dx } : { dx: d.dz, dz: -d.dx };
}

/** Street axis coordinates of the grid lines, in world units. */
function axes(lines: readonly number[]): number[] {
  return lines.map((l) => (l + 0.5) * TILE);
}

/** Centre line of the city part: from the exit lane axis, through E0, to the edge of the plan. */
function cityCenterline(
  layout: AgencyLayout,
  plan: CityPlan,
  pattern: readonly Turn[],
): GroundPoint[] {
  const colAxes = axes(plan.streetCols);
  const rowAxes = axes(plan.streetRows);
  const e = plan.extent;
  const zc = (layout.streetRow + 0.5) * TILE;
  let pos: GroundPoint = { x: layout.exitLaneX, z: zc };
  let dir: Dir = { dx: 1, dz: 0 };
  const line: GroundPoint[] = [pos];

  const nextCrossing = (): GroundPoint | null => {
    const eps = 1e-6;
    if (dir.dx !== 0) {
      const list = dir.dx > 0 ? colAxes : [...colAxes].reverse();
      const x = list.find((a) => (dir.dx > 0 ? a > pos.x + eps : a < pos.x - eps));
      return x === undefined ? null : { x, z: pos.z };
    }
    const list = dir.dz > 0 ? rowAxes : [...rowAxes].reverse();
    const z = list.find((a) => (dir.dz > 0 ? a > pos.z + eps : a < pos.z - eps));
    return z === undefined ? null : { x: pos.x, z };
  };

  for (const turn of pattern) {
    const next = nextCrossing();
    if (!next) break;
    pos = next;
    line.push(pos);
    dir = turned(dir, turn);
  }
  const edge: GroundPoint =
    dir.dx > 0
      ? { x: (e.colMax + 1) * TILE - EDGE_INSET, z: pos.z }
      : dir.dx < 0
        ? { x: e.colMin * TILE + EDGE_INSET, z: pos.z }
        : dir.dz > 0
          ? { x: pos.x, z: (e.rowMax + 1) * TILE - EDGE_INSET }
          : { x: pos.x, z: e.rowMin * TILE + EDGE_INSET };
  line.push(edge);
  return line;
}

/**
 * Departure and arrival routes for every place of the layout. The pattern is ROUTE_PATTERNS[index mod 6];
 * its first manoeuvre is made at E0 = (lotCols + 1, streetRow), the next ones at the following crossings.
 */
export function carRoutes(layout: AgencyLayout, plan: CityPlan): CarRoutes {
  const departure: GroundPoint[][] = [];
  const arrival: GroundPoint[][] = [];
  const outLane: GroundPoint[][] = [];
  const inLane: GroundPoint[][] = [];
  ROUTE_PATTERNS.forEach((pattern) => {
    const center = cityCenterline(layout, plan, pattern);
    outLane.push(roundCorners(laneOffset(center, LANE_OFFSET), TURN_RADIUS, false));
    // The way back is the same axis driven the other way, so its lane is on the other side.
    inLane.push(roundCorners(laneOffset([...center].reverse(), LANE_OFFSET), TURN_RADIUS, false));
  });
  for (let index = 0; index < layout.spots.length; index++) {
    const k = index % ROUTE_PATTERNS.length;
    const city = outLane[k] ?? [];
    const back = inLane[k] ?? [];
    departure.push([...exitPath(layout, index), ...city.slice(1)]);
    arrival.push([...back, ...returnPath(layout, index).slice(1)]);
  }
  return { departure, arrival };
}
