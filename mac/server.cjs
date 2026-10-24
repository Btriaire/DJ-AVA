// Runs the local Next server for the DJSynth window and exits as soon as the app that
// started it is gone (crash, force quit): an orphan server runs the app's own executable,
// so macOS would refuse to reopen DJSynth (error -600).
const path = require("node:path");

const [project, port] = process.argv.slice(2);
const parent = process.ppid;
setInterval(() => {
  if (process.ppid !== parent) process.exit(0);
}, 1000).unref();

// .next can be a symlink to a cache folder outside the project: Node resolves it to its real path,
// so the compiled server code no longer finds `next/...` by walking up. Give it the project's modules.
process.env.NODE_PATH = [path.join(project, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require("node:module").Module._initPaths?.();

const next = path.join(project, "node_modules", "next", "dist", "bin", "next");
process.argv = [process.argv[0], next, "start", "-p", port];
require(next);
