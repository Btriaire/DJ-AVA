const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const PROJECT = process.env.DJSYNTH_HOME || "/Users/bruno/dj-app";
const PORT = 3217;
const URL_LOCAL = `http://localhost:${PORT}`;

let server = null;

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(URL_LOCAL, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Le serveur local ne répond pas"));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function startServer() {
  const next = path.join(PROJECT, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [next, "start", "-p", String(PORT)], {
    cwd: PROJECT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      // Demucs sur le GPU Apple (MPS) : ~1/3 plus rapide que le CPU mesuré sur un extrait de 30 s
      DEMUCS_DEVICE: process.env.DEMUCS_DEVICE || "mps",
      PYTHON3_PATH: process.env.PYTHON3_PATH || path.join(PROJECT, ".venv-stems", "bin", "python"),
      PATH: `/opt/homebrew/bin:/usr/local/bin:${path.join(PROJECT, ".venv-stems", "bin")}:${process.env.PATH || ""}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  server.on("exit", () => {
    server = null;
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#050506",
    title: "DJSynth",
    titleBarStyle: "hiddenInset",
    webPreferences: { contextIsolation: true },
  });
  await win.loadURL(URL_LOCAL);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer(60_000);
    await createWindow();
  } catch (e) {
    dialog.showErrorBox("DJSynth", String(e.message));
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());

app.on("will-quit", () => {
  if (server) server.kill("SIGTERM");
});
