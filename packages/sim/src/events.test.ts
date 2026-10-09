import { describe, expect, it } from "vitest";
import {
  DAY_MINUTES,
  EVENTS,
  EVENT_KINDS,
  GAME_STATE_VERSION,
  InvalidGameStateError,
  activeEvent,
  advanceMinutes,
  createGame,
  eventDaysLeft,
  eventDemandPct,
  eventReferencePct,
  restoreGameState,
  tick,
  validateGameState,
  type ActiveEvent,
  type EventKind,
  type GameState,
  type NewCar,
} from "./index.js";

// Spec: docs/specs/events.md

const CASH = 1_000_000_00;
const NEVER = Number.MAX_SAFE_INTEGER;

const fleetOf = (n: number, dailyPrice: number, dailyCost = 10_00): NewCar[] =>
  Array.from({ length: n }, () => ({ dailyPrice, dailyCost }));

const json = (s: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

/** A game at the start of `day` with the given event forced (and no new one drawn). */
function withEvent(g: GameState, event: ActiveEvent | null, day = g.day): GameState {
  return { ...g, day, event, nextEventDay: NEVER };
}

/** Opens a day (processes minute 0) and returns the state. */
const open = (g: GameState): GameState => advanceMinutes(g, 1);

describe("events: definitions", () => {
  it("matches the spec table", () => {
    expect(EVENT_KINDS).toEqual(["holidays", "carShow", "strike", "storm"]);
    const row = (k: EventKind) => {
      const e = EVENTS[k];
      return [e.kind, e.demandPct, e.referencePct, e.minDays, e.maxDays, e.weight];
    };
    expect(row("holidays")).toEqual(["holidays", 200, 100, 2, 4, 3]);
    expect(row("carShow")).toEqual(["carShow", 100, 130, 1, 2, 2]);
    expect(row("strike")).toEqual(["strike", 150, 100, 1, 2, 2]);
    expect(row("storm")).toEqual(["storm", 40, 100, 1, 1, 2]);
  });

  it("a new game has no event and the first one is due on day 3", () => {
    const g = createGame(1, CASH, fleetOf(3, 90_00));
    expect(g.event).toBeNull();
    expect(g.nextEventDay).toBe(3);
  });
});

describe("events: accessors", () => {
  const base = createGame(1, CASH, fleetOf(2, 90_00));
  const ev: ActiveEvent = { kind: "holidays", startDay: 5, endDay: 8 };

  it("no event: neutral values", () => {
    expect(activeEvent(base)).toBeNull();
    expect(eventDaysLeft(base)).toBe(0);
    expect(eventDemandPct(base)).toBe(100);
    expect(eventReferencePct(base)).toBe(100);
  });

  it("active for startDay <= day < endDay only", () => {
    const at = (day: number): GameState => ({ ...base, day, event: ev });
    expect(activeEvent(at(4))).toBeNull();
    expect(eventDemandPct(at(4))).toBe(100);
    expect(activeEvent(at(5))).toBe(ev);
    expect(activeEvent(at(7))).toBe(ev);
    expect(activeEvent(at(8))).toBeNull();
    expect(eventDaysLeft(at(5))).toBe(3);
    expect(eventDaysLeft(at(7))).toBe(1);
    expect(eventDaysLeft(at(8))).toBe(0);
    expect(eventDemandPct(at(6))).toBe(200);
    expect(eventReferencePct(at(6))).toBe(100);
  });

  it("car show changes the reference only", () => {
    const g: GameState = { ...base, day: 1, event: { kind: "carShow", startDay: 1, endDay: 2 } };
    expect(eventReferencePct(g)).toBe(130);
    expect(eventDemandPct(g)).toBe(100);
  });
});

/** Plays `days` full days, recording each distinct event seen at day openings. */
function observe(seed: number, days: number): { events: ActiveEvent[]; end: GameState } {
  let g = createGame(seed, CASH, fleetOf(4, 90_00));
  const events: ActiveEvent[] = [];
  for (let d = 0; d < days; d++) {
    g = open(g);
    const e = g.event;
    const last = events[events.length - 1];
    if (e !== null && (last === undefined || last.startDay !== e.startDay)) events.push(e);
    g = advanceMinutes(g, DAY_MINUTES - 1);
  }
  return { events, end: g };
}

describe("events: random draws over many days", () => {
  const { events } = observe(42, 3000);

  it("the first event starts exactly on day 3", () => {
    expect(events[0]?.startDay).toBe(3);
  });

  it("all kinds occur, weighted by their weight", () => {
    const count = (k: EventKind): number => events.filter((e) => e.kind === k).length;
    for (const k of EVENT_KINDS) expect(count(k)).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(200);
    // weights 3 / 2 / 2 / 2 over 9
    expect(count("holidays") / events.length).toBeGreaterThan(0.25);
    expect(count("holidays") / events.length).toBeLessThan(0.42);
    for (const k of ["carShow", "strike", "storm"] as const) {
      expect(count(k) / events.length).toBeGreaterThan(0.15);
      expect(count(k) / events.length).toBeLessThan(0.3);
    }
  });

  it("durations stay inside each kind's interval, and every value is reached", () => {
    for (const k of EVENT_KINDS) {
      const spec = EVENTS[k];
      const seen = new Set<number>();
      for (const e of events.filter((x) => x.kind === k)) {
        const d = e.endDay - e.startDay;
        expect(d).toBeGreaterThanOrEqual(spec.minDays);
        expect(d).toBeLessThanOrEqual(spec.maxDays);
        seen.add(d);
      }
      expect(seen.size).toBe(spec.maxDays - spec.minDays + 1);
    }
  });

  it("never overlap, and the cooldown after an end is 4 to 9 days", () => {
    const gaps = new Set<number>();
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1] as ActiveEvent;
      const cur = events[i] as ActiveEvent;
      expect(cur.startDay).toBeGreaterThanOrEqual(prev.endDay);
      const gap = cur.startDay - prev.endDay;
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(9);
      gaps.add(gap);
    }
    expect(gaps.size).toBe(6);
  });

  it("is deterministic: same seed, same events; another seed differs", () => {
    expect(observe(42, 200).events).toEqual(events.filter((e) => e.startDay < 200));
    expect(observe(43, 200).events).not.toEqual(observe(42, 200).events);
  });
});

