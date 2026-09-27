import Link from "next/link";

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(inc\.?|corp\.?|co\.?|the|of|and)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "C";

/** Public pages (careers, offer letters): company mark + name, no app chrome. */
export function PublicShell({ company, children, href = "/careers" }: { company: string; children: React.ReactNode; href?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-hairline print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-sm font-bold text-on-dark">
              {monogram(company)}
            </span>
            <span className="truncate font-display text-lg font-bold tracking-[-0.02em]">{company}</span>
          </Link>
          <span className="text-sm font-medium text-ink-muted">Careers</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-hairline print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <p>
            © {new Date().getFullYear()} {company}
          </p>
          <p>Your data is handled under the Data Privacy Act of 2012 (RA 10173).</p>
        </div>
      </footer>
    </div>
  );
}
