/**
 * Car thumbnails drawn by the scene's own renderer (no second WebGL context): one render target,
 * the same cached .glb templates and paint shader, a fixed noon light without shadows, the scene's
 * camera angle, and a transparent background. Pixels go through a 2D canvas to a PNG data URL.
 * three.js glue: only AgencyScene3D calls this.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  type Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { CAR_ASSET, KIT_SCALE, type CarAssetKey } from "../assets.js";
import { cameraRig, toViewPlane } from "../iso.js";
import { lightAt } from "../lighting.js";
import { carTint } from "../palette.js";
import { CarInstancer } from "./carInstances.js";
import { assetKey, type Template } from "./loader.js";

/** Empty margin around the car, as a fraction of its projected size, on every side. */
const MARGIN = 0.08;
/** Minute of the light cycle used for every thumbnail (noon). */
const NOON_MINUTE = 150;
/**
 * Heading of the car: its nose points to the left of the screen, turned a little towards the
 * viewer (a three-quarter view). 0 = nose towards +z.
 */
const THUMB_HEADING = -Math.PI / 3 + 0.5;
const MSAA_SAMPLES = 4;

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Projected (view-plane) box of the car, wheels included, for the given heading. */
function projectedCarBox(
  template: Template,
  heading: number,
): { x: number; y: number; width: number; height: number } {
  const turn = template.frontIsNegZ ? Math.PI : 0;
  const a = heading + turn;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const s = KIT_SCALE.cars;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const corner = new Vector3();
  const visit = (box: Box3, matrix: Matrix4): void => {
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).applyMatrix4(matrix);
          // Rotate about Y by `a`, then scale.
          const wx = (corner.x * cos + corner.z * sin) * s;
          const wy = corner.y * s;
          const wz = (-corner.x * sin + corner.z * cos) * s;
          const v = toViewPlane({ x: wx, y: wy, z: wz });
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
      }
    }
  };
  for (const part of template.meshes) {
    if (part.geometry.boundingBox === null) part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) visit(part.geometry.boundingBox, part.matrix);
  }
  if (template.wheelPart) {
    const wp = template.wheelPart;
    if (wp.geometry.boundingBox === null) wp.geometry.computeBoundingBox();
    const box = wp.geometry.boundingBox;
    if (box) {
      for (const w of template.wheels) {
        visit(box, w.pivot.clone().multiply(w.local));
      }
    }
  }
  if (![minX, minY, maxX, maxY].every(fin)) return { x: -1, y: -1, width: 2, height: 2 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Un-premultiplies and flips (GL rows run bottom-up) into a canvas-ready buffer. */
function toImageData(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      const o = dst + x * 4;
      const a = pixels[i + 3] ?? 0;
      const k = a > 0 && a < 255 ? 255 / a : 1;
      out[o] = Math.min(255, (pixels[i] ?? 0) * k);
      out[o + 1] = Math.min(255, (pixels[i + 1] ?? 0) * k);
      out[o + 2] = Math.min(255, (pixels[i + 2] ?? 0) * k);
      out[o + 3] = a;
    }
  }
  return out;
}

export interface ThumbnailRequest {
  readonly renderer: WebGLRenderer;
  readonly templates: ReadonlyMap<string, Template>;
  readonly keys: readonly CarAssetKey[];
  readonly size: { readonly width: number; readonly height: number };
}

/**
 * Renders one PNG data URL per requested key. Throws on any failure (the caller falls back to the
 * drawn illustration). The renderer's target and clear colour are restored in every case.
 */
