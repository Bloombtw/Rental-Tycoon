import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, CUSTOMER_ASSETS } from "../assets.js";
import { MAX_CUSTOMERS_SHOWN, WALK_CYCLE_METRES, type CustomerPose } from "../customers.js";
import { disposeObject } from "./loader.js";

/** Height of a customer in world units (metres). */
const CUSTOMER_HEIGHT = 1.7;

interface Model {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly scale: number;
}

type Clip = "walk" | "idle" | "no";

interface Actor {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  readonly actions: Readonly<Record<Clip, AnimationAction | null>>;
  current: Clip | null;
  /** Pose seed this actor shows, or null when free. */
  seed: number | null;
}

function findClip(clips: readonly AnimationClip[], name: string): AnimationClip | null {
  return clips.find((c) => c.name === name) ?? null;
}

/**
 * Animated Kenney characters for the customers (visible-customers). A small pool of skinned clones,
 * each bound to one customer (by pose seed) while it is on screen. The walk clip is driven by the
 * distance walked, so the feet never slide whatever the game speed.
 */
export class People {
  private readonly group = new Group();
  private readonly actors: Actor[] = [];
  private readonly models: Model[] = [];
  private disposed = false;
  private lastAmbient = Number.NaN;

  constructor(private readonly parent: Object3D) {
    parent.add(this.group);
  }

  /** Loads the character models. Never rejects: without them there are just no customers. */
  async load(baseUrl: string, isCancelled: () => boolean): Promise<void> {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(
      CUSTOMER_ASSETS.map((ref) => loader.loadAsync(assetUrl(ref, baseUrl))),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const gltf = r.value;
      if (this.disposed || isCancelled()) {
        disposeObject(gltf.scene);
        continue;
      }
      const box = new Box3().setFromObject(gltf.scene);
      const h = box.max.y - box.min.y;
      this.models.push({
        scene: gltf.scene,
        clips: gltf.animations,
        scale: h > 0 && Number.isFinite(h) ? CUSTOMER_HEIGHT / h : 1,
      });
    }
  }

  private makeActor(seed: number): Actor | null {
    if (this.models.length === 0 || this.actors.length >= MAX_CUSTOMERS_SHOWN) return null;
    const model = this.models[Math.abs(seed) % this.models.length];
    if (!model) return null;
    const root = cloneSkinned(model.scene);
    root.scale.setScalar(model.scale);
    root.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds follow the bind pose, not the animation
    });
    const mixer = new AnimationMixer(root);
    const action = (name: string): AnimationAction | null => {
      const clip = findClip(model.clips, name);
      return clip ? mixer.clipAction(clip) : null;
    };
    const actor: Actor = {
      root,
      mixer,
      actions: { walk: action("walk"), idle: action("idle"), no: action("emote-no") },
      current: null,
      seed,
    };
    actor.actions.no?.setLoop(LoopOnce, 1);
    if (actor.actions.no) actor.actions.no.clampWhenFinished = true;
    actor.actions.walk?.setLoop(LoopRepeat, Infinity);
    actor.actions.idle?.setLoop(LoopRepeat, Infinity);
    this.group.add(root);
    this.actors.push(actor);
    return actor;
  }

  private play(actor: Actor, clip: Clip): void {
    if (actor.current === clip) return;
    if (actor.current !== null) actor.actions[actor.current]?.stop();
    const next = actor.actions[clip] ?? actor.actions.idle;
    next?.reset().play();
    actor.current = clip;
  }

  /** Places one actor per pose. `ambientSeconds` paces the idle and head-shake animations. */
  update(poses: readonly CustomerPose[], ambientSeconds: number): void {
    if (this.disposed) return;
    const dt =
      Number.isFinite(this.lastAmbient) && ambientSeconds >= this.lastAmbient
        ? Math.min(0.25, ambientSeconds - this.lastAmbient)
        : 0;
    this.lastAmbient = ambientSeconds;

    const wanted = new Set(poses.map((p) => p.seed));
    for (const a of this.actors) if (a.seed !== null && !wanted.has(a.seed)) a.seed = null;

    for (const pose of poses) {
      let actor = this.actors.find((a) => a.seed === pose.seed);
      if (!actor) {
        actor = this.actors.find((a) => a.seed === null);
        if (actor) {
          actor.seed = pose.seed;
          actor.current = null;
          actor.mixer.stopAllAction();
        } else {
          actor = this.makeActor(pose.seed) ?? undefined;
        }
      }
      if (!actor) continue;
      actor.root.visible = true;
      actor.root.position.set(pose.x, 0, pose.z);
      actor.root.rotation.y = pose.heading;
      if (pose.walking) {
        this.play(actor, "walk");
        const walk = actor.actions.walk;
        if (walk) {
          const d = walk.getClip().duration;
          const cycle = (pose.stride / WALK_CYCLE_METRES) % 1;
          walk.time = (cycle < 0 ? cycle + 1 : cycle) * d;
        }
        actor.mixer.update(0);
      } else {
        this.play(actor, pose.sad ? "no" : "idle");
        actor.mixer.update(dt);
      }
    }
    for (const a of this.actors) if (a.seed === null) a.root.visible = false;
  }

  dispose(): void {
    this.disposed = true;
    for (const a of this.actors) a.mixer.stopAllAction();
    this.parent.remove(this.group);
    // Clones share geometry and materials with the models: dispose those once.
    for (const m of this.models) disposeObject(m.scene);
    this.actors.length = 0;
    this.models.length = 0;
  }
}
