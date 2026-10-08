import { carAssetKey, type CarAssetKey } from "./assets";

/**
 * Scene colours. Read from the CSS tokens in styles/tokens.css; FALLBACK_PALETTE is used when a
 * token is missing or unparsable. This is the only file outside tokens.css allowed to hold raw hex.
 * Colours are 0xRRGGBB numbers (what three.js expects).
 */

export type PaletteKey =
  "grass" | "lot" | "lotLine" | "rentedDot" | "highlight" | "signBg" | "signText";

export type Palette = Readonly<Record<PaletteKey, number>>;

/** Palette key -> CSS custom property. A test keeps this in sync with tokens.css. */
export const PALETTE_TOKENS: Readonly<Record<PaletteKey, string>> = Object.freeze({
  grass: "--c-grass",
  lot: "--c-road",
  lotLine: "--c-on-dark",
  rentedDot: "--c-money-on-dark",
  highlight: "--c-on-dark",
  signBg: "--c-accent",
  signText: "--c-on-dark",
});

export const FALLBACK_PALETTE: Palette = Object.freeze({
  grass: 0x81b29a,
  lot: 0x3d405b,
  lotLine: 0xffffff,
  rentedDot: 0x6fd07a,
  highlight: 0xffffff,
  signBg: 0xe07a5f,
  signText: 0xffffff,
});

/** Purely 3D colours (light and sky), not tied to a CSS token. */
export const SCENE_COLORS: Readonly<{
  sky: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
}> = Object.freeze({
  sky: 0xbfe3f2,
  sun: 0xfff1d6,
  hemiSky: 0xcfe8ff,
  hemiGround: 0x9bb07a,
});

/** Body tints per model, picked by car id. Every list is non-empty. */
export const CAR_TINTS: Readonly<Record<CarAssetKey, readonly number[]>> = Object.freeze({
  used: Object.freeze([0x9c8f7a, 0x7d8a8f, 0xa89f91, 0x8c7b6b]),
  compact: Object.freeze([0xe07a5f, 0xf2cc8f, 0x3d9bd1, 0xffffff, 0x81b29a]),
  hybrid: Object.freeze([0xf7f7f2, 0x2f4b7c, 0x1f7a6d, 0x3a3a3a]),
  unknown: Object.freeze([0xb0b0b0]),
});

/** Parses "#rgb" or "#rrggbb". Returns null for anything else. */
export function parseHexColor(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m || m[1] === undefined) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return parseInt(hex, 16);
}

/** Returns the raw value of a CSS custom property (e.g. via getComputedStyle), or "" if unknown. */
export type CssVarReader = (name: string) => string;

export function readPalette(read?: CssVarReader): Palette {
  const out: Record<string, number> = { ...FALLBACK_PALETTE };
  if (!read) return out as unknown as Palette;
  for (const key of Object.keys(PALETTE_TOKENS) as PaletteKey[]) {
    let parsed: number | null;
    try {
      parsed = parseHexColor(read(PALETTE_TOKENS[key]));
    } catch {
      parsed = null;
    }
    if (parsed !== null) out[key] = parsed;
  }
  return Object.freeze(out) as unknown as Palette;
}

/**
 * Body tint of a car: CAR_TINTS[model][id mod n]. Stable per car (depends only on model and id).
 * Unknown model -> neutral; an unsafe id (NaN, float, huge, non-number) -> the first tint.
 */
export function carTint(model: unknown, carId: unknown): number {
  const tints = CAR_TINTS[carAssetKey(model)];
  const first = tints[0] ?? 0xb0b0b0;
  if (typeof carId !== "number" || !Number.isSafeInteger(carId)) return first;
  const n = tints.length;
  return tints[((carId % n) + n) % n] ?? first;
}
