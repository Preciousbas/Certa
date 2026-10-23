import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "../../src/server/sentry-scrub";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.CERTA_ENV || "development",
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}
