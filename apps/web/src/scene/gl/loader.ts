/**
 * Model loading for the 3D scene (three.js glue). Loads every glb once into a "template": the
 * meshes with their transform relative to the model root, ready to be instanced.
 */
import {
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  Texture,
  Vector3,
  Vector4,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl, type AssetRef, type Kit } from "../assets.js";

export const WHEEL_NAMES = [
  "wheel-front-left",
  "wheel-front-right",
  "wheel-back-left",
  "wheel-back-right",
] as const;

export interface TemplateMesh {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** Mesh transform relative to the template root. */
  readonly matrix: Matrix4;
  readonly name: string;
}

/** A wheel: `pivot` is the wheel node, `local` maps the wheel mesh into the pivot's space. */
export interface WheelInfo {
  readonly pivot: Matrix4;
  readonly local: Matrix4;
}

export interface Template {
  readonly root: Object3D;
  /** All meshes except the wheels of a car. */
  readonly meshes: readonly TemplateMesh[];
  readonly kit: Kit;
  /** Top of the model's bounding box (unscaled). */
  readonly topY: number;
  /** True if the model's nose points to -z (so it needs a half turn to face +z). */
  readonly frontIsNegZ: boolean;
  /** Linear chromaticity + luminance of the body paint in the colormap (cars only). */
  readonly paint: Vector4 | null;
  /** Geometry and material shared by the four wheels (cars only). */
  readonly wheelPart: TemplateMesh | null;
  /** Front-left, front-right, back-left, back-right. */
  readonly wheels: readonly WheelInfo[];
}

export function materialsOf(m: Material | Material[]): Material[] {
  return Array.isArray(m) ? m : [m];
}

export function assetKey(ref: AssetRef): string {
  return `${ref.kit}/${ref.name}`;
}

function wheelIndexOf(obj: Object3D): { index: number; node: Object3D } | null {
  let node: Object3D | null = obj;
  while (node) {
    const index = WHEEL_NAMES.indexOf(node.name as (typeof WHEEL_NAMES)[number]);
    if (index >= 0) return { index, node };
    node = node.parent;
  }
  return null;
}

function buildTemplate(kit: Kit, root: Object3D, shared: Map<string, Texture>): Template {
  root.updateMatrixWorld(true);
  const meshes: TemplateMesh[] = [];
  const wheelSlots: (WheelInfo | undefined)[] = [undefined, undefined, undefined, undefined];
  let wheelPart: TemplateMesh | null = null;
  let topY = 0;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    for (const m of materialsOf(obj.material as Material | Material[])) {
      if (m instanceof MeshStandardMaterial && m.map) {
        // One GPU texture per kit: the colormaps are identical across the files of a kit.
        const img = m.map.image as { width?: number; height?: number } | undefined;
        const k = `${kit}:${String(img?.width)}x${String(img?.height)}`;
        const canonical = shared.get(k);
        if (canonical) {
          if (canonical !== m.map) {
            m.map.dispose();
            m.map = canonical;
          }
        } else {
          m.map.magFilter = NearestFilter;
          m.map.minFilter = NearestFilter;
          m.map.generateMipmaps = false;
          m.map.needsUpdate = true;
          shared.set(k, m.map);
        }
      }
    }
    if (obj.geometry.boundingBox === null) obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    if (bb) topY = Math.max(topY, bb.clone().applyMatrix4(obj.matrixWorld).max.y);
    const part: TemplateMesh = {
      geometry: obj.geometry,
      material: obj.material as Material | Material[],
      matrix: obj.matrixWorld.clone(),
      name: obj.name,
    };
    const wheel = kit === "cars" ? wheelIndexOf(obj) : null;
    if (!wheel) {
      meshes.push(part);
      return;
    }
    const pivot = wheel.node.matrixWorld.clone();
    wheelSlots[wheel.index] = {
      pivot,
      local: pivot.clone().invert().multiply(obj.matrixWorld),
    };
    wheelPart ??= part;
  });
  let frontIsNegZ = false;
  const front = root.getObjectByName("wheel-front-left");
  if (front) frontIsNegZ = front.getWorldPosition(new Vector3()).z < 0;
  const wheels = wheelSlots.filter((w): w is WheelInfo => w !== undefined);
  return {
    root,
    meshes,
    kit,
    topY,
    frontIsNegZ,
    paint: kit === "cars" ? findPaint(root) : null,
    wheelPart,
    wheels: wheels.length === 4 ? wheels : [],
  };
}

