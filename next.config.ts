import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lean, self-contained production build for the VPS: `next build` emits
  // `.next/standalone` (a minimal server.js + only the traced node_modules), so
  // the server runs without installing dependencies. See Dockerfile / compose.
  output: "standalone",
  // Pin tracing + turbopack to THIS project — there are sibling apps in the
  // parent dir, and without this Next can infer the wrong workspace root.
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