describe("events: lifecycle at the day opening", () => {
  const g0 = createGame(7, CASH, fleetOf(5, 90_00));

  it("no event before nextEventDay", () => {
    let g = g0;
    for (let d = 0; d < 3; d++) {
      g = open(g);
      expect(g.event).toBeNull();
      g = advanceMinutes(g, DAY_MINUTES - 1);
    }
    g = open(g); // day 3
    expect(g.day).toBe(3);
    expect(g.event).not.toBeNull();
  });

  it("a finished event is cleared at the opening of endDay and the cooldown is drawn", () => {
    const g = open(withEvent(g0, { kind: "storm", startDay: 9, endDay: 10 }, 10));
    expect(g.event).toBeNull();
    expect(g.nextEventDay).toBeGreaterThanOrEqual(14);
    expect(g.nextEventDay).toBeLessThanOrEqual(19);
  });

  it("an event is not touched while it runs", () => {
    const ev: ActiveEvent = { kind: "holidays", startDay: 10, endDay: 13 };
    const g = open(withEvent(g0, ev, 11));
    expect(g.event).toBe(ev);
    expect(g.nextEventDay).toBe(NEVER);
  });

  it("never clears and draws on the same day (cooldown is at least 4)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = open(
        withEvent(
          createGame(seed, CASH, fleetOf(2, 90_00)),
          {
            kind: "storm",
            startDay: 4,
            endDay: 5,
          },
          5,
        ),
      );
      expect(g.event).toBeNull();
    }
  });

  it("a loaded game that is long overdue draws one event, not several", () => {
    const g = open({ ...g0, day: 40, nextEventDay: 3, lastDay: { revenue: 0, costs: 0 } });
    expect(g.event?.startDay).toBe(40);
  });

  it("a 1-minute split gives the same state as one big call", () => {
    let a = g0;
    let b = g0;
    for (let d = 0; d < 40; d++) {
      a = tick(a);
      for (let m = 0; m < DAY_MINUTES; m++) b = advanceMinutes(b, 1);
    }
    expect(b).toEqual(a);
    expect(a.event !== null || a.nextEventDay > 0).toBe(true);
  });
});

