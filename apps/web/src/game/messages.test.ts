import { describe, expect, it } from "vitest";
import {
  CAR_MODEL_IDS,
  FleetFullError,
  InsufficientCashError,
  InvalidDaysError,
  InvalidFleetError,
  InvalidPriceError,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
} from "@rt/sim";
import { formatCents } from "../format.js";
import {
  CAR_MODEL_LABELS,
  carStatusLabel,
  PRICE_FORMAT_ERROR,
  PRICE_RANGE_ERROR,
  errorMessage,
} from "./messages.js";

const GENERIC = "Une erreur inattendue est survenue : action annulée.";
const clean = (s: string): boolean => !/NaN|undefined|Infinity|\[object|null/.test(s);
const normalise = (s: string): string => s.replace(/\s/g, " ");

describe("errorMessage", () => {
  it("INSUFFICIENT_CASH", () => {
    const msg = errorMessage(new InsufficientCashError(4_000_00, 3_999_99));
    expect(msg).toBe(
      `Fonds insuffisants : il faut ${formatCents(4_000_00)}, vous avez ${formatCents(3_999_99)}.`,
    );
  });

  it("INSUFFICIENT_CASH with negative cash", () => {
    const msg = errorMessage(new InsufficientCashError(4_000_00, -5_00));
    expect(msg).toContain(formatCents(-5_00));
    expect(clean(msg)).toBe(true);
  });

  it("INSUFFICIENT_CASH with non-finite amounts shows a dash, never NaN", () => {
    const msg = errorMessage(new InsufficientCashError(NaN, Infinity));
    expect(clean(msg)).toBe(true);
    expect(msg).toContain("—");
  });

  it("FLEET_FULL", () => {
    expect(errorMessage(new FleetFullError(MAX_FLEET_SIZE))).toBe(
      `Flotte complète : ${MAX_FLEET_SIZE} voitures maximum.`,
    );
  });

  it("FLEET_FULL with a hostile maxFleetSize does not leak NaN", () => {
    expect(clean(errorMessage(new FleetFullError(NaN)))).toBe(true);
  });

  it("UNKNOWN_CAR_MODEL ignores the (hostile) model value", () => {
    for (const m of ["truck", "<b>x</b>", null, undefined, {}, Symbol("s")]) {
      expect(errorMessage(new UnknownCarModelError(m))).toBe("Modèle de voiture inconnu.");
    }
  });

  it("UNKNOWN_CAR ignores the carId value", () => {
    for (const id of [99, NaN, "<img src=x onerror=alert(1)>", null, 1n]) {
      expect(errorMessage(new UnknownCarError(id))).toBe("Cette voiture n'existe pas.");
    }
  });

  it("INVALID_PRICE uses the range constant; bounds come from the constants", () => {
    expect(errorMessage(new InvalidPriceError(NaN))).toBe(PRICE_RANGE_ERROR);
    expect(PRICE_RANGE_ERROR).toContain(formatCents(0));
    expect(PRICE_RANGE_ERROR).toContain(formatCents(MAX_CAR_DAILY_PRICE));
    expect(normalise(PRICE_RANGE_ERROR)).toBe(
      "Le prix doit être compris entre 0,00 € et 1 000,00 € par jour.",
    );
  });

  it("SIM_OVERFLOW", () => {
    for (const f of ["cash", "day", "carId"] as const) {
      expect(errorMessage(new SimOverflowError(f))).toBe(
        "La simulation a atteint une limite numérique : action annulée.",
      );
    }
  });

  it("everything else is generic: Error, string, null, undefined, other SimErrors, weird objects", () => {
    const weird = {
      get message(): string {
        throw new Error("boom");
      },
    };
    for (const e of [
      new Error("x"),
      "x",
      null,
      undefined,
      42,
      NaN,
      {},
      [],
      weird,
      Symbol("s"),
      new InvalidDaysError(5),
      new InvalidFleetError(0, "fleet"),
      new TypeError("t"),
      new RangeError("r"),
    ]) {
      expect(errorMessage(e)).toBe(GENERIC);
    }
  });

  it("a Proxy that throws on every access does not make errorMessage throw", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
        getPrototypeOf() {
          throw new Error("trap");
        },
      },
    );
    expect(() => errorMessage(hostile)).not.toThrow();
    expect(errorMessage(hostile)).toBe(GENERIC);
  });
});

describe("constants", () => {
  it("labels cover every model, in French", () => {
    expect(Object.keys(CAR_MODEL_LABELS).sort()).toEqual([...CAR_MODEL_IDS].sort());
    expect(CAR_MODEL_LABELS.used).toBe("Citadine d'occasion");
    expect(CAR_MODEL_LABELS.compact).toBe("Citadine neuve");
    expect(CAR_MODEL_LABELS.hybrid).toBe("Berline hybride");
  });

  it("inline price messages", () => {
    expect(PRICE_FORMAT_ERROR).toBe(
      "Format invalide : saisissez un montant en euros, par ex. 89,90.",
    );
  });
});

describe("carStatusLabel (random-demand.md)", () => {
  it("names the reason a car stayed at the lot", () => {
    expect(carStatusLabel({ rented: true, outcome: "rented" })).toBe("Louée");
    expect(carStatusLabel({ rented: false, outcome: "tooExpensive" })).toBe(
      "Au parking · trop cher",
    );
    expect(carStatusLabel({ rented: false, outcome: "noCustomer" })).toBe(
      "Au parking · pas de client",
    );
    expect(carStatusLabel({ rented: false })).toBe("Au parking");
    expect(carStatusLabel({ rented: false, outcome: "junk" })).toBe("Au parking");
  });
});
