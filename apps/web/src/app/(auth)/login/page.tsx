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
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-surface to-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in to HRIS</h1>
          <p className="mt-1 text-sm text-slate-500">Use your company account</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Trouble signing in? Contact your HR administrator.</p>
      </div>
    </main>
  );
}
