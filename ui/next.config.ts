import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: {
    root,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid watching the whole home directory when ~/package-lock.json exists
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          path.join(root, "..", "..", "..", "package-lock.json"),
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
