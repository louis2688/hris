import type { Metadata } from "next";
import Link from "next/link";
import { QUALIFICATION_KINDS, QUALIFICATION_LABELS, type QualificationKind } from "@hris/shared";
import { listNationalities, listQualifications } from "@/server/services/qualifications";
import { deleteNationalityAction, deleteQualificationAction, saveNationalityAction, saveQualificationAction } from "@/server/actions/qualifications";
import { EntityManager } from "@/components/entity-manager";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Qualifications" };

const TABS = [...QUALIFICATION_KINDS, "NATIONALITY"] as const;
const LABEL: Record<(typeof TABS)[number], string> = { ...QUALIFICATION_LABELS, NATIONALITY: "Nationality" };

export default async function QualificationsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams;
  const kind = (TABS as readonly string[]).includes(k ?? "") ? (k as (typeof TABS)[number]) : "SKILL";

  return (
    <div className="space-y-4">
      <nav className="inline-flex gap-1 rounded-xl bg-slate-200/60 p-1" aria-label="Qualification type">
        {TABS.map((t) => (
          <Link key={t} href={`/settings/qualifications?kind=${t}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", t === kind ? "bg-white text-ink shadow-card" : "text-slate-600 hover:text-ink")}>
            {LABEL[t]}s
          </Link>
        ))}
      </nav>
      {kind === "NATIONALITY" ? <Nationalities /> : <Qualifications kind={kind} />}
    </div>
  );
}

async function Qualifications({ kind }: { kind: QualificationKind }) {
  const rows = await listQualifications(kind);
  const label = QUALIFICATION_LABELS[kind];
  return (
    <EntityManager
      title={`${label}s`}
      singular={label.toLowerCase()}
      columns={["Name", "Description", "Employees"]}
      rows={rows.map((r) => ({ id: r.id, cells: [r.name, r.description ?? "-", r._count.holders], values: r }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "description", label: "Description", type: "textarea", span: 2 },
      ]}
      hidden={{ kind }}
      saveAction={saveQualificationAction}
      deleteAction={deleteQualificationAction}
      deleteConfirm={`Delete this ${label.toLowerCase()}? It is removed from every employee who has it.`}
    />
  );
}

async function Nationalities() {
  const rows = await listNationalities();
  return (
    <EntityManager
      title="Nationalities"
      singular="nationality"
      columns={["Name"]}
      rows={rows.map((r) => ({ id: r.id, cells: [r.name], values: r }))}
      fields={[{ name: "name", label: "Name", required: true, span: 2 }]}
      saveAction={saveNationalityAction}
      deleteAction={deleteNationalityAction}
    />
  );
}
