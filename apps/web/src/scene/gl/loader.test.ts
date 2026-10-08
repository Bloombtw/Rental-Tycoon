import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoxGeometry, MeshStandardMaterial } from "three";
import { loadTemplates } from "./loader.js";

interface Job {
  url: string;
  resolve: () => void;
  reject: (e: Error) => void;
  geometry: BoxGeometry;
  material: MeshStandardMaterial;
  geoDisposed: () => number;
}
const jobs = vi.hoisted(() => [] as unknown[]);

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const three = await import("three");
  return {
    GLTFLoader: class {
      loadAsync(url: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
          const geometry = new three.BoxGeometry();
          const material = new three.MeshStandardMaterial();
          let n = 0;
          geometry.addEventListener("dispose", () => n++);
          const scene = new three.Group();
          scene.add(new three.Mesh(geometry, material));
          jobs.push({
            url,
            geometry,
            material,
            geoDisposed: () => n,
            resolve: () => {
              resolve({ scene });
            },
            reject,
          });
        });
      }
    },
  };
});

const J = () => jobs as Job[];
const refs = [
  { kit: "city", name: "a" },
  { kit: "city", name: "b" },
  { kit: "city", name: "c" },
] as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  jobs.length = 0;
  vi.useRealTimers();
});

describe("loadTemplates: late and failed models are freed", () => {
  it("a model that finishes after the timeout is disposed, and progress stops", async () => {
    const progress: number[] = [];
    const p = loadTemplates(
      refs,
      "/",
      20,
      (l) => progress.push(l),
      () => false,
    );
    J()[0]?.resolve();
    await expect(p).rejects.toThrow(/timeout/);
    const seen = progress.length;
    J()[1]?.resolve();
    J()[2]?.resolve();
    await tick();
    for (const j of J()) expect(j.geoDisposed(), j.url).toBe(1);
    expect(progress.length).toBe(seen);
  });

  it("one failing model disposes the others, whenever they finish", async () => {
    const p = loadTemplates(refs, "/", 1000, undefined, () => false);
    J()[0]?.resolve();
    J()[1]?.reject(new Error("404"));
    await expect(p).rejects.toThrow("404");
    J()[2]?.resolve();
    await tick();
    // Job 1 failed and has no scene; the two that loaded are freed.
    expect(J()[0]?.geoDisposed()).toBe(1);
    expect(J()[2]?.geoDisposed()).toBe(1);
  });

  it("a cancelled load disposes every model and builds nothing", async () => {
    let cancelled = false;
    const p = loadTemplates(refs, "/", 1000, undefined, () => cancelled);
    cancelled = true;
    for (const j of J()) j.resolve();
    await expect(p).rejects.toThrow("cancelled");
    for (const j of J()) expect(j.geoDisposed(), j.url).toBe(1);
  });

  it("the happy path disposes nothing and reports 0..total progress", async () => {
    const progress: string[] = [];
    const p = loadTemplates(
      refs,
      "/",
      1000,
      (l, t) => progress.push(`${l}/${t}`),
      () => false,
    );
    for (const j of J()) j.resolve();
    const out = await p;
    expect(out.size).toBe(3);
    expect(progress).toEqual(["0/3", "1/3", "2/3", "3/3"]);
    for (const j of J()) expect(j.geoDisposed()).toBe(0);
  });

  it("an empty list resolves with an empty map (no 0/0 division downstream)", async () => {
    const out = await loadTemplates([], "/", 10, undefined, () => false);
    expect(out.size).toBe(0);
  });
});
