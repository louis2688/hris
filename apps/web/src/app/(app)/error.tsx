"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.message === "Forbidden";
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">{forbidden ? "You do not have access to this page" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-slate-500">{forbidden ? "Ask your HR administrator if you think this is a mistake." : error.message}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
          Go to dashboard
        </Button>
        {!forbidden ? <Button onClick={reset}>Try again</Button> : null}
      </div>
    </div>
  );
}
