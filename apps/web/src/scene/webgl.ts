/** WebGL detection, run before `import("three")`. The canvas factory is injectable for tests. */

interface ContextProbe {
  getContext(id: string): unknown;
}

function defaultCreate(): ContextProbe | null {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas");
}

export function detectWebGL(create: () => ContextProbe | null = defaultCreate): boolean {
  try {
    const canvas = create();
    if (!canvas) return false;
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
