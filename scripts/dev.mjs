// Runs server and web dev servers together, cross-platform. Ctrl+C or one crashing stops both.
import { spawn } from "node:child_process";

const tasks = [
  { name: "server", color: 34, script: "dev:server" },
  { name: "web", color: 35, script: "dev:web" },
];

const children = tasks.map(({ name, color, script }) => {
  // A single command string (fixed, no user input): needed for npm.cmd on Windows.
  const child = spawn(`npm run ${script} --silent`, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line) out.write(prefix + line + "\n");
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.error(`${prefix}exited with code ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"]);
    else c.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
