"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { commitImportAction, previewImportAction } from "@/server/actions/timeoff";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Preview = Extract<Awaited<ReturnType<typeof previewImportAction>>, { ok: true }>["data"];
const SAMPLE = "employeeCode,date,time_in,time_out\nEMP-0005,2026-09-01,08:55,18:02";

export function Importer() {
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [summary, setSummary] = React.useState<{ inserted: number; skipped: number; errors: number } | null>(null);
  const [pending, start] = React.useTransition();
  const errors = preview?.rows.filter((r) => r.error).length ?? 0;

  const edit = (v: string) => {
    setText(v);
    setPreview(null);
    setSummary(null);
  };
  const doPreview = () =>
    start(async () => {
      const r = await previewImportAction(text);
      if (r.ok) setPreview(r.data);
      else toast.error(r.error);
    });
  const doCommit = () =>
    start(async () => {
      const r = await commitImportAction(text);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Imported");
      setSummary(r.data);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="1. File" description="CSV columns: employeeCode (or biometricId), date (YYYY-MM-DD), time_in, time_out (HH:mm). An out time earlier than the in time counts as the next day." />
        <div className="space-y-3 px-5 py-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-ink hover:bg-canvas">
            <Upload className="size-4" /> Choose file
            <input
              type="file"
              accept=".csv,.txt,.dat,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) edit(await f.text());
              }}
            />
          </label>
          <Textarea aria-label="Attendance data" rows={8} value={text} onChange={(e) => edit(e.target.value)} placeholder={SAMPLE} className="font-mono text-xs" />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={doPreview} loading={pending && !preview} disabled={!text.trim()}>
              Preview
            </Button>
          </div>
        </div>
      </Card>

      {preview ? (
        <Card>
          <CardHeader
            title="2. Preview"
            description={`${preview.format} · ${preview.rows.length} row${preview.rows.length === 1 ? "" : "s"} · ${preview.valid} punch${preview.valid === 1 ? "" : "es"} ready${errors ? ` · ${errors} with errors (skipped)` : ""}`}
            action={
              summary ? null : (
                <Button variant="brand" onClick={doCommit} loading={pending} disabled={!preview.valid}>
                  Import {preview.valid} punch{preview.valid === 1 ? "" : "es"}
                </Button>
              )
            }
          />
          {summary ? (
            <p className="border-b border-slate-100 bg-tone-green-bg px-5 py-3 text-sm text-tone-green-fg" role="status">
              Done: {summary.inserted} inserted, {summary.skipped} already on file, {summary.errors} row{summary.errors === 1 ? "" : "s"} with errors.
            </p>
          ) : null}
          {preview.rows.length === 0 ? (
            <EmptyState title="No rows found" />
          ) : (
            <Table className="min-w-[560px]">
              <THead>
                <tr>
                  <TH className="w-16">Line</TH>
                  <TH>Employee</TH>
                  <TH>Date</TH>
                  <TH>Punches</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {preview.rows.slice(0, 500).map((r) => (
                  <TR key={r.line}>
                    <TD className="tabular-nums text-slate-500">{r.line}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.name ?? r.key}</span>
                      {r.name ? <span className="ml-1.5 font-mono text-xs text-slate-500">{r.key}</span> : null}
                    </TD>
                    <TD className="tabular-nums">{r.date || "-"}</TD>
                    <TD className="font-mono text-xs">{r.punches || "-"}</TD>
                    <TD>{r.error ? <Badge tone="red">{r.error}</Badge> : <Badge tone="green">OK</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {preview.rows.length > 500 ? <p className="px-5 py-3 text-xs text-slate-500">Showing the first 500 rows.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
