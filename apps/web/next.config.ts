import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
try {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1);
  }
} catch {
  // The repo .env is optional. Apps still run on their own environment.
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@certa/db", "@certa/ai", "@certa/chain", "@certa/pdf", "@certa/shared", "@certa/bot"],
  serverExternalPackages: ["postgres", "pdf-parse", "sharp", "pino", "@electric-sql/pglite", "@coinbase/cdp-sdk", "@x402/core", "@x402/evm", "@x402/fetch"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' https://telegram.org${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data:",
              "connect-src 'self' https://telegram.org",
              "frame-ancestors https://web.telegram.org https://*.telegram.org",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" },
        ],
      },
    ];
  },
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