/**
 * The dominant texel colour of the `body` mesh (its paint), in linear space, read from the
 * colormap at the vertex UVs. Null if it cannot be read (the tint then multiplies instead).
 */
function findPaint(root: Object3D): Vector4 | null {
  try {
    const body = root.getObjectByName("body");
    if (!(body instanceof Mesh)) return null;
    const mat = body.material as Material;
    const map = mat instanceof MeshStandardMaterial ? mat.map : null;
    const uv = body.geometry.getAttribute("uv");
    const image = map?.image as CanvasImageSource & { width: number; height: number };
    if (!map || !uv || !image) return null;
    const w = image.width;
    const h = image.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(image, 0, 0);
    const counts = new Map<string, number>();
    for (let i = 0; i < uv.count; i++) {
      const px = Math.min(w - 1, Math.max(0, Math.floor(uv.getX(i) * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor(uv.getY(i) * h)));
      // glTF UVs have their origin at the top-left of the image: no flip.
      const d = g.getImageData(px, py, 1, 1).data;
      const [pr = 0, pg = 0, pb = 0] = d;
      // Paint is saturated; skip greys (windows, tyres, trim).
      if (Math.max(pr, pg, pb) - Math.min(pr, pg, pb) < 50) continue;
      const k = `${String(pr)},${String(pg)},${String(pb)}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [k, n] of counts) {
      if (n > bestN) {
        best = k;
        bestN = n;
      }
    }
    if (best === null) return null;
    const [r = 0, gg = 0, b = 0] = best.split(",").map(Number);
    const c = new Color().setRGB(r / 255, gg / 255, b / 255, SRGBColorSpace);
    const sum = c.r + c.g + c.b;
    if (!(sum > 0)) return null;
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return new Vector4(c.r / sum, c.g / sum, c.b / sum, lum);
  } catch {
    return null;
  }
}

function disposeMaterial(m: Material, seen: Set<unknown>): void {
  for (const value of Object.values(m)) {
    if (value instanceof Texture && !seen.has(value)) {
      seen.add(value);
      value.dispose();
    }
  }
  if (!seen.has(m)) {
    seen.add(m);
    m.dispose();
  }
}

/** Frees the geometries, materials and textures of a loaded scene graph. */
export function disposeObject(root: Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const geometry = obj.geometry as BufferGeometry;
    if (!seen.has(geometry)) {
      seen.add(geometry);
      geometry.dispose();
    }
    for (const m of materialsOf(obj.material as Material | Material[])) disposeMaterial(m, seen);
  });
}

export function disposeTemplates(templates: ReadonlyMap<string, Template>): void {
  const seen = new Set<unknown>();
  for (const t of templates.values()) {
    const parts = t.wheelPart ? [...t.meshes, t.wheelPart] : t.meshes;
    for (const m of parts) {
      if (!seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
      for (const mat of materialsOf(m.material)) disposeMaterial(mat, seen);
    }
  }
}

/**
 * Loads every model once. Rejects on timeout, failure or cancellation. Whatever finishes loading
 * after that (or was already loaded) is disposed, so a late model never leaks.
 */
export async function loadTemplates(
  refs: readonly AssetRef[],
  baseUrl: string,
  timeoutMs: number,
  onProgress: ((loaded: number, total: number) => void) | undefined,
  isCancelled: () => boolean,
): Promise<Map<string, Template>> {
  const loader = new GLTFLoader();
  const total = refs.length;
  const gltfs: (GLTF | undefined)[] = [];
  let aborted = false;
  let done = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  onProgress?.(0, total);

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("asset load timeout"));
    }, timeoutMs);
  });
  const loading = refs.map((ref, i) =>
    loader.loadAsync(assetUrl(ref, baseUrl)).then((gltf) => {
      if (aborted) {
        disposeObject(gltf.scene);
        return gltf;
      }
      gltfs[i] = gltf;
      done += 1;
      onProgress?.(done, total);
      return gltf;
    }),
  );
  try {
    await Promise.race([Promise.all(loading), timeout]);
    if (isCancelled()) throw new Error("cancelled");
    const shared = new Map<string, Texture>();
    const out = new Map<string, Template>();
    refs.forEach((ref, i) => {
      const gltf = gltfs[i];
      if (!gltf) throw new Error("missing model");
      out.set(assetKey(ref), buildTemplate(ref.kit, gltf.scene, shared));
    });
    return out;
  } catch (error) {
    aborted = true;
    for (const g of gltfs) if (g) disposeObject(g.scene);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
