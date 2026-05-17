import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Only needed for local dev when a package-lock.json exists above the repo
  ...(process.env.NODE_ENV === "development"
    ? {
        turbopack: { root },
        webpack: (config: { watchOptions?: { ignored?: string[] } }) => {
          config.watchOptions = {
            ...config.watchOptions,
            ignored: [
              "**/node_modules/**",
              path.join(root, "..", "..", "..", "package-lock.json"),
            ],
          };
          return config;
        },
      }
    : {}),
};

export default nextConfig;