describe("events: effects", () => {
  const fleet = fleetOf(20, 90_00);

  /** Customers drawn on the opening of `day`, for several seeds. */
  function customers(kind: EventKind | null, seed: number): number {
    const g = createGame(seed, CASH, fleet);
    const e: ActiveEvent | null = kind === null ? null : { kind, startDay: 10, endDay: 11 };
    return open(withEvent(g, e, 10)).customersLeft;
  }

  // Opening the day also lets car 0 depart (minute 0), which takes one customer: hence the +1.
  it("demand: round(base * pct / 100) for every kind and seed", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame(seed, CASH, fleet);
      const quiet = open(withEvent(g, null, 10));
      const base = quiet.customersLeft + 1; // car 0 departs at minute 0 and takes one
      for (const kind of EVENT_KINDS) {
        const ev = open(withEvent(g, { kind, startDay: 10, endDay: 11 }, 10));
        const expected = Math.round((base * EVENTS[kind].demandPct) / 100);
        // the same rng stream is used, so the base is identical
        expect(ev.customersLeft + 1).toBe(expected);
      }
    }
  });

  it("holidays draw more customers than no event, storm fewer, strike in between", () => {
    let none = 0;
    let holidays = 0;
    let strike = 0;
    let storm = 0;
    let show = 0;
    for (let seed = 1; seed <= 40; seed++) {
      none += customers(null, seed);
      holidays += customers("holidays", seed);
      strike += customers("strike", seed);
      storm += customers("storm", seed);
      show += customers("carShow", seed);
    }
    expect(holidays).toBeGreaterThan(none * 1.8);
    expect(strike).toBeGreaterThan(none * 1.3);
    expect(strike).toBeLessThan(holidays);
    expect(storm).toBeLessThan(none * 0.5);
    expect(show).toBe(none);
  });

  it("the effect stops after the event: day endDay is back to normal", () => {
    const g = createGame(3, CASH, fleet);
    const ev: ActiveEvent = { kind: "holidays", startDay: 10, endDay: 11 };
    const during = open(withEvent(g, ev, 10)).customersLeft;
    // On day 11 the event is cleared first; compare with a state that never had one.
    const after = open({ ...g, day: 11, event: ev, nextEventDay: NEVER });
    expect(after.event).toBeNull();
    expect(during).toBeGreaterThan(after.customersLeft);
  });

  it("car show: overpriced cars rent more often than without", () => {
    // 135,00 is 1.5x the 90,00 reference: 40 % acceptance, about 62 % with +30 % reference.
    const play = (ev: ActiveEvent | null): number => {
      let g = withEvent(createGame(11, CASH, fleetOf(20, 135_00)), ev, 0);
      let rented = 0;
      for (let d = 0; d < 150; d++) {
        g = tick(g);
        rented += g.fleet.filter((c) => c.rented).length;
      }
      return rented;
    };
    const show = play({ kind: "carShow", startDay: 0, endDay: 10_000 });
    const plain = play(null);
    expect(show).toBeGreaterThan(plain * 1.2);
  });

  it("car show: a car at twice the reference, never rentable alone, becomes rentable", () => {
    const play = (ev: ActiveEvent | null): number => {
      let g = withEvent(createGame(5, CASH, fleetOf(20, 180_00)), ev, 0);
      let rented = 0;
      for (let d = 0; d < 100; d++) {
        g = tick(g);
        rented += g.fleet.filter((c) => c.rented).length;
      }
      return rented;
    };
    expect(play(null)).toBe(0);
    expect(play({ kind: "carShow", startDay: 0, endDay: 10_000 })).toBeGreaterThan(0);
  });

  it("holidays raise revenue, storm lowers it", () => {
    const revenue = (kind: EventKind | null): number => {
      const ev = kind === null ? null : { kind, startDay: 0, endDay: 10_000 };
      let g = withEvent(createGame(21, CASH, fleetOf(10, 90_00, 0)), ev, 0);
      const start = g.cash;
      for (let d = 0; d < 120; d++) g = tick(g);
      return g.cash - start;
    };
    const none = revenue(null);
    expect(revenue("holidays")).toBeGreaterThan(none);
    expect(revenue("storm")).toBeLessThan(none);
  });
});

