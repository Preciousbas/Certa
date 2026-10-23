import { scrubEvent } from "./sentry-scrub";

/** Starts Sentry when SENTRY_DSN is set. With no DSN this returns without loading the SDK. */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.CERTA_ENV || "development",
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}
