import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const hook = (name: string) => path.join(root, ".claude/hooks", name);

function run(script: string, filePath: string, args: string[] = []): number | null {
  const res = spawnSync("node", [hook(script), ...args], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  return res.status;
}

const abs = (rel: string) => path.join(root, rel);
const BLOCKED = 2;

describe("protect-files hook", () => {
  it.each([
    ".env",
    ".env.local",
    "package-lock.json",
    ".claude/settings.json",
    ".claude/hooks/lib.mjs",
    ".github/workflows/ci.yml",
    ".husky/pre-commit",
    "../outside.txt",
    abs(".github/workflows/ci.yml"),
    abs(".env").toUpperCase(),
    path.parse(root).root + "Windows/evil.txt",
  ])("blocks %s", (file) => {
    expect(run("protect-files.mjs", file)).toBe(BLOCKED);
  });

  it.each(["packages/sim/src/a.ts", abs("apps/web/src/App.tsx"), ".claude/agents/x.md"])(
    "allows %s",
    (file) => {
      expect(run("protect-files.mjs", file)).toBe(0);
    },
  );
});

describe("guard-scope hook", () => {
  const sim = ["packages/sim/"];
  const qa = ["*.test.ts", "*.test.tsx", "e2e/"];

  it("keeps an agent inside its folder", () => {
    expect(run("guard-scope.mjs", abs("packages/sim/src/x.ts"), sim)).toBe(0);
    expect(run("guard-scope.mjs", abs("apps/web/src/x.ts"), sim)).toBe(BLOCKED);
  });

  it("is not fooled by prefixes or traversal", () => {
    expect(run("guard-scope.mjs", "packages/sim-evil/x.ts", sim)).toBe(BLOCKED);
    expect(run("guard-scope.mjs", "packages/sim/../../apps/web/x.ts", sim)).toBe(BLOCKED);
    expect(run("guard-scope.mjs", "../rental-tycoon-copy/packages/sim/x.ts", sim)).toBe(BLOCKED);
  });

  it("lets qa write tests only", () => {
    expect(run("guard-scope.mjs", "packages/sim/src/tick.test.ts", qa)).toBe(0);
    expect(run("guard-scope.mjs", "e2e/rent.spec.ts", qa)).toBe(0);
    expect(run("guard-scope.mjs", "packages/sim/src/tick.ts", qa)).toBe(BLOCKED);
  });
});
