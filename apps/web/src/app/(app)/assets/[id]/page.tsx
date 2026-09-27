import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { gate } from "@/server/auth/session";
import { assetCategories, assetHistory, getAsset } from "@/server/services/assets";
import { employeeOptions } from "@/server/services/employees";
import { deleteAssetAction, setAssetStatusAction } from "@/server/actions/people";
import { ConfirmButton } from "@/components/action-form";
import { DL } from "@/components/profile";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ActionButton } from "../../announcements/client";
import { AssetDialog, AssetStatusBadge, AssignForm } from "../client";

export const metadata: Metadata = { title: "Asset" };

const ACTION_LABEL: Record<string, string> = {
  "asset.create": "Added",
  "asset.update": "Details edited",
  "asset.assign": "Assigned",
  "asset.return": "Returned",
  "asset.available": "Marked available",
  "asset.repair": "Sent to repair",
  "asset.retire": "Retired",
};

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const a = await getAsset(id).catch(() => null);
  if (!a) notFound();
  const [history, employees, categories] = await Promise.all([assetHistory(id), employeeOptions(), assetCategories()]);
  const peso = a.cost ? `PHP ${Number(a.cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : null;

  async function remove() {
    "use server";
    const r = await deleteAssetAction(id);
    if (r.ok) redirect("/assets");
    return r;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm">
        <Link href="/assets" className="text-slate-500 hover:text-brand-700">
          Assets
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="font-mono text-slate-700">{a.tag}</span>
      </p>

      <Card className="mb-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{a.name}</h1>
              <AssetStatusBadge status={a.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-mono">{a.tag}</span> · {a.category}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AssetDialog
              categories={categories}
              initial={{ ...a, cost: a.cost?.toString() ?? null, purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString().slice(0, 10) : null }}
            />
            <ConfirmButton action={remove} confirm={`Delete ${a.tag}? Its history stays in the audit log.`} variant="ghost" size="sm" className="text-red-700">
              Delete
            </ConfirmButton>
          </div>
        </CardBody>
        <div className="border-t border-slate-100 px-5 py-4">
          <DL
            cols={3}
            items={[
              ["Serial number", a.serialNumber ? <span className="font-mono">{a.serialNumber}</span> : null],
              ["Purchase date", a.purchaseDate ? fmtDate(a.purchaseDate) : null],
              ["Cost", peso],
              ...(a.notes ? ([["Notes", a.notes]] as [string, string][]) : []),
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Custody" />
          <CardBody className="space-y-4">
            {a.assignedTo ? (
              <div className="flex items-center gap-3 rounded-xl bg-bone px-4 py-3">
                <Avatar first={a.assignedTo.firstName} last={a.assignedTo.lastName} src={a.assignedTo.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link href={`/employees/${a.assignedTo.id}?tab=assets`} className="block truncate text-sm font-medium text-ink hover:text-brand-700">
                    {fullName(a.assignedTo)}
                  </Link>
                  <p className="text-xs text-slate-500">Since {fmtDate(a.assignedAt)}</p>
                </div>
                <ActionButton action={setAssetStatusAction.bind(null, a.id, "AVAILABLE")} variant="secondary">
                  Return
                </ActionButton>
              </div>
            ) : (
              <p className="text-sm text-slate-500">{a.status === "RETIRED" ? "Retired assets cannot be assigned." : "Not assigned to anyone."}</p>
            )}
            {a.status !== "RETIRED" ? (
              <AssignForm id={a.id} employees={employees.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }))} current={a.assignedTo?.id} />
            ) : null}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {a.status === "REPAIR" || a.status === "RETIRED" ? (
                <ActionButton action={setAssetStatusAction.bind(null, a.id, "AVAILABLE")} variant="secondary">
                  Mark available
                </ActionButton>
              ) : null}
              {a.status !== "REPAIR" && a.status !== "RETIRED" ? (
                <ActionButton action={setAssetStatusAction.bind(null, a.id, "REPAIR")} variant="secondary">
                  Send to repair
                </ActionButton>
              ) : null}
              {a.status !== "RETIRED" ? (
                <ConfirmButton action={setAssetStatusAction.bind(null, a.id, "RETIRED")} confirm={`Retire ${a.tag}? It will be unassigned.`} variant="ghost" size="sm">
                  Retire
                </ConfirmButton>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" />
          {history.length === 0 ? (
            <EmptyState title="No history yet" />
          ) : (
            <ol className="divide-y divide-slate-100">
              {history.map((h) => {
                const after = (h.after ?? {}) as { to?: string; from?: string };
                const who = h.actor?.employee ? fullName(h.actor.employee) : (h.actor?.email ?? "System");
                return (
                  <li key={h.id} className="px-5 py-3">
                    <p className="text-sm text-ink">
                      <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                      {after.to ? ` to ${after.to}` : after.from && h.action !== "asset.update" && h.action !== "asset.create" ? ` from ${after.from}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDateTime(h.createdAt)} · {who}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
