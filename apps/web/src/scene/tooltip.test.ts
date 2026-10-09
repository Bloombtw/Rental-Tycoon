import { describe, expect, it } from "vitest";
import { departureMinute, returnMinute, type Car } from "@rt/sim";
import { formatCents } from "../format.js";
import { carTooltip } from "./tooltip.js";

const car = (over: Partial<Car> = {}): Car => ({
  id: 7,
  model: "compact",
  dailyPrice: 60_00,
  dailyCost: 25_00,
  rented: true,
  ...over,
});
const junk = (s: string) => /NaN|undefined|\[object|Infinity|null/.test(s);
const all = (t: ReturnType<typeof carTooltip>) => `${t.title}|${t.status}|${t.price}`;

describe("carTooltip", () => {
  it("title with a model label, price per day", () => {
    const t = carTooltip(car(), 3, 100);
    expect(t.title).toBe("Voiture n°7 · Citadine neuve");
    expect(t.price).toBe(`Prix : ${formatCents(60_00)}/jour`);
    expect(t.rented).toBe(true);
  });

  it.each([
    ["used", "Citadine d'occasion"],
    ["hybrid", "Berline hybride"],
  ] as const)("model %s -> label", (model, label) => {
    expect(carTooltip(car({ model }), 0, 0).title).toBe(`Voiture n°7 · ${label}`);
  });

  it("no model: title without a label (createGame fixtures)", () => {
    const bare: Car = { id: 7, dailyPrice: 60_00, dailyCost: 25_00, rented: true };
    expect(carTooltip(bare, 0, 0).title).toBe("Voiture n°7");
  });

  it.each(["truck", "__proto__", "constructor", "toString", "", 3, null, {}, []])(
    "unknown model %j -> no label, no junk",
    (model) => {
      const t = carTooltip(car({ model } as unknown as Partial<Car>), 0, 0);
      expect(t.title).toBe("Voiture n°7");
    },
  );

  it("in rental from departure to return: 'En location, retour à HH:MM'", () => {
    const i = 3; // dep 6, ret 606 = 19:06
    const d = departureMinute(i) as number;
    const r = returnMinute(i) as number;
    for (const t of [d, d + 10, 300, r - 0.01]) {
      expect(carTooltip(car(), i, t).status).toBe("En location, retour à 19:06");
    }
    expect(r).toBe(606);
  });

  it("the return time follows the index: car 0 back at 19:00, car 49 at 20:38", () => {
    expect(carTooltip(car(), 0, 50).status).toBe("En location, retour à 19:00");
    expect(carTooltip(car(), 49, 200).status).toBe("En location, retour à 20:38");
  });

  it("before its slot a rented-yesterday car is just parked", () => {
    expect(carTooltip(car(), 3, 5.99).status).toBe("Au parking");
    expect(carTooltip(car(), 3, 6).status).not.toBe("Au parking");
  });

  it("after returning: parked, rented today", () => {
    expect(carTooltip(car(), 3, 606).status).toBe("Au parking (louée aujourd'hui)");
    expect(carTooltip(car(), 3, 719.9).status).toBe("Au parking (louée aujourd'hui)");
  });

  it("a car that is not rented is simply parked, at any time", () => {
    for (const t of [0, 100, 400, 719]) {
      const r = carTooltip(car({ rented: false }), 3, t);
      expect(r.status).toBe("Au parking");
      expect(r.rented).toBe(false);
    }
  });

  it("an index with no slot (corrupt fleet, >= 50) never says it is rented out", () => {
    for (const i of [50, 99, -1, 1.5, NaN]) {
      expect(carTooltip(car(), i, 300).status).not.toContain("En location");
    }
  });

  it.each([NaN, Infinity, -Infinity, undefined, null, "x"])("hostile time %s: no junk", (t) => {
    expect(junk(all(carTooltip(car(), 2, t as number)))).toBe(false);
  });

  it("corrupt car fields never print NaN or undefined", () => {
    const bad = [
      car({ id: NaN }),
      car({ id: Infinity }),
      car({ id: 1.5 }),
      car({ dailyPrice: NaN }),
      car({ dailyPrice: Infinity }),
      car({ dailyPrice: -Infinity }),
      car({ dailyPrice: undefined as unknown as number }),
      car({ rented: "yes" as unknown as boolean }),
      car({ rented: undefined as unknown as boolean }),
    ];
    for (const c of bad) {
      for (const i of [0, 25, 49, 60, NaN]) {
        expect(junk(all(carTooltip(c, i, 120)))).toBe(false);
      }
    }
  });

  it("only rented === true counts as rented (truthy strings do not)", () => {
    expect(carTooltip(car({ rented: "true" as unknown as boolean }), 0, 100).status).toBe(
      "Au parking",
    );
  });

  it("a huge price is formatted, not exponential", () => {
    const t = carTooltip(car({ dailyPrice: Number.MAX_SAFE_INTEGER }), 0, 0);
    expect(t.price).not.toMatch(/e\+/);
  });

  it("does not mutate a frozen car", () => {
    expect(() => carTooltip(Object.freeze(car()), 0, 1)).not.toThrow();
  });
});

describe("carTooltip: breakdown (resale-wear.md)", () => {
  it("a parked broken car says so, from the outcome or the flag", () => {
    expect(carTooltip(car({ rented: false, outcome: "broken" }), 0, 100).status).toBe(
      "Au parking · en panne",
    );
    expect(carTooltip(car({ rented: false, broken: true }), 0, 100).status).toBe(
      "Au parking · en panne",
    );
  });

  it("a repaired car is no longer reported as broken", () => {
    const t = carTooltip(car({ rented: false, broken: false, outcome: "broken" }), 0, 100);
    expect(t.status).toBe("Au parking");
    expect(junk(all(t))).toBe(false);
  });
});
