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
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/60 via-brand-100/40 to-transparent blur-3xl" aria-hidden />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgb(0_82_255/0.6)]">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in with your company account</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-float ring-1 ring-slate-900/[0.06]">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Trouble signing in? Contact your HR administrator.</p>
      </div>
    </main>
  );
}
