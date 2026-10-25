const { app, BrowserWindow, dialog, ipcMain } = require("electron");
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
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs") },
  });
  // A renderer killed for lack of memory must not leave a white window: log it, reload (the library is stored on disk)
  // and tell the page why. Three reloads in two minutes means something is really wrong: ask instead.
  const crashes = [];
  win.webContents.on("render-process-gone", (_e, details) => {
    logCrash(`render-process-gone reason=${details.reason} exit=${details.exitCode}`);
    if (details.reason === "clean-exit") return;
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && now - crashes[0] > 120_000) crashes.shift();
    if (crashes.length > 3) {
      dialog.showErrorBox("DJSynth", `L'affichage s'est arrêté plusieurs fois de suite (${details.reason}). Ferme les autres applications puis relance DJSynth.`);
      return;
    }
    win.loadURL(`${url}/?recovered=${encodeURIComponent(details.reason)}`);
  });
  await win.loadURL(url);
}

// what happened, kept next to the app data (read it when the app misbehaves)
function logCrash(line) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "crash.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* log folder not writable */
  }
}
app.on("child-process-gone", (_e, details) => logCrash(`child-process-gone type=${details.type} reason=${details.reason} exit=${details.exitCode}`));

app.whenReady().then(async () => {
  pidFile = path.join(app.getPath("userData"), "server.pid");
  killStaleServer();
  // real memory of every DJSynth process (window, GPU, audio…) plus the local Next server AND its children
  // (yt-dlp, ffmpeg, python analysis and separation), and the RAM of the machine
  ipcMain.handle("djsynth:memory", () => {
    const appMB = Math.round(app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024);
    let serverMB = 0;
    if (server && server.pid) {
      try {
        const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" })
          .trim()
          .split("\n")
          .map((l) => l.trim().split(/\s+/).map(Number));
        const tree = new Set([server.pid]);
        for (let grew = true; grew; ) {
          grew = false;
          for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) (tree.add(pid), (grew = true));
        }
        serverMB = Math.round(rows.filter(([pid]) => tree.has(pid)).reduce((sum, r) => sum + (r[2] || 0), 0) / 1024);
      } catch {
        /* server gone */
      }
    }
    return { appMB, serverMB, totalMB: Math.round(process.getSystemMemoryInfo().total / 1024) };
  });
  // drops the window's HTTP cache (audio streams already played)
  ipcMain.handle("djsynth:trim", async (event) => {
    await event.sender.session.clearCache();
    return true;
  });
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
