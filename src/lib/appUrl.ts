let loggedMissing = false;

/** Public app origin. Localhost is only a development fallback. */
export function appBaseUrl(): string {
  const app = clean(process.env.APP_URL);
  if (app) return app;
  const next = clean(process.env.NEXT_PUBLIC_APP_URL);
  if (next) return next;
  const vercelHost = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const vercel = vercelHost ? (vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`) : "";
  if (process.env.CERTA_ENV === "production") {
    if (!loggedMissing) {
      loggedMissing = true;
      console.error(JSON.stringify({ msg: "app url missing" }));
    }
    return vercel;
  }
  return vercel || "http://localhost:3000";
}

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/$/, "");
}
