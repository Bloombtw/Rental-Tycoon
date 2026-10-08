// PreToolUse for a subagent: restrict writes to the path prefixes it owns.
// Usage: node guard-scope.mjs <prefix> [<prefix> ...]   (prefix may end with * for a glob-ish match)
import { block, readPayload, targetFile } from "./lib.mjs";

const allowed = process.argv.slice(2);
const raw = targetFile(await readPayload());
if (!raw) process.exit(0);
// Windows paths are case-insensitive.
const fold = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
const file = fold(raw);

const ok = allowed.map(fold).some((p) => {
  if (p.startsWith("*")) return file.endsWith(p.slice(1));
  return file === p || file.startsWith(p.endsWith("/") ? p : p + "/");
});
if (!ok) {
  block(
    `Out of scope: you may only write under [${allowed.join(", ")}], not "${raw}". ` +
      "Report what needs changing there to the lead instead of editing it.",
  );
}
