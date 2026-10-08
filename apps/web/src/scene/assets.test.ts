/// <reference types="node" />
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENCY_SCALE,
  ASSET_TURN_OFFSET,
  CAR_ASSET,
  KIT_SCALE,
  LAMP_HEAD,
  LOW_BUILDING_SCALE,
  PROP_ASSETS,
  ROAD_TILE_ASSET,
  TRAFFIC_ASSET,
  assetUrl,
  carAssetKey,
  requiredAssets,
  type AssetRef,
} from "./assets";

const root = ["apps/web/public/assets", "public/assets"].find((p) => existsSync(p)) ?? "";
const file = (r: AssetRef) => `${root}/${r.kit}/${r.name}.glb`;
const letters = (from: string, to: string) => {
  const out: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
};
const names = (kit: AssetRef["kit"], list: string[]): AssetRef[] =>
  list.map((name) => ({ kit, name }));

describe("carAssetKey", () => {
  it("maps the three models", () => {
    expect(carAssetKey("used")).toBe("used");
    expect(carAssetKey("compact")).toBe("compact");
    expect(carAssetKey("hybrid")).toBe("hybrid");
  });

  const evil = { toString: () => "used", valueOf: () => "used" };
  it.each([
    "__proto__",
    "toString",
    "constructor",
    "hasOwnProperty",
    "valueOf",
    "prototype",
    "",
    " used",
    "Used",
    "USED",
    "used ",
    "compact\n",
    "sedan",
    "unknown",
    "<script>alert(1)</script>",
    "'; DROP TABLE cars;--",
    "💥",
    "x".repeat(10_000),
    0,
    1,
    NaN,
    -0,
    Infinity,
    true,
    false,
    null,
    undefined,
    {},
    [],
    ["used"],
    ["hybrid"],
    evil,
    () => "used",
    Symbol("used"),
    10n,
  ])("hostile model %s -> unknown", (model) => {
    expect(carAssetKey(model)).toBe("unknown");
  });

  it("does not read the prototype chain", () => {
    const polluted = Object.create({ used: 1 });
    expect(carAssetKey(polluted)).toBe("unknown");
    expect(Object.keys(CAR_ASSET).sort()).toEqual(["compact", "hybrid", "unknown", "used"]);
  });
});

