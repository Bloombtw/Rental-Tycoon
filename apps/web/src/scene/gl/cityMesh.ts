/**
 * The static decor: street tiles, buildings, furniture, trees, ground, parking slab and signs,
 * built from the agency layout and the city plan. One InstancedMesh per (asset, mesh); trees and the
 * ground are procedural. Rebuilt only when the plan changes.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Texture,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  AGENCY_SCALE,
  ASSET_TURN_OFFSET,
  KIT_SCALE,
  LAMP_HEAD,
  LOW_BUILDING_SCALE,
  PROP_ASSETS,
  ROAD_TILE_ASSET,
  type AssetRef,
} from "../assets.js";
import { carParkStalls, STALL_D, type CityPlan } from "../cityPlan.js";
import type { Point3 } from "../iso.js";
import { tileCenter, TILE, type AgencyLayout, type PropKind } from "../layout.js";
import { SCENE_COLORS, type Palette } from "../palette.js";
import { assetKey, type Template } from "./loader.js";

export interface CityMeshInput {
  readonly layout: AgencyLayout;
  readonly plan: CityPlan;
  readonly templates: ReadonlyMap<string, Template>;
  readonly palette: Palette;
  readonly signTexture: Texture;
  readonly propShadows: boolean;
}

export interface CityMesh {
  readonly group: Group;
  /** Height of the road surface. */
  readonly roadTop: number;
  /** World position of the head of every street lamp. */
  readonly lampHeads: readonly Point3[];
  /** Front of the "LOCATION" sign, emissive in the evening. */
  readonly signMaterial: MeshStandardMaterial;
  readonly signPosition: Point3 | null;
  setPropShadows(on: boolean): void;
  dispose(): void;
}

type Shadow = "always" | "furniture" | "never";

interface Placement {
  readonly asset: AssetRef;
  readonly shadow: Shadow;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

const PAINT_LIFT = 0.02;
const SIGN_W = 6;
const SIGN_H = 1.2;
const SIGN_D = 0.2;
const GROUND_MARGIN = 400;

const FURNITURE: ReadonlySet<PropKind> = new Set<PropKind>([
  "lamp",
  "streetLamp",
  "trafficLight",
  "streetSign",
  "construction",
  "dumpster",
  "parasol",
]);
const BUILDINGS: ReadonlySet<PropKind> = new Set<PropKind>([
  "building",
  "backdrop",
  "lowBuilding",
  "agency",
  "awning",
]);

function shadowOf(kind: PropKind): Shadow {
  if (BUILDINGS.has(kind)) return "always";
  return FURNITURE.has(kind) ? "furniture" : "never";
}

function treeGeometry(trees: readonly { x: number; z: number; scale: number; tint: number }[]): {
  trunk: BufferGeometry | null;
  crown: BufferGeometry | null;
} {
  const trunks: BufferGeometry[] = [];
  const crowns: BufferGeometry[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const color = new Color();
  trees.forEach((t, k) => {
    const s = new Vector3(t.scale, t.scale, t.scale);
    q.setFromEuler(new Euler(0, (k * 2.399) % (Math.PI * 2), 0));
    m.compose(new Vector3(t.x, 0, t.z), q, s);
    const trunk = new CylinderGeometry(0.14, 0.2, 1.4, 6).toNonIndexed();
    trunk.translate(0, 0.7, 0);
    trunk.applyMatrix4(m);
    trunks.push(trunk);
    const leaves = SCENE_COLORS.treeLeaves;
    color.setHex(leaves[((t.tint % leaves.length) + leaves.length) % leaves.length] ?? 0);
    const parts: [number, number, number][] = [
      [1.25, 2.4, 1],
      [0.85, 3.4, 0.9],
    ];
    for (const [radius, y, squash] of parts) {
      const crown = new IcosahedronGeometry(radius, 0);
      crown.scale(1, squash, 1);
      crown.translate(0, y, 0);
      crown.applyMatrix4(m);
      const n = crown.getAttribute("position").count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        // A little shading variation per face keeps the low-poly look lively.
        const shade = 0.86 + 0.14 * ((i / 3) % 2);
        colors[i * 3] = color.r * shade;
        colors[i * 3 + 1] = color.g * shade;
        colors[i * 3 + 2] = color.b * shade;
      }
      crown.setAttribute("color", new BufferAttribute(colors, 3));
      crowns.push(crown);
    }
  });
  const merge = (list: BufferGeometry[]): BufferGeometry | null => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return merged;
  };
  // The trunk has no colour attribute: drop it from nothing, they live in separate meshes.
  return { trunk: merge(trunks), crown: merge(crowns) };
}

