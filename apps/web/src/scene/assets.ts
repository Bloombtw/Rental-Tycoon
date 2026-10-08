import type { PropKind, QuarterTurn, RoadTileKind } from "./layout";

/** Model -> Kenney asset mapping (spec 2.7). Pure: names and URLs only, nothing is loaded here. */

export type Kit = "cars" | "roads" | "city";

/** File `public/assets/{kit}/{name}.glb`. */
export interface AssetRef {
  readonly kit: Kit;
  readonly name: string;
}

export type CarAssetKey = "used" | "compact" | "hybrid" | "unknown";

/** Maps a game model to its asset key. Anything but the three known models is "unknown". */
export function carAssetKey(model: unknown): CarAssetKey {
  switch (model) {
    case "used":
      return "used";
    case "compact":
      return "compact";
    case "hybrid":
      return "hybrid";
    default:
      return "unknown";
  }
}

function ref(kit: Kit, name: string): AssetRef {
  return Object.freeze({ kit, name });
}

function refs(kit: Kit, names: readonly string[]): readonly AssetRef[] {
  return Object.freeze(names.map((n) => ref(kit, n)));
}

const letters = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
};

export const CAR_ASSET: Readonly<Record<CarAssetKey, AssetRef>> = Object.freeze({
  used: ref("cars", "hatchback-sports"),
  compact: ref("cars", "sedan"),
  hybrid: ref("cars", "sedan-sports"),
  unknown: ref("cars", "sedan"),
});

export const ROAD_TILE_ASSET: Readonly<Record<RoadTileKind, AssetRef>> = Object.freeze({
  straight: ref("roads", "road-straight"),
  crossroad: ref("roads", "road-crossroad"),
  driveway: ref("roads", "road-driveway-single"),
  sidewalk: ref("roads", "tile-low"),
});

/** The variant of a placement is taken modulo the list length. "sign" is a plain mesh (no asset). */
export const PROP_ASSETS: Readonly<Record<PropKind, readonly AssetRef[]>> = Object.freeze({
  agency: refs("city", ["building-h"]),
  awning: refs("city", ["detail-awning-wide"]),
  sign: refs("city", []),
  parasol: refs("city", ["detail-parasol-a", "detail-parasol-b"]),
  building: refs(
    "city",
    letters("a", "f").map((l) => `building-${l}`),
  ),
  backdrop: refs(
    "city",
    letters("a", "e").map((l) => `building-skyscraper-${l}`),
  ),
  lowBuilding: refs(
    "city",
    letters("a", "n").map((l) => `low-detail-building-${l}`),
  ),
  lamp: refs("roads", ["light-square"]),
});

/** Uniform scale per kit (the kits do not share an original scale). */
export const KIT_SCALE: Readonly<Record<Kit, number>> = Object.freeze({
  roads: 6,
  city: 6,
  cars: 1.4,
});

/** The agency building is larger than its neighbours. */
export const AGENCY_SCALE = 7;

/** Quarter-turn correction per asset name, tuned against screenshots (0 when absent). */
export const ASSET_TURN_OFFSET: Readonly<Record<string, QuarterTurn>> = Object.freeze({});

/** `${base}/` normalised + `assets/{kit}/{name}.glb`. A missing or non-string base becomes "/". */
export function assetUrl(asset: AssetRef, baseUrl: string): string {
  const base = typeof baseUrl === "string" && baseUrl.length > 0 ? baseUrl : "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}assets/${asset.kit}/${asset.name}.glb`;
}

/** Every asset the scene needs, without duplicates. */
export function requiredAssets(): readonly AssetRef[] {
  const seen = new Set<string>();
  const out: AssetRef[] = [];
  const add = (a: AssetRef): void => {
    const key = `${a.kit}/${a.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  Object.values(CAR_ASSET).forEach(add);
  Object.values(ROAD_TILE_ASSET).forEach(add);
  Object.values(PROP_ASSETS).forEach((list) => {
    list.forEach(add);
  });
  return out;
}