describe("events: save", () => {
  const played = (): GameState => {
    let g = createGame(9, CASH, fleetOf(3, 90_00));
    for (let d = 0; d < 6; d++) g = tick(g);
    return open(g);
  };

  it("is at version 9", () => {
    expect(GAME_STATE_VERSION).toBe(9);
  });

  it("round-trips a state with and without an active event", () => {
    const none = played();
    expect(validateGameState(json(none))).toEqual(none);
    const g = withEvent(none, { kind: "strike", startDay: none.day, endDay: none.day + 2 });
    expect(restoreGameState(json(g), GAME_STATE_VERSION)).toEqual(g);
  });

  it("migrates v8: no event, first one in 3 days", () => {
    const g = played();
    const v8 = json(g);
    delete v8["event"];
    delete v8["nextEventDay"];
    const out = restoreGameState(v8, 8);
    expect(out.event).toBeNull();
    expect(out.nextEventDay).toBe(g.day + 3);
    expect(out.cash).toBe(g.cash);
  });

  it("migrates from older versions too", () => {
    const v8 = json(createGame(1, CASH));
    delete v8["event"];
    delete v8["nextEventDay"];
    expect(restoreGameState(v8, 8).nextEventDay).toBe(3);
  });

  it("a v9 save without the new fields is rejected", () => {
    const a = json(played());
    delete a["event"];
    expect(() => validateGameState(a)).toThrow(InvalidGameStateError);
    const b = json(played());
    delete b["nextEventDay"];
    expect(() => validateGameState(b)).toThrow(InvalidGameStateError);
  });

  const withPatch = (patch: Record<string, unknown>): Record<string, unknown> => {
    const s = json(played());
    s["event"] = { kind: "storm", startDay: 6, endDay: 7, ...patch };
    return s;
  };

  it.each([
    ["kind", "flood"],
    ["kind", "__proto__"],
    ["kind", 3],
    ["kind", null],
    ["startDay", -1],
    ["startDay", 1.5],
    ["startDay", NaN],
    ["startDay", "6"],
    ["endDay", -1],
    ["endDay", 2 ** 53],
    ["endDay", Infinity],
    ["endDay", 5], // before startDay
  ])("rejects event.%s = %s", (key, value) => {
    expect(() => validateGameState(withPatch({ [key]: value }))).toThrow(InvalidGameStateError);
  });

  it.each([5, "x", true, [], [1]])("rejects event = %s", (bad) => {
    const s = json(played());
    s["event"] = bad;
    expect(() => validateGameState(s)).toThrow(InvalidGameStateError);
  });

  it("accepts an empty event (startDay = endDay) and every kind", () => {
    for (const kind of EVENT_KINDS) {
      expect(validateGameState(withPatch({ kind, endDay: 6 })).event?.kind).toBe(kind);
    }
  });

  it.each([-1, 1.5, NaN, Infinity, 2 ** 53, "3", null, undefined])(
    "rejects nextEventDay = %s",
    (bad) => {
      const s = json(played());
      s["nextEventDay"] = bad;
      expect(() => validateGameState(s)).toThrow(InvalidGameStateError);
      expect(() => validateGameState({ ...played(), nextEventDay: bad })).toThrow(
        InvalidGameStateError,
      );
    },
  );

  it("accepts a customersLeft that holidays can produce", () => {
    const s = json(played());
    s["customersLeft"] = 2 * 91;
    expect(validateGameState(s).customersLeft).toBe(182);
    s["customersLeft"] = 183;
    expect(() => validateGameState(s)).toThrow(InvalidGameStateError);
  });
});
