import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { getSetting } from "@/server/services/settings";
import { listPublicVacancies } from "@/server/services/careers";
import { fmtDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSetting("company");
  return { title: { absolute: `Careers at ${name}` }, description: `Open roles at ${name}. Apply online in a few minutes.` };
}

export default async function CareersPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const [{ ref }, company, jobs] = await Promise.all([searchParams, getSetting("company"), listPublicVacancies()]);
  const refQs = ref && /^[\w-]{1,30}$/.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <section className="py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-600">Careers</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-7xl">Build your career at {company.name}</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          {jobs.length ? `${jobs.length} open role${jobs.length === 1 ? "" : "s"}. Pick one, send your resume, and our HR team will get back to you.` : "We have no open roles right now. Check back soon."}
        </p>
      </section>

      {jobs.length ? (
        <ul className="mb-20 divide-y divide-hairline border-y border-hairline">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/careers/${j.slug}${refQs}`} className="group -mx-4 flex items-center gap-4 rounded-2xl px-4 py-6 transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus sm:-mx-6 sm:px-6">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">{j.title}</h2>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                    {j.department ? <span>{j.department.name}</span> : null}
                    {j.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {j.location.city ?? j.location.name}
                      </span>
                    ) : null}
                    {j.closesAt ? <span>Apply by {fmtDate(j.closesAt)}</span> : null}
                  </p>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-hairline transition-colors group-hover:bg-ink group-hover:text-on-dark" aria-hidden>
                  <ArrowUpRight className="size-5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