describe("asset tables", () => {
  it("car models map to the spec 2.7 table", () => {
    expect(CAR_ASSET.used).toEqual({ kit: "cars", name: "hatchback-sports" });
    expect(CAR_ASSET.compact).toEqual({ kit: "cars", name: "sedan" });
    expect(CAR_ASSET.hybrid).toEqual({ kit: "cars", name: "sedan-sports" });
    expect(CAR_ASSET.unknown).toEqual({ kit: "cars", name: "sedan" });
  });

  it("road tiles", () => {
    expect(ROAD_TILE_ASSET).toEqual({
      straight: { kit: "roads", name: "road-straight" },
      crossroad: { kit: "roads", name: "road-crossroad" },
      crossing: { kit: "roads", name: "road-crossing" },
      driveway: { kit: "roads", name: "road-driveway-single" },
      sidewalk: { kit: "roads", name: "tile-low" },
      asphalt: { kit: "roads", name: "road-square" },
    });
  });

  it("buildings: 13 models, building-h reserved for the agency", () => {
    const b = PROP_ASSETS.building.map((r) => r.name);
    expect(b).toHaveLength(13);
    expect(b).not.toContain("building-h");
    expect(new Set(b).size).toBe(13);
    expect(PROP_ASSETS.agency.map((r) => r.name)).toEqual(["building-h"]);
  });

  it("traffic models map to cars/{name} and never to a player car", () => {
    expect(Object.keys(TRAFFIC_ASSET).sort()).toEqual(
      ["ambulance", "delivery", "garbage-truck", "police", "suv", "taxi", "truck", "van"].sort(),
    );
    const player = new Set(Object.values(CAR_ASSET).map((r) => r.name));
    for (const [model, r] of Object.entries(TRAFFIC_ASSET)) {
      expect(r).toEqual({ kit: "cars", name: model });
      expect(player.has(r.name), `${model} uses a player asset`).toBe(false);
    }
    expect(LOW_BUILDING_SCALE).toBe(4.2);
  });

  it("props list the spec models and cover every prop kind", () => {
    const n = (kit: AssetRef["kit"], list: string[]) => names(kit, list);
    expect(PROP_ASSETS.agency).toEqual(n("city", ["building-h"]));
    expect(PROP_ASSETS.awning).toEqual(n("city", ["detail-awning-wide"]));
    expect(PROP_ASSETS.sign).toEqual([]);
    expect(PROP_ASSETS.parasol).toEqual(n("city", ["detail-parasol-a", "detail-parasol-b"]));
    expect(PROP_ASSETS.building).toEqual(
      n(
        "city",
        [...letters("a", "g"), ...letters("i", "n")].map((c) => `building-${c}`),
      ),
    );
    expect(PROP_ASSETS.backdrop).toEqual(
      n(
        "city",
        letters("a", "e").map((c) => `building-skyscraper-${c}`),
      ),
    );
    expect(PROP_ASSETS.lowBuilding).toEqual(
      n("city", [
        ...letters("a", "n").map((c) => `low-detail-building-${c}`),
        "low-detail-building-wide-a",
        "low-detail-building-wide-b",
      ]),
    );
    expect(PROP_ASSETS.lamp.map((r) => r.name)).toEqual(["light-square"]);
    expect(PROP_ASSETS.streetLamp.map((r) => r.name)).toEqual(["light-curved"]);
    expect(PROP_ASSETS.trafficLight.map((r) => r.name)).toEqual(["traffic-light"]);
    expect(PROP_ASSETS.streetSign.map((r) => r.name)).toHaveLength(1);
    expect(PROP_ASSETS.streetSign[0]?.name).toMatch(/^road-sign-(object-)?street$/);
    expect(PROP_ASSETS.construction.map((r) => r.name)).toEqual([
      "construction-fence",
      "construction-barrier",
      "construction-cone",
      "construction-light",
    ]);
    expect(PROP_ASSETS.dumpster.map((r) => r.name)).toEqual(["dumpster"]);
    expect(PROP_ASSETS.tree).toEqual([]);
    expect(PROP_ASSETS.parkedCar).toEqual([]);
    expect(Object.keys(PROP_ASSETS).sort()).toEqual(
      [
        "agency",
        "awning",
        "sign",
        "parasol",
        "building",
        "backdrop",
        "lowBuilding",
        "lamp",
        "streetLamp",
        "trafficLight",
        "streetSign",
        "construction",
        "dumpster",
        "tree",
        "parkedCar",
      ].sort(),
    );
  });

  it("scales", () => {
    expect(KIT_SCALE).toEqual({ roads: 6, city: 6, cars: 1.4 });
    expect(AGENCY_SCALE).toBe(7);
  });

  it("turn offsets are quarter turns on assets that exist", () => {
    const known = new Set(requiredAssets().map((r) => r.name));
    for (const [name, turn] of Object.entries(ASSET_TURN_OFFSET)) {
      expect(known.has(name), `${name} is not a required asset`).toBe(true);
      expect([0, 1, 2, 3]).toContain(turn);
    }
  });

  it("a prop variant picked modulo the list always lands on a real asset", () => {
    for (const [kind, list] of Object.entries(PROP_ASSETS)) {
      if (list.length === 0) continue;
      for (const variant of [0, 1, 5, 6, 7, 1000, 2 ** 31]) {
        expect(list[variant % list.length], `${kind} variant ${variant}`).toBeDefined();
      }
    }
  });
});

