import { describe, expect, it } from "vitest";
import * as paletteModule from "./palette";
import {
  CAR_TINTS,
  FALLBACK_PALETTE,
  FAR_TINTS,
  PALETTE_TOKENS,
  SCENE_COLORS,
  carTint,
  parseHexColor,
  readPalette,
  type PaletteKey,
} from "./palette";

const KEYS = Object.keys(PALETTE_TOKENS) as PaletteKey[];
const isColor = (c: unknown) =>
  typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 0xffffff;

describe("palette keys (tokens.css sync lives in palette-tokens.test.ts)", () => {
  it("maps exactly the 7 spec keys to the spec tokens", () => {
    expect(PALETTE_TOKENS).toEqual({
      grass: "--c-grass",
      lot: "--c-road",
      lotLine: "--c-on-dark",
      rentedDot: "--c-money-on-dark",
      highlight: "--c-on-dark",
      signBg: "--c-accent",
      signText: "--c-on-dark",
    });
    expect(Object.keys(FALLBACK_PALETTE).sort()).toEqual([...KEYS].sort());
  });

  it("every colour is an integer in 0..0xffffff", () => {
    for (const k of KEYS) expect(isColor(FALLBACK_PALETTE[k])).toBe(true);
  });

  it("the old 2D keys and carColor are gone", () => {
    expect("carColor" in paletteModule).toBe(false);
    for (const gone of ["ground", "road", "building", "carUsed", "carHybrid", "windshield"]) {
      expect(gone in FALLBACK_PALETTE).toBe(false);
      expect(gone in PALETTE_TOKENS).toBe(false);
    }
  });
});

describe("parseHexColor", () => {
  it.each([
    ["#fff", 0xffffff],
    ["#FFF", 0xffffff],
    ["#abc", 0xaabbcc],
    ["#000000", 0],
    ["#E07A5F", 0xe07a5f],
    ["  #2b2d42 ", 0x2b2d42],
  ])("%s -> %s", (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "#",
    "#12",
    "#1234",
    "#12345",
    "#1234567",
    "#ffffffff",
    "ffffff",
    "0xffffff",
    "#ggg",
    "#12 345",
    "rgb(1,2,3)",
    "red",
    "var(--c-sand)",
    "#fff; color: red",
    "<script>",
    "'; DROP TABLE x;--",
    "💥",
    "#🙂🙂🙂",
    "x".repeat(10_000),
    "#" + "f".repeat(10_000),
    null,
    undefined,
    NaN,
    123,
    {},
    [],
    ["#fff"],
    true,
  ])("rejects %j", (input) => {
    expect(parseHexColor(input)).toBeNull();
  });
});

describe("readPalette", () => {
  it("without a reader returns the fallback values", () => {
    expect(readPalette()).toEqual(FALLBACK_PALETTE);
  });

  it("reads each key from its token", () => {
    const asked: string[] = [];
    const p = readPalette((name) => {
      asked.push(name);
      return "#010203";
    });
    expect(Object.values(p).every((v) => v === 0x010203)).toBe(true);
    expect(new Set(asked)).toEqual(new Set(Object.values(PALETTE_TOKENS)));
  });

  it("falls back per key, not globally", () => {
    const p = readPalette((name) => (name === "--c-grass" ? "#112233" : ""));
    expect(p.grass).toBe(0x112233);
    expect(p.lot).toBe(FALLBACK_PALETTE.lot);
    expect(p.signBg).toBe(FALLBACK_PALETTE.signBg);
  });

  it("keys sharing a token move together", () => {
    const p = readPalette((name) => (name === "--c-on-dark" ? "#0a0b0c" : ""));
    expect(p.lotLine).toBe(0x0a0b0c);
    expect(p.highlight).toBe(0x0a0b0c);
    expect(p.signText).toBe(0x0a0b0c);
  });

  it("a reader that throws everywhere gives the fallback", () => {
    expect(
      readPalette(() => {
        throw new Error("boom");
      }),
    ).toEqual(FALLBACK_PALETTE);
  });

  it("a reader that throws for one token only affects that key", () => {
    const p = readPalette((name) => {
      if (name === "--c-road") throw new Error("boom");
      return "#000";
    });
    expect(p.lot).toBe(FALLBACK_PALETTE.lot);
    expect(p.grass).toBe(0);
  });

  it("a hostile reader returning non-strings or junk never leaks NaN/undefined", () => {
    const junk: unknown[] = [undefined, null, NaN, 5, {}, [], "red", "#zzz", "x".repeat(10_000)];
    for (const j of junk) {
      const p = readPalette(() => j as string);
      for (const k of KEYS) expect(p[k]).toBe(FALLBACK_PALETTE[k]);
    }
  });

  it("a reader returning a throwing object (toString/trim) does not crash", () => {
    const evil = {
      toString(): string {
        throw new Error("x");
      },
      trim(): string {
        throw new Error("y");
      },
    };
    expect(() => readPalette(() => evil as unknown as string)).not.toThrow();
  });

  it("never mutates the shared fallback and returns all valid colours", () => {
    const before = { ...FALLBACK_PALETTE };
    const p = readPalette((n) => (n.length % 2 ? "#abcdef" : "bad"));
    expect(FALLBACK_PALETTE).toEqual(before);
    expect(p).not.toBe(FALLBACK_PALETTE);
    expect(Object.keys(p).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) expect(isColor(p[k])).toBe(true);
  });
});

