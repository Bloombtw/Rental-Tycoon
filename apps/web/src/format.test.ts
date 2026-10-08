import { describe, expect, it } from "vitest";
import { formatCents } from "./format.js";

describe("formatCents", () => {
  it("formats euros", () => {
    expect(formatCents(123_45).replace(/\s/g, " ")).toBe("123,45 €");
  });
  it("never renders NaN or Infinity", () => {
    expect(formatCents(Number.NaN)).toBe("—");
    expect(formatCents(Infinity)).toBe("—");
  });
});