describe("assetUrl", () => {
  const ref: AssetRef = { kit: "cars", name: "sedan-sports" };

  it.each([
    ["/", "/assets/cars/sedan-sports.glb"],
    ["/Rental-Tycoon/", "/Rental-Tycoon/assets/cars/sedan-sports.glb"],
    ["/Rental-Tycoon", "/Rental-Tycoon/assets/cars/sedan-sports.glb"],
    ["./", "./assets/cars/sedan-sports.glb"],
    ["https://cdn.example.com/game/", "https://cdn.example.com/game/assets/cars/sedan-sports.glb"],
    ["https://cdn.example.com/game", "https://cdn.example.com/game/assets/cars/sedan-sports.glb"],
  ])("base %j", (base, expected) => {
    expect(assetUrl(ref, base)).toBe(expected);
  });

  it("an empty base still gives a clean relative or root URL", () => {
    const url = assetUrl(ref, "");
    expect(url.endsWith("assets/cars/sedan-sports.glb")).toBe(true);
    expect(url).not.toContain("//");
    expect(url).not.toMatch(/undefined|NaN|\[object/);
  });

  it("never doubles a slash after the scheme and always ends with .glb", () => {
    for (const base of ["/", "/a/", "/a", "/a/b/", "/a/b", "https://x.y/z/"]) {
      for (const r of requiredAssets()) {
        const url = assetUrl(r, base);
        expect(url.replace(/^[a-z]+:\/\//, "")).not.toContain("//");
        expect(url.startsWith(base.endsWith("/") ? base : `${base}/`)).toBe(true);
        expect(url.endsWith(`${r.kit}/${r.name}.glb`)).toBe(true);
      }
    }
  });
});

describe("requiredAssets", () => {
  const list = requiredAssets();

  it("has no duplicates", () => {
    const keys = list.map((r) => `${r.kit}/${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is exactly every asset of the tables (nothing missing, nothing extra to download)", () => {
    const expected = new Set<string>();
    const add = (r: AssetRef) => expected.add(`${r.kit}/${r.name}`);
    Object.values(CAR_ASSET).forEach(add);
    Object.values(TRAFFIC_ASSET).forEach(add);
    Object.values(ROAD_TILE_ASSET).forEach(add);
    Object.values(PROP_ASSETS).forEach((l) => l.forEach(add));
    expect(new Set(list.map((r) => `${r.kit}/${r.name}`))).toEqual(expected);
    expect(list.length).toBe(expected.size);
  });

  it("uses only the known kits, with a scale for each", () => {
    for (const r of list) {
      expect(["cars", "roads", "city"]).toContain(r.kit);
      expect(KIT_SCALE[r.kit]).toBeGreaterThan(0);
    }
  });

  it("the public/assets folder is found", () => {
    expect(root).not.toBe("");
  });

  it.each(list.map((r) => [`${r.kit}/${r.name}`, r] as const))(
    "%s exists on disk and is a complete GLB",
    (_name, r) => {
      const path = file(r);
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("glTF");
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(statSync(path).size);
    },
  );
});

describe("car models expose what the renderer relies on (spec 8.3)", () => {
  // Kenney cars carry one shared "colormap" material (no "body" material): the tint must be
  // applied by cloning the material of the non-wheel meshes, so we only rely on wheel nodes and
  // on at least one body mesh outside them.
  function gltf(r: AssetRef): { nodes?: { name?: string; mesh?: number }[] } {
    const bytes = readFileSync(file(r));
    const jsonLength = bytes.readUInt32LE(12);
    expect(bytes.subarray(16, 20).toString("latin1")).toBe("JSON");
    return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  }

  it.each(["used", "compact", "hybrid"] as const)(
    "%s has four named wheels and a body mesh",
    (key) => {
      const g = gltf(CAR_ASSET[key]);
      const nodeNames = (g.nodes ?? []).map((n) => n.name);
      for (const wheel of [
        "wheel-front-left",
        "wheel-front-right",
        "wheel-back-left",
        "wheel-back-right",
      ]) {
        expect(nodeNames, `${CAR_ASSET[key].name} lacks node ${wheel}`).toContain(wheel);
      }
      const bodyMeshes = (g.nodes ?? []).filter(
        (n) => n.mesh !== undefined && !(n.name ?? "").startsWith("wheel-"),
      );
      expect(bodyMeshes.length, `${CAR_ASSET[key].name} has no body mesh`).toBeGreaterThan(0);
    },
  );

  it.each(Object.entries(TRAFFIC_ASSET))(
    "traffic model %s has named wheels (they are instanced and spun) and a body mesh",
    (_model, r) => {
      const g = gltf(r);
      const names = (g.nodes ?? []).map((n) => n.name ?? "");
      expect(names.filter((n) => n.startsWith("wheel")).length, r.name).toBeGreaterThanOrEqual(4);
      expect(
        (g.nodes ?? []).filter((n) => n.mesh !== undefined && !(n.name ?? "").startsWith("wheel"))
          .length,
        r.name,
      ).toBeGreaterThan(0);
    },
  );
});

describe("LAMP_HEAD is measured on the model", () => {
  interface Gltf {
    accessors?: { min?: number[]; max?: number[] }[];
    meshes?: { primitives: { attributes: { POSITION?: number } }[] }[];
  }
  function bounds(r: AssetRef): { min: number[]; max: number[] } {
    const bytes = readFileSync(file(r));
    const g = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as Gltf;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const m of g.meshes ?? []) {
      for (const p of m.primitives) {
        const a = g.accessors?.[p.attributes.POSITION ?? -1];
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i] ?? 0, a?.min?.[i] ?? Infinity);
          max[i] = Math.max(max[i] ?? 0, a?.max?.[i] ?? -Infinity);
        }
      }
    }
    return { min, max };
  }

  it("covers light-square and light-curved only, finite, near the top of the model", () => {
    expect(Object.keys(LAMP_HEAD).sort()).toEqual(["light-curved", "light-square"]);
    for (const [name, head] of Object.entries(LAMP_HEAD)) {
      const b = bounds({ kit: "roads", name });
      const [x, y, z] = [head.x, head.y, head.z];
      expect([x, y, z].every(Number.isFinite), name).toBe(true);
      expect(y, `${name} head height`).toBeGreaterThan(0.75 * (b.max[1] ?? 0));
      expect(y, `${name} head height`).toBeLessThanOrEqual((b.max[1] ?? 0) + 0.05);
      expect(x).toBeGreaterThanOrEqual((b.min[0] ?? 0) - 0.05);
      expect(x).toBeLessThanOrEqual((b.max[0] ?? 0) + 0.05);
      expect(z).toBeGreaterThanOrEqual((b.min[2] ?? 0) - 0.05);
      expect(z).toBeLessThanOrEqual((b.max[2] ?? 0) + 0.05);
    }
  });
});
