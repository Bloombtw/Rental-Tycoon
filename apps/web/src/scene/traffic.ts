import type { CityPlan } from "./cityPlan";
import { sampleAt } from "./paths";
import { TIER_SETTINGS, type QualityTier } from "./quality";

/**
 * Background traffic as a pure function of an "ambient time" (spec 2.3). No three, no DOM.
 * Every vehicle circles one block clockwise on its right-hand lane, so none can collide by
 * construction (same loop: same speed and a gap of at least MIN_TRAFFIC_GAP).
 */

export type TrafficModel =
  "taxi" | "suv" | "van" | "delivery" | "truck" | "police" | "ambulance" | "garbage-truck";

export const TRAFFIC_MODELS: readonly TrafficModel[] = Object.freeze([
  "taxi",
  "suv",
  "van",
  "delivery",
  "truck",
  "police",
  "ambulance",
  "garbage-truck",
]);

/** 15 entries as listed in the spec: taxi x4, suv x3, van x2, delivery x2, then one of the rest. */
export const TRAFFIC_MIX: readonly TrafficModel[] = Object.freeze([
  "taxi",
  "suv",
  "van",
  "taxi",
  "delivery",
  "suv",
  "truck",
  "taxi",
  "police",
  "van",
  "suv",
  "ambulance",
  "delivery",
  "taxi",
  "garbage-truck",
]);

export const MAX_TRAFFIC = 24;

/** Ambient seconds per real second, by game speed. */
export const AMBIENT_RATE: Readonly<Record<1 | 2 | 4 | 10, number>> = Object.freeze({
  1: 1,
  2: 1.5,
  4: 2,
  10: 3,
});

/** 0 when paused; an unknown speed counts as x1. */
export function ambientRate(speed: unknown, paused: boolean): number {
  if (paused) return 0;
  if (speed === 1 || speed === 2 || speed === 4 || speed === 10) return AMBIENT_RATE[speed];
  return 1;
}

const MAX_DT_MS = 250;

/** prev + min(dt, 250 ms) at the ambient rate. A non-finite `prev` restarts from 0. */
export function advanceAmbient(
  prev: number,
  dtMs: number,
  speed: unknown,
  paused: boolean,
): number {
  const base = typeof prev === "number" && Number.isFinite(prev) ? prev : 0;
  const dt =
    typeof dtMs === "number" && Number.isFinite(dtMs) ? Math.min(MAX_DT_MS, Math.max(0, dtMs)) : 0;
  return base + (dt / 1000) * ambientRate(speed, paused);
}

export interface TrafficVehicle {
  readonly id: number;
  /** Index into `plan.loops`. */
  readonly loop: number;
  readonly offset: number;
  readonly model: TrafficModel;
}

/**
 * Fixed ordered list of at most MAX_TRAFFIC vehicles. Vehicle k rides loop `k mod n`, so any prefix
 * is valid: dropping the last vehicles never brings two closer together.
 */
export function trafficVehicles(plan: CityPlan): readonly TrafficVehicle[] {
  const n = plan.loops.length;
  if (n === 0) return [];
  const out: TrafficVehicle[] = [];
  for (let k = 0; k < MAX_TRAFFIC; k++) {
    const loopIndex = k % n;
    const loop = plan.loops[loopIndex];
    if (!loop) continue;
    const lap = Math.floor(k / n);
    // Never more vehicles on a loop than it can hold.
    if (lap >= Math.max(1, loop.capacity)) continue;
    out.push({
      id: k,
      loop: loopIndex,
      offset: (lap * loop.length) / Math.max(1, loop.capacity) + loop.phase,
      model: TRAFFIC_MIX[k % TRAFFIC_MIX.length] ?? "taxi",
    });
  }
  return out;
}

export interface VehiclePose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  /** Distance driven since t = 0, for the wheels. */
  readonly distance: number;
}

export function trafficPoseAt(
  plan: CityPlan,
  v: TrafficVehicle,
  ambientSeconds: number,
): VehiclePose {
  const loop = plan.loops[v.loop];
  const t =
    typeof ambientSeconds === "number" && Number.isFinite(ambientSeconds) ? ambientSeconds : 0;
  if (!loop) return { x: 0, z: 0, heading: 0, distance: 0 };
  const driven = loop.speed * t;
  const s = sampleAt(loop.path, v.offset + driven, true);
  return { x: s.x, z: s.z, heading: s.heading, distance: driven };
}

/** How many background vehicles to show: fewer while many of our cars are on the road. */
export function trafficBudget(tier: QualityTier, playerCarsDriving: number): number {
  const s = TIER_SETTINGS[tier] ?? TIER_SETTINGS.low;
  const driving =
    typeof playerCarsDriving === "number" && Number.isFinite(playerCarsDriving)
      ? Math.max(0, playerCarsDriving)
      : 0;
  return Math.max(s.trafficMin, s.trafficMax - Math.floor(driving / 2));
}