export function buildCityMesh(input: CityMeshInput): CityMesh {
  const { layout, plan, templates, palette } = input;
  const group = new Group();
  const disposers: (() => void)[] = [];
  const furniture: Mesh[] = [];
  let propShadows = input.propShadows;

  const own = <T extends { dispose(): void }>(o: T): T => {
    disposers.push(() => {
      o.dispose();
    });
    return o;
  };

  const roadTpl = templates.get(assetKey(ROAD_TILE_ASSET.straight));
  const roadTop = (roadTpl?.topY ?? 0) * KIT_SCALE.roads;

  // ---- placements ----
  const placements: Placement[] = [];
  for (const t of [...layout.tiles, ...plan.tiles]) {
    const asset = ROAD_TILE_ASSET[t.kind];
    const c = tileCenter(t.col, t.row);
    const turn = t.turn + (ASSET_TURN_OFFSET[asset.name] ?? 0);
    placements.push({
      asset,
      shadow: "never",
      x: c.x,
      z: c.z,
      yaw: (turn * Math.PI) / 2,
      scale: KIT_SCALE.roads,
    });
  }
  const lampHeads: Point3[] = [];
  const trees: { x: number; z: number; scale: number; tint: number }[] = [];
  for (const p of [...layout.props, ...plan.props]) {
    if (p.kind === "tree") {
      trees.push({ x: p.x, z: p.z, scale: p.scale, tint: p.tint });
      continue;
    }
    if (p.kind === "parkedCar") continue;
    const list = PROP_ASSETS[p.kind];
    if (list.length === 0) continue;
    const asset = list[Math.abs(Math.trunc(p.variant)) % list.length];
    if (!asset) continue;
    const big = p.kind === "agency" || p.kind === "awning";
    const base = big
      ? AGENCY_SCALE
      : p.kind === "lowBuilding"
        ? LOW_BUILDING_SCALE
        : KIT_SCALE[asset.kit];
    const scale = base * p.scale;
    const yaw = p.heading + ((ASSET_TURN_OFFSET[asset.name] ?? 0) * Math.PI) / 2;
    placements.push({ asset, shadow: shadowOf(p.kind), x: p.x, z: p.z, yaw, scale });
    const head = LAMP_HEAD[asset.name];
    if (head && (p.kind === "lamp" || p.kind === "streetLamp")) {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      lampHeads.push({
        x: p.x + (head.x * cos + head.z * sin) * scale,
        y: head.y * scale,
        z: p.z + (-head.x * sin + head.z * cos) * scale,
      });
    }
  }

  // ---- instanced assets ----
  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const k = `${assetKey(p.asset)}|${p.shadow}`;
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }
  const base = new Matrix4();
  const out = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const sc = new Vector3();
  for (const list of groups.values()) {
    const first = list[0];
    if (!first) continue;
    const tpl = templates.get(assetKey(first.asset));
    if (!tpl) continue;
    for (const part of tpl.meshes) {
      const inst = new InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => {
        q.setFromEuler(e.set(0, p.yaw, 0));
        base.compose(pos.set(p.x, 0, p.z), q, sc.set(p.scale, p.scale, p.scale));
        out.multiplyMatrices(base, part.matrix);
        inst.setMatrixAt(i, out);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = first.shadow === "always" || (first.shadow === "furniture" && propShadows);
      inst.receiveShadow = true;
      if (first.shadow === "furniture") furniture.push(inst);
      group.add(inst);
      disposers.push(() => {
        inst.dispose();
      });
    }
  }

  // ---- ground, parking slab and painted lines ----
  const ext = plan.extent;
  const groundW = (ext.colMax - ext.colMin + 1) * TILE + GROUND_MARGIN;
  const groundD = (ext.rowMax - ext.rowMin + 1) * TILE + GROUND_MARGIN;
  const groundGeo = own(new PlaneGeometry(groundW, groundD));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = own(new MeshStandardMaterial({ color: palette.grass, roughness: 1 }));
  const ground = new Mesh(groundGeo, groundMat);
  ground.position.set(
    ((ext.colMin + ext.colMax + 1) / 2) * TILE,
    -0.03,
    ((ext.rowMin + ext.rowMax + 1) / 2) * TILE,
  );
  ground.receiveShadow = true;
  group.add(ground);

  const lotTop = roadTop;
  const slabGeo = own(new BoxGeometry(layout.lot.width, lotTop + 0.02, layout.lot.depth));
  const slabMat = own(new MeshStandardMaterial({ color: palette.lot, roughness: 0.95 }));
  const slab = new Mesh(slabGeo, slabMat);
  slab.position.set(
    layout.lot.x + layout.lot.width / 2,
    (lotTop + 0.02) / 2 - 0.02,
    layout.lot.z + layout.lot.depth / 2,
  );
  slab.receiveShadow = true;
  group.add(slab);

  // Construction site ground.
  const siteMat = own(
    new MeshStandardMaterial({ color: SCENE_COLORS.constructionGround, roughness: 1 }),
  );
  for (const blk of plan.blocks) {
    if (blk.use !== "construction") continue;
    const w = (blk.cells.colMax - blk.cells.colMin + 1) * TILE;
    const d = (blk.cells.rowMax - blk.cells.rowMin + 1) * TILE;
    const geo = own(new BoxGeometry(w, 0.1, d));
    const site = new Mesh(geo, siteMat);
    site.position.set(blk.cells.colMin * TILE + w / 2, 0.02, blk.cells.rowMin * TILE + d / 2);
    site.receiveShadow = true;
    group.add(site);
  }

  // Painted lines: the agency parking and the neighbourhood car park.
  const lines: { x: number; z: number; w: number; d: number }[] = layout.spotLines.map((l) => ({
    x: l.x + l.width / 2,
    z: l.z + l.depth / 2,
    w: l.width,
    d: l.depth,
  }));
  for (const blk of plan.blocks) {
    if (blk.use !== "carPark") continue;
    const stalls = carParkStalls(blk);
    const seen = new Set<string>();
    for (const s of stalls) {
      for (const dx of [-1.5, 1.5]) {
        const key = `${(s.x + dx).toFixed(2)},${s.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push({ x: s.x + dx, z: s.z, w: 0.12, d: STALL_D });
      }
    }
  }
  const asphaltTop =
    (templates.get(assetKey(ROAD_TILE_ASSET.asphalt))?.topY ?? 0) * KIT_SCALE.roads;
  const lineGeo = own(new BoxGeometry(1, 0.03, 1));
  const lineMat = own(new MeshStandardMaterial({ color: palette.lotLine, roughness: 0.9 }));
  const lineMesh = new InstancedMesh(lineGeo, lineMat, Math.max(1, lines.length));
  lineMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  lines.forEach((l, i) => {
    const inLot = i < layout.spotLines.length;
    out.compose(
      pos.set(l.x, (inLot ? lotTop : asphaltTop) + PAINT_LIFT + 0.015, l.z),
      q.identity(),
      sc.set(l.w, 1, l.d),
    );
    lineMesh.setMatrixAt(i, out);
  });
  lineMesh.count = lines.length;
  lineMesh.instanceMatrix.needsUpdate = true;
  lineMesh.frustumCulled = false;
  lineMesh.receiveShadow = true;
  group.add(lineMesh);
  disposers.push(() => {
    lineMesh.dispose();
  });

  // ---- trees ----
  const tg = treeGeometry(trees);
  if (tg.trunk) {
    const mesh = new Mesh(
      own(tg.trunk),
      own(
        new MeshStandardMaterial({
          color: SCENE_COLORS.treeTrunk,
          roughness: 1,
          flatShading: true,
        }),
      ),
    );
    mesh.castShadow = propShadows;
    mesh.receiveShadow = true;
    furniture.push(mesh);
    group.add(mesh);
  }
  if (tg.crown) {
    const mesh = new Mesh(
      own(tg.crown),
      own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })),
    );
    mesh.castShadow = propShadows;
    mesh.receiveShadow = true;
    furniture.push(mesh);
    group.add(mesh);
  }

  // ---- "LOCATION" sign above the awning ----
  const signSide = own(new MeshStandardMaterial({ color: palette.signBg }));
  const signFront = own(
    new MeshStandardMaterial({
      map: input.signTexture,
      emissive: new Color(palette.signText),
      emissiveMap: input.signTexture,
      emissiveIntensity: 0,
    }),
  );
  const signGeo = own(new BoxGeometry(SIGN_W, SIGN_H, SIGN_D));
  const sign = new Mesh(signGeo, [signSide, signSide, signSide, signSide, signFront, signSide]);
  const sp = layout.props.find((p) => p.kind === "sign");
  let signPosition: Point3 | null = null;
  const agencyAsset = PROP_ASSETS.agency[0];
  const awningAsset = PROP_ASSETS.awning[0];
  if (sp && agencyAsset && awningAsset) {
    const awningTop = (templates.get(assetKey(awningAsset))?.topY ?? 0) * AGENCY_SCALE;
    const door = (templates.get(assetKey(agencyAsset))?.topY ?? 0) * AGENCY_SCALE;
    const y = Math.min(door - SIGN_H, awningTop + SIGN_H);
    sign.position.set(sp.x, y, sp.z + 0.3);
    signPosition = { x: sp.x, y, z: sp.z + 1.4 };
  }
  sign.castShadow = true;
  group.add(sign);

  return {
    group,
    roadTop,
    lampHeads,
    signMaterial: signFront,
    signPosition,
    setPropShadows(on: boolean): void {
      propShadows = on;
      for (const m of furniture) m.castShadow = on;
    },
    dispose(): void {
      for (const fn of disposers) fn();
      group.clear();
    },
  };
}

export type { Material };
