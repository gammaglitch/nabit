import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Off by default: source maps slow the build and publish readable sources.
  // Set NEXT_SOURCE_MAPS=1 to debug a production-only failure (minified React
  // errors are unreadable without them) — see docs/scripts.md.
  productionBrowserSourceMaps: process.env.NEXT_SOURCE_MAPS === "1",
  turbopack: {
    root: "../..",
  },
};

export default nextConfig;
