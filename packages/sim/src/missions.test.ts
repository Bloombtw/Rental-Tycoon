import { describe, expect, it } from "vitest";
import {
  ACTIVE_MISSIONS,
  buyCar,
  claimableMissions,
  claimMission,
  createGame,
  INITIAL_MISSIONS,
  LEVEL_XP,
  MISSIONS,
  MissionNotReadyError,
  missionProgress,
  restoreGameState,
  validateGameState,
} from "./index.js";

describe("missions chain (missions.md)", () => {
  it("starts with the first three missions", () => {
    expect(createGame(1).missions).toEqual(INITIAL_MISSIONS);
    expect(INITIAL_MISSIONS.slots).toHaveLength(ACTIVE_MISSIONS);
    expect(MISSIONS.length).toBeGreaterThanOrEqual(20);
    for (const m of MISSIONS) expect(Number.isSafeInteger(m.reward) && m.reward > 0).toBe(true);
  });

  it("an unfinished mission cannot be claimed", () => {
    const g = createGame(1);
    expect(claimableMissions(g)).toBe(0);
    expect(() => claimMission(g, 0)).toThrow(MissionNotReadyError);
    expect(() => claimMission(g, 7)).toThrow(MissionNotReadyError);
    expect(() => claimMission(g, Number.NaN)).toThrow(MissionNotReadyError);
  });

  it("claiming pays the reward and hands out the next mission in the slot", () => {
    const g = buyCar(buyCar(createGame(1), "used"), "used"); // mission 0: own 2 cars
    expect(claimableMissions(g)).toBe(1);
    const r = claimMission(g, 0);
    expect(r.mission).toBe(MISSIONS[0]);
    expect(r.state.cash).toBe(g.cash + (MISSIONS[0]?.reward ?? 0));
    expect(r.state.missions).toEqual({ slots: [3, 1, 2], next: 4 });
    expect(() => claimMission(r.state, 0)).toThrow(MissionNotReadyError); // mission 3 not met
  });

  it("progress reads the state (level, day revenue)", () => {
    const g = { ...createGame(1), xp: LEVEL_XP[1] ?? 0 };
    expect(missionProgress({ kind: "level", level: 2 }, g)).toEqual({ current: 2, target: 2 });
    expect(missionProgress({ kind: "dayRevenue", amount: 100 }, createGame(1))).toEqual({
      current: 0,
      target: 100,
    });
  });

  it("at the end of the chain the slot empties", () => {
    const last = MISSIONS.length - 1;
    const g = {
      ...createGame(1, 10 ** 12),
      missions: { slots: [last, null, null], next: MISSIONS.length },
      lastDay: { revenue: 10 ** 9, costs: 0 },
      day: 1,
    };
    expect(claimMission(g, 0).state.missions).toEqual({
      slots: [null, null, null],
      next: MISSIONS.length,
    });
  });
});

describe("save v8", () => {
  it("migrates a v7 save to the start of the chain; rejects broken slots", () => {
    const v7 = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    delete v7["missions"];
    expect(restoreGameState(v7, 7).missions).toEqual({ slots: [0, 1, 2], next: 3 });
    const base = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    for (const missions of [
      { slots: [0, 0, 2], next: 3 },
      { slots: [0, 1], next: 3 },
      { slots: [0, 1, 5], next: 3 },
      { slots: [0, 1, 2], next: 999 },
    ]) {
      expect(() => validateGameState({ ...base, missions })).toThrow();
    }
  });
});
