import { describe, expect, it } from "vitest";
import {
  GAME_STATE_VERSION,
  InvalidGameStateError,
  UnsupportedGameStateVersionError,
  advance,
  advanceMinutes,
  buyCar,
  createGame,
  restoreGameState,
  setCarPrice,
  validateGameState,
  type GameState,
} from "./index.js";

function played(): GameState {
  let s = createGame(0xffffffff);
  s = buyCar(s, "used");
  s = buyCar(s, "compact");
  s = buyCar(s, "hybrid");
  s = setCarPrice(s, 2, 75_00);
  s = advanceMinutes(s, 300);
  s = advance(s, 5);
  return advanceMinutes(s, 123);
}

function json(s: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
}

function expectInvalid(raw: unknown, path: string, issue?: string): void {
  try {
    validateGameState(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(InvalidGameStateError);
    expect((e as InvalidGameStateError).path).toBe(path);
    if (issue !== undefined) expect((e as InvalidGameStateError).issue).toBe(issue);
    return;
  }
  throw new Error("expected InvalidGameStateError");
}

function withFleetCar(patch: Record<string, unknown>): Record<string, unknown> {
  const s = json(played());
  const fleet = s["fleet"] as Record<string, unknown>[];
  fleet[1] = { ...fleet[1], ...patch };
  return s;
}

describe("validateGameState", () => {
  it("round-trips played states, including 3650 days and negative cash", () => {
    const states = [createGame(0), createGame(4294967295), played(), advance(played(), 3650)];
    let broke = advance(buyCar(createGame(1, 10_000_00), "used"), 3650);
    broke = advance(broke, 100);
    states.push(broke);
    for (const s of states) {
      const copy = validateGameState(JSON.parse(JSON.stringify(s)));
      expect(copy).toEqual(s);
      expect(copy).not.toBe(s);
    }
  });

  it("accepts negative cash", () => {
    const s = { ...json(played()), cash: -5000 };
    expect(validateGameState(s).cash).toBe(-5000);
  });

  it("strips extra fields and normalises -0", () => {
    const s: Record<string, unknown> = { ...json(played()), extra: 1, cash: -0 };
    const first = (s["fleet"] as Record<string, unknown>[])[0];
    if (first === undefined) throw new Error("fixture");
    first["evil"] = true;
    const v = validateGameState(s);
    expect(v).not.toHaveProperty("extra");
    expect(v.fleet[0]).not.toHaveProperty("evil");
    expect(Object.is(v.cash, 0)).toBe(true);
  });

  it("accepts fixture cars without model", () => {
    const g = createGame(1, 100_00, [{ dailyPrice: 10_00, dailyCost: 0 }]);
    expect(validateGameState(json(g))).toEqual(g);
  });

  it("rejects bad roots", () => {
    for (const raw of [null, undefined, [], 1, "x", true]) expectInvalid(raw, "$", "type");
  });

  it("rejects bad scalars", () => {
    const base = json(played());
    expectInvalid({ ...base, cash: Number.NaN }, "cash", "type");
    expectInvalid({ ...base, cash: 1.5 }, "cash", "type");
    expectInvalid({ ...base, cash: "100" }, "cash", "type");
    expectInvalid({ ...base, cash: Infinity }, "cash", "type");
    expectInvalid({ ...base, day: -1 }, "day", "range");
    expectInvalid({ ...base, minute: 720 }, "minute", "range");
    expectInvalid({ ...base, minute: -1 }, "minute", "range");
    expectInvalid({ ...base, rngState: 2 ** 32 }, "rngState", "range");
    expectInvalid({ ...base, rngState: -1 }, "rngState", "range");
    expectInvalid({ ...base, seed: 2 ** 53 }, "seed", "type");
    expectInvalid({ ...base, todayRevenue: -1 }, "todayRevenue", "range");
    expectInvalid({ ...base, fleet: undefined }, "fleet", "type");
  });

  it("requires todayRevenue 0 at minute 0", () => {
    expectInvalid(
      { ...json(played()), minute: 0, todayRevenue: 5 },
      "todayRevenue",
      "inconsistent",
    );
  });

  it("rejects missing fields", () => {
    const base = json(played());
    for (const k of ["seed", "rngState", "day", "minute", "cash", "todayRevenue", "lastDay"]) {
      const copy = Object.fromEntries(Object.entries(base).filter(([key]) => key !== k));
      expect(() => validateGameState(copy)).toThrow(InvalidGameStateError);
    }
  });

  it("ignores inherited properties", () => {
    const proto = json(played());
    const raw = Object.create(proto) as unknown;
    expectInvalid(raw, "seed", "type");
  });

  it("validates the fleet", () => {
    const base = json(played());
    const car = (base["fleet"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    expectInvalid({ ...base, fleet: Array.from({ length: 51 }, () => car) }, "fleet", "range");
    expectInvalid({ ...base, fleet: {} }, "fleet", "type");
    expectInvalid({ ...base, fleet: [null] }, "fleet[0]", "type");
    expectInvalid({ ...base, fleet: [car, car] }, "fleet[1].id", "duplicateId");
    expectInvalid(withFleetCar({ id: 0 }), "fleet[1].id", "range");
    expectInvalid(withFleetCar({ id: 1.5 }), "fleet[1].id", "type");
    expectInvalid(withFleetCar({ model: "tesla" }), "fleet[1].model", "unknownModel");
    expectInvalid(withFleetCar({ model: "toString" }), "fleet[1].model", "unknownModel");
    expectInvalid(withFleetCar({ model: "__proto__" }), "fleet[1].model", "unknownModel");
    expectInvalid(withFleetCar({ model: 3 }), "fleet[1].model", "type");
    expectInvalid(
      withFleetCar({ model: "used", dailyCost: 0 }),
      "fleet[1].dailyCost",
      "inconsistent",
    );
    expectInvalid(withFleetCar({ dailyPrice: -1 }), "fleet[1].dailyPrice", "range");
    expectInvalid(withFleetCar({ dailyPrice: 1_000_01 }), "fleet[1].dailyPrice", "range");
    expectInvalid(withFleetCar({ dailyCost: 1_000_01 }), "fleet[1].dailyCost", "range");
    expectInvalid(withFleetCar({ rented: 1 }), "fleet[1].rented", "type");
    expectInvalid(withFleetCar({ rented: undefined }), "fleet[1].rented", "type");
  });

  it("accepts exactly 50 cars", () => {
    const base = json(played());
    const fleet = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      dailyPrice: 1,
      dailyCost: 0,
      rented: false,
    }));
    const upgrades = { parking: 9, counter: 0, ads: 0, wash: 0 };
    expect(validateGameState({ ...base, upgrades, fleet, nextCarId: 51 }).fleet).toHaveLength(50);
    // More cars than the parking holds is inconsistent.
    expect(() => validateGameState({ ...base, fleet })).toThrow(InvalidGameStateError);
  });

  it("validates lastDay", () => {
    const base = json(played());
    expectInvalid({ ...base, lastDay: null }, "lastDay", "inconsistent");
    expectInvalid({ ...base, lastDay: undefined }, "lastDay", "type");
    expectInvalid({ ...base, lastDay: [] }, "lastDay", "type");
    expectInvalid({ ...base, lastDay: { revenue: -1, costs: 0 } }, "lastDay.revenue", "range");
    expectInvalid({ ...base, lastDay: { revenue: 0, costs: 0.5 } }, "lastDay.costs", "type");
    expectInvalid(
      { ...json(createGame(1)), lastDay: { revenue: 0, costs: 0 } },
      "lastDay",
      "inconsistent",
    );
  });

  it("never throws anything but InvalidGameStateError on hostile input", () => {
    const base = json(played());
    const thrower = {
      get cash(): number {
        throw new TypeError("boom");
      },
    };
    const hostile: unknown[] = [
      new Proxy(
        {},
        {
          get() {
            throw new Error("trap");
          },
          has() {
            throw new Error("trap");
          },
          getOwnPropertyDescriptor() {
            throw new Error("trap");
          },
        },
      ),
      Object.defineProperty({ ...base }, "cash", {
        enumerable: true,
        get() {
          throw new Error("getter");
        },
      }),
      thrower,
      {
        ...base,
        fleet: new Proxy([], {
          get: () => {
            throw new Error("trap");
          },
        }),
      },
      Object.create(null),
      JSON.parse('{"__proto__": {"cash": 1}}'),
      Symbol("x"),
      () => 1,
      10n,
    ];
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    hostile.push(revocable.proxy);
    for (const raw of hostile) {
      expect(() => validateGameState(raw)).toThrow(InvalidGameStateError);
    }
  });

  it("does not pollute prototypes", () => {
    const raw = JSON.parse(
      `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}`,
    ) as unknown;
    expect(() => validateGameState(raw)).toThrow(InvalidGameStateError);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const ok = { ...json(played()) };
    const parsed = JSON.parse(`{"__proto__":{"polluted":true}}`) as object;
    const v = validateGameState(Object.assign(ok, parsed));
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const raw = json(played());
    const snapshot = JSON.stringify(raw);
    validateGameState(raw);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});

describe("restoreGameState", () => {
  it("restores at the current version", () => {
    const s = played();
    expect(restoreGameState(json(s), GAME_STATE_VERSION)).toEqual(s);
  });

  it("rejects unsupported versions", () => {
    const raw = json(played());
    for (const v of [0, -1, 1.5, "1", null, undefined, NaN, GAME_STATE_VERSION + 1]) {
      try {
        restoreGameState(raw, v);
        throw new Error("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(UnsupportedGameStateVersionError);
        const err = e as UnsupportedGameStateVersionError;
        expect(err.code).toBe("UNSUPPORTED_STATE_VERSION");
        expect(err.newer).toBe(v === GAME_STATE_VERSION + 1);
      }
    }
  });

  it("checks the version before the state and still validates the state", () => {
    expect(() => restoreGameState(null, 99)).toThrow(UnsupportedGameStateVersionError);
    expect(() => restoreGameState(null, 1)).toThrow(InvalidGameStateError);
  });
});

describe("createGame with any uint32 seed", () => {
  it("accepts 0 and 2^32-1 and keeps rngState", () => {
    expect(createGame(0).rngState).toBe(0);
    expect(createGame(4294967295).rngState).toBe(4294967295);
  });
});
