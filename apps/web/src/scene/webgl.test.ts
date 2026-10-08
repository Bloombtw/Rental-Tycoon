import { afterEach, describe, expect, it, vi } from "vitest";
import { detectWebGL } from "./webgl";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ctx = {};

describe("detectWebGL", () => {
  it("true when webgl2 is available (webgl is not even asked)", () => {
    const asked: string[] = [];
    const ok = detectWebGL(() => ({
      getContext: (id: string) => {
        asked.push(id);
        return id === "webgl2" ? ctx : null;
      },
    }));
    expect(ok).toBe(true);
    expect(asked).toEqual(["webgl2"]);
  });

  it("falls back to webgl when webgl2 is missing", () => {
    expect(detectWebGL(() => ({ getContext: (id: string) => (id === "webgl" ? ctx : null) }))).toBe(
      true,
    );
  });

  it("false when neither context exists (null or undefined)", () => {
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false);
    expect(detectWebGL(() => ({ getContext: () => undefined }))).toBe(false);
  });

  it("false when no canvas can be created", () => {
    expect(detectWebGL(() => null)).toBe(false);
  });

  it("false (never throws) when the factory throws", () => {
    expect(
      detectWebGL(() => {
        throw new Error("no canvas");
      }),
    ).toBe(false);
  });

  it("false (never throws) when getContext throws", () => {
    expect(
      detectWebGL(() => ({
        getContext: () => {
          throw new Error("blocked");
        },
      })),
    ).toBe(false);
  });

  it("false when there is no document (SSR / worker)", () => {
    vi.stubGlobal("document", undefined);
    expect(detectWebGL()).toBe(false);
  });

  it("jsdom has no WebGL: the default probe returns false without throwing", () => {
    expect(detectWebGL()).toBe(false);
  });

  it("a falsy-but-defined context value (0, '') is not WebGL", () => {
    expect(detectWebGL(() => ({ getContext: () => 0 }))).toBe(false);
    expect(detectWebGL(() => ({ getContext: () => "" }))).toBe(false);
  });
});
