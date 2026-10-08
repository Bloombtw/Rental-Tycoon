// Stop: before the lead hands back control, typecheck + tests must pass.
import { spawnSync } from "node:child_process";
import { projectDir, readPayload } from "./lib.mjs";

const payload = await readPayload();
if (payload.stop_hook_active) process.exit(0); // already retried once this turn; don't loop

const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: projectDir(), encoding: "utf8" });
if (dirty.stdout.trim() === "") process.exit(0); // nothing changed, nothing to verify

for (const script of ["typecheck", "test"]) {
  const r = spawnSync("npm", ["run", script, "--silent"], {
    cwd: projectDir(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    const out = (r.stdout + r.stderr).split("\n").slice(-60).join("\n");
    process.stderr.write(`npm run ${script} failed. Fix it before finishing:\n${out}`);
    process.exit(2);
  }
}
