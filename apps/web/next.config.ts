import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  transpilePackages: ["@certa/db", "@certa/ai", "@certa/chain", "@certa/pdf", "@certa/shared", "@certa/bot"],
  serverExternalPackages: ["postgres", "pdf-parse", "sharp", "pino", "@electric-sql/pglite", "@coinbase/cdp-sdk"],
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    if (isServer) {
      const external = (
        data: { request?: string },
        callback: (error?: Error | null, result?: string) => void,
      ) => {
        if (data.request === "@electric-sql/pglite" || data.request?.startsWith("@electric-sql/pglite/")) {
          callback(null, "commonjs " + data.request);
          return;
        }
        callback();
      };
      config.externals = Array.isArray(config.externals) ? [...config.externals, external] : [config.externals, external];
    }
    return config;
  },
};

export default nextConfig;
