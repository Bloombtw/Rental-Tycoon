/**
 * Three.js glue: orchestrates the renderer, the light cycle, the quality tier and the helpers in
 * scene/gl. It draws what the pure modules compute (layout, cityPlan, routes, traffic, lighting,
 * carMotion, iso, assets, palette) and holds no game rules.
 */
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PCFSoftShadowMap,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { MAX_FLEET_SIZE, type GameState } from "@rt/sim";
import {
  CAR_ASSET,
  TRAFFIC_ASSET,
  carAssetKey,
  requiredAssets,
  type AssetRef,
  type CarAssetKey,
} from "./assets.js";
import type { Camera, ScreenRect } from "./camera.js";
import { WHEEL_RADIUS, carPoseAt, type CarPose } from "./carMotion.js";
import { computeCityPlan, type CityPlan } from "./cityPlan.js";
import { CarInstancer, RentedDots } from "./gl/carInstances.js";
import { buildCityMesh, type CityMesh } from "./gl/cityMesh.js";
import { assetKey, disposeTemplates, loadTemplates, type Template } from "./gl/loader.js";
import { NightLights } from "./gl/nightLights.js";
import { renderCarThumbnails } from "./gl/thumbnails.js";
import { cameraRig, groundPointOnScreen, shadowFrustum } from "./iso.js";
import type { AgencyLayout } from "./layout.js";
import { lightAt, type LightState } from "./lighting.js";
import { carTint, type Palette } from "./palette.js";
import { TIER_SETTINGS, initialTier, type QualityTier } from "./quality.js";
import { carRoutes, type CarRoutes } from "./routes.js";
import {
  MAX_TRAFFIC,
  TRAFFIC_MODELS,
  trafficBudget,
  trafficPoseAt,
  trafficVehicles,
  type TrafficVehicle,
} from "./traffic.js";

export interface SceneOptions {
  readonly palette: Palette;
  readonly reducedMotion: boolean;
  readonly size: { width: number; height: number };
  readonly baseUrl: string;
  readonly isCancelled: () => boolean;
  readonly loadTimeoutMs?: number;
  readonly tier: QualityTier;
  readonly onProgress?: (loaded: number, total: number) => void;
}

const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const SUN_DISTANCE = 120;
const DOT_Y = 2.4;
const DOT_SIZE = 0.9;
/** Margin (px) beyond the screen within which a traffic car is still considered visible. */
const OFFSCREEN_MARGIN_PX = 40;
const TIER_ORDER: readonly QualityTier[] = ["high", "medium", "low"];

function fin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function worse(a: QualityTier, b: QualityTier): QualityTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

function shadowType(soft: boolean): typeof PCFShadowMap | typeof PCFSoftShadowMap {
  return soft ? PCFSoftShadowMap : PCFShadowMap;
}

function applyRendererTier(renderer: WebGLRenderer, tier: QualityTier): void {
  const s = TIER_SETTINGS[tier];
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  renderer.setPixelRatio(Math.min(dpr, s.pixelRatioCap));
  renderer.shadowMap.type = shadowType(s.softShadows);
}

