import { describe, expect, it } from "vitest";
import { advance, buyCar, createGame } from "@rt/sim";
import { gameReducer, initUiState } from "./gameReducer.js";
import { MAX_OFFLINE_DAYS, OFFLINE_DAY_MS, offlineDays, playOffline } from "./offline.js";
import { encodeSave, SAVE_KEY } from "./saveFormat.js";
import { loadInitialState } from "./persistence.js";
import { memoryStorage } from "./fakeStorage.js";

const H = 60 * 60 * 1000;
const game = buyCar(buyCar(createGame(3), "compact"), "hybrid");

describe("offlineDays", () => {
  it("one day per OFFLINE_DAY_MS, capped at 8 h", () => {
    expect(offlineDays(OFFLINE_DAY_MS - 1)).toBe(0);
    expect(offlineDays(OFFLINE_DAY_MS)).toBe(1);
    expect(offlineDays(H)).toBe(6);
    expect(offlineDays(8 * H)).toBe(MAX_OFFLINE_DAYS);
    expect(offlineDays(1000 * H)).toBe(MAX_OFFLINE_DAYS);
    expect(MAX_OFFLINE_DAYS).toBe(48);
  });

  it("garbage, negative or future gives 0", () => {
    for (const v of [NaN, Infinity, -Infinity, -5, 0, "3600000", null, undefined]) {
      expect(offlineDays(v)).toBe(0);
    }
  });
});

describe("playOffline", () => {
  it("plays the days with the sim and reports the cash difference", () => {
    const r = playOffline(game, 5);
    const expected = advance(game, 5);
    expect(r?.game).toEqual(expected);
    expect(r?.report).toEqual({ days: 5, delta: expected.cash - game.cash });
  });

  it("nothing to play gives null", () => {
    expect(playOffline(game, 0)).toBeNull();
    expect(playOffline(game, -1)).toBeNull();
    expect(playOffline(game, 1.5)).toBeNull();
  });
});

describe("returnAfter / claimOffline", () => {
  it("applies the gains at once, pauses, and shows the report until claimed", () => {
    const running = { ...initUiState(game), paused: false, hasRun: true };
    const s = gameReducer(running, { type: "returnAfter", elapsedMs: H });
    expect(s.game).toEqual(advance(game, 6));
    expect(s.paused).toBe(true);
    expect(s.offline?.days).toBe(6);
    const claimed = gameReducer(s, { type: "claimOffline" });
    expect(claimed.offline).toBeNull();
    expect(claimed.game).toBe(s.game);
  });

  it("a short absence changes nothing", () => {
    const s = initUiState(game);
    expect(gameReducer(s, { type: "returnAfter", elapsedMs: 1000 })).toBe(s);
    expect(gameReducer(s, { type: "returnAfter", elapsedMs: Number.NaN })).toBe(s);
  });

  it("two absences before the claim add up", () => {
    let s = initUiState(game);
    s = gameReducer(s, { type: "returnAfter", elapsedMs: 2 * OFFLINE_DAY_MS });
    s = gameReducer(s, { type: "returnAfter", elapsedMs: 3 * OFFLINE_DAY_MS });
    expect(s.offline?.days).toBe(5);
    expect(s.offline?.delta).toBe(s.game.cash - game.cash);
  });
});

describe("launch after time away", () => {
  it("plays the offline days from savedAt", () => {
    const storage = memoryStorage({ [SAVE_KEY]: encodeSave(game, 1, 1_000) });
    const r = loadInitialState({ storage, newSeed: () => 1, now: 1_000 + 2 * H });
    expect(r.ui.offline?.days).toBe(12);
    expect(r.ui.game).toEqual(advance(game, 12));
  });

  it("a savedAt in the future gives nothing", () => {
    const storage = memoryStorage({ [SAVE_KEY]: encodeSave(game, 1, 10 * H) });
    const r = loadInitialState({ storage, newSeed: () => 1, now: H });
    expect(r.ui.offline).toBeNull();
    expect(r.ui.game).toEqual(game);
  });
});
