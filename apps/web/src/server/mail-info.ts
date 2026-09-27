import "server-only";
import { appUrl } from "./mail";

/** Safe-to-display mail config: never returns the SMTP URL, user or password. */
export function mailInfo() {
  const raw = process.env.SMTP_URL;
  let host: string | null = null;
  if (raw) {
    try {
      const u = new URL(raw);
      host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    } catch {
      host = "(unparseable SMTP_URL)";
    }
  }
  const appUrlSource = process.env.APP_URL
    ? "APP_URL"
    : process.env.NEXT_PUBLIC_APP_URL
      ? "NEXT_PUBLIC_APP_URL"
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? "VERCEL_PROJECT_PRODUCTION_URL"
        : "default";
  return {
    configured: !!raw,
    host,
    // ponytail: mirrors the fallback in mail.ts sendMail(); keep in sync if that changes
    from: process.env.MAIL_FROM || "Ugnayo <no-reply@hris.local>",
    fromIsDefault: !process.env.MAIL_FROM,
    appUrl: appUrl(),
    appUrlSource,
  };
}
