const { app, BrowserWindow, dialog } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");

const PROJECT = process.env.DJSYNTH_HOME || "/Users/bruno/dj-app";

let server = null;
let pidFile = "";

// A server left behind by a crash / force-quit would keep serving an old build, so the previous one is killed first.
function killStaleServer() {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    if (pid > 0) {
      const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
      if (/next/.test(cmd)) process.kill(pid, "SIGKILL");
    }
  } catch {
    /* no pid file, process already gone, or ps found nothing */
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* nothing to remove */
  }
}

function stopServer() {
  if (server) {
    try {
      server.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    server = null;
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* nothing to remove */
  }
}

function freePort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(freePort(start + 1)));
    s.listen(start, () => s.close(() => resolve(start)));
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
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

function startServer(port) {
  // server.cjs stops the server by itself if this app dies without cleaning up
  server = spawn(process.execPath, [path.join(PROJECT, "mac", "server.cjs"), PROJECT, String(port)], {
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
  fs.writeFileSync(pidFile, String(server.pid));
  server.stderr.on("data", (d) => process.stderr.write(d));
  server.on("exit", () => {
    server = null;
  });
}

async function createWindow(url) {
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
  await win.loadURL(url);
}

app.whenReady().then(async () => {
  pidFile = path.join(app.getPath("userData"), "server.pid");
  killStaleServer();
  const port = await freePort(3217);
  startServer(port);
  const url = `http://localhost:${port}`;
  try {
    await waitForServer(url, 60_000);
    await createWindow(url);
  } catch (e) {
    dialog.showErrorBox("DJSynth", String(e.message));
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", stopServer);
process.on("exit", stopServer);
