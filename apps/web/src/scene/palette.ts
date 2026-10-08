import { carAssetKey, type CarAssetKey } from "./assets";
import type { LightKey } from "./lighting";

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

/** Sky, sun and hemisphere colours of each light keyframe (spec 2.4). */
export const LIGHT_COLORS: Readonly<
  Record<LightKey, { sky: number; sun: number; hemiSky: number; hemiGround: number }>
> = Object.freeze({
  morning: { sky: 0xcde9f6, sun: 0xfff4e2, hemiSky: 0xd8eeff, hemiGround: 0x9bb07a },
  noon: { sky: 0xb4e0f4, sun: 0xfff6e8, hemiSky: 0xcfe8ff, hemiGround: 0x9bb07a },
  afternoon: { sky: 0xbfe3f2, sun: 0xfff1d6, hemiSky: 0xcfe8ff, hemiGround: 0x9bb07a },
  golden: { sky: 0xf5dcb4, sun: 0xffd59e, hemiSky: 0xf3dcc0, hemiGround: 0x9a9f6e },
  sunset: { sky: 0xf6b48a, sun: 0xffa463, hemiSky: 0xf0c0a0, hemiGround: 0x8a7f62 },
  // Evening hemisphere colours lifted from the spec's starting values: at 20:30 the scene had to
  // stay readable on a phone screen (visual pass, city-life phase B).
  dusk: { sky: 0xd98a7a, sun: 0xff8550, hemiSky: 0xc9aac8, hemiGround: 0x7a706b },
  late: { sky: 0x7a6a9c, sun: 0xff7a48, hemiSky: 0xa8a0d4, hemiGround: 0x6a6c8c },
});

/** Purely 3D colours, not tied to a CSS token. */
export const SCENE_COLORS: Readonly<{
  lampGlow: number;
  headlight: number;
  taillight: number;
  treeLeaves: readonly number[];
  treeTrunk: number;
  constructionGround: number;
}> = Object.freeze({
  lampGlow: 0xffd58a,
  headlight: 0xfff2c8,
  taillight: 0xff4a3d,
  treeLeaves: Object.freeze([0x6fbf73, 0x4f9d69, 0x8cc084]),
  treeTrunk: 0x8a5a3b,
  constructionGround: 0xc9a77c,
});

/** Tints of the distant low-detail buildings (brick, sand, cream...). */
export const FAR_TINTS: readonly number[] = Object.freeze([0xd9a07a, 0xc9b79c, 0xe3c9a0, 0xb98b73]);

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
