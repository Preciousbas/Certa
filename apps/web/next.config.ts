import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@certa/db", "@certa/ai", "@certa/chain", "@certa/pdf", "@certa/shared", "@certa/bot"],
  serverExternalPackages: ["postgres", "pdf-parse", "sharp", "pino", "@electric-sql/pglite", "@coinbase/cdp-sdk"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
