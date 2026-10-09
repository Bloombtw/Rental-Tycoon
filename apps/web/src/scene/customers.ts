import { departureMinute, type Car } from "@rt/sim";
import { SPOT_D, TILE, type AgencyLayout } from "./layout.js";

/**
 * Customers walking to the counter (visible-customers). Pure: no three, no DOM.
 *
 * For the car at index i (slot `dep`): the customer walks from the sidewalk to the counter
 * [dep − ARRIVE, dep − WAIT), waits at the counter, walks to the car [dep − TO_CAR, dep), then
 * either drives off with it (rented: gone at `dep`) or walks back to the sidewalk, disappointed
 * (tooExpensive), during [dep, dep + LEAVE). Slots not reached yet show a customer only when one is
 * expected: the first `customersLeft` upcoming slots of the day.
 */

/** Game minutes. */
export const ARRIVE_MINUTES = 30;
export const WAIT_MINUTES = 8;
export const TO_CAR_MINUTES = 3;
export const LEAVE_MINUTES = 20;

/** Most customers drawn at once. */
export const MAX_CUSTOMERS_SHOWN = 60;

/** Stride: radians of leg swing per metre walked. */
const STRIDE_PER_METRE = 2.4;

export interface CustomerPose {
  readonly x: number;
  readonly z: number;
  /** Yaw around +y; 0 faces +z. */
  readonly heading: number;
  /** Leg swing phase in radians; 0 when standing. */
  readonly stride: number;
  readonly walking: boolean;
  /** Leaving without a car (price too high). */
  readonly sad: boolean;
  /** Stable per customer (outfit colours). */
  readonly seed: number;
}

interface P {
  readonly x: number;
  readonly z: number;
}

/** The walkway along the top of the lot, in front of the awning. */
function walkZ(): number {
  return TILE + 0.8;
}

export function customerAnchors(layout: AgencyLayout): { spawn: P; counter: P } {
  const agencyX = (layout.lotCols * TILE) / 2;
  return { spawn: { x: -TILE / 2, z: walkZ() }, counter: { x: agencyX, z: walkZ() } };
}

/** Where the customer stands to look at the car of a spot (its north edge). */
function besideCar(spot: P): P {
  return { x: spot.x, z: spot.z - SPOT_D / 2 - 0.3 };
}

function length(path: readonly P[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a && b) d += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return d;
}

/** Point at fraction `t` (0..1) of a polyline, with the heading of its segment. */
function along(
  path: readonly P[],
  t: number,
): { x: number; z: number; heading: number; dist: number } {
  const total = length(path);
  const first = path[0] ?? { x: 0, z: 0 };
  if (!(total > 0)) return { x: first.x, z: first.z, heading: 0, dist: 0 };
  let target = Math.min(1, Math.max(0, t)) * total;
  const dist = target;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (target <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(1, target / seg) : 0;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading, dist };
    }
    target -= seg;
  }
  return { x: first.x, z: first.z, heading: 0, dist };
}

function walk(path: readonly P[], t: number, seed: number, sad: boolean): CustomerPose {
  const p = along(path, t);
  return {
    x: p.x,
    z: p.z,
    heading: p.heading,
    stride: p.dist * STRIDE_PER_METRE,
    walking: true,
    sad,
    seed,
  };
}

/**
 * Poses of the customers at `timeOfDay` (fractional game minutes since opening). `minute` and
 * `customersLeft` come from the committed state: slots before `minute` are resolved (their car
 * carries the outcome), the others are predictions. Nothing with reduced motion.
 */
export function customerPosesAt(
  layout: AgencyLayout,
  fleet: readonly Car[],
  minute: number,
  customersLeft: number,
  timeOfDay: number,
  reducedMotion: boolean,
): CustomerPose[] {
  if (reducedMotion || !Number.isFinite(timeOfDay)) return [];
  const { spawn, counter } = customerAnchors(layout);
  const out: CustomerPose[] = [];
  // At opening (minute 0) the day's customers are not drawn yet: expect one per car.
  let expected =
    minute === 0
      ? Number.POSITIVE_INFINITY
      : Number.isSafeInteger(customersLeft) && customersLeft > 0
        ? customersLeft
        : 0;
  const t = timeOfDay;
  const count = Math.min(fleet.length, layout.spots.length);
  for (let i = 0; i < count && out.length < MAX_CUSTOMERS_SHOWN; i++) {
    const car = fleet[i];
    const spot = layout.spots[i];
    const dep = departureMinute(i);
    if (!car || !spot || dep === null) continue;
    const resolved = dep < minute;
    let comes: boolean;
    let sad = false;
    if (resolved) {
      comes = car.outcome === "rented" || car.outcome === "tooExpensive";
      sad = car.outcome === "tooExpensive";
    } else {
      comes = expected > 0;
      if (comes) expected -= 1;
    }
    if (!comes) continue;
    const seed = car.id * 7919 + dep;
    const car_ = besideCar(spot);
    if (t >= dep - ARRIVE_MINUTES && t < dep - WAIT_MINUTES) {
      const k = (t - (dep - ARRIVE_MINUTES)) / (ARRIVE_MINUTES - WAIT_MINUTES);
      out.push(walk([spawn, counter], k, seed, false));
    } else if (t >= dep - WAIT_MINUTES && t < dep - TO_CAR_MINUTES) {
      out.push({
        x: counter.x,
        z: counter.z,
        heading: Math.PI, // facing the agency (north)
        stride: 0,
        walking: false,
        sad: false,
        seed,
      });
    } else if (t >= dep - TO_CAR_MINUTES && t < dep) {
      out.push(walk([counter, car_], (t - (dep - TO_CAR_MINUTES)) / TO_CAR_MINUTES, seed, false));
    } else if (resolved && sad && t >= dep && t < dep + LEAVE_MINUTES) {
      out.push(
        walk([car_, { x: car_.x, z: spawn.z }, spawn], (t - dep) / LEAVE_MINUTES, seed, true),
      );
    }
  }
  return out;
}
