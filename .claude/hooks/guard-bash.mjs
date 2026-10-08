// PreToolUse Bash for subagents: allowlist of read-only / verification commands.
// Agents only need Bash to run checks; anything that could write files is refused.
import { block, readPayload } from "./lib.mjs";

const SCRIPTS = [
  "check",
  "lint",
  "typecheck",
  "test",
  "format:check",
  "build",
  "dev",
  "dev:web",
  "dev:server",
];

const ALLOWED = [
  // Root npm scripts only: no -w/--prefix (a workspace package.json is editable by agents).
  new RegExp(`^npm run (${SCRIPTS.join("|")})$`),
  /^npm test$/,
  // Vitest without snapshot updates or output files.
  /^npx vitest( run)?( (--project [a-z]+|[\w./-]+\.test\.tsx?|-t "[\w .,'-]*"|--reporter=\w+))*$/,
  // Read-only git.
  /^git (status|diff|log|show)( [\w./@^~:=-]+)*$/,
  /^git branch( --show-current| -a| -v)?$/,
];

// Shell features that chain, redirect, substitute or spawn: never allowed.
const META = /[;&|<>`$(){}\n\\]|\b(eval|exec|xargs)\b/;
// Flags that make an allowed command write to disk.
const WRITE_FLAGS = /(^|\s)(-u|--update|--output\S*|--outputFile\S*|--fix|--write|-o)(\s|=|$)/;

const command = String((await readPayload()).tool_input?.command ?? "").trim();
const reason = META.test(command)
  ? "shell operators (; & | > < ` $ ( ) \\) are not allowed"
  : WRITE_FLAGS.test(command)
    ? "flags that write files are not allowed"
    : ALLOWED.some((re) => re.test(command))
      ? null
      : "command is not on the allowlist";

if (reason) {
  block(
    `Bash refused (${reason}): \`${command.slice(0, 200)}\`. ` +
      "Agents may only run: npm run check|lint|typecheck|test|format:check|build|dev*, " +
      "npx vitest [run] [--project X] [file.test.ts], read-only git (status/diff/log/show). " +
      "Use Edit/Write inside your scope to change files.",
  );
}
