import type { Rng } from "./rng.js";
import type { GameState } from "./state.js";

/** Random world events (docs/specs/events.md). Pure and deterministic through `rng.ts`. */
export type EventKind = "holidays" | "carShow" | "strike" | "storm";

export const EVENT_KINDS: readonly EventKind[] = Object.freeze([
  "holidays",
  "carShow",
  "strike",
  "storm",
] as const);

export interface EventSpec {
  readonly kind: EventKind;
  /** Percent applied to the day's customers; 100 = no change. */
  readonly demandPct: number;
  /** Percent applied to the reference price; 100 = no change. */
  readonly referencePct: number;
  readonly minDays: number;
  readonly maxDays: number;
  readonly weight: number;
}

export const EVENTS: Readonly<Record<EventKind, EventSpec>> = Object.freeze({
  holidays: {
    kind: "holidays",
    demandPct: 200,
    referencePct: 100,
    minDays: 2,
    maxDays: 4,
    weight: 3,
  },
  carShow: {
    kind: "carShow",
    demandPct: 100,
    referencePct: 130,
    minDays: 1,
    maxDays: 2,
    weight: 2,
  },
  strike: { kind: "strike", demandPct: 150, referencePct: 100, minDays: 1, maxDays: 2, weight: 2 },
  storm: { kind: "storm", demandPct: 40, referencePct: 100, minDays: 1, maxDays: 1, weight: 2 },
});

export interface ActiveEvent {
  readonly kind: EventKind;
  readonly startDay: number;
  /** Exclusive: the event is active for startDay <= day < endDay. */
  readonly endDay: number;
}

/** First day on which an event can start in a new game. */
export const FIRST_EVENT_DAY = 3;
/** Quiet period (days) after an event ends, inclusive bounds. */
export const EVENT_COOLDOWN_MIN_DAYS = 4;
export const EVENT_COOLDOWN_MAX_DAYS = 9;

/** The event if it is running on the state's day, else null. */
export function activeEvent(state: GameState): ActiveEvent | null {
  const event = state.event;
  if (event === null || event === undefined) return null;
  return state.day >= event.startDay && state.day < event.endDay ? event : null;
}

/** Days remaining including today (endDay - day), or 0 when no event is running. */
export function eventDaysLeft(state: GameState): number {
  const event = activeEvent(state);
  return event === null ? 0 : event.endDay - state.day;
}

/** Percent applied to the day's customers; 100 when no event is running. */
export function eventDemandPct(state: GameState): number {
  const event = activeEvent(state);
  return event === null ? 100 : EVENTS[event.kind].demandPct;
}

/** Percent applied to the reference price; 100 when no event is running. */
export function eventReferencePct(state: GameState): number {
  const event = activeEvent(state);
  return event === null ? 100 : EVENTS[event.kind].referencePct;
}

/** Draws a weighted random event starting on `day` (consumes the rng). */
export function drawEvent(rng: Rng, day: number): ActiveEvent {
  let total = 0;
  for (const kind of EVENT_KINDS) total += EVENTS[kind].weight;
  let roll = rng.int(0, total - 1);
  let spec = EVENTS[EVENT_KINDS[0] ?? "holidays"];
  for (const kind of EVENT_KINDS) {
    spec = EVENTS[kind];
    if (roll < spec.weight) break;
    roll -= spec.weight;
  }
  const duration = rng.int(spec.minDays, spec.maxDays);
  return { kind: spec.kind, startDay: day, endDay: day + duration };
}

/** Largest demand percent any event applies (for save bounds). */
export const MAX_EVENT_DEMAND_PCT = Math.max(...EVENT_KINDS.map((k) => EVENTS[k].demandPct), 100);
