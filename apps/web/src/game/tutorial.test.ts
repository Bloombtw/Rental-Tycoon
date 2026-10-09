import { describe, expect, it } from "vitest";
import { advance, buyCar, createGame } from "@rt/sim";
import { gameReducer, initUiState, type UiState } from "./gameReducer.js";
import { initialTutorial } from "./tutorial.js";

describe("tutorial (tutorial.md)", () => {
  it("only a brand-new agency starts it", () => {
    expect(initialTutorial(createGame(1))).toBe("buy");
    expect(initialTutorial(buyCar(createGame(1), "used"))).toBe("done");
    expect(initialTutorial(advance(createGame(1), 1))).toBe("done");
  });

  it("buy -> price -> run -> wait -> report -> done", () => {
    let s: UiState = initUiState(createGame(1));
    s = gameReducer(s, { type: "buyCar", model: "used" });
    expect(s.tutorial).toBe("price");
    s = gameReducer(s, { type: "setCarPrice", carId: 1, dailyPrice: 80_00 });
    expect(s.tutorial).toBe("run");
    s = gameReducer(s, { type: "togglePause" });
    expect(s.tutorial).toBe("wait");
    s = gameReducer(s, { type: "advanceTime", minutes: 720 });
    expect(s.tutorial).toBe("report");
    s = gameReducer(s, { type: "tutorialNext" });
    expect(s.tutorial).toBe("done");
  });

  it("a refused action does not advance; 'Garder ce prix' skips the price step", () => {
    let s: UiState = initUiState(createGame(1, 0));
    s = gameReducer(s, { type: "buyCar", model: "used" }); // no cash
    expect(s.tutorial).toBe("buy");
    s = initUiState(createGame(1));
    s = gameReducer(s, { type: "buyCar", model: "used" });
    s = gameReducer(s, { type: "setCarPrice", carId: 1, dailyPrice: -1 });
    expect(s.tutorial).toBe("price");
    s = gameReducer(s, { type: "tutorialNext" });
    expect(s.tutorial).toBe("run");
    // "next" does nothing on steps completed by an action.
    expect(gameReducer(s, { type: "tutorialNext" }).tutorial).toBe("run");
  });

  it("can be skipped at any time; a new game restarts it", () => {
    let s = gameReducer(initUiState(createGame(1)), { type: "skipTutorial" });
    expect(s.tutorial).toBe("done");
    s = gameReducer(s, { type: "newGame", seed: 9 });
    expect(s.tutorial).toBe("buy");
  });
});
