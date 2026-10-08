// PreToolUse (all agents): files no agent may write. Humans change these by hand.
import { block, readPayload, targetFile } from "./lib.mjs";

const PROTECTED = [
  /^\.\./i, // anything outside the repo
  /^\.env(\..*)?$/i,
  /^package-lock\.json$/i,
  /(^|\/)package\.json$/i, // root and workspace manifests (scripts, deps)
  // Vite/Vitest configs (any extension, so an agent can't add an overriding vitest.config.mts).
  /(^|\/)vite(st)?\.config\.[cm]?[jt]s$/i,
  /^\.claude\//i, // agents, hooks, commands, settings: the harness itself
  /^CLAUDE\.md$/i,
  /^\.mcp\.json$/i,
  /^\.github\/workflows\//i,
  /^\.husky\//i,
  /^\.git\//i,
];

const file = targetFile(await readPayload());
if (file && PROTECTED.some((re) => re.test(file))) {
  block(
    `Blocked: "${file}" is protected (harness/secrets/lockfile). ` +
      "Ask the human to change it, or use npm install for dependencies.",
  );
}
