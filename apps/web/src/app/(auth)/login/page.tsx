import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { providerConfig, safeNext } from "@/server/auth/oidc";
import { buttonVariants } from "@/components/ui/button";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Sign in" };

const SSO_ERRORS: Record<string, string> = {
  sso_no_account: "There's no active Ugnayo account for that email. Ask HR to set one up, then try again.",
  sso_domain: "That email domain isn't allowed to sign in here.",
  sso_unverified: "Your provider didn't confirm a verified email address for this account.",
  sso_state: "Your sign-in session expired. Please try again.",
  sso_cancelled: "Sign-in was cancelled.",
  sso_unavailable: "That sign-in option isn't available right now.",
  sso_failed: "We couldn't complete sign-in with that provider. Please try again.",
};

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4">
    <path fill="currentColor" d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.74 2.98-4.3 2.98-7.28ZM12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22ZM6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96L6.4 13.9ZM12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z" />
  </svg>
);

const MicrosoftMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
    <rect x="3" y="3" width="8.5" height="8.5" />
    <rect x="12.5" y="3" width="8.5" height="8.5" />
    <rect x="3" y="12.5" width="8.5" height="8.5" />
    <rect x="12.5" y="12.5" width="8.5" height="8.5" />
  </svg>
);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const sp = await searchParams;
  const error = sp.error;
  // `/\evil.com` passes a naive startsWith("/") check but browsers resolve it off-site; same rule as SSO.
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  const sso = [
    { id: "google", label: "Continue with Google", Mark: GoogleMark },
    { id: "microsoft", label: "Continue with Microsoft", Mark: MicrosoftMark },
  ].filter((p) => providerConfig(p.id));
  const ssoError = error ? (SSO_ERRORS[error] ?? SSO_ERRORS.sso_failed) : null;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-ink text-on-dark">
            <Building2 className="size-6" />
          </div>
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-ink">Welcome back</h1>
          <p className="mt-3 text-sm text-ink-muted">Sign in with your company account</p>
        </div>
        <div className="rounded-2xl bg-card p-6 ring-1 ring-hairline">
          {ssoError ? (
            <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {ssoError}
            </p>
          ) : null}
          <LoginForm next={next} />
          {sso.length ? (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-ink-muted" aria-hidden>
                <span className="h-px flex-1 bg-hairline" />
                or
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <div className="space-y-2.5">
                {sso.map(({ id, label, Mark }) => (
                  <a key={id} href={`/api/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ""}`} className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                    <Mark />
                    {label}
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Trouble signing in? Contact your HR administrator.</p>
      </div>
    </main>
  );
}
