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
    "package.json",
    "packages/sim/package.json",
    "apps/server/package.json",
    "apps/web/package.json",
    abs("apps/web/package.json"),
    "vitest.config.ts",
    "packages/sim/vitest.config.ts",
    "apps/server/vitest.config.ts",
    "tests/harness/vitest.config.ts",
    ".claude/settings.json",
    ".claude/hooks/lib.mjs",
    ".claude/agents/sim-engineer.md",
    ".claude/commands/feature.md",
    "CLAUDE.md",
    "claude.md",
    ".mcp.json",
    ".github/workflows/ci.yml",
    ".husky/pre-commit",
    "../outside.txt",
    abs(".github/workflows/ci.yml"),
    abs(".env").toUpperCase(),
    path.parse(root).root + "Windows/evil.txt",
  ])("blocks %s", (file) => {
    expect(run("protect-files.mjs", file)).toBe(BLOCKED);
  });

  it.each([
    "packages/sim/src/a.ts",
    abs("apps/web/src/App.tsx"),
    "docs/specs/x.md",
    "README.md",
    "packages/sim/src/package.ts",
  ])("allows %s", (file) => {
    expect(run("protect-files.mjs", file)).toBe(0);
  });
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

describe("guard-bash hook", () => {
  function bash(command: string): number | null {
    return spawnSync("node", [hook("guard-bash.mjs")], {
      input: JSON.stringify({ tool_input: { command } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
    }).status;
  }

  it.each([
    "npm run check",
    "npm run typecheck",
    "npm run test",
    "npm test",
    "npm run dev:web",
    "npx vitest run --project sim",
    "npx vitest run packages/sim/src/sim.test.ts",
    'npx vitest run --project sim -t "rejects absurd ranges"',
    "git status",
    "git diff --stat HEAD~1",
    "git log --oneline -5",
    "git branch --show-current",
  ])("allows %s", (cmd) => {
    expect(bash(cmd)).toBe(0);
  });

  it.each([
    // writes and redirections
    "echo hi > apps/web/src/App.tsx",
    "cat x >> y",
    "npm run check | tee out.txt",
    "sed -i s/a/b/ apps/web/src/App.tsx",
    "cp a b",
    "mv a b",
    "rm -rf apps",
    "node -e \"require('fs').writeFileSync('x','y')\"",
    "python -c 1",
    "touch apps/web/x.ts",
    // chaining and substitution
    "npm run check && rm -rf .",
    "npm run check; rm x",
    "git status $(rm x)",
    "git status `rm x`",
    "npm run check\nrm x",
    // allowed tools used to write
    "npm run lint:fix",
    "npm run format",
    "npm run test -w @rt/sim",
    "npm run x --prefix packages/sim",
    "npx vitest run -u",
    "npx vitest run --update",
    "npx vitest run --outputFile=x.json",
    "npx eslint --fix apps",
    "npx prettier --write .",
    "npx tsc --outDir ../x",
    "git diff --output=apps/web/src/App.tsx",
    "git checkout -- apps",
    "git commit -m x",
    "git push",
    "npm install left-pad",
    "",
  ])("refuses %j", (cmd) => {
    expect(bash(cmd)).toBe(BLOCKED);
  });
});
