import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  DatabaseBackup,
  FileText,
  Fingerprint,
  GraduationCap,
  HandCoins,
  KeyRound,
  Laptop,
  Lock,
  MapPin,
  Megaphone,
  Receipt,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Ugnayo - HR, payroll and time for Philippine teams",
  description: "One place for employee records, attendance, leave, payroll, hiring and performance. Built for Philippine labor rules.",
};

// ponytail: fully static marketing page (no session lookup) so it is served from the CDN; "/login" already bounces signed-in users to the dashboard.

const NAV = [
  ["Features", "#features"],
  ["Payroll", "#payroll"],
  ["Mobile", "#mobile"],
  ["Security", "#security"],
  ["FAQ", "#faq"],
] as const;

const COMPLIANCE = ["SSS contributions", "PhilHealth premiums", "Pag-IBIG savings", "BIR withholding tax", "13th month pay", "DOLE holiday pay rules"];

const SUITES: { title: string; blurb: string; items: [typeof Users, string][] }[] = [
  {
    title: "Hire",
    blurb: "From job post to first day.",
    items: [
      [UserPlus, "Careers page and applicant pipeline"],
      [Sparkles, "AI resume screening"],
      [FileText, "Offer letters with e-accept"],
      [ClipboardCheck, "Onboarding checklists"],
    ],
  },
  {
    title: "Manage",
    blurb: "One record for every employee.",
    items: [
      [Users, "201 files, documents and org chart"],
      [Laptop, "Company assets and returns"],
      [Megaphone, "Announcements with read receipts"],
      [ScrollText, "Cases, notices and separations"],
    ],
  },
  {
    title: "Time",
    blurb: "Attendance that matches the payroll.",
    items: [
      [Fingerprint, "Biometric device sync"],
      [MapPin, "Geofenced mobile clock-in"],
      [CalendarDays, "Shifts, swaps and rest days"],
      [Clock, "Leave, overtime and DTR"],
    ],
  },
  {
    title: "Pay & grow",
    blurb: "Pay people right, then help them grow.",
    items: [
      [Wallet, "Payroll runs and payslips"],
      [HandCoins, "Loans, expenses and final pay"],
      [Target, "Goals, reviews and 1:1s"],
      [GraduationCap, "Training and surveys"],
    ],
  },
];

const SECURITY: [typeof Lock, string, string][] = [
  [Lock, "Role-based access", "Employees see their own records. Managers see their team. Pay and government IDs stay with HR."],
  [ScrollText, "Full audit trail", "Every change to a record is logged with who, what and when."],
  [DatabaseBackup, "Encrypted nightly backups", "Your database is backed up every night and kept for 30 days."],
  [KeyRound, "Modern sign-in", "Google and Microsoft single sign-on, passkeys, and Face ID or fingerprint on mobile."],
];

const FAQ: [string, string][] = [
  ["Does it follow Philippine labor rules?", "Yes. Payroll computes SSS, PhilHealth, Pag-IBIG and BIR withholding tax, plus overtime, night differential, regular and special holiday pay, and 13th month pay."],
  ["Can we use our existing biometric devices?", "Yes. Devices that push logs over the standard iclock protocol sync straight into attendance. Employees can also clock in from the mobile app inside a geofence."],
  ["Do employees need training?", "Very little. Leave, payslips, schedules and requests work like any modern app, on the web or on their phone. The HR assistant answers questions about their own records."],
  ["How do we move our data in?", "Import employees and past attendance from CSV, set your leave and payroll policies, then invite your team."],
  ["Who can see salaries and government IDs?", "Only HR and admins. Managers and employees never receive those fields, not even through the API."],
];

