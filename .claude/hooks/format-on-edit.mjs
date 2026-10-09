// PostToolUse Edit|Write: format the touched file. Lint runs at commit (lint-staged), in /check and CI.
import { spawnSync } from "node:child_process";
import { projectDir, readPayload, targetFile } from "./lib.mjs";

const file = targetFile(await readPayload());
if (!file || !/\.(ts|tsx|js|mjs|json|css|md)$/.test(file)) process.exit(0);

spawnSync("npx", ["prettier", "--write", "--log-level", "warn", file], {
  cwd: projectDir(),
  encoding: "utf8",
  shell: process.platform === "win32",
});