describe("SCENE_COLORS", () => {
  it("has the city-life 3D-only colours, all valid; sky and sun moved to LIGHT_COLORS", () => {
    expect(Object.keys(SCENE_COLORS).sort()).toEqual(
      [
        "constructionGround",
        "headlight",
        "lampGlow",
        "taillight",
        "treeLeaves",
        "treeTrunk",
      ].sort(),
    );
    for (const gone of ["sky", "sun", "hemiSky", "hemiGround"])
      expect(gone in SCENE_COLORS).toBe(false);
    for (const [k, c] of Object.entries(SCENE_COLORS)) {
      if (Array.isArray(c)) {
        expect(c.length, k).toBeGreaterThanOrEqual(3);
        for (const v of c) expect(isColor(v), k).toBe(true);
      } else expect(isColor(c), k).toBe(true);
    }
  });

  it("FAR_TINTS are warm, valid and not all the same", () => {
    expect(FAR_TINTS.length).toBeGreaterThanOrEqual(3);
    for (const c of FAR_TINTS) expect(isColor(c)).toBe(true);
    expect(new Set(FAR_TINTS).size).toBe(FAR_TINTS.length);
    for (const c of FAR_TINTS) expect((c >> 16) & 255).toBeGreaterThan(c & 255); // red above blue
  });
});

describe("CAR_TINTS", () => {
  it("follows the spec 2.7 table", () => {
    expect(CAR_TINTS.used).toEqual([0x9c8f7a, 0x7d8a8f, 0xa89f91, 0x8c7b6b]);
    expect(CAR_TINTS.compact).toEqual([0xe07a5f, 0xf2cc8f, 0x3d9bd1, 0xffffff, 0x81b29a]);
    expect(CAR_TINTS.hybrid).toEqual([0xf7f7f2, 0x2f4b7c, 0x1f7a6d, 0x3a3a3a]);
    expect(CAR_TINTS.unknown).toEqual([0xb0b0b0]);
  });

  it("every list is non-empty and holds valid colours", () => {
    expect(Object.keys(CAR_TINTS).sort()).toEqual(["compact", "hybrid", "unknown", "used"]);
    for (const list of Object.values(CAR_TINTS)) {
      expect(list.length).toBeGreaterThan(0);
      for (const c of list) expect(isColor(c)).toBe(true);
    }
  });
});

describe("carTint", () => {
  it("picks CAR_TINTS[model][id mod n]", () => {
    for (const model of ["used", "compact", "hybrid"] as const) {
      const list = CAR_TINTS[model];
      for (let id = 0; id < 40; id++) expect(carTint(model, id)).toBe(list[id % list.length]);
    }
  });

  it("is stable: the same car always gets the same tint", () => {
    for (const model of ["used", "compact", "hybrid", "weird"]) {
      for (const id of [0, 1, 7, 99, 12345]) expect(carTint(model, id)).toBe(carTint(model, id));
    }
  });

  it("same-model cars with different ids can differ", () => {
    for (const model of ["used", "compact", "hybrid"] as const) {
      const seen = new Set<number>();
      for (let id = 0; id < CAR_TINTS[model].length; id++) seen.add(carTint(model, id));
      expect(seen.size).toBe(new Set(CAR_TINTS[model]).size);
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it.each([
    undefined,
    null,
    "",
    "Used",
    "__proto__",
    "constructor",
    "toString",
    1,
    NaN,
    {},
    [],
    ["used"],
  ])("unknown model %j gets the neutral tint whatever the id", (model) => {
    for (const id of [0, 1, 2, 5, "x", NaN]) expect(carTint(model, id)).toBe(0xb0b0b0);
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
    2 ** 53,
    1e300,
    "3",
    "",
    null,
    undefined,
    {},
    [],
    [3],
    true,
    0.5,
    2.5,
  ])("unsafe id %j gives the first tint", (id) => {
    for (const model of ["used", "compact", "hybrid"] as const) {
      expect(carTint(model, id)).toBe(CAR_TINTS[model][0]);
    }
  });

  it.each([-1, -7, -(2 ** 31), Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, -0])(
    "extreme safe id %s still gives one of the model's tints",
    (id) => {
      for (const model of ["used", "compact", "hybrid"] as const) {
        expect(CAR_TINTS[model]).toContain(carTint(model, id));
      }
    },
  );

  it("always returns a valid colour, never NaN or undefined", () => {
    const models: unknown[] = ["used", "compact", "hybrid", "x", null, 5, {}];
    const ids: unknown[] = [0, 1, -1, 3.3, NaN, "a", null, undefined, 2 ** 60, {}];
    for (const m of models) for (const i of ids) expect(isColor(carTint(m, i))).toBe(true);
  });
});