export default async function Landing() {
  // Signed-in visitors (logo click from the app) get "Go to dashboard" instead of "Sign in". Makes / dynamic: one cached session lookup.
  const signedIn = !!(await getSession());
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Ugnayo home">
            <LogoMark />
            <span className="font-display text-xl font-bold tracking-[-0.02em]">Ugnayo</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Sections">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="size-9" />
            {signedIn ? null : (
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Sign in
              </Link>
            )}
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
              {signedIn ? "Go to dashboard" : "Open app"}
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-medium text-ink-muted ring-1 ring-inset ring-hairline">
              <span className="size-1.5 rounded-full bg-brand-600" aria-hidden /> Built for Philippine teams
            </p>
            <h1 className="mt-5 font-display text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              HR, payroll and time.
              <br />
              <span className="text-ink-muted">Finally in one place.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
              Employee records, attendance, leave, payroll, hiring and performance share one database, so the numbers always agree. No more spreadsheets between systems.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Get started <ArrowRight />
              </Link>
              <a href="#features" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                See what&apos;s inside
              </a>
            </div>
            <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-muted">
              {["Web and mobile app", "Works with biometrics", "PH payroll built in", "AI HR assistant"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-tone-green-fg" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </section>

        {/* Compliance strip */}
        <section aria-label="Philippine compliance" className="border-y border-hairline bg-bone">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Computed for you</span>
            {COMPLIANCE.map((c) => (
              <span key={c} className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-tone-blue-fg" aria-hidden /> {c}
              </span>
            ))}
          </div>
        </section>

        {/* Suites */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionHead eyebrow="Everything in one system" title="Every part of the employee journey" sub="Start with what you need today. Everything else is already there when you are ready." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUITES.map((s) => (
              <div key={s.title} className="rounded-2xl bg-card p-6 shadow-card">
                <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{s.blurb}</p>
                <ul className="mt-5 space-y-3">
                  {s.items.map(([Icon, label]) => (
                    <li key={label} className="flex items-start gap-3 text-sm">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-bone">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="pt-1">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Spotlights */}
        <section id="payroll" className="mx-auto max-w-6xl scroll-mt-20 space-y-20 px-4 pb-20 sm:px-6">
          <Spotlight
            eyebrow="Time and attendance"
            title="Punches in, clean DTR out"
            body="Biometric devices and the mobile app feed the same timesheet. Late, undertime, overtime and night differential are counted per shift, and employees fix missed punches with a request instead of a message to HR."
            points={["Geofenced clock-in with location check", "Shift rosters, swaps and rest days", "Attendance corrections with approval"]}
            visual={<DtrVisual />}
          />
          <Spotlight
            reverse
            eyebrow="Payroll"
            title="Payroll that reads the timesheet"
            body="Each run pulls approved attendance, leave and overtime, applies holiday rules and government contributions, and publishes payslips employees can open on their phone."
            points={["Regular, off-cycle and final pay runs", "Loans, allowances and adjustments", "Bank file and accounting export"]}
            visual={<PayslipVisual />}
          />
          <Spotlight
            eyebrow="Self-service"
            title="Fewer questions in HR's inbox"
            body="Employees file leave, overtime and certificate requests, check balances and read announcements themselves. The HR assistant answers questions using only their own records and your policies."
            points={["Multi-level approvals with email alerts", "Certificate of employment on request", "AI assistant that cites company policy"]}
            visual={<AssistantVisual />}
          />
        </section>

        {/* Mobile */}
        <section id="mobile" className="scroll-mt-16 bg-slate-900 text-on-dark">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mobile app</p>
              <h2 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">HR in every pocket</h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-slate-300">
                Clock in, file leave, swap shifts, approve requests and open payslips from iPhone or Android. Sign in with Face ID or fingerprint.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-200">
                {["Push notifications for approvals", "Geofenced attendance", "Payslips and schedules on the go"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-brand-400" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <PhoneVisual />
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionHead eyebrow="Security and privacy" title="Built to hold sensitive data" sub="Payroll, government IDs and health leave are the most private data a company keeps. It is treated that way." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map(([Icon, title, body]) => (
              <div key={title} className="rounded-2xl bg-card p-6 shadow-card">
                <Icon className="size-5" aria-hidden />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="border-y border-hairline bg-bone">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead eyebrow="Getting started" title="Live in three steps" />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                ["Import your people", "Upload employees and past attendance from CSV, or add them one by one."],
                ["Set your policies", "Leave types, shifts, holidays, approval chains and payroll settings."],
                ["Invite your team", "Everyone gets a login on web and mobile. Connect biometrics when ready."],
              ].map(([t, b], i) => (
                <li key={t} className="rounded-2xl bg-card p-6 shadow-card">
                  <span className="font-mono text-sm text-ink-muted">0{i + 1}</span>
                  <h3 className="mt-3 text-lg font-semibold">{t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionHead eyebrow="FAQ" title="Questions HR teams ask" />
          <div className="mt-10 divide-y divide-hairline rounded-2xl bg-card shadow-card">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="text-xl leading-none text-ink-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl bg-slate-900 px-6 py-14 text-center text-on-dark sm:px-12">
            <h2 className="font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Run HR from one place</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">Sign in to set up your company, or ask your HR admin for an invite.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/login" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Get started <ArrowRight />
              </Link>
              <Link href="/careers" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-on-dark hover:bg-white/10")}>
                View open jobs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="font-display font-bold text-ink">Ugnayo</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-ink">
                {label}
              </a>
            ))}
            <Link href="/careers" className="hover:text-ink">
              Careers
            </Link>
            <Link href={signedIn ? "/dashboard" : "/login"} className="hover:text-ink">
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{eyebrow}</p>
      <h2 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">{title}</h2>
      {sub ? <p className="mt-4 text-lg leading-relaxed text-ink-muted">{sub}</p> : null}
    </div>
  );
}

function Spotlight({ eyebrow, title, body, points, visual, reverse }: { eyebrow: string; title: string; body: string; points: string[]; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div className={cn(reverse && "md:order-2")}>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{eyebrow}</p>
        <h3 className="mt-3 font-display text-3xl font-bold leading-[1.1] tracking-[-0.025em] sm:text-4xl">{title}</h3>
        <p className="mt-4 leading-relaxed text-ink-muted">{body}</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <Check className="size-4 text-tone-green-fg" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden>{visual}</div>
    </div>
  );
}

// ---- Illustrations: plain HTML/CSS, sample data, decorative (aria-hidden) ----

const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("rounded-2xl bg-card p-5 shadow-float", className)}>{children}</div>;

function ProductPreview() {
  const bars = [62, 80, 74, 91, 88, 45, 30];
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-linear-to-br from-brand-100 via-bone to-tone-blue-bg opacity-80 blur-2xl" />
      <Frame className="p-0">
        <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-3">
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 h-5 flex-1 rounded-full bg-canvas" />
        </div>
        <div className="grid grid-cols-[56px_1fr]">
          <div className="space-y-3 border-r border-hairline p-3">
            <span className="block size-8 rounded-lg bg-brand-600" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={cn("block h-2 rounded-full", i === 0 ? "bg-ink" : "bg-slate-200")} />
            ))}
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Present today", "84 / 96"],
                ["Pending leave", "7"],
                ["Next payroll", "30 Sep"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-canvas p-3">
                  <p className="text-[10px] text-ink-muted">{k}</p>
                  <p className="mt-1 whitespace-nowrap font-display text-base font-bold sm:text-lg">{v}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-[10px] text-ink-muted">Attendance this week</p>
              <div className="mt-3 flex h-20 items-end gap-2">
                {bars.map((h, i) => (
                  <span key={i} className={cn("flex-1 rounded-t-md", i === 4 ? "bg-brand-600" : "bg-slate-300")} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {[
                ["MS", "Vacation leave", "2 days", "bg-tone-amber-bg text-tone-amber-fg", "Pending"],
                ["JD", "Overtime", "3 hrs", "bg-tone-green-bg text-tone-green-fg", "Approved"],
              ].map(([i, t, d, tone, s]) => (
                <div key={t} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-card text-[10px] font-semibold ring-1 ring-hairline">{i}</span>
                  <span className="flex-1 text-xs">
                    {t} · <span className="text-ink-muted">{d}</span>
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone)}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Frame>
    </div>
  );
}

function DtrVisual() {
  const rows = [
    ["Mon 22", "08:54", "18:02", "On time", "bg-tone-green-bg text-tone-green-fg"],
    ["Tue 23", "09:12", "18:05", "Late 12m", "bg-tone-amber-bg text-tone-amber-fg"],
    ["Wed 24", "08:58", "20:31", "OT 2h 30m", "bg-tone-blue-bg text-tone-blue-fg"],
    ["Thu 25", "-", "-", "Vacation leave", "bg-tone-violet-bg text-tone-violet-fg"],
  ] as const;
  return (
    <Frame>
      <p className="text-sm font-semibold">Daily time record</p>
      <div className="mt-4 divide-y divide-hairline text-xs">
        {rows.map(([d, i, o, s, tone]) => (
          <div key={d} className="grid grid-cols-[64px_1fr_1fr_auto] items-center gap-2 py-2.5">
            <span className="font-medium">{d}</span>
            <span className="font-mono text-ink-muted">{i}</span>
            <span className="font-mono text-ink-muted">{o}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-medium", tone)}>{s}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-muted">
        <MapPin className="size-3.5" /> Clocked in at Manila HQ · inside geofence
      </div>
    </Frame>
  );
}

function PayslipVisual() {
  const lines = [
    ["Basic pay", "25,000.00"],
    ["Overtime", "1,420.45"],
    ["Holiday pay", "1,923.08"],
    ["SSS", "-1,125.00"],
    ["PhilHealth", "-625.00"],
    ["Pag-IBIG", "-200.00"],
    ["Withholding tax", "-1,134.52"],
  ] as const;
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Payslip · 16-30 Sep</p>
        <Receipt className="size-4 text-ink-muted" />
      </div>
      <div className="mt-4 space-y-2 text-xs">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-ink-muted">{k}</span>
            <span className={cn("font-mono tabular-nums", v.startsWith("-") && "text-tone-red-fg")}>{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-hairline pt-4">
        <span className="text-xs text-ink-muted">Net pay</span>
        <span className="font-display text-2xl font-bold">PHP 25,259.01</span>
      </div>
    </Frame>
  );
}

function AssistantVisual() {
  return (
    <Frame className="space-y-3 text-sm">
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-on-dark">How many vacation days do I have left?</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <Sparkles className="size-3.5" /> Checking your leave balances...
      </p>
      <div className="max-w-[90%] rounded-2xl bg-canvas px-4 py-3 leading-relaxed">
        You have <strong>8.5 vacation leave days</strong> available this year. 3 are used and none are pending.
      </div>
      <div className="flex gap-2 pt-1">
        {["File leave", "Next holiday"].map((t) => (
          <span key={t} className="rounded-full bg-canvas px-3 py-1.5 text-xs ring-1 ring-inset ring-hairline">
            {t}
          </span>
        ))}
      </div>
    </Frame>
  );
}

const PHONE_TILES: [typeof Wallet, string, string][] = [
  [CalendarDays, "Leave", "8.5 days"],
  [Wallet, "Payslip", "Ready"],
  [BarChart3, "This month", "On time"],
  [ClipboardCheck, "Requests", "2 open"],
];

function PhoneVisual() {
  return (
    <div aria-hidden className="mx-auto w-64 rounded-[2.5rem] bg-slate-800 p-3 shadow-2xl ring-1 ring-white/10">
      <div className="rounded-[2rem] bg-canvas p-4 text-ink">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-300" />
        <p className="text-xs text-ink-muted">Good morning</p>
        <p className="font-display text-lg font-bold">Maria</p>
        <div className="mt-4 rounded-2xl bg-card p-4 text-center shadow-card">
          <p className="text-[10px] text-ink-muted">Wed, 24 Sep</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">08:58</p>
          <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 py-2 text-xs font-semibold text-white">
            <Smartphone className="size-3.5" /> Clock in
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PHONE_TILES.map(([Icon, k, v]) => (
            <div key={k} className="rounded-xl bg-card p-2.5 shadow-card">
              <Icon className="size-3.5 text-ink-muted" />
              <p className="mt-1.5 text-[10px] text-ink-muted">{k}</p>
              <p className="text-xs font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
