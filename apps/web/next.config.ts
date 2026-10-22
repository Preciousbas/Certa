import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (process.env.PLAYWRIGHT !== "1") {
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
}

function connectSources(): string {
  const extra = ["https://telegram.org", "https://oauth.telegram.org"];
  for (const name of ["SUPABASE_URL", "RPC_URL", "SEPOLIA_RPC_URL", "NEXT_PUBLIC_APP_URL"]) {
    const value = process.env[name];
    if (!value) continue;
    try {
      extra.push(new URL(value).origin);
    } catch {
      // An unset or relative URL is left out of connect-src.
    }
  }
  return ["'self'", ...new Set(extra)].join(" ");
}

function imageSources(): string {
  const extra = ["'self'", "data:", "blob:"];
  const supabase = process.env.SUPABASE_URL;
  if (supabase) {
    try {
      extra.push(new URL(supabase).origin);
    } catch {
      // Storage images stay on this origin when the URL is unset.
    }
  }
  return extra.join(" ");
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@certa/db", "@certa/ai", "@certa/chain", "@certa/pdf", "@certa/shared", "@certa/bot"],
  serverExternalPackages: ["postgres", "pdf-parse", "pdfjs-dist", "exceljs", "mammoth", "jszip", "file-type", "xlsx", "heic-convert", "sharp", "pino", "@electric-sql/pglite", "@coinbase/cdp-sdk", "@x402/core", "@x402/evm", "@x402/fetch"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' https://telegram.org 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src ${imageSources()}`,
              `connect-src ${connectSources()}`,
              "frame-src https://telegram.org https://oauth.telegram.org",
              "frame-ancestors https://web.telegram.org https://*.telegram.org 'self'",
            ].join("; "),
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
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
