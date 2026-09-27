import type { captureRouterTransitionStart } from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
// ponytail: Sentry (~130 KB gz) is fetched after hydration and only with a DSN; errors in the first ms before it loads are missed.
const sentry = dsn
  ? import("@sentry/nextjs").then((S) => {
      S.init(sentryOptions(dsn));
      return S;
    })
  : null;

export function onRouterTransitionStart(...args: Parameters<typeof captureRouterTransitionStart>) {
  void sentry?.then((S) => S.captureRouterTransitionStart(...args));
}
