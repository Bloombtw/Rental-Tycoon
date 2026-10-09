import type { Point3 } from "./iso";
import type { PropKind, QuarterTurn, RoadTileKind } from "./layout";
import type { TrafficModel } from "./traffic";

/** Model -> Kenney asset mapping (spec 2.7). Pure: names and URLs only, nothing is loaded here. */

export type Kit = "cars" | "roads" | "city" | "characters";

/** File `public/assets/{kit}/{name}.glb`. */
export interface AssetRef {
  readonly kit: Kit;
  readonly name: string;
}

export type CarAssetKey =
  "used" | "compact" | "hybrid" | "suv" | "van" | "electric" | "sport" | "luxury" | "unknown";

/** Every game model key, in catalogue order (thumbnails). */
export const MODEL_ASSET_KEYS: readonly Exclude<CarAssetKey, "unknown">[] = Object.freeze([
  "used",
  "compact",
  "hybrid",
  "suv",
  "van",
  "electric",
  "sport",
  "luxury",
] as const);

/** Maps a game model to its asset key. Anything but a known model is "unknown". */
export function carAssetKey(model: unknown): CarAssetKey {
  return MODEL_ASSET_KEYS.find((k) => k === model) ?? "unknown";
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
  suv: ref("cars", "suv"),
  van: ref("cars", "delivery-flat"),
  electric: ref("cars", "race-future"),
  sport: ref("cars", "race"),
  luxury: ref("cars", "suv-luxury"),
  unknown: ref("cars", "sedan"),
});

export const ROAD_TILE_ASSET: Readonly<Record<RoadTileKind, AssetRef>> = Object.freeze({
  straight: ref("roads", "road-straight"),
  crossroad: ref("roads", "road-crossroad"),
  crossing: ref("roads", "road-crossing"),
  driveway: ref("roads", "road-driveway-single"),
  sidewalk: ref("roads", "tile-low"),
  asphalt: ref("roads", "road-square"),
});

/** The variant of a placement is taken modulo the list length. "sign" is a plain mesh (no asset). */
export const PROP_ASSETS: Readonly<Record<PropKind, readonly AssetRef[]>> = Object.freeze({
  agency: refs("city", ["building-h"]),
  awning: refs("city", ["detail-awning-wide"]),
  sign: refs("city", []),
  parasol: refs("city", ["detail-parasol-a", "detail-parasol-b"]),
  // building-h is reserved for the agency.
  building: refs(
    "city",
    [...letters("a", "g"), ...letters("i", "n")].map((l) => `building-${l}`),
  ),
  backdrop: refs(
    "city",
    letters("a", "e").map((l) => `building-skyscraper-${l}`),
  ),
  lowBuilding: refs("city", [
    ...letters("a", "n").map((l) => `low-detail-building-${l}`),
    "low-detail-building-wide-a",
    "low-detail-building-wide-b",
  ]),
  lamp: refs("roads", ["light-square"]),
  streetLamp: refs("roads", ["light-curved"]),
  trafficLight: refs("roads", ["traffic-light"]),
  // road-sign-street has the pole; road-sign-object-street is the bare plate.
  streetSign: refs("roads", ["road-sign-street"]),
  construction: refs("roads", [
    "construction-fence",
    "construction-barrier",
    "construction-cone",
    "construction-light",
  ]),
  dumpster: refs("roads", ["dumpster"]),
  tree: refs("roads", []),
  parkedCar: refs("cars", []),
});

/** Background-traffic model -> asset (`cars/{name}`). */
export const TRAFFIC_ASSET: Readonly<Record<TrafficModel, AssetRef>> = Object.freeze({
  taxi: ref("cars", "taxi"),
  suv: ref("cars", "suv"),
  van: ref("cars", "van"),
  delivery: ref("cars", "delivery"),
  truck: ref("cars", "truck"),
  police: ref("cars", "police"),
  ambulance: ref("cars", "ambulance"),
  "garbage-truck": ref("cars", "garbage-truck"),
});

/**
 * Lamp head in model space (unscaled), measured from the glb bounds: the pole is at the origin and
 * the arm reaches towards -z (light-curved: y 0.675, z -0.2; light-square: y 0.6, z -0.2125).
 */
export const LAMP_HEAD: Readonly<Record<string, Point3>> = Object.freeze({
  "light-square": Object.freeze({ x: 0, y: 0.59, z: -0.2 }),
  "light-curved": Object.freeze({ x: 0, y: 0.66, z: -0.18 }),
});

/** The "low-detail" models are tall silhouettes; this keeps the south side below the street view. */
export const LOW_BUILDING_SCALE = 4.2;

/** Uniform scale per kit (the kits do not share an original scale). */
export const KIT_SCALE: Readonly<Record<Kit, number>> = Object.freeze({
  roads: 6,
  city: 6,
  cars: 1.4,
  // Characters are scaled to CUSTOMER_HEIGHT from their bounds instead (gl/people.ts).
  characters: 1,
});

/** Customer models (Kenney animated characters), loaded after the scene is up. */
export const CUSTOMER_ASSETS: readonly AssetRef[] = Object.freeze(
  ["female-a", "female-c", "female-e", "male-a", "male-c", "male-e"].map((n) =>
    ref("characters", `character-${n}`),
  ),
);

/** René, the retiring manager of the tutorial (Kenney animated character). */
export const RENE_ASSET: AssetRef = ref("characters", "character-male-b");

/** The agency building is larger than its neighbours. */
export const AGENCY_SCALE = 7;

/** Quarter-turn correction per asset name, tuned against screenshots (0 when absent). */
export const ASSET_TURN_OFFSET: Readonly<Record<string, QuarterTurn>> = Object.freeze({
  // The lamp arm points to -z; heading 0 means "front towards +z", so turn half a circle.
  "light-square": 2,
  "light-curved": 2,
});

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
  Object.values(TRAFFIC_ASSET).forEach(add);
  Object.values(ROAD_TILE_ASSET).forEach(add);
  Object.values(PROP_ASSETS).forEach((list) => {
    list.forEach(add);
  });
  return out;
}
