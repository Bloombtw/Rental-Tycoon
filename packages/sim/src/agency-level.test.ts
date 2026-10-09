import { describe, expect, it } from "vitest";
import {
  advance,
  buyCar,
  CAR_MODEL_IDS,
  CAR_MODELS,
  createGame,
  LEVEL_XP,
  levelForXp,
  MAX_AGENCY_LEVEL,
  ModelLockedError,
  rentalXp,
  restoreGameState,
  type GameState,
} from "./index.js";

describe("levels", () => {
  it("levelForXp follows LEVEL_XP, garbage gives level 1", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(1_499)).toBe(1);
    expect(levelForXp(1_500)).toBe(2);
    expect(levelForXp(10 ** 9)).toBe(MAX_AGENCY_LEVEL);
    for (const bad of [NaN, -5, "9000", null, undefined, Infinity]) expect(levelForXp(bad)).toBe(1);
    expect(LEVEL_XP).toHaveLength(MAX_AGENCY_LEVEL);
  });

  it("one XP per whole euro of rental", () => {
    expect(rentalXp(90_00)).toBe(90);
    expect(rentalXp(99)).toBe(0);
    expect(rentalXp(Number.NaN)).toBe(0);
  });

  it("each model unlocks at its level, in catalogue order", () => {
    let prev = 0;
    for (const id of CAR_MODEL_IDS) {
      expect(CAR_MODELS[id].unlockLevel).toBeGreaterThanOrEqual(prev);
      prev = CAR_MODELS[id].unlockLevel;
    }
  });
});

describe("xp in play", () => {
  it("renting earns exactly the euros of revenue as XP", () => {
    const fleet = Array.from({ length: 5 }, () => ({ dailyPrice: 90_00, dailyCost: 0 }));
    const g = advance(createGame(3, 0, fleet), 20);
    expect(g.xp).toBe(Math.floor((g.cash - 0) / 100));
  });

  it("buyCar refuses a locked model, then allows it at the level", () => {
    const g = createGame(1, 10 ** 12);
    expect(() => buyCar(g, "suv")).toThrow(ModelLockedError);
    const leveled: GameState = { ...g, xp: LEVEL_XP[1] ?? 0 };
    expect(buyCar(leveled, "suv").fleet[0]?.model).toBe("suv");
    expect(() => buyCar(leveled, "van")).toThrow(ModelLockedError);
  });
});

describe("save v4", () => {
  it("migrates a v3 save with xp 0", () => {
    const v3 = JSON.parse(JSON.stringify(createGame(1))) as Record<string, unknown>;
    delete v3["xp"];
    expect(restoreGameState(v3, 3).xp).toBe(0);
  });
});
