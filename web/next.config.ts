import path from "node:path";
import type { NextConfig } from "next";

/**
 * Turbopack's workspace root must be the pnpm workspace root, not this app.
 *
 * `web` is a package in the workspace declared at `../pnpm-workspace.yaml`, and
 * pnpm hoists every dependency into `<root>/node_modules/.pnpm`, leaving
 * `web/node_modules/*` as symlinks pointing up and out. Pinning the root to
 * `web/` makes Turbopack refuse to follow those symlinks ("files outside of the
 * project directory will not be compiled") and it cannot find `next` at all.
 */
const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};

export default nextConfig;
