export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
    return;
  }
  await import("./sentry.server.config");
}
