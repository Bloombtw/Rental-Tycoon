import { describe, expect, it } from "vitest";
import { createGame, giveWelcomeGift, MAX_WELCOME_GIFT } from "./index.js";

describe("giveWelcomeGift (tutorial.md)", () => {
  it("adds the amount, capped; junk amounts change nothing", () => {
    const g = createGame(1, 1_000_00);
    expect(giveWelcomeGift(g, 1_500_00).cash).toBe(2_500_00);
    expect(giveWelcomeGift(g, 10 ** 9).cash).toBe(1_000_00 + MAX_WELCOME_GIFT);
    for (const bad of [0, -5, 1.5, Number.NaN]) expect(giveWelcomeGift(g, bad)).toBe(g);
  });
});
