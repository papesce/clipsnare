import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";

const WATCH_INTERVAL_MS = 500;
const WATCHED_ROOTS = ["server.mjs", "public"];

let serverProcess = null;
let restartTimer = null;
let isShuttingDown = false;
const watchedFiles = new Set();

await refreshWatchedFiles();
startServer();

const refreshTimer = setInterval(() => {
  refreshWatchedFiles().catch((error) => {
    console.error(`Could not refresh watched files: ${error.message}`);
  });
}, 2000);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function startServer() {
  serverProcess = spawn(process.execPath, ["server.mjs"], {
    stdio: "inherit",
    env: process.env
  });

  serverProcess.on("exit", (code, signal) => {
    if (isShuttingDown || restartTimer) {
      return;
    }

    if (signal) {
      console.log(`Server stopped with ${signal}.`);
      return;
    }

    if (code !== 0) {
      console.log(`Server exited with code ${code}. Waiting for file changes...`);
    }
  });
}

function scheduleRestart(filePath) {
  if (isShuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartServer(filePath);
  }, 120);
}

function restartServer(filePath) {
  console.log(`Restarting after ${filePath} changed...`);

  if (!serverProcess || serverProcess.killed) {
    startServer();
    return;
  }

  serverProcess.once("exit", () => {
    if (!isShuttingDown) {
      startServer();
    }
  });
  serverProcess.kill("SIGTERM");
}

async function refreshWatchedFiles() {
  const nextFiles = new Set();

  for (const root of WATCHED_ROOTS) {
    for (const filePath of await listFiles(root)) {
      nextFiles.add(filePath);
      if (!watchedFiles.has(filePath)) {
        watchFile(filePath, { interval: WATCH_INTERVAL_MS }, (current, previous) => {
          if (current.mtimeMs !== previous.mtimeMs) {
            scheduleRestart(filePath);
          }
        });
        watchedFiles.add(filePath);
      }
    }
  }

  for (const filePath of watchedFiles) {
    if (!nextFiles.has(filePath)) {
      unwatchFile(filePath);
      watchedFiles.delete(filePath);
    }
  }
}

async function listFiles(path) {
  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    return [path];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function shutdown() {
  isShuttingDown = true;
  clearInterval(refreshTimer);
  for (const filePath of watchedFiles) {
    unwatchFile(filePath);
  }

  if (!serverProcess || serverProcess.killed) {
    process.exit(0);
  }

  serverProcess.once("exit", () => process.exit(0));
  serverProcess.kill("SIGTERM");
}
