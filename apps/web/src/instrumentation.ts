import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry";

// Same init for the Node and Edge runtimes. No DSN (local, CI, e2e) = Sentry never initialises.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) Sentry.init(sentryOptions(dsn));
}

export const onRequestError = Sentry.captureRequestError;
