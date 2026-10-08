/**
 * Every car of the scene (ours, background traffic, parked) is drawn through InstancedMesh: one per
 * (model, body part) and one per (model, wheels). Our cars are tinted per instance with a paint
 * shader driven by `instanceColor`. A car that is not drawn simply is not written this frame.
 */
import {
  Color,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  Vector4,
  type BufferGeometry,
} from "three";
import { KIT_SCALE, type AssetRef } from "../assets.js";
import { assetKey, materialsOf, type Template } from "./loader.js";

const CAPACITY = 128;
const TINTED_MESHES: ReadonlySet<string> = new Set(["body", "spoiler"]);

/**
 * Repaints the texels of the body paint with the per-instance colour (`vColor`), keeping the
 * painted shading. Windows, lights and tyres keep their texel.
 */
function paintMaterial(mat: MeshStandardMaterial, paint: Vector4): void {
  const reference = paint.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uPaint"] = { value: reference };
    // The paint is a shaded gradient in the colormap: select it by chromaticity, keep its shading.
    shader.fragmentShader = `uniform vec4 uPaint;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", "")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      {
        vec3 texel = diffuseColor.rgb;
        float chromaDist = distance(texel / (texel.r + texel.g + texel.b + 0.0001), uPaint.xyz);
        float paintMask = 1.0 - smoothstep(0.07, 0.14, chromaDist);
        float shade = clamp(dot(texel, vec3(0.2126, 0.7152, 0.0722)) / uPaint.w, 0.0, 1.5);
        diffuseColor.rgb = mix(texel, vColor * shade, paintMask);
      }`,
      );
  };
  mat.customProgramCacheKey = () => "car-paint-instanced";
}

interface Part {
  readonly mesh: InstancedMesh;
  readonly matrix: Matrix4;
  readonly tinted: boolean;
}

interface Model {
  readonly template: Template;
  readonly parts: Part[];
  readonly wheels: InstancedMesh | null;
  readonly frontSign: 1 | -1;
  readonly turn: number;
  count: number;
}

export class CarInstancer {
  private readonly models = new Map<string, Model>();
  private readonly owned: Material[] = [];
  private readonly all: InstancedMesh[] = [];
  private readonly base = new Matrix4();
  private readonly out = new Matrix4();
  private readonly spin = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly axisX = new Vector3(1, 0, 0);
  private readonly axisY = new Vector3(0, 1, 0);

  /**
   * @param tinted asset keys whose body is repainted per instance (our own cars)
   */
  constructor(
    private readonly parent: Group,
    templates: ReadonlyMap<string, Template>,
    assets: readonly AssetRef[],
    tinted: ReadonlySet<string>,
  ) {
    for (const ref of assets) {
      const key = assetKey(ref);
      const template = templates.get(key);
      if (!template || this.models.has(key)) continue;
      this.models.set(key, this.build(template, tinted.has(key)));
    }
  }

  private build(template: Template, tinted: boolean): Model {
    const parts: Part[] = [];
    for (const part of template.meshes) {
      const paintable = tinted && template.paint !== null && TINTED_MESHES.has(part.name);
      let material = part.material;
      if (paintable && template.paint) {
        const cloned = materialsOf(part.material).map((m) => m.clone());
        for (const m of cloned) {
          if (m instanceof MeshStandardMaterial) paintMaterial(m, template.paint);
        }
        this.owned.push(...cloned);
        material = Array.isArray(part.material) ? cloned : (cloned[0] ?? part.material);
      }
      const mesh = this.makeMesh(part.geometry, material);
      if (paintable) mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
      parts.push({ mesh, matrix: part.matrix, tinted: paintable });
    }
    const wheels = template.wheelPart
      ? this.makeMesh(template.wheelPart.geometry, template.wheelPart.material, CAPACITY * 4)
      : null;
    return {
      template,
      parts,
      wheels,
      frontSign: template.frontIsNegZ ? -1 : 1,
      turn: template.frontIsNegZ ? Math.PI : 0,
      count: 0,
    };
  }

  private makeMesh(
    geometry: BufferGeometry,
    material: Material | Material[],
    capacity = CAPACITY,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    this.parent.add(mesh);
    this.all.push(mesh);
    return mesh;
  }

  begin(): void {
    for (const model of this.models.values()) model.count = 0;
  }

  /** Writes one car. `tint` is a 0xRRGGBB colour, used only by models built as tinted. */
  add(
    asset: AssetRef,
    x: number,
    z: number,
    heading: number,
    wheelRotation: number,
    tint: number | null,
  ): void {
    const model = this.models.get(assetKey(asset));
    if (!model || model.count >= CAPACITY) return;
    const i = model.count++;
    this.pos.set(x, 0, z);
    this.quat.setFromAxisAngle(this.axisY, heading + model.turn);
    this.scale.setScalar(KIT_SCALE.cars);
    this.base.compose(this.pos, this.quat, this.scale);
    for (const part of model.parts) {
      this.out.multiplyMatrices(this.base, part.matrix);
      part.mesh.setMatrixAt(i, this.out);
      if (part.tinted && tint !== null) part.mesh.setColorAt(i, this.color.setHex(tint));
    }
    const wheels = model.wheels;
    if (wheels) {
      this.spin.makeRotationAxis(this.axisX, model.frontSign * wheelRotation);
      const infos = model.template.wheels;
      for (let k = 0; k < infos.length; k++) {
        const w = infos[k];
        if (!w) continue;
        this.out.multiplyMatrices(this.base, w.pivot).multiply(this.spin).multiply(w.local);
        wheels.setMatrixAt(i * 4 + k, this.out);
      }
    }
  }

  end(): void {
    for (const model of this.models.values()) {
      for (const part of model.parts) {
        part.mesh.count = model.count;
        part.mesh.visible = model.count > 0;
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
      if (model.wheels) {
        model.wheels.count = model.count * 4;
        model.wheels.visible = model.count > 0;
        model.wheels.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const mesh of this.all) {
      this.parent.remove(mesh);
      mesh.dispose();
    }
    for (const m of this.owned) m.dispose();
    this.all.length = 0;
    this.owned.length = 0;
    this.models.clear();
  }
}

/** "Rented" dots above parked rented cars: one InstancedMesh of camera-facing discs. */
export class RentedDots {
  private readonly mesh: InstancedMesh;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material: MeshBasicMaterial;
  private readonly texture: CanvasTexture;
  private readonly matrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly facing = new Quaternion();
  private count = 0;

  constructor(
    private readonly parent: Group,
    texture: CanvasTexture,
    private readonly size: number,
    capacity: number,
  ) {
    this.texture = texture;
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
  }

  /** The camera never rotates, so one orientation faces it for good. */
  setFacing(q: Quaternion): void {
    this.facing.copy(q);
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    this.pos.set(x, y, z);
    this.scale.set(this.size, this.size, 1);
    this.matrix.compose(this.pos, this.facing, this.scale);
    this.mesh.setMatrixAt(this.count++, this.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
