import { RewardAlreadyClaimedError, SimOverflowError } from "./errors.js";
import type { Cents, GameState } from "./state.js";

/**
 * Daily login reward (daily-reward.md). The sim never reads a clock: the web passes `today`, a
 * whole local calendar day number (days since 1970-01-01 in the player's time zone).
 */

/** Rewards of a 7-day streak; day 8 starts the cycle again. */
export const DAILY_REWARDS: readonly Cents[] = Object.freeze([
  500_00, 750_00, 1_000_00, 1_500_00, 2_000_00, 3_000_00, 5_000_00,
]);

export interface DailyRewardState {
  /** Calendar day of the last claim; -1 before the first. */
  readonly lastDay: number;
  /** Consecutive days claimed, ending at `lastDay`; 0 before the first. */
  readonly streak: number;
}

export const NO_DAILY_REWARD: DailyRewardState = Object.freeze({ lastDay: -1, streak: 0 });

function validDay(today: unknown): today is number {
  return typeof today === "number" && Number.isSafeInteger(today) && today >= 0;
}

/** True if a reward can be claimed on calendar day `today`. */
export function canClaimDailyReward(state: GameState, today: number): boolean {
  return validDay(today) && today > state.dailyReward.lastDay;
}

/** Streak the claim on `today` would reach (a missed day restarts at 1). */
export function nextStreak(reward: DailyRewardState, today: number): number {
  return today === reward.lastDay + 1 ? reward.streak + 1 : 1;
}

/** Reward of a given streak day (1-based, cycling every 7). */
export function rewardForStreak(streak: number): Cents {
  const n = Number.isSafeInteger(streak) && streak > 0 ? streak : 1;
  return DAILY_REWARDS[(n - 1) % DAILY_REWARDS.length] ?? 0;
}

/** Claims today's reward. Pure: returns a new state. */
export function claimDailyReward(state: GameState, today: number): GameState {
  if (!canClaimDailyReward(state, today)) throw new RewardAlreadyClaimedError(today);
  const streak = nextStreak(state.dailyReward, today);
  const cash = state.cash + rewardForStreak(streak);
  if (!Number.isSafeInteger(cash)) throw new SimOverflowError("cash");
  return { ...state, cash, dailyReward: { lastDay: today, streak } };
}
