/**
 * Three.js glue: the ONLY module that imports "three". It draws what the pure modules compute
 * (layout, camera, carMotion, iso, assets, palette) and holds no game rules.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3,
  Vector4,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MAX_FLEET_SIZE, type GameState } from "@rt/sim";
import {
  AGENCY_SCALE,
  ASSET_TURN_OFFSET,
  CAR_ASSET,
  KIT_SCALE,
  PROP_ASSETS,
  ROAD_TILE_ASSET,
  assetUrl,
  carAssetKey,
  requiredAssets,
  type AssetRef,
  type Kit,
} from "./assets.js";
import type { Camera, ScreenRect } from "./camera.js";
import { carPoseAt, type CarPose } from "./carMotion.js";
import { cameraRig, shadowFrustum } from "./iso.js";
import { tileCenter, type AgencyLayout, type PropKind } from "./layout.js";
import { SCENE_COLORS, carTint, type Palette } from "./palette.js";

export interface SceneOptions {
  readonly palette: Palette;
  readonly reducedMotion: boolean;
  readonly size: { width: number; height: number };
  readonly baseUrl: string;
  readonly isCancelled: () => boolean;
  readonly loadTimeoutMs?: number;
}

const MAX_PIXEL_RATIO = 2;
const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const SHADOW_MAP_SIZE = 2048;
const SUN_ELEVATION = (55 * Math.PI) / 180;
const SUN_AZIMUTH = Math.PI / 4;
const SUN_DISTANCE = 120;
/** Height (world units) of the paint on the asphalt above the road surface. */
const PAINT_LIFT = 0.02;
/** The "low-detail" models are tall silhouettes; this keeps the south side below the street view. */
const LOW_BUILDING_SCALE = 4.2;
const SIGN_W = 6;
const SIGN_H = 1.2;
const SIGN_D = 0.2;
const DOT_Y = 2.4;
const DOT_SIZE = 0.9;
const TINTED_MESHES: ReadonlySet<string> = new Set(["body", "spoiler"]);
const WHEEL_NAMES = [
  "wheel-front-left",
  "wheel-front-right",
  "wheel-back-left",
  "wheel-back-right",
] as const;

interface TemplateMesh {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** Mesh transform relative to the template root. */
  readonly matrix: Matrix4;
}

interface Template {
  readonly root: Object3D;
  readonly meshes: readonly TemplateMesh[];
  readonly kit: Kit;
  /** Top of the model's bounding box (unscaled). */
  readonly topY: number;
  /** True if the model's nose points to -z (so it needs a half turn to face +z). */
  readonly frontIsNegZ: boolean;
  /** Linear colour of the body paint in the colormap (cars only). */
  readonly paint: Vector4 | null;
}

interface Placement {
  readonly asset: AssetRef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

interface CarObject {
  readonly group: Group;
  readonly dot: Sprite;
  inner: Object3D | null;
  wheels: Object3D[];
  wheelBase: number[];
  materials: Material[];
  tinted: Color[];
  frontSign: 1 | -1;
  assetKey: string;
  tintKey: string;
}

function materialsOf(m: Material | Material[]): Material[] {
  return Array.isArray(m) ? m : [m];
}

function key(ref: AssetRef): string {
  return `${ref.kit}/${ref.name}`;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Makes `mat` repaint its body: every texel equal to `paint` is replaced by the returned colour
 * (set it with setHex). Windows, lights and tyres keep their texel. Without a known paint the
 * material colour is multiplied instead.
 */
function paintMaterial(mat: MeshStandardMaterial, paint: Vector4 | null): Color {
  if (!paint) return mat.color;
  const tint = new Color();
  const reference = paint.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uPaint"] = { value: reference };
    shader.uniforms["uTint"] = { value: tint };
    // The paint is a shaded gradient in the colormap: select it by chromaticity, keep its shading.
    shader.fragmentShader =
      `uniform vec4 uPaint;\nuniform vec3 uTint;\n${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      {
        vec3 texel = diffuseColor.rgb;
        float chromaDist = distance(texel / (texel.r + texel.g + texel.b + 0.0001), uPaint.xyz);
        float paintMask = 1.0 - smoothstep(0.07, 0.14, chromaDist);
        float shade = clamp(dot(texel, vec3(0.2126, 0.7152, 0.0722)) / uPaint.w, 0.0, 1.5);
        diffuseColor.rgb = mix(texel, uTint * shade, paintMask);
      }`,
      );
  };
  mat.customProgramCacheKey = () => "car-paint";
  return tint;
}

