import type { Metadata } from "next";
import { CHECKLIST_KIND_LABELS } from "@hris/shared";
import { listTemplates } from "@/server/services/onboarding";
import { deleteTemplateAction } from "@/server/actions/people";
import { ConfirmButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { AddItemForm, ItemRow, TemplateDialog } from "./client";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Checklists" };

export default async function ChecklistsSettingsPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const templates = await listTemplates();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Checklist templates"
          description="Tasks copied onto an employee when onboarding or offboarding starts. Due days count from the hire date, or back from the last day."
          action={<TemplateDialog />}
        />
        {templates.length === 0 ? <EmptyState title="No templates yet" description="Create an onboarding template and mark it default so new hires get it automatically." /> : null}
      </Card>

      {templates.map((t) => (
        <Card key={t.id}>
          <CardHeader
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                {t.name}
                <Badge tone={t.kind === "ONBOARDING" ? "blue" : "violet"}>{CHECKLIST_KIND_LABELS[t.kind]}</Badge>
                {t.isDefault ? <Badge tone="green">Default</Badge> : null}
              </span>
            }
            description={`${t.items.length} item${t.items.length === 1 ? "" : "s"} · used ${t._count.checklists} time${t._count.checklists === 1 ? "" : "s"}`}
            action={
              <div className="flex gap-1">
                <TemplateDialog initial={t} />
                <ConfirmButton action={deleteTemplateAction.bind(null, t.id)} confirm={`Delete "${t.name}"? Checklists already started keep their tasks.`} variant="ghost" size="sm" className="text-red-700">
                  Delete
                </ConfirmButton>
              </div>
            }
          />
          {t.items.length ? (
            <ol className="divide-y divide-slate-100">
              {t.items.map((it, i) => (
                <ItemRow key={it.id} item={it} kind={t.kind} first={i === 0} last={i === t.items.length - 1} />
              ))}
            </ol>
          ) : null}
          <div className="border-t border-slate-100 bg-canvas/60 px-5 py-4">
            <AddItemForm templateId={t.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
