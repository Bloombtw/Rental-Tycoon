import { describe, expect, it } from "vitest";
import {
  advanceMinutes,
  createGame,
  DAY_MINUTES,
  GAME_STATE_VERSION,
  InvalidGameStateError,
  MAX_HISTORY_DAYS,
  modelStatKey,
  restoreGameState,
  validateGameState,
  type GameState,
} from "./index.js";

const quiet = (g: GameState): GameState => ({ ...g, nextEventDay: Number.MAX_SAFE_INTEGER });
const cheap = { dailyPrice: 1_00, dailyCost: 1_00 };
const start = (n = 3): GameState =>
  quiet(
    createGame(
      7,
      1_000_00,
      Array.from({ length: n }, () => cheap),
    ),
  );

describe("stats", () => {
  it("starts empty and the version is 11", () => {
    const g = createGame(1);
    expect(g.history).toEqual([]);
    expect(g.modelStats).toEqual({});
    expect(GAME_STATE_VERSION).toBe(11);
    expect(MAX_HISTORY_DAYS).toBe(60);
  });

  it("modelStatKey: model id or other", () => {
    expect(modelStatKey({ id: 1, dailyPrice: 1, dailyCost: 1, rented: false })).toBe("other");
    expect(modelStatKey({ id: 1, model: "used", dailyPrice: 1, dailyCost: 1, rented: false })).toBe(
      "used",
    );
  });

  it("closing appends a record; modelStats matches revenue", () => {
    const g = advanceMinutes(start(), DAY_MINUTES);
    expect(g.history).toHaveLength(1);
    const rec = g.history[0];
    expect(rec).toEqual({ day: 0, revenue: g.lastDay?.revenue, costs: 3_00, cash: g.cash });
    const stat = g.modelStats["other"];
    expect(stat?.revenue).toBe(rec?.revenue);
    expect(stat?.rentals).toBe((rec?.revenue ?? 0) / 1_00);
  });

  it("keeps the last 60 days", () => {
    let g = start();
    for (let i = 0; i < 65; i++) g = advanceMinutes(g, DAY_MINUTES);
    expect(g.history).toHaveLength(MAX_HISTORY_DAYS);
    expect(g.history[0]?.day).toBe(5);
    expect(g.history[59]?.day).toBe(64);
  });

  it("splitting into 1-minute steps gives the same state", () => {
    let a = start();
    let b = start();
    a = advanceMinutes(a, DAY_MINUTES);
    a = advanceMinutes(a, DAY_MINUTES);
    for (let i = 0; i < 2 * DAY_MINUTES; i++) b = advanceMinutes(b, 1);
    expect(b).toEqual(a);
    expect(a.history).toHaveLength(2);
  });

  it("does not mutate the input state", () => {
    const g = start();
    const json = JSON.stringify(g);
    advanceMinutes(g, DAY_MINUTES);
    expect(JSON.stringify(g)).toBe(json);
  });

  it("save round-trips", () => {
    const g = advanceMinutes(start(), DAY_MINUTES);
    const back = restoreGameState(JSON.parse(JSON.stringify(g)), GAME_STATE_VERSION);
    expect(back).toEqual(g);
  });

  it("migrates v10 to empty stats", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGame(1)));
    delete raw["history"];
    delete raw["modelStats"];
    const g = restoreGameState(raw, 10);
    expect(g.history).toEqual([]);
    expect(g.modelStats).toEqual({});
  });

  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(createGame(1)));
  const rec = { day: 0, revenue: 1, costs: 1, cash: 1 };

  it.each([
    ["history not array", { history: {} }],
    ["history too long", { history: Array.from({ length: 61 }, () => rec) }],
    ["negative revenue", { history: [{ ...rec, revenue: -1 }] }],
    ["negative costs", { history: [{ ...rec, costs: -1 }] }],
    ["float day", { history: [{ ...rec, day: 0.5 }] }],
    ["NaN cash", { history: [{ ...rec, cash: Number.NaN }] }],
    ["modelStats array", { modelStats: [] }],
    ["unknown key", { modelStats: { ferrari: { rentals: 1, revenue: 1 } } }],
    ["negative rentals", { modelStats: { other: { rentals: -1, revenue: 1 } } }],
    ["float revenue", { modelStats: { other: { rentals: 1, revenue: 1.5 } } }],
    ["missing fields", { modelStats: { other: {} } }],
  ])("rejects %s", (_n, patch) => {
    expect(() => validateGameState({ ...base(), ...patch })).toThrow(InvalidGameStateError);
  });

  it("rejects a __proto__ key in modelStats without pollution", () => {
    const raw = JSON.parse(
      '{"__proto__":{"rentals":1,"revenue":1},"other":{"rentals":1,"revenue":1}}',
    ) as unknown;
    expect(() => validateGameState({ ...base(), modelStats: raw })).toThrow(InvalidGameStateError);
    expect(({} as Record<string, unknown>)["rentals"]).toBeUndefined();
  });

  it("accepts valid stats", () => {
    const g = validateGameState({
      ...base(),
      history: [rec],
      modelStats: { other: { rentals: 2, revenue: 3 } },
    });
    expect(g.history).toEqual([rec]);
    expect(g.modelStats).toEqual({ other: { rentals: 2, revenue: 3 } });
  });
});
