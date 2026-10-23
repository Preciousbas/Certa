import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "../../src/server/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}
