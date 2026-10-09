import { describe, expect, it } from "vitest";
import {
  canClaimDailyReward,
  claimDailyReward,
  createGame,
  DAILY_REWARDS,
  restoreGameState,
  rewardForStreak,
  RewardAlreadyClaimedError,
  validateGameState,
} from "./index.js";

const D = 20_000; // some calendar day

describe("daily reward", () => {
  it("claims once per calendar day and pays the streak's reward", () => {
    const g = createGame(1, 0);
    expect(canClaimDailyReward(g, D)).toBe(true);
    const c = claimDailyReward(g, D);
    expect(c.cash).toBe(DAILY_REWARDS[0]);
    expect(c.dailyReward).toEqual({ lastDay: D, streak: 1 });
    expect(canClaimDailyReward(c, D)).toBe(false);
    expect(() => claimDailyReward(c, D)).toThrow(RewardAlreadyClaimedError);
    expect(() => claimDailyReward(c, D - 1)).toThrow(RewardAlreadyClaimedError);
  });

  it("consecutive days grow the streak; a missed day restarts it", () => {
    let g = createGame(1, 0);
    for (let i = 0; i < 9; i++) g = claimDailyReward(g, D + i);
    expect(g.dailyReward.streak).toBe(9);
    const expected = [0, 1, 2, 3, 4, 5, 6, 0, 1].reduce((s, k) => s + (DAILY_REWARDS[k] ?? 0), 0);
    expect(g.cash).toBe(expected);
    g = claimDailyReward(g, D + 11);
    expect(g.dailyReward.streak).toBe(1);
  });

  it("bad days are refused, odd streaks pay the first reward", () => {
    const g = createGame(1, 0);
    for (const bad of [-1, 1.5, Number.NaN]) expect(canClaimDailyReward(g, bad)).toBe(false);
    expect(rewardForStreak(0)).toBe(DAILY_REWARDS[0]);
    expect(rewardForStreak(8)).toBe(DAILY_REWARDS[0]);
  });

  it("save v6: migrates v5, rejects an inconsistent streak", () => {
    const v5 = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    delete v5["dailyReward"];
    expect(restoreGameState(v5, 5).dailyReward).toEqual({ lastDay: -1, streak: 0 });
    const bad = {
      ...JSON.parse(JSON.stringify(createGame(1))),
      dailyReward: { lastDay: -1, streak: 3 },
    };
    expect(() => validateGameState(bad)).toThrow();
  });
});
