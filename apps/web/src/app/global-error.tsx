"use client";

import { useEffect } from "react";

// Replaces the root layout when it crashes, so it brings its own <html> and inline styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Lazy so the Sentry SDK stays out of every page's first-load JS.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((S) => S.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f9f7f3", color: "#151412" }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p>Please try again. If it keeps happening, contact HR.</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