export class AgencyScene3D {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly ambient: AmbientLight;
  private readonly sky = new Color();
  private readonly templates: ReadonlyMap<string, Template>;
  private readonly palette: Palette;
  private readonly decor = new Group();
  private readonly carLayer = new Group();
  private readonly ring: Mesh;
  private readonly ringGeometry: BufferGeometry;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly signTexture: CanvasTexture;
  private readonly instancer: CarInstancer;
  private readonly dots: RentedDots;
  private city: CityMesh | null = null;
  private night: NightLights | null = null;
  private cityKey = "";
  private cityPlan: { key: string; plan: CityPlan } | null = null;
  private routeCache: { layout: AgencyLayout; routes: CarRoutes } | null = null;
  private vehicles: readonly TrafficVehicle[] = [];
  private parked: { asset: AssetRef; x: number; z: number; heading: number }[] = [];
  private shown: boolean[] = [];
  private trafficShown = 0;
  private readonly poses: CarPose[] = [];
  private readonly scratchPoint = { x: 0, y: 0, z: 0 };
  /** Shadow-pass throttling: see `render`. */
  private lastAmbient = Number.NaN;
  private animating = false;
  private frameNo = 0;
  private light: LightState;
  private lightTime = Number.NaN;
  private tier: QualityTier;
  private lastCam: Camera | null = null;
  private lastView: ScreenRect | null = null;
  private facingDone = false;
  private roadTop = 0;
  private highlight: number | null = null;
  private reducedMotion: boolean;
  private failure: (() => void) | null = null;
  private failed = false;
  private destroyed = false;
  private size = { width: 0, height: 0 };
  private drawStats = { calls: 0, triangles: 0 };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail();
  };

  private constructor(
    renderer: WebGLRenderer,
    templates: ReadonlyMap<string, Template>,
    opts: SceneOptions,
    tier: QualityTier,
  ) {
    this.renderer = renderer;
    this.templates = templates;
    this.palette = opts.palette;
    this.reducedMotion = opts.reducedMotion;
    this.tier = tier;
    this.light = lightAt(0);

    this.scene.background = this.sky;
    this.scene.add(this.decor, this.carLayer);

    const settings = TIER_SETTINGS[tier];
    this.sun = new DirectionalLight(new Color(), 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = SUN_DISTANCE * 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(new Color(), new Color(), 1);
    this.ambient = new AmbientLight(new Color(), 0.15);
    this.scene.add(this.hemi, this.ambient);

    this.ringGeometry = new RingGeometry(2.2, 2.6, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new MeshBasicMaterial({
      color: this.palette.highlight,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.ring = new Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);

    this.signTexture = AgencyScene3D.makeSignTexture(this.palette);
    const playerAssets = Object.values(CAR_ASSET);
    this.instancer = new CarInstancer(
      this.carLayer,
      templates,
      [...playerAssets, ...Object.values(TRAFFIC_ASSET)],
      new Set(playerAssets.map(assetKey)),
    );
    this.dots = new RentedDots(
      this.carLayer,
      AgencyScene3D.makeDotTexture(this.palette),
      DOT_SIZE,
      MAX_FLEET_SIZE,
    );
    this.applyLight(0);

    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.resize(opts.size.width, opts.size.height);
  }

  /** Creates the renderer inside `host` and loads the models. Rejects on any failure. */
  static async create(host: HTMLElement, o: SceneOptions): Promise<AgencyScene3D> {
    if (o.isCancelled()) throw new Error("cancelled");
    // Laptops with two GPUs otherwise often run the scene on the integrated one.
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    let templates: Map<string, Template> | null = null;
    try {
      // A GPU with small textures is capped to the lowest tier whatever the caller said.
      const tier = worse(
        o.tier,
        initialTier({ maxTextureSize: renderer.capabilities.maxTextureSize }),
      );
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false; // refreshed on demand in `render`
      applyRendererTier(renderer, tier);
      renderer.setSize(Math.max(1, o.size.width), Math.max(1, o.size.height));
      templates = await loadTemplates(
        requiredAssets(),
        o.baseUrl,
        o.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
        o.onProgress,
        o.isCancelled,
      );
      if (o.isCancelled()) throw new Error("cancelled");
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.touchAction = "none";
      host.appendChild(canvas);
      return new AgencyScene3D(renderer, templates, o, tier);
    } catch (error) {
      if (templates) disposeTemplates(templates);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      throw error;
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

  /** Draw calls and triangles of the last render, and the background cars on screen. */
  stats(): { readonly calls: number; readonly triangles: number; readonly traffic: number } {
    return { ...this.drawStats, traffic: this.trafficShown };
  }

  /**
   * Renders one transparent PNG data URL per car asset key on this scene's renderer (same models,
   * no second WebGL context). Rejects if the scene is gone or the render fails; the renderer state
   * is restored either way. Call between frames, never during a gesture.
   */
  renderThumbnails(
    keys: readonly CarAssetKey[],
    size: { width: number; height: number },
  ): Promise<ReadonlyMap<CarAssetKey, string>> {
    if (this.destroyed || this.failed) return Promise.reject(new Error("scene unavailable"));
    try {
      return Promise.resolve(
        renderCarThumbnails({ renderer: this.renderer, templates: this.templates, keys, size }),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("thumbnail render failed"));
    }
  }

  /** The tier actually in use (creation may lower the requested one). */
  quality(): QualityTier {
    return this.tier;
  }

  /** Pixel ratio, shadow map size and type, traffic budget, light pools and prop shadows. */
  setQuality(tier: QualityTier): void {
    if (this.destroyed || tier === this.tier) return;
    this.tier = tier;
    const s = TIER_SETTINGS[tier];
    applyRendererTier(this.renderer, tier);
    this.renderer.setSize(this.size.width, this.size.height);
    const shadow = this.sun.shadow;
    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    this.city?.setPropShadows(s.propShadows);
    // A new shadow filter needs new programs.
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const mats = o.material as Material | Material[];
      for (const m of Array.isArray(mats) ? mats : [mats]) m.needsUpdate = true;
    });
  }

  private resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(fin(width) ? width : 1));
    const h = Math.max(1, Math.floor(fin(height) ? height : 1));
    if (this.size.width === w && this.size.height === h) return;
    this.size = { width: w, height: h };
    this.renderer.setSize(w, h);
  }

  private applyLight(timeOfDay: number): void {
    if (timeOfDay === this.lightTime) return;
    this.lightTime = timeOfDay;
    const l = lightAt(timeOfDay);
    this.light = l;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.hemi.color.setHex(l.hemiSky);
    this.hemi.groundColor.setHex(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.ambient.color.setHex(l.sunColor);
    this.ambient.intensity = l.ambientIntensity;
    this.sky.setHex(l.sky);
    if (this.city) this.city.signMaterial.emissiveIntensity = 1.2 * l.lampGlow;
  }

  setCamera(cam: Camera, view: ScreenRect): void {
    if (this.destroyed) return;
    this.lastCam = cam;
    this.lastView = view;
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
    c.updateMatrixWorld();
    if (!this.facingDone) {
      // The camera never rotates: billboards oriented once face it for good.
      this.night?.setFacing(c.quaternion);
      this.dots.setFacing(c.quaternion);
      this.facingDone = true;
    }

    const dir = this.light.sunDir;
    const f = shadowFrustum(cam, view, dir);
    this.sun.target.position.set(f.center.x, 0, f.center.z);
    this.sun.position.set(
      f.center.x + dir.x * SUN_DISTANCE,
      dir.y * SUN_DISTANCE,
      f.center.z + dir.z * SUN_DISTANCE,
    );
    const sc = this.sun.shadow.camera;
    sc.up.set(f.up.x, f.up.y, f.up.z);
    sc.left = -f.halfWidth;
    sc.right = f.halfWidth;
    sc.top = f.halfHeight;
    sc.bottom = -f.halfHeight;
    sc.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  update(game: GameState, timeOfDay: number, layout: AgencyLayout, ambientSeconds: number): void {
    if (this.destroyed) return;
    this.animating = ambientSeconds !== this.lastAmbient;
    this.lastAmbient = ambientSeconds;
    const plan = this.planFor(layout);
    const routes = this.routesFor(layout, plan);
    this.syncDecor(layout, plan);
    this.applyLight(fin(timeOfDay) ? timeOfDay : 0);

    const count = Math.min(Array.isArray(game.fleet) ? game.fleet.length : 0, MAX_FLEET_SIZE);
    const night = this.night;
    const headlights = this.light.headlightsOn;
    this.instancer.begin();
    this.dots.begin();
    night?.beginCars();

    const poses = this.poses;
    poses.length = 0;
    let driving = 0;
    for (let i = 0; i < count; i++) {
      const car = game.fleet[i];
      if (!car) continue;
      const pose = carPoseAt(layout, routes, i, car.rented, timeOfDay, this.reducedMotion);
      poses.push(pose);
      if (pose.phase === "departing" || pose.phase === "returning") driving += 1;
      if (!(pose.alpha > 0.001)) continue;
      this.instancer.add(
        CAR_ASSET[carAssetKey(car.model)],
        pose.x,
        pose.z,
        pose.heading,
        pose.wheelRotation,
        carTint(car.model, car.id),
      );
      if (pose.phase === "parked" && car.rented === true) this.dots.add(pose.x, DOT_Y, pose.z);
      else if (headlights && pose.phase !== "parked") night?.addCar(pose.x, pose.z, pose.heading);
    }

    for (const p of this.parked) this.instancer.add(p.asset, p.x, p.z, p.heading, 0, null);
    this.updateTraffic(plan, ambientSeconds, driving, headlights);

    this.instancer.end();
    this.dots.end();
    night?.finish(
      this.light.lampGlow,
      headlights,
      TIER_SETTINGS[this.tier].lampPools,
      this.roadTop,
    );
    this.placeRing();
  }

  private updateTraffic(
    plan: CityPlan,
    ambientSeconds: number,
    driving: number,
    headlights: boolean,
  ): void {
    const target = this.reducedMotion
      ? 0
      : Math.min(this.vehicles.length, trafficBudget(this.tier, driving));
    const cam = this.lastCam;
    const view = this.lastView;
    let shownCount = 0;
    const scratch = this.scratchPoint;
    for (let k = 0; k < this.vehicles.length; k++) {
      const v = this.vehicles[k];
      if (!v) continue;
      const pose = trafficPoseAt(plan, v, ambientSeconds);
      const want = k < target;
      let shown = this.shown[k] ?? false;
      if (shown !== want) {
        // Visibility only changes out of sight (or at once if nothing can be seen yet).
        scratch.x = pose.x;
        scratch.z = pose.z;
        const hidden =
          this.reducedMotion ||
          !cam ||
          !view ||
          !groundPointOnScreen(cam, view, scratch, OFFSCREEN_MARGIN_PX);
        if (hidden) shown = want;
      }
      this.shown[k] = shown;
      if (!shown) continue;
      shownCount += 1;
      this.instancer.add(
        TRAFFIC_ASSET[v.model],
        pose.x,
        pose.z,
        pose.heading,
        pose.distance / WHEEL_RADIUS,
        null,
      );
      if (headlights) this.night?.addCar(pose.x, pose.z, pose.heading);
    }
    this.trafficShown = shownCount;
  }

  private planFor(layout: AgencyLayout): CityPlan {
    const k = `${layout.lotCols}x${layout.streetRow}`;
    if (this.cityPlan?.key !== k) {
      const plan = computeCityPlan(layout);
      this.cityPlan = { key: k, plan };
      this.vehicles = trafficVehicles(plan);
      this.shown = [];
      this.parked = plan.props
        .filter((p) => p.kind === "parkedCar")
        .map((p) => ({
          asset:
            TRAFFIC_ASSET[
              TRAFFIC_MODELS[Math.abs(Math.trunc(p.variant)) % TRAFFIC_MODELS.length] ?? "taxi"
            ],
          x: p.x,
          z: p.z,
          heading: p.heading,
        }));
    }
    return this.cityPlan.plan;
  }

  private routesFor(layout: AgencyLayout, plan: CityPlan): CarRoutes {
    if (this.routeCache?.layout !== layout) {
      this.routeCache = { layout, routes: carRoutes(layout, plan) };
    }
    return this.routeCache.routes;
  }

  render(): void {
    if (this.destroyed || this.failed) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      // The shadow pass redraws every caster (the whole city). While time runs, refresh it every
      // other frame: cars move a few centimetres per frame, so a 30 Hz shadow is invisible. A
      // still frame (paused, or a one-off redraw) always gets fresh shadows.
      this.frameNo = (this.frameNo + 1) % 2;
      this.renderer.shadowMap.needsUpdate = !this.animating || this.frameNo === 0;
      this.renderer.render(this.scene, this.camera);
      const info = this.renderer.info.render;
      this.drawStats = { calls: info.calls, triangles: info.triangles };
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
    this.instancer.dispose();
    this.dots.dispose();
    this.night?.dispose();
    this.city?.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.signTexture.dispose();
    disposeTemplates(this.templates);
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
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

  private syncDecor(layout: AgencyLayout, plan: CityPlan): void {
    const k = `${layout.columns}x${layout.rows}`;
    if (k === this.cityKey) return;
    this.cityKey = k;
    this.night?.dispose();
    this.city?.dispose();
    this.decor.clear();
    const city = buildCityMesh({
      layout,
      plan,
      templates: this.templates,
      palette: this.palette,
      signTexture: this.signTexture,
      propShadows: TIER_SETTINGS[this.tier].propShadows,
    });
    this.city = city;
    this.roadTop = city.roadTop;
    this.decor.add(city.group);
    this.night = new NightLights(
      this.decor,
      city.lampHeads,
      city.signPosition,
      MAX_TRAFFIC + MAX_FLEET_SIZE,
    );
    this.facingDone = false;
    city.signMaterial.emissiveIntensity = 1.2 * this.light.lampGlow;
    if (this.lastCam && this.lastView) this.setCamera(this.lastCam, this.lastView);
  }
}
