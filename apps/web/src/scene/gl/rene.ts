import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { RENE_ASSET, assetUrl } from "../assets.js";
import { TILE, type AgencyLayout } from "../layout.js";
import { disposeObject } from "./loader.js";
import { renderCharacterPortrait } from "./thumbnails.js";

/** What René does in the scene (the tutorial drives it). */
export type ReneMode = "hidden" | "idle" | "cheer" | "leave";

/** Height of René in world units (metres): a little taller than the customers. */
const RENE_HEIGHT = 1.8;
const WALK_SPEED = 1.7;
/** How far east of his post he walks before disappearing. */
const LEAVE_DISTANCE = 12;
/** Longest frame step the animation accepts (a background tab must not make him jump). */
const MAX_STEP_SECONDS = 0.1;
/** Where he waits: east of the counter, on the walkway in front of the awning. */
const POST_DX = 4.6;
const POST_Z = TILE - 0.3;
const POST_HEADING = 0.5;
const WALK_HEADING = Math.PI / 2;

type Clip = "idle" | "walk" | "yes";

function findClip(clips: readonly AnimationClip[], name: string): AnimationClip | null {
  return clips.find((c) => c.name === name) ?? null;
}

interface Model {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly scale: number;
}

/**
 * René, the retiring manager: stands in front of the agency, cheers, walks away. Loaded in the
 * background; until the model is there every call is a harmless no-op.
 */
export class Rene {
  private readonly group = new Group();
  private model: Model | null = null;
  private root: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private actions: Partial<Record<Clip, AnimationAction>> = {};
  private current: Clip | null = null;
  private wanted: ReneMode = "hidden";
  private shown: ReneMode = "hidden";
  private walked = 0;
  private startX = 0;
  private x = 0;
  private lastNow = Number.NaN;
  private reducedMotion = false;
  private disposed = false;
  private loadPromise: Promise<void> = Promise.resolve();

  constructor(private readonly parent: Object3D) {
    this.group.visible = false;
    parent.add(this.group);
  }

  /** Loads the model. Never rejects: without it René simply is not there. */
  load(baseUrl: string, isCancelled: () => boolean): Promise<void> {
    this.loadPromise = (async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(assetUrl(RENE_ASSET, baseUrl));
        if (this.disposed || isCancelled()) {
          disposeObject(gltf.scene);
          return;
        }
        const box = new Box3().setFromObject(gltf.scene);
        const h = box.max.y - box.min.y;
        this.model = {
          scene: gltf.scene,
          clips: gltf.animations,
          scale: h > 0 && Number.isFinite(h) ? RENE_HEIGHT / h : 1,
        };
        this.build(this.model);
      } catch {
        // No René: the tutorial still works with the portrait alone.
      }
    })();
    return this.loadPromise;
  }

  private build(model: Model): void {
    const root = cloneSkinned(model.scene);
    root.scale.setScalar(model.scale);
    root.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds follow the bind pose, not the animation
    });
    const mixer = new AnimationMixer(root);
    const make = (name: string, clip: Clip, once: boolean): void => {
      const c = findClip(model.clips, name);
      if (!c) return;
      const action = mixer.clipAction(c);
      if (once) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(LoopRepeat, Infinity);
      }
      this.actions[clip] = action;
    };
    make("idle", "idle", false);
    make("walk", "walk", false);
    make("emote-yes", "yes", true);
    mixer.addEventListener("finished", () => {
      if (this.shown === "cheer") {
        this.shown = "idle";
        this.wanted = "idle";
        this.current = null;
        this.actions.yes?.stop();
      }
    });
    this.group.add(root);
    this.root = root;
    this.mixer = mixer;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  /** True while he is on screen (the scene keeps its shadows fresh). */
  get active(): boolean {
    return this.shown !== "hidden" && this.root !== null;
  }

  setMode(mode: ReneMode): void {
    if (this.disposed) return;
    if (mode === "cheer") {
      // A new cheer always replays, even if the previous one is still running.
      this.wanted = "cheer";
      if (this.shown === "hidden" || this.shown === "leave" || this.reducedMotion) return;
      this.shown = "cheer";
      this.stopCurrent();
      this.actions.yes?.reset().play();
      if (!this.actions.yes) this.shown = "idle";
      return;
    }
    const previous = this.wanted;
    this.wanted = mode;
    if (mode === previous) return;
    if (mode === "hidden") {
      this.shown = "hidden";
    } else if (mode === "idle") {
      // Back at his post (also after having left, for a replayed tutorial).
      if (this.shown !== "cheer") this.shown = "idle";
      this.walked = 0;
    } else {
      this.startX = this.x;
      this.walked = 0;
      this.shown = this.reducedMotion || this.shown === "hidden" ? "hidden" : "leave";
    }
  }

  private stopCurrent(): void {
    if (this.current !== null) this.actions[this.current]?.stop();
    this.current = null;
  }

  private play(clip: Clip): void {
    if (this.current === clip) return;
    if (this.current !== null) this.actions[this.current]?.fadeOut(0.15);
    const next = this.actions[clip] ?? this.actions.idle;
    next?.reset().fadeIn(0.15).play();
    this.current = clip;
  }

  /** Places and animates him. Called every frame by the scene, with the current layout. */
  update(layout: AgencyLayout, nowMs: number): void {
    if (this.disposed) return;
    const root = this.root;
    const mixer = this.mixer;
    if (!root || !mixer) return;
    const step =
      Number.isFinite(this.lastNow) && nowMs >= this.lastNow
        ? Math.min(MAX_STEP_SECONDS, (nowMs - this.lastNow) / 1000)
        : 0;
    this.lastNow = nowMs;
    if (this.shown === "hidden") {
      this.group.visible = false;
      return;
    }
    const postX = (layout.lotCols * TILE) / 2 + POST_DX;
    this.group.visible = true;
    if (this.shown === "leave") {
      this.walked += WALK_SPEED * step;
      if (this.walked >= LEAVE_DISTANCE) {
        this.shown = "hidden";
        this.group.visible = false;
        return;
      }
      this.x = this.startX + this.walked;
      root.rotation.y = WALK_HEADING;
      this.play("walk");
    } else {
      this.x = postX;
      root.rotation.y = POST_HEADING;
      if (this.shown === "idle") this.play("idle");
    }
    root.position.set(this.x, 0, POST_Z);
    mixer.update(step);
  }

  /** Renders the bust portrait with this scene's renderer. Rejects if the model never loads. */
  async renderPortrait(
    renderer: WebGLRenderer,
    size: { width: number; height: number },
  ): Promise<string> {
    await this.loadPromise;
    const model = this.model;
    if (this.disposed || !model) throw new Error("René is not available");
    const root = cloneSkinned(model.scene);
    root.scale.setScalar(model.scale);
    root.traverse((o) => {
      o.frustumCulled = false;
    });
    const mixer = new AnimationMixer(root);
    const idle = findClip(model.clips, "idle");
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0.2);
    return renderCharacterPortrait({ renderer, model: root, height: RENE_HEIGHT, size });
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.parent.remove(this.group);
    if (this.model) disposeObject(this.model.scene);
    this.model = null;
    this.root = null;
    this.mixer = null;
  }
}
