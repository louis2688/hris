"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ActionResult } from "@/server/actions/_helpers";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type FieldDef =
  | { name: string; label: string; type?: "text" | "email" | "date" | "number" | "color"; required?: boolean; hint?: string; placeholder?: string; step?: string; min?: number; span?: 2 }
  | { name: string; label: string; type: "textarea"; hint?: string; span?: 2 }
  | { name: string; label: string; type: "select"; options: { id: string; name: string }[]; placeholder?: string; required?: boolean; hint?: string; span?: 2 }
  | { name: string; label: string; type: "checkbox"; hint?: string; span?: 2 };

export type Row = { id: string; cells: React.ReactNode[]; values: Record<string, unknown>; deletable?: boolean };

type SaveAction = (id: string | undefined, prev: ActionResult | undefined, fd: FormData) => Promise<ActionResult>;

/**
 * Data-driven CRUD table + dialog. Good enough for every settings entity;
 * ponytail: swap for a bespoke page only if an entity needs custom layout.
 */
export function EntityManager({
  title,
  description,
  singular,
  columns,
  rows,
  fields,
  saveAction,
  deleteAction,
  deleteConfirm,
  extra,
}: {
  title: string;
  description?: string;
  singular: string;
  columns: string[];
  rows: Row[];
  fields: FieldDef[];
  saveAction: SaveAction;
  deleteAction?: (id: string) => Promise<ActionResult>;
  deleteConfirm?: string;
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState<Row | "new" | null>(null);
  const initial = editing && editing !== "new" ? editing.values : {};
  const id = editing && editing !== "new" ? editing.id : undefined;

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <div className="flex gap-2">
            {extra}
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add {singular}
            </Button>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} action={<Button size="sm" variant="secondary" onClick={() => setEditing("new")}>Add the first {singular}</Button>} />
      ) : (
        <Table className="min-w-[520px]">
          <THead>
            <tr>
              {columns.map((c) => (
                <TH key={c}>{c}</TH>
              ))}
              <TH className="w-24 text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                {r.cells.map((c, i) => (
                  <TD key={i} className={i === 0 ? "font-medium text-ink" : undefined}>
                    {c}
                  </TD>
                ))}
                <TD className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Edit ${singular}`}>
                      <Pencil />
                    </Button>
                    {deleteAction && r.deletable !== false ? (
                      <ConfirmButton action={() => deleteAction(r.id)} confirm={deleteConfirm ?? `Delete this ${singular}?`} variant="ghost" size="icon-sm" className="text-red-600">
                        <Trash2 />
                      </ConfirmButton>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? `Add ${singular}` : `Edit ${singular}`}>
          <ActionForm key={id ?? "new"} action={saveAction.bind(null, id)} onSuccess={() => setEditing(null)}>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <FieldInput key={f.name} f={f} value={initial[f.name]} />
              ))}
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FieldInput({ f, value }: { f: FieldDef; value: unknown }) {
  const span = f.span === 2 ? "sm:col-span-2" : undefined;
  if (f.type === "checkbox") {
    return (
      <div className={span ?? "flex items-end pb-2"}>
        <Checkbox name={f.name} defaultChecked={value === undefined ? true : Boolean(value)} label={f.label} />
      </div>
    );
  }
  const str = value === undefined || value === null ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return (
    <FormField label={f.label} name={f.name} required={"required" in f ? f.required : false} hint={f.hint} className={span}>
      {f.type === "textarea" ? (
        <Textarea id={f.name} name={f.name} defaultValue={str} rows={3} />
      ) : f.type === "select" ? (
        <Select id={f.name} name={f.name} defaultValue={str}>
          <option value="">{f.placeholder ?? "None"}</option>
          {f.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      ) : (
        <Input id={f.name} name={f.name} type={f.type ?? "text"} defaultValue={str} placeholder={f.placeholder} step={f.step} min={f.min} required={f.required} className={f.type === "color" ? "h-10 w-20 p-1" : undefined} />
      )}
    </FormField>
  );
}
