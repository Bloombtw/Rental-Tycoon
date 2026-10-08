/// <reference types="node" />
// Vitest blanks CSS imports (`?raw` returns ""), so tokens.css is read from disk here.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_PALETTE,
  PALETTE_TOKENS,
  parseHexColor,
  readPalette,
  type PaletteKey,
} from "./palette";

const path = ["apps/web/src/styles/tokens.css", "src/styles/tokens.css"].find((p) => existsSync(p));
const css = path ? readFileSync(path, "utf8") : "";
const KEYS = Object.keys(PALETTE_TOKENS) as PaletteKey[];

function tokenValue(name: string): string {
  return new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\s*;`).exec(css)?.[1] ?? "";
}

describe("palette sync with tokens.css", () => {
  it("tokens.css is readable", () => {
    expect(css.length).toBeGreaterThan(100);
  });

  it.each(KEYS)("%s fallback equals its CSS token", (key) => {
    const raw = tokenValue(PALETTE_TOKENS[key]);
    expect(raw, `${PALETTE_TOKENS[key]} missing from tokens.css`).not.toBe("");
    expect(FALLBACK_PALETTE[key]).toBe(parseHexColor(raw));
  });

  it("reading the real tokens reproduces the fallback palette", () => {
    expect(readPalette((name) => tokenValue(name))).toEqual(FALLBACK_PALETTE);
  });
});

describe("no raw hex colour outside palette.ts (acceptance 20)", () => {
  const dir = ["apps/web/src", "src"].find((p) => existsSync(`${p}/scene`)) ?? "";
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
    );
  const sources = dir
    ? walk(dir).filter(
        (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith("scene/palette.ts"),
      )
    : [];

  it("finds the sources", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it("no component or scene file holds a hex literal", () => {
    const offenders = sources.filter((f) =>
      /(?:0x[0-9a-fA-F]{6}\b|["'`]#[0-9a-fA-F]{3,8}["'`])/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