export function renderCarThumbnails(req: ThumbnailRequest): Map<CarAssetKey, string> {
  const { renderer, templates, keys } = req;
  const width = Math.max(1, Math.min(1024, Math.floor(fin(req.size.width) ? req.size.width : 1)));
  const height = Math.max(
    1,
    Math.min(1024, Math.floor(fin(req.size.height) ? req.size.height : 1)),
  );
  const result = new Map<CarAssetKey, string>();

  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearColor(new Color());
  const previousAlpha = renderer.getClearAlpha();
  const target = new WebGLRenderTarget(width, height, {
    samples: MSAA_SAMPLES,
    colorSpace: SRGBColorSpace,
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  const scene = new Scene();
  const light = lightAt(NOON_MINUTE);
  const sun = new DirectionalLight(new Color(light.sunColor), light.sunIntensity);
  sun.position.set(light.sunDir.x * 50, light.sunDir.y * 50, light.sunDir.z * 50);
  const hemi = new HemisphereLight(
    new Color(light.hemiSky),
    new Color(light.hemiGround),
    light.hemiIntensity,
  );
  const ambient = new AmbientLight(new Color(light.sunColor), light.ambientIntensity);
  scene.add(sun, sun.target, hemi, ambient);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  const pixels = new Uint8Array(width * height * 4);

  try {
    if (!g) throw new Error("no 2d context");
    renderer.setClearColor(0, 0); // fully transparent background
    for (const key of keys) {
      const asset = CAR_ASSET[key];
      const template = templates.get(assetKey(asset));
      if (!template) throw new Error(`missing car model ${key}`);
      const holder = new Group();
      scene.add(holder);
      const instancer = new CarInstancer(holder, templates, [asset], new Set([assetKey(asset)]));
      try {
        instancer.begin();
        instancer.add(asset, 0, 0, THUMB_HEADING, 0, carTint(key, 0));
        instancer.end();

        const box = projectedCarBox(template, THUMB_HEADING);
        const zoom = Math.min(
          width / (box.width * (1 + 2 * MARGIN)),
          height / (box.height * (1 + 2 * MARGIN)),
        );
        const rig = cameraRig(
          {
            zoom,
            centerX: box.x + box.width / 2,
            centerY: box.y + box.height / 2,
          },
          { x: 0, y: 0, width, height },
        );
        camera.left = rig.left;
        camera.right = rig.right;
        camera.top = rig.top;
        camera.bottom = rig.bottom;
        camera.position.set(rig.position.x, rig.position.y, rig.position.z);
        camera.up.set(rig.up.x, rig.up.y, rig.up.z);
        camera.lookAt(rig.target.x, rig.target.y, rig.target.z);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        sun.target.position.set(rig.target.x, 0, rig.target.z);
        sun.target.updateMatrixWorld();

        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        g.putImageData(new ImageData(toImageData(pixels, width, height), width, height), 0, 0);
        const url = canvas.toDataURL("image/png");
        if (!url.startsWith("data:image/png")) throw new Error("png encoding failed");
        result.set(key, url);
      } finally {
        instancer.dispose();
        scene.remove(holder);
      }
    }
    return result;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    target.dispose();
  }
}

export interface PortraitRequest {
  readonly renderer: WebGLRenderer;
  /** A posed, ready-to-draw character, about `height` metres tall, feet at y = 0, facing +z. */
  readonly model: Object3D;
  readonly height: number;
  readonly size: { readonly width: number; readonly height: number };
}

/** Share of the character's height at the bottom of the frame (belt) and at the top (above the head). */
const PORTRAIT_FROM = 0.42;
const PORTRAIT_TO = 1.13;
/** Turn of the character towards the viewer's side (a three-quarter look). */
const PORTRAIT_TURN = 0.3;

/**
 * Renders a bust portrait of a character as a transparent PNG data URL, on the scene's renderer.
 * Throws on any failure (the caller falls back to the drawn portrait). Renderer state is restored.
 */
export function renderCharacterPortrait(req: PortraitRequest): string {
  const { renderer, model } = req;
  const width = Math.max(1, Math.min(1024, Math.floor(fin(req.size.width) ? req.size.width : 1)));
  const height = Math.max(
    1,
    Math.min(1024, Math.floor(fin(req.size.height) ? req.size.height : 1)),
  );
  const h = fin(req.height) && req.height > 0 ? req.height : 1.7;
  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearColor(new Color());
  const previousAlpha = renderer.getClearAlpha();
  const target = new WebGLRenderTarget(width, height, {
    samples: MSAA_SAMPLES,
    colorSpace: SRGBColorSpace,
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  const scene = new Scene();
  const light = lightAt(NOON_MINUTE);
  const key = new DirectionalLight(new Color(light.sunColor), light.sunIntensity * 1.1);
  key.position.set(3, 4, 6);
  const hemi = new HemisphereLight(
    new Color(light.hemiSky),
    new Color(light.hemiGround),
    light.hemiIntensity * 1.2,
  );
  const ambient = new AmbientLight(new Color(light.sunColor), light.ambientIntensity + 0.25);
  scene.add(key, key.target, hemi, ambient);
  const holder = new Group();
  holder.rotation.y = PORTRAIT_TURN;
  holder.add(model);
  scene.add(holder);
  const bottom = h * PORTRAIT_FROM;
  const top = h * PORTRAIT_TO;
  const halfH = (top - bottom) / 2;
  const halfW = (halfH * width) / height;
  const camera = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 50);
  camera.position.set(0, (top + bottom) / 2 + 0.05, 8);
  camera.lookAt(0, (top + bottom) / 2 - 0.02, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const pixels = new Uint8Array(width * height * 4);
  try {
    if (!g) throw new Error("no 2d context");
    renderer.setClearColor(0, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    g.putImageData(new ImageData(toImageData(pixels, width, height), width, height), 0, 0);
    const url = canvas.toDataURL("image/png");
    if (!url.startsWith("data:image/png")) throw new Error("png encoding failed");
    return url;
  } finally {
    holder.remove(model);
    scene.remove(holder);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    target.dispose();
  }
}
