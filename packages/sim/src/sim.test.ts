import { describe, expect, it } from "vitest";
import { createGame, createRng, tick } from "./index.js";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next));
  });

  it("rejects absurd ranges", () => {
    expect(() => createRng(1).int(5, 1)).toThrow(RangeError);
    expect(() => createRng(1).int(0.5, 3)).toThrow(RangeError);
  });
});

describe("game", () => {
  it("rejects invalid starting cash", () => {
    expect(() => createGame(1, -1)).toThrow(RangeError);
    expect(() => createGame(1, 10.5)).toThrow(RangeError);
    expect(() => createGame(Number.NaN)).toThrow(RangeError);
  });

  it("advances one day per tick without mutating input", () => {
    const g = createGame(7);
    const next = tick(g);
    expect(next.day).toBe(1);
    expect(g.day).toBe(0);
  });
});
