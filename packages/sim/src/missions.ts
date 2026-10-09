import { levelForXp, type CarModelId } from "./economy.js";
import { MissionNotReadyError, SimOverflowError } from "./errors.js";
import type { ManagerId } from "./managers.js";
import type { Cents, GameState } from "./state.js";
import type { UpgradeId } from "./upgrades.js";

/** Short-term goals (missions.md). A fixed chain; three are active at a time. */
export type MissionGoal =
  | { readonly kind: "ownCars"; readonly count: number }
  | { readonly kind: "ownModel"; readonly model: CarModelId; readonly count: number }
  | { readonly kind: "dayRevenue"; readonly amount: Cents }
  | { readonly kind: "cash"; readonly amount: Cents }
  | { readonly kind: "level"; readonly level: number }
  | { readonly kind: "upgrade"; readonly upgrade: UpgradeId; readonly level: number }
  | { readonly kind: "hire"; readonly manager: ManagerId };

export interface Mission {
  readonly goal: MissionGoal;
  readonly reward: Cents;
}

const m = (goal: MissionGoal, reward: Cents): Mission => Object.freeze({ goal, reward });

/** Tunable placeholders, in order of difficulty. */
export const MISSIONS: readonly Mission[] = Object.freeze([
  m({ kind: "ownCars", count: 2 }, 1_000_00),
  m({ kind: "dayRevenue", amount: 150_00 }, 1_000_00),
  m({ kind: "upgrade", upgrade: "parking", level: 1 }, 1_500_00),
  m({ kind: "ownCars", count: 5 }, 2_000_00),
  m({ kind: "dayRevenue", amount: 400_00 }, 2_500_00),
  m({ kind: "level", level: 2 }, 2_500_00),
  m({ kind: "ownModel", model: "hybrid", count: 2 }, 3_000_00),
  m({ kind: "upgrade", upgrade: "ads", level: 1 }, 3_000_00),
  m({ kind: "hire", manager: "sales" }, 4_000_00),
  m({ kind: "cash", amount: 60_000_00 }, 4_000_00),
  m({ kind: "ownCars", count: 10 }, 5_000_00),
  m({ kind: "dayRevenue", amount: 1_000_00 }, 6_000_00),
  m({ kind: "level", level: 3 }, 6_000_00),
  m({ kind: "upgrade", upgrade: "wash", level: 2 }, 7_000_00),
  m({ kind: "hire", manager: "pricing" }, 8_000_00),
  m({ kind: "ownModel", model: "van", count: 3 }, 8_000_00),
  m({ kind: "ownCars", count: 20 }, 10_000_00),
  m({ kind: "dayRevenue", amount: 2_500_00 }, 12_000_00),
  m({ kind: "level", level: 5 }, 15_000_00),
  m({ kind: "upgrade", upgrade: "counter", level: 3 }, 15_000_00),
  m({ kind: "ownModel", model: "sport", count: 2 }, 20_000_00),
  m({ kind: "cash", amount: 250_000_00 }, 20_000_00),
  m({ kind: "ownCars", count: 40 }, 30_000_00),
  m({ kind: "dayRevenue", amount: 6_000_00 }, 40_000_00),
]);

export const ACTIVE_MISSIONS = 3;

export interface MissionsState {
  /** Indexes into MISSIONS of the active missions; null once the chain is exhausted. */
  readonly slots: readonly (number | null)[];
  /** Index of the next mission to hand out. */
  readonly next: number;
}

export const INITIAL_MISSIONS: MissionsState = Object.freeze({
  slots: Object.freeze([0, 1, 2]),
  next: ACTIVE_MISSIONS,
});

/** Progress towards a goal: current value and target, in the goal's unit. */
export function missionProgress(
  goal: MissionGoal,
  state: GameState,
): { readonly current: number; readonly target: number } {
  switch (goal.kind) {
    case "ownCars":
      return { current: state.fleet.length, target: goal.count };
    case "ownModel":
      return {
        current: state.fleet.filter((c) => c.model === goal.model).length,
        target: goal.count,
      };
    case "dayRevenue":
      return { current: state.lastDay?.revenue ?? 0, target: goal.amount };
    case "cash":
      return { current: Math.max(0, state.cash), target: goal.amount };
    case "level":
      return { current: levelForXp(state.xp), target: goal.level };
    case "upgrade":
      return { current: state.upgrades[goal.upgrade], target: goal.level };
    case "hire":
      return { current: state.managers[goal.manager] ? 1 : 0, target: 1 };
  }
}

export function missionDone(goal: MissionGoal, state: GameState): boolean {
  const p = missionProgress(goal, state);
  return p.current >= p.target;
}

/** The mission in an active slot, if any. */
export function missionInSlot(state: GameState, slot: number): Mission | null {
  const index = Number.isSafeInteger(slot) ? state.missions.slots[slot] : undefined;
  return index === null || index === undefined ? null : (MISSIONS[index] ?? null);
}

/** Active missions whose reward is waiting to be claimed. */
export function claimableMissions(state: GameState): number {
  let n = 0;
  for (let slot = 0; slot < state.missions.slots.length; slot++) {
    const m = missionInSlot(state, slot);
    if (m && missionDone(m.goal, state)) n += 1;
  }
  return n;
}

/**
 * Claims the reward of a completed mission and hands out the next mission of the chain in its slot
 * (or leaves it empty at the end of the chain). Pure.
 */
export function claimMission(
  state: GameState,
  slot: number,
): { readonly state: GameState; readonly mission: Mission } {
  const mission = missionInSlot(state, slot);
  if (!mission) throw new MissionNotReadyError(slot);
  if (!missionDone(mission.goal, state)) throw new MissionNotReadyError(slot);
  const cash = state.cash + mission.reward;
  if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
  const { next } = state.missions;
  const slots = state.missions.slots.map((v, i) =>
    i === slot ? (next < MISSIONS.length ? next : null) : v,
  );
  return {
    state: { ...state, cash, missions: { slots, next: Math.min(next + 1, MISSIONS.length) } },
    mission,
  };
}
