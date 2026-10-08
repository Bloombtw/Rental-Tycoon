// Shared helpers for Claude Code hooks. Hooks get a JSON payload on stdin.
import path from "node:path";

export async function readPayload() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Accepts Windows (D:\x), mixed (D:/x) and Git Bash (/d/x) forms. */
function normalize(p) {
  const msys = /^\/([a-zA-Z])(\/|$)/.exec(p);
  const native = msys && process.platform === "win32" ? `${msys[1]}:\${p.slice(3)}` : p;
  return path.resolve(native);
}

export function projectDir() {
  return normalize(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
}

const OUTSIDE = "../<outside-repo>";

/**
 * Repo-relative, forward-slash path of the file a tool call targets, or null when
 * the call has no file. Paths outside the repo come back starting with "../".
 */
export function targetFile(payload) {
  const input = payload.tool_input ?? {};
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof file !== "string" || file === "") return null;
  const root = projectDir();
  const abs =
    path.isAbsolute(file) || /^\/[a-zA-Z]\//.test(file)
      ? normalize(file)
      : path.resolve(root, file);
  let rel = path.relative(root, abs);
  if (process.platform === "win32" && abs.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
    rel = abs.slice(root.length + 1); // same drive, different casing
  }
  if (path.isAbsolute(rel) || rel.startsWith("..")) return OUTSIDE;
  return rel.split(path.sep).join("/");
}

/** Exit code 2 blocks the tool call and feeds the message back to the agent. */
export function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}
