import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ASSET_STATUSES, ASSET_STATUS_LABELS, assetListQuerySchema } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { assetCategories, listAssets } from "@/server/services/assets";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fullName } from "@/lib/utils";
import { AssetDialog, AssetStatusBadge } from "./client";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await gate("ADMIN", "HR");
  const q = assetListQuerySchema.parse(await searchParams);
  const [items, categories] = await Promise.all([listAssets(q), assetCategories()]);
  const assigned = items.filter((a) => a.status === "ASSIGNED").length;
  const filtered = !!(q.q || q.status || q.category);

  return (
    <>
      <PageHeader title="Assets" description={`${items.length} ${filtered ? "matching" : "tracked"} · ${assigned} assigned`} actions={<AssetDialog categories={categories} />} />
      <Card>
        <form className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_170px_170px_auto]" method="get">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q.q} placeholder="Tag, name, serial or person" className="pl-10" aria-label="Search assets" />
          </div>
          <Select name="status" defaultValue={q.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select name="category" defaultValue={q.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>

        {items.length === 0 ? (
          <EmptyState
            title={filtered ? "No assets match" : "No assets yet"}
            description={filtered ? "Try a different search or clear the filters." : "Add laptops, phones and other equipment to track who has what."}
            action={filtered ? <Link href="/assets" className={buttonVariants({ variant: "secondary", size: "sm" })}>Clear filters</Link> : undefined}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 sm:hidden">
              {items.map((a) => (
                <li key={a.id}>
                  <Link href={`/assets/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        <span className="font-mono">{a.tag}</span> · {a.assignedTo ? fullName(a.assignedTo) : a.category}
                      </p>
                    </div>
                    <AssetStatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Tag</TH>
                    <TH>Asset</TH>
                    <TH>Serial</TH>
                    <TH>Status</TH>
                    <TH>Assigned to</TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((a) => (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap">
                        <Link href={`/assets/${a.id}`} className="font-mono text-xs font-semibold text-ink hover:text-brand-700">
                          {a.tag}
                        </Link>
                      </TD>
                      <TD>
                        <Link href={`/assets/${a.id}`} className="block font-medium text-ink hover:text-brand-700">
                          {a.name}
                        </Link>
                        <span className="text-xs text-slate-500">{a.category}</span>
                      </TD>
                      <TD className="font-mono text-xs">{a.serialNumber ?? "-"}</TD>
                      <TD>
                        <AssetStatusBadge status={a.status} />
                      </TD>
                      <TD>
                        {a.assignedTo ? (
                          <Link href={`/employees/${a.assignedTo.id}`} className="flex items-center gap-2.5">
                            <Avatar first={a.assignedTo.firstName} last={a.assignedTo.lastName} src={a.assignedTo.avatarUrl} size="sm" />
                            <span>
                              <span className="block text-ink hover:text-brand-700">{fullName(a.assignedTo)}</span>
                              <span className="block text-xs text-slate-500">since {fmtDate(a.assignedAt)}</span>
                            </span>
                          </Link>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
