// Shared Sentry options for server, edge and browser. Callers skip Sentry.init entirely when the DSN is unset.
import type { Event } from "@sentry/nextjs";

const SECRET = /password|token|secret|^(authorization|cookie|tin|sss|sssno|philhealthno|pagibigno|bankaccountno|basicpay)$/i;

const OFFER_LINK = /\/offer\/[^/?#\s"]+/g; // offer tokens are bearer secrets in the URL

function scrub(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.replace(OFFER_LINK, "/offer/[Filtered]");
  if (!v || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? "[Filtered]" : scrub(x, depth + 1)]));
}

export function beforeSend<E extends Event>(event: E): E {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    event.request.data = scrub(event.request.data);
    event.request.query_string = undefined;
    event.request.url = scrub(event.request.url) as string | undefined;
  }
  event.extra = scrub(event.extra) as Event["extra"];
  event.contexts = scrub(event.contexts) as Event["contexts"];
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({ ...b, message: scrub(b.message) as string | undefined, data: scrub(b.data) as typeof b.data }));
  return event;
}

export const sentryOptions = (dsn: string) => ({
  dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  // Browser only sees NEXT_PUBLIC_*; server falls back to SENTRY_TRACES_SAMPLE_RATE.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  beforeSend,
  beforeSendTransaction: beforeSend,
});
