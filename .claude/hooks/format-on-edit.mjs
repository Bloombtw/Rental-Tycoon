// PostToolUse Edit|Write: format and lint-fix the touched file; report remaining lint errors.
import { spawnSync } from "node:child_process";
import { projectDir, readPayload, targetFile } from "./lib.mjs";

const file = targetFile(await readPayload());
if (!file || !/\.(ts|tsx|js|mjs|json|css|md)$/.test(file)) process.exit(0);

const run = (cmd, args) =>
  spawnSync(cmd, args, {
    cwd: projectDir(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });

run("npx", ["prettier", "--write", "--log-level", "warn", file]);
if (/\.(ts|tsx)$/.test(file)) {
  const lint = run("npx", ["eslint", "--fix", "--max-warnings=0", file]);
  if (lint.status !== 0) {
    process.stderr.write(`ESLint still reports problems in ${file}:\n${lint.stdout}${lint.stderr}`);
    process.exit(2); // feeds the errors back to the agent so it fixes them now
  }
}
