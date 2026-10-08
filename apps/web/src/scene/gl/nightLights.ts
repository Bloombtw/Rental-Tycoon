/**
 * Evening lighting without real lights (spec 2.5): additive billboard halos (lamps, sign, car
 * lights) in one InstancedMesh, light pools on the ground and headlight beams as ground decals.
 * The only light that casts shadows stays the sun.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { SCENE_COLORS } from "../palette.js";
import type { Point3 } from "../iso.js";

const LAMP_HALO = 1.6;
const SIGN_HALO = 7;
const CAR_HALO = 0.9;
const POOL_RADIUS = 3;
const POOL_OPACITY = 0.35;
const BEAM_W = 2.4;
const BEAM_L = 6;
const HEAD_FRONT = 1.95;
const HEAD_SIDE = 0.72;
const HEAD_Y = 0.75;
const TAIL_BACK = 1.9;
const BEAM_CENTER = HEAD_FRONT + BEAM_L / 2 - 0.4;
const GROUND_LIFT = 0.07;

/** [metres along the heading, metres to the right, is a headlight] */
const CAR_LIGHTS: readonly (readonly [number, number, boolean])[] = [
  [HEAD_FRONT, HEAD_SIDE, true],
  [HEAD_FRONT, -HEAD_SIDE, true],
  [-TAIL_BACK, HEAD_SIDE, false],
  [-TAIL_BACK, -HEAD_SIDE, false],
];

function gradientTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) draw(g, c.width, c.height);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function radialTexture(): CanvasTexture {
  return gradientTexture((g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.35, "rgba(255,255,255,0.45)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

function beamTexture(): CanvasTexture {
  return gradientTexture((g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, "rgba(255,255,255,0.9)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    const s = g.createLinearGradient(0, 0, w, 0);
    s.addColorStop(0, "rgba(255,255,255,0)");
    s.addColorStop(0.5, "rgba(255,255,255,1)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);
  });
}

export class NightLights {
  private readonly halos: InstancedMesh;
  private readonly pools: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly textures: CanvasTexture[] = [];
  private readonly geometries: PlaneGeometry[] = [];
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly lampCount: number;
  private readonly facing = new Quaternion();
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();
  private readonly yaw = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();
  private readonly lampColor = new Color(SCENE_COLORS.lampGlow);
  private readonly headColor = new Color(SCENE_COLORS.headlight);
  private readonly tailColor = new Color(SCENE_COLORS.taillight);
  private haloCount = 0;
  private beamCount = 0;
  private lastGlow = -1;

  constructor(
    private readonly parent: Group,
    private readonly heads: readonly Point3[],
    private readonly sign: Point3 | null,
    carCapacity: number,
  ) {
    this.lampCount = heads.length;
    const radial = radialTexture();
    const beam = beamTexture();
    this.textures.push(radial, beam);

    const haloGeo = new PlaneGeometry(1, 1);
    const haloMat = new MeshBasicMaterial({
      map: radial,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const haloMax = heads.length + 1 + carCapacity * 4;
    this.halos = new InstancedMesh(haloGeo, haloMat, haloMax);
    this.halos.setColorAt(0, this.c.setRGB(0, 0, 0));
    this.halos.instanceMatrix.setUsage(DynamicDrawUsage);

    const poolGeo = new PlaneGeometry(POOL_RADIUS * 2, POOL_RADIUS * 2);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new MeshBasicMaterial({
      map: radial,
      color: this.lampColor,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.pools = new InstancedMesh(poolGeo, poolMat, Math.max(1, heads.length));

    const beamGeo = new PlaneGeometry(BEAM_W, BEAM_L);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new MeshBasicMaterial({
      map: beam,
      color: this.headColor,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.beams = new InstancedMesh(beamGeo, beamMat, Math.max(1, carCapacity));
    this.beams.instanceMatrix.setUsage(DynamicDrawUsage);

    this.geometries.push(haloGeo, poolGeo, beamGeo);
    this.materials.push(haloMat, poolMat, beamMat);

    for (const mesh of [this.halos, this.pools, this.beams]) {
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.count = 0;
      mesh.renderOrder = 2;
      parent.add(mesh);
    }
    this.writeStatic();
  }

  /** The camera never rotates, so one orientation faces it for good. */
  setFacing(q: Quaternion): void {
    this.facing.copy(q);
    this.writeStatic();
    this.lastGlow = -1;
  }

  private writeStatic(): void {
    this.heads.forEach((h, i) => {
      this.p.set(h.x, h.y, h.z);
      this.s.set(LAMP_HALO, LAMP_HALO, 1);
      this.m.compose(this.p, this.facing, this.s);
      this.halos.setMatrixAt(i, this.m);
      this.p.set(h.x, GROUND_LIFT, h.z);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q.identity(), this.s);
      this.pools.setMatrixAt(i, this.m);
    });
    if (this.sign) {
      this.p.set(this.sign.x, this.sign.y, this.sign.z);
      this.s.set(SIGN_HALO, SIGN_HALO * 0.45, 1);
      this.m.compose(this.p, this.facing, this.s);
      this.halos.setMatrixAt(this.lampCount, this.m);
    } else {
      // No sign: the slot stays reserved but collapsed, never a halo at the origin.
      this.p.set(0, 0, 0);
      this.s.set(0, 0, 0);
      this.m.compose(this.p, this.facing, this.s);
      this.halos.setMatrixAt(this.lampCount, this.m);
    }
    this.pools.count = this.heads.length;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  /** Y of the pool decals (just above the road surface). */
  setGroundY(y: number): void {
    this.heads.forEach((h, i) => {
      this.p.set(h.x, y + GROUND_LIFT, h.z);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q.identity(), this.s);
      this.pools.setMatrixAt(i, this.m);
    });
    this.pools.instanceMatrix.needsUpdate = true;
  }

  beginCars(): void {
    this.haloCount = this.lampCount + 1;
    this.beamCount = 0;
  }

  /** A moving car with its lights on (call between beginCars and finish). */
  addCar(x: number, z: number, heading: number): void {
    if (this.haloCount + 4 > this.halos.instanceMatrix.count) return;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = -fz;
    const rz = fx;
    for (const [along, side, isHead] of CAR_LIGHTS) {
      this.p.set(x + fx * along + rx * side, HEAD_Y, z + fz * along + rz * side);
      this.s.set(CAR_HALO, CAR_HALO, 1);
      this.m.compose(this.p, this.facing, this.s);
      const i = this.haloCount++;
      this.halos.setMatrixAt(i, this.m);
      this.halos.setColorAt(i, isHead ? this.headColor : this.tailColor);
    }
    if (this.beamCount < this.beams.instanceMatrix.count) {
      this.p.set(x + fx * BEAM_CENTER, GROUND_LIFT + this.groundY, z + fz * BEAM_CENTER);
      this.s.set(1, 1, 1);
      this.yaw.setFromAxisAngle(this.up, heading);
      this.m.compose(this.p, this.yaw, this.s);
      this.beams.setMatrixAt(this.beamCount++, this.m);
    }
  }

  private groundY = 0;

  /**
   * Applies the evening state. Lamps and sign follow `lampGlow`, car lights need `headlightsOn`.
   * Pools only show when `pools` is true (not at the lowest quality tier).
   */
  finish(lampGlow: number, headlightsOn: boolean, pools: boolean, groundY: number): void {
    const glow = Number.isFinite(lampGlow) ? Math.min(1, Math.max(0, lampGlow)) : 0;
    if (groundY !== this.groundY) {
      this.groundY = groundY;
      this.setGroundY(groundY);
    }
    const carHalos = headlightsOn ? this.haloCount - (this.lampCount + 1) : 0;
    if (glow !== this.lastGlow) {
      this.lastGlow = glow;
      this.c.copy(this.lampColor).multiplyScalar(glow);
      for (let i = 0; i < this.lampCount; i++) this.halos.setColorAt(i, this.c);
      this.c.copy(this.lampColor).multiplyScalar(glow * 1.4);
      this.halos.setColorAt(this.lampCount, this.c);
      const poolMat = this.pools.material as MeshBasicMaterial;
      poolMat.opacity = POOL_OPACITY * glow;
    }
    this.halos.count = this.lampCount + 1 + carHalos;
    this.halos.visible = glow > 0 || carHalos > 0;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    this.pools.visible = pools && glow > 0 && this.lampCount > 0;
    this.beams.count = headlightsOn ? this.beamCount : 0;
    this.beams.visible = headlightsOn && this.beamCount > 0;
    this.beams.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.halos, this.pools, this.beams]) {
      this.parent.remove(mesh);
      mesh.dispose();
    }
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
