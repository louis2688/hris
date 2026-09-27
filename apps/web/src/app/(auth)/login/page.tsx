import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-ink text-on-dark">
            <Building2 className="size-6" />
          </div>
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-ink">Welcome back</h1>
          <p className="mt-3 text-sm text-ink-muted">Sign in with your company account</p>
        </div>
        <div className="rounded-2xl bg-white p-6 ring-1 ring-hairline">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Trouble signing in? Contact your HR administrator.</p>
      </div>
    </main>
  );
}