function disposeMaterial(m: Material): void {
  for (const value of Object.values(m)) {
    if (value instanceof Texture) value.dispose();
  }
  m.dispose();
}

export class AgencyScene3D {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private readonly sun: DirectionalLight;
  private readonly templates: ReadonlyMap<string, Template>;
  private readonly palette: Palette;
  private readonly decor = new Group();
  private readonly carLayer = new Group();
  private readonly ring: Mesh;
  private readonly dotMaterial: SpriteMaterial;
  private readonly dotTexture: CanvasTexture;
  private readonly signTexture: CanvasTexture;
  private readonly ownedGeometry: BufferGeometry[] = [];
  private readonly ownedMaterial: Material[] = [];
  private decorDisposables: (() => void)[] = [];
  private cars: CarObject[] = [];
  private poses: CarPose[] = [];
  private layoutKey = "";
  private roadTop = 0;
  private highlight: number | null = null;
  private reducedMotion: boolean;
  private failure: (() => void) | null = null;
  private failed = false;
  private destroyed = false;
  private size = { width: 0, height: 0 };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail();
  };

  private constructor(
    renderer: WebGLRenderer,
    templates: ReadonlyMap<string, Template>,
    opts: SceneOptions,
  ) {
    this.renderer = renderer;
    this.templates = templates;
    this.palette = opts.palette;
    this.reducedMotion = opts.reducedMotion;

    this.scene.background = new Color(SCENE_COLORS.sky);
    this.scene.add(this.decor, this.carLayer);

    this.sun = new DirectionalLight(SCENE_COLORS.sun, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = SUN_DISTANCE * 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new HemisphereLight(SCENE_COLORS.hemiSky, SCENE_COLORS.hemiGround, 0.95));
    this.scene.add(new AmbientLight(SCENE_COLORS.sun, 0.15));

    const ringGeometry = new RingGeometry(2.2, 2.6, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringMaterial = new MeshBasicMaterial({
      color: this.palette.highlight,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.ownedGeometry.push(ringGeometry);
    this.ownedMaterial.push(ringMaterial);
    this.ring = new Mesh(ringGeometry, ringMaterial);
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);

    this.dotTexture = AgencyScene3D.makeDotTexture(this.palette);
    this.dotMaterial = new SpriteMaterial({ map: this.dotTexture, depthWrite: false });
    this.signTexture = AgencyScene3D.makeSignTexture(this.palette);

    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.resize(opts.size.width, opts.size.height);
  }

  /** Creates the renderer inside `host` and loads the models. Rejects on any failure. */
  static async create(host: HTMLElement, o: SceneOptions): Promise<AgencyScene3D> {
    const renderer = new WebGLRenderer({ antialias: true });
    let templates: Map<string, Template> | null = null;
    try {
      renderer.setPixelRatio(
        Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, MAX_PIXEL_RATIO),
      );
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.setSize(Math.max(1, o.size.width), Math.max(1, o.size.height));
      templates = await AgencyScene3D.loadTemplates(
        o.baseUrl,
        o.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
      );
      if (o.isCancelled()) throw new Error("cancelled");
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.touchAction = "none";
      host.appendChild(canvas);
      return new AgencyScene3D(renderer, templates, o);
    } catch (error) {
      if (templates) AgencyScene3D.disposeTemplates(templates);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      throw error;
    }
  }

  private static async loadTemplates(
    baseUrl: string,
    timeoutMs: number,
  ): Promise<Map<string, Template>> {
    const loader = new GLTFLoader();
    const refs = requiredAssets();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("asset load timeout"));
      }, timeoutMs);
    });
    try {
      const loaded = await Promise.race([
        Promise.all(refs.map((r) => loader.loadAsync(assetUrl(r, baseUrl)))),
        timeout,
      ]);
      const sharedMaps = new Map<string, Texture>();
      const out = new Map<string, Template>();
      refs.forEach((ref, i) => {
        const gltf = loaded[i];
        if (!gltf) throw new Error("missing model");
        out.set(key(ref), AgencyScene3D.buildTemplate(ref.kit, gltf.scene, sharedMaps));
      });
      return out;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private static buildTemplate(kit: Kit, root: Object3D, shared: Map<string, Texture>): Template {
    root.updateMatrixWorld(true);
    const meshes: TemplateMesh[] = [];
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
            if (canonical !== m.map) m.map = canonical;
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
      if (bb) {
        const top = bb.clone().applyMatrix4(obj.matrixWorld).max.y;
        topY = Math.max(topY, top);
      }
      meshes.push({
        geometry: obj.geometry,
        material: obj.material as Material | Material[],
        matrix: obj.matrixWorld.clone(),
      });
    });
    let frontIsNegZ = false;
    const front = root.getObjectByName("wheel-front-left");
    if (front) frontIsNegZ = front.getWorldPosition(new Vector3()).z < 0;
    return {
      root,
      meshes,
      kit,
      topY,
      frontIsNegZ,
      paint: kit === "cars" ? AgencyScene3D.findPaint(root) : null,
    };
  }

  /**
   * The dominant texel colour of the `body` mesh (its paint), in linear space, read from the
   * colormap at the vertex UVs. Null if it cannot be read (the tint then multiplies instead).
   */
  private static findPaint(root: Object3D): Vector4 | null {
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

  private static disposeTemplates(templates: ReadonlyMap<string, Template>): void {
    const seenGeo = new Set<BufferGeometry>();
    const seenMat = new Set<Material>();
    for (const t of templates.values()) {
      for (const m of t.meshes) {
        if (!seenGeo.has(m.geometry)) {
          seenGeo.add(m.geometry);
          m.geometry.dispose();
        }
        for (const mat of materialsOf(m.material)) {
          if (!seenMat.has(mat)) {
            seenMat.add(mat);
            disposeMaterial(mat);
          }
        }
      }
    }
  }

  private static makeDotTexture(palette: Palette): CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      g.beginPath();
      g.arc(32, 32, 28, 0, Math.PI * 2);
      g.fillStyle = css(palette.highlight);
      g.fill();
      g.beginPath();
      g.arc(32, 32, 21, 0, Math.PI * 2);
      g.fillStyle = css(palette.rentedDot);
      g.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  private static makeSignTexture(palette: Palette): CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = css(palette.signBg);
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = css(palette.signText);
      g.font = "800 84px system-ui, -apple-system, 'Segoe UI', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("LOCATION", c.width / 2, c.height / 2 + 4);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  onFailure(cb: () => void): void {
    this.failure = cb;
    if (this.failed) cb();
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.failure?.();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  setHighlight(index: number | null): void {
    this.highlight = index;
    this.placeRing();
  }

  posesNow(): readonly CarPose[] {
    return this.poses;
  }

  private resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(fin(width) ? width : 1));
    const h = Math.max(1, Math.floor(fin(height) ? height : 1));
    if (this.size.width === w && this.size.height === h) return;
    this.size = { width: w, height: h };
    this.renderer.setSize(w, h);
  }

  setCamera(cam: Camera, view: ScreenRect): void {
    if (this.destroyed) return;
    this.resize(view.width, view.height);
    const rig = cameraRig(cam, view);
    const c = this.camera;
    c.left = rig.left;
    c.right = rig.right;
    c.top = rig.top;
    c.bottom = rig.bottom;
    c.position.set(rig.position.x, rig.position.y, rig.position.z);
    c.up.set(rig.up.x, rig.up.y, rig.up.z);
    c.lookAt(rig.target.x, rig.target.y, rig.target.z);
    c.updateProjectionMatrix();

    const f = shadowFrustum(cam, view);
    const dir = new Vector3(
      -Math.cos(SUN_ELEVATION) * Math.sin(SUN_AZIMUTH),
      Math.sin(SUN_ELEVATION),
      Math.cos(SUN_ELEVATION) * Math.cos(SUN_AZIMUTH),
    );
    this.sun.target.position.set(f.center.x, 0, f.center.z);
    this.sun.position.set(
      f.center.x + dir.x * SUN_DISTANCE,
      dir.y * SUN_DISTANCE,
      f.center.z + dir.z * SUN_DISTANCE,
    );
    const sc = this.sun.shadow.camera;
    sc.left = -f.halfExtent;
    sc.right = f.halfExtent;
    sc.top = f.halfExtent;
    sc.bottom = -f.halfExtent;
    sc.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  update(game: GameState, timeOfDay: number, layout: AgencyLayout): void {
    if (this.destroyed) return;
    this.syncDecor(layout);
    const count = Math.min(Array.isArray(game.fleet) ? game.fleet.length : 0, MAX_FLEET_SIZE);
    this.syncCars(count);
    const poses: CarPose[] = [];
    for (let i = 0; i < count; i++) {
      const obj = this.cars[i];
      const car = game.fleet[i];
      if (!obj || !car) continue;
      const pose = carPoseAt(layout, i, car.rented, timeOfDay, this.reducedMotion);
      poses.push(pose);
      this.applyTint(obj, car.model, car.id);
      this.applyPose(obj, pose, car.rented === true);
    }
    this.poses = poses;
    this.placeRing();
  }

  render(): void {
    if (this.destroyed || this.failed) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.fail();
      throw error;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.failure = null;
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    for (const car of this.cars) this.disposeCar(car);
    this.cars = [];
    this.clearDecor();
    for (const g of this.ownedGeometry) g.dispose();
    for (const m of this.ownedMaterial) m.dispose();
    this.dotMaterial.dispose();
    this.dotTexture.dispose();
    this.signTexture.dispose();
    AgencyScene3D.disposeTemplates(this.templates);
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------- cars ----------

  private template(ref: AssetRef): Template | undefined {
    return this.templates.get(key(ref));
  }

  private syncCars(count: number): void {
    while (this.cars.length > count) {
      const car = this.cars.pop();
      if (car) this.disposeCar(car);
    }
    while (this.cars.length < count) this.cars.push(this.makeCar());
  }

  private makeCar(): CarObject {
    const group = new Group();
    group.visible = false;
    const dot = new Sprite(this.dotMaterial);
    dot.scale.set(DOT_SIZE, DOT_SIZE, 1);
    dot.visible = false;
    this.carLayer.add(group, dot);
    return {
      group,
      inner: null,
      wheels: [],
      wheelBase: [],
      materials: [],
      tinted: [],
      dot,
      frontSign: 1,
      assetKey: "",
      tintKey: "",
    };
  }

  private disposeCar(car: CarObject): void {
    this.carLayer.remove(car.group, car.dot);
    for (const m of car.materials) m.dispose();
  }

  private applyTint(obj: CarObject, model: unknown, id: unknown): void {
    const ref = CAR_ASSET[carAssetKey(model)];
    if (obj.assetKey !== key(ref)) {
      const tpl = this.template(ref);
      if (!tpl) return;
      obj.assetKey = key(ref);
      obj.tintKey = "";
      for (const m of obj.materials) m.dispose();
      if (obj.inner) obj.group.remove(obj.inner);
      const fresh = this.makeCarFromTemplate(tpl);
      obj.group.add(fresh.inner);
      obj.inner = fresh.inner;
      obj.wheels = fresh.wheels;
      obj.wheelBase = fresh.wheelBase;
      obj.materials = fresh.materials;
      obj.tinted = fresh.tinted;
      obj.frontSign = tpl.frontIsNegZ ? -1 : 1;
    }
    const tint = carTint(model, id);
    const k = String(tint);
    if (obj.tintKey === k) return;
    obj.tintKey = k;
    for (const c of obj.tinted) c.setHex(tint);
  }

  private makeCarFromTemplate(tpl: Template) {
    const inner = tpl.root.clone(true);
    inner.scale.setScalar(KIT_SCALE.cars);
    inner.rotation.y = tpl.frontIsNegZ ? Math.PI : 0;
    const materials: Material[] = [];
    const tinted: Color[] = [];
    inner.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const cloned = materialsOf(o.material as Material | Material[]).map((m) => m.clone());
      o.material = Array.isArray(o.material) ? cloned : (cloned[0] ?? o.material);
      materials.push(...cloned);
      if (!TINTED_MESHES.has(o.name)) return;
      for (const m of cloned) {
        if (m instanceof MeshStandardMaterial) tinted.push(paintMaterial(m, tpl.paint));
      }
    });
    const wheels = WHEEL_NAMES.map((n) => inner.getObjectByName(n)).filter(
      (w): w is Object3D => w !== undefined,
    );
    return { inner, wheels, wheelBase: wheels.map((w) => w.rotation.x), materials, tinted };
  }

  private applyPose(obj: CarObject, pose: CarPose, rented: boolean): void {
    const visible = pose.alpha > 0.001;
    obj.group.visible = visible;
    obj.dot.visible = visible && pose.phase === "parked" && rented;
    if (!visible) return;
    obj.group.position.set(pose.x, 0, pose.z);
    obj.group.rotation.y = pose.heading;
    obj.dot.position.set(pose.x, DOT_Y, pose.z);
    obj.wheels.forEach((w, i) => {
      w.rotation.x = (obj.wheelBase[i] ?? 0) + obj.frontSign * pose.wheelRotation;
    });
    const transparent = pose.alpha < 1;
    for (const m of obj.materials) {
      m.opacity = pose.alpha;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
    }
  }

  private placeRing(): void {
    const index = this.highlight;
    const pose = index === null ? undefined : this.poses[index];
    if (!pose || !(pose.alpha > 0.001)) {
      this.ring.visible = false;
      return;
    }
    this.ring.visible = true;
    this.ring.position.set(pose.x, this.roadTop + 0.08, pose.z);
    this.ring.rotation.y = pose.heading;
  }

  // ---------- static decor ----------

  private clearDecor(): void {
    for (const fn of this.decorDisposables) fn();
    this.decorDisposables = [];
    this.decor.clear();
  }

  private syncDecor(layout: AgencyLayout): void {
    const k = `${layout.columns}x${layout.rows}`;
    if (k === this.layoutKey) return;
    this.layoutKey = k;
    this.clearDecor();
    const place: Placement[] = [];
    const roadTpl = this.template(ROAD_TILE_ASSET.straight);
    this.roadTop = (roadTpl?.topY ?? 0) * KIT_SCALE.roads;
    const lotTop = this.roadTop;

    for (const t of layout.tiles) {
      const asset = ROAD_TILE_ASSET[t.kind];
      const c = tileCenter(t.col, t.row);
      const turn = t.turn + (ASSET_TURN_OFFSET[asset.name] ?? 0);
      place.push({
        asset,
        x: c.x,
        y: 0,
        z: c.z,
        yaw: (turn * Math.PI) / 2,
        scale: KIT_SCALE.roads,
      });
    }
    for (const p of layout.props) {
      const list = PROP_ASSETS[p.kind as PropKind];
      if (list.length === 0) continue;
      const asset = list[Math.abs(Math.trunc(p.variant)) % list.length];
      if (!asset) continue;
      const big = p.kind === "agency" || p.kind === "awning";
      place.push({
        asset,
        x: p.x,
        y: p.kind === "lamp" ? 0 : 0,
        z: p.z,
        yaw: p.heading + ((ASSET_TURN_OFFSET[asset.name] ?? 0) * Math.PI) / 2,
        scale: big
          ? AGENCY_SCALE
          : p.kind === "lowBuilding"
            ? LOW_BUILDING_SCALE
            : KIT_SCALE[asset.kit],
      });
    }
    this.addInstanced(place);

    // Ground, parking slab and painted lines.
    const groundGeo = new PlaneGeometry(400, 400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new MeshStandardMaterial({ color: this.palette.grass, roughness: 1 });
    const ground = new Mesh(groundGeo, groundMat);
    ground.position.set(layout.lot.x + layout.lot.width / 2, -0.03, layout.lot.z + 20);
    ground.receiveShadow = true;
    this.decor.add(ground);

    const slabGeo = new BoxGeometry(layout.lot.width, lotTop + 0.02, layout.lot.depth);
    const slabMat = new MeshStandardMaterial({ color: this.palette.lot, roughness: 0.95 });
    const slab = new Mesh(slabGeo, slabMat);
    slab.position.set(
      layout.lot.x + layout.lot.width / 2,
      (lotTop + 0.02) / 2 - 0.02,
      layout.lot.z + layout.lot.depth / 2,
    );
    slab.receiveShadow = true;
    this.decor.add(slab);

    const lineGeo = new BoxGeometry(1, 0.03, 1);
    const lineMat = new MeshStandardMaterial({ color: this.palette.lotLine, roughness: 0.9 });
    const lines = new InstancedMesh(lineGeo, lineMat, layout.spotLines.length);
    const m4 = new Matrix4();
    layout.spotLines.forEach((l, i) => {
      m4.compose(
        new Vector3(l.x + l.width / 2, lotTop + PAINT_LIFT + 0.015, l.z + l.depth / 2),
        new Quaternion(),
        new Vector3(l.width, 1, l.depth),
      );
      lines.setMatrixAt(i, m4);
    });
    lines.instanceMatrix.needsUpdate = true;
    lines.frustumCulled = false;
    lines.receiveShadow = true;
    this.decor.add(lines);

    // Sign above the awning.
    const signSide = new MeshStandardMaterial({ color: this.palette.signBg });
    const signFront = new MeshStandardMaterial({ map: this.signTexture });
    const signGeo = new BoxGeometry(SIGN_W, SIGN_H, SIGN_D);
    const sign = new Mesh(signGeo, [signSide, signSide, signSide, signSide, signFront, signSide]);
    const sp = layout.props.find((p) => p.kind === "sign");
    if (sp) {
      const agencyTpl = this.template(PROP_ASSETS.agency[0] ?? CAR_ASSET.unknown);
      const awningTpl = this.template(PROP_ASSETS.awning[0] ?? CAR_ASSET.unknown);
      const awningTop = (awningTpl?.topY ?? 0) * AGENCY_SCALE;
      const door = (agencyTpl?.topY ?? 0) * AGENCY_SCALE;
      sign.position.set(sp.x, Math.min(door - SIGN_H, awningTop + SIGN_H) + 0.0, sp.z + 0.3);
    }
    sign.castShadow = true;
    this.decor.add(sign);

    this.decorDisposables.push(() => {
      groundGeo.dispose();
      groundMat.dispose();
      slabGeo.dispose();
      slabMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      lines.dispose();
      signGeo.dispose();
      signSide.dispose();
      signFront.dispose();
    });
  }

  /** One InstancedMesh per (asset, mesh): few draw calls however many tiles and buildings. */
  private addInstanced(placements: readonly Placement[]): void {
    const groups = new Map<string, Placement[]>();
    for (const p of placements) {
      const k = key(p.asset);
      const list = groups.get(k);
      if (list) list.push(p);
      else groups.set(k, [p]);
    }
    const base = new Matrix4();
    const out = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    for (const [k, list] of groups) {
      const tpl = this.templates.get(k);
      if (!tpl) continue;
      for (const part of tpl.meshes) {
        const inst = new InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((p, i) => {
          q.setFromEuler(e.set(0, p.yaw, 0));
          base.compose(new Vector3(p.x, p.y, p.z), q, new Vector3(p.scale, p.scale, p.scale));
          out.multiplyMatrices(base, part.matrix);
          inst.setMatrixAt(i, out);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        this.decor.add(inst);
        this.decorDisposables.push(() => {
          inst.dispose();
        });
      }
    }
  }
}
