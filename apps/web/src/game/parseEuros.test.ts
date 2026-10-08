import { describe, expect, it } from "vitest";
import { MAX_CAR_DAILY_PRICE } from "@rt/sim";
import { formatCentsForInput, parseEurosToCents } from "./parseEuros.js";

const asString = (v: unknown): string => v as string;

describe("parseEurosToCents", () => {
  it.each([
    ["0", 0],
    ["60", 60_00],
    ["89,9", 89_90],
    ["89.90", 89_90],
    [" 150 ", 150_00],
    ["007,50", 7_50],
    ["1000", 1_000_00],
    ["0,01", 1],
    ["0.5", 50],
    ["\t12\n", 12_00],
    ["000", 0],
    ["0,00", 0],
    ["99,99", 99_99],
  ])("valid %j -> %i", (input, cents) => {
    expect(parseEurosToCents(input)).toEqual({ ok: true, cents });
  });

  it("has no float error: 0,07 / 1,15 / 19,99 / 8,2", () => {
    expect(parseEurosToCents("0,07")).toEqual({ ok: true, cents: 7 });
    expect(parseEurosToCents("1,15")).toEqual({ ok: true, cents: 1_15 });
    expect(parseEurosToCents("19,99")).toEqual({ ok: true, cents: 19_99 });
    expect(parseEurosToCents("8,2")).toEqual({ ok: true, cents: 8_20 });
  });

  const FORMAT: readonly string[] = [
    "",
    "  ",
    "abc",
    "-5",
    "+5",
    "1e3",
    "1E3",
    "1 000",
    "12,345",
    "1.234",
    "12,",
    ",5",
    ".5",
    "NaN",
    "Infinity",
    "12345678",
    "0x10",
    "0b1",
    "1,5,0",
    "1.5.0",
    "1,.5",
    "1..5",
    "--5",
    "5-",
    "٣٤", // Arabic-indic digits
    "١٢٣",
    "１２３", // full-width digits
    "∞",
    "🚗",
    "12€",
    "12 €",
    "<script>alert(1)</script>",
    "1; DROP TABLE cars",
    "12\n34",
    "12\0",
    "​12", // zero width space is not trimmed
    "1_000",
    "0,",
    "9".repeat(10_000),
    "1".repeat(8),
    "0".repeat(8),
    "1,5 ",
  ].filter((s) => s !== "1,5 ");

  it.each(FORMAT.map((s) => [s.length > 40 ? `${s.slice(0, 20)}...(${s.length})` : s, s] as const))(
    "format error for %j",
    (_label, input) => {
      expect(parseEurosToCents(input)).toEqual({ ok: false, reason: "format" });
    },
  );

  it("range errors", () => {
    expect(parseEurosToCents("1000,01")).toEqual({ ok: false, reason: "range" });
    expect(parseEurosToCents("9999999")).toEqual({ ok: false, reason: "range" });
    expect(parseEurosToCents("1001")).toEqual({ ok: false, reason: "range" });
    expect(parseEurosToCents("9999999,99")).toEqual({ ok: false, reason: "range" });
  });

  it("boundary: MAX_CAR_DAILY_PRICE accepted, +1 cent rejected", () => {
    const max = formatCentsForInput(MAX_CAR_DAILY_PRICE);
    expect(parseEurosToCents(max)).toEqual({ ok: true, cents: MAX_CAR_DAILY_PRICE });
    const over = formatCentsForInput(MAX_CAR_DAILY_PRICE + 1);
    expect(parseEurosToCents(over)).toEqual({ ok: false, reason: "range" });
    expect(parseEurosToCents(formatCentsForInput(MAX_CAR_DAILY_PRICE - 1))).toEqual({
      ok: true,
      cents: MAX_CAR_DAILY_PRICE - 1,
    });
  });

  it("non-string input never throws and is a format error", () => {
    for (const v of [null, undefined, 5, NaN, {}, [], 1n, Symbol("x")]) {
      const r = parseEurosToCents(asString(v));
      expect(r).toEqual({ ok: false, reason: "format" });
    }
  });

  it("never ok:true with a non-safe-integer or out-of-range cents (sweep)", () => {
    const seeds = ["0", "1", "9", ",", ".", "e", "-", " ", "x", "00", "99", "٣"];
    let count = 0;
    const walk = (prefix: string, depth: number): void => {
      const r = parseEurosToCents(prefix);
      count++;
      if (r.ok) {
        expect(Number.isSafeInteger(r.cents)).toBe(true);
        expect(r.cents).toBeGreaterThanOrEqual(0);
        expect(r.cents).toBeLessThanOrEqual(MAX_CAR_DAILY_PRICE);
        expect(Object.is(r.cents, -0)).toBe(false);
      }
      if (depth === 0) return;
      for (const s of seeds) walk(prefix + s, depth - 1);
    };
    walk("", 4);
    expect(count).toBeGreaterThan(1000);
  });

  it("parse(formatCentsForInput(x)) round-trips for all valid prices (sample)", () => {
    for (let c = 0; c <= MAX_CAR_DAILY_PRICE; c += 37) {
      expect(parseEurosToCents(formatCentsForInput(c))).toEqual({ ok: true, cents: c });
    }
  });
});

describe("formatCentsForInput", () => {
  it("formats", () => {
    expect(formatCentsForInput(60_00)).toBe("60,00");
    expect(formatCentsForInput(0)).toBe("0,00");
    expect(formatCentsForInput(1)).toBe("0,01");
    expect(formatCentsForInput(10)).toBe("0,10");
    expect(formatCentsForInput(1_000_00)).toBe("1000,00");
  });

  it("returns an empty string for non-safe-integers and negatives", () => {
    for (const v of [NaN, Infinity, -Infinity, 1.5, 2 ** 53, -1]) {
      expect(formatCentsForInput(v)).toBe("");
    }
  });

  it("-0 formats as 0,00 (no minus sign)", () => {
    expect(formatCentsForInput(-0)).toBe("0,00");
  });
});
