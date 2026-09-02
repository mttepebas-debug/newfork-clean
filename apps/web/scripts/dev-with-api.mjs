import { spawn } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const webUrl = "http://127.0.0.1:5555";
const apiUrl = "http://localhost:5556";

const processes = [
  spawn(pnpm, ["--dir", "../api", "run", "dev"], {
    stdio: "inherit",
    shell: isWindows,
    env: {
      ...process.env,
      PORT: "5556",
      APP_URL: webUrl,
    },
  }),
  spawn("vite", ["--host", "127.0.0.1"], {
    stdio: "inherit",
    shell: isWindows,
    env: {
      ...process.env,
      PORT: "5555",
      VITE_API_URL: apiUrl,
    },
  }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
