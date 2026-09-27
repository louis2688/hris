import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSetting } from "@/server/services/settings";
import { getListedVacancy } from "@/server/services/careers";
import { fmtDate } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ApplyForm } from "./apply-form";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [company, v] = await Promise.all([getSetting("company"), getListedVacancy(slug)]);
  if (!v) return { title: { absolute: `Careers at ${company.name}` } };
  const description = (v.description ?? `Join ${company.name} as ${v.title}.`).replace(/\s+/g, " ").slice(0, 160);
  return { title: { absolute: `${v.title} - Careers at ${company.name}` }, description, openGraph: { title: `${v.title} at ${company.name}`, description } };
}

export default async function JobPage({ params, searchParams }: Props) {
  const [{ slug }, { ref }] = await Promise.all([params, searchParams]);
  const v = await getListedVacancy(slug);
  if (!v) notFound();
  const facts = [
    ["Department", v.department?.name],
    ["Location", v.location ? [v.location.name, v.location.city].filter(Boolean).join(", ") : null],
    ["Openings", String(v.positions)],
    ["Apply by", v.closesAt ? fmtDate(v.closesAt) : "Open until filled"],
  ].filter((f): f is [string, string] => !!f[1]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <Link href={`/careers${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`} className="mt-6 inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All roles
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-12">
        <article className="min-w-0">
          <h1 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.035em] sm:text-6xl">{v.title}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-hairline py-5 sm:grid-cols-4">
            {facts.map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{val}</dd>
              </div>
            ))}
          </dl>
          <a href="#apply" className={buttonVariants({ className: "mt-6 w-full lg:hidden" })}>
            Apply now
          </a>
          <div className="mt-8 whitespace-pre-line text-[17px] leading-relaxed text-slate-700">{v.description || "Details to follow. Apply and our HR team will reach out."}</div>
        </article>
        <aside id="apply" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-hairline sm:p-6">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">Apply for this role</h2>
            <p className="mb-5 mt-1 text-sm text-ink-muted">Takes about two minutes. PDF resume, up to 5 MB.</p>
            <ApplyForm slug={v.slug!} referralCode={ref && /^[\w-]{1,30}$/.test(ref) ? ref : ""} />
          </div>
        </aside>
      </div>
    </div>
  );
}
