"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType, type SurveyQuestion } from "@hris/shared";
import { saveSurveyAction } from "@/server/actions/growth";
import { ActionForm, FormField, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";

export type SurveyValues = {
  id?: string;
  title: string;
  description: string | null;
  anonymous: boolean;
  departmentIds: string[];
  opensAt: string;
  closesAt: string;
  questions: SurveyQuestion[];
};

type Q = SurveyQuestion & { optionsText: string };
const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;
const blank = (type: QuestionType, text = ""): Q => ({ id: newId(), type, text, required: true, options: undefined, optionsText: "" });
const ENPS_TEMPLATE = (): Q[] => [
  blank("nps", "How likely are you to recommend working here to a friend?"),
  blank("rating", "How supported do you feel by your manager?"),
  { ...blank("text", "What is one thing we should change?"), required: false },
];

function QuestionErrors() {
  const { fieldErrors } = useFormCtx();
  const msgs = Object.entries(fieldErrors ?? {})
    .filter(([k]) => k.startsWith("questions") || k === "_")
    .map(([k, v]) => `${k.replace(/^questions\.?(\d+)?\.?/, (_m, n) => (n != null ? `Question ${Number(n) + 1}: ` : ""))}${v[0]}`);
  return msgs.length ? (
    <ul className="rounded-xl bg-tone-red-bg px-4 py-3 text-sm text-tone-red-fg" role="alert">
      {msgs.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  ) : null;
}

export function SurveyBuilder({ initial, departments }: { initial?: SurveyValues; departments: { id: string; name: string }[] }) {
  const [qs, setQs] = React.useState<Q[]>(() => (initial?.questions.length ? initial.questions.map((q) => ({ ...q, optionsText: (q.options ?? []).join("\n") })) : ENPS_TEMPLATE()));
  const set = (i: number, patch: Partial<Q>) => setQs((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQs((l) => {
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d]!, n[i]!];
      return n;
    });
  const payload = JSON.stringify(
    qs.map(({ optionsText, ...q }) => ({ ...q, options: q.type === "choice" ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : undefined })),
  );

  return (
    <ActionForm action={saveSurveyAction.bind(null, initial?.id)} successHref={(id: string) => `/surveys/${id}/results`} submitLabel="Save draft">
      <input type="hidden" name="questions" value={payload} />
      <Card>
        <CardHeader title="Basics" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormField label="Title" name="title" required className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={initial?.title} placeholder="e.g. October pulse" />
          </FormField>
          <FormField label="Description" name="description" className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
          </FormField>
          <FormField label="Opens" name="opensAt" hint="Blank = when published">
            <Input id="opensAt" name="opensAt" type="date" defaultValue={initial?.opensAt} />
          </FormField>
          <FormField label="Closes" name="closesAt" hint="Blank = until you close it">
            <Input id="closesAt" name="closesAt" type="date" defaultValue={initial?.closesAt} />
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox name="anonymous" defaultChecked={initial?.anonymous ?? true} label="Anonymous (answers are never linked to names)" />
          </div>
          <FormField label="Audience" name="departmentIds" hint="Nothing ticked = everyone" className="sm:col-span-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {departments.map((d) => (
                <Checkbox key={d.id} name="departmentIds" value={d.id} defaultChecked={initial?.departmentIds.includes(d.id)} label={d.name} />
              ))}
            </div>
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Questions" description={`${qs.length} question${qs.length === 1 ? "" : "s"}`} />
        <ol className="divide-y divide-slate-100">
          {qs.map((q, i) => (
            <li key={q.id} className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bone text-xs font-semibold text-ink">{i + 1}</span>
                <Select value={q.type} onChange={(e) => set(i, { type: e.target.value as QuestionType })} aria-label={`Question ${i + 1} type`} className="h-9 w-auto pl-3 text-sm">
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <span className="flex-1" />
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" className="text-tone-red-fg" disabled={qs.length === 1} onClick={() => setQs((l) => l.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                  <Trash2 />
                </Button>
              </div>
              <Input value={q.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="Question" aria-label={`Question ${i + 1}`} />
              {q.type === "choice" ? (
                <Textarea value={q.optionsText} onChange={(e) => set(i, { optionsText: e.target.value })} rows={3} placeholder={"Options, one per line"} aria-label={`Question ${i + 1} options`} />
              ) : null}
              <Checkbox checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} label="Required" />
            </li>
          ))}
        </ol>
        <CardBody className="flex flex-wrap gap-2 border-t border-slate-100">
          {QUESTION_TYPES.map((t) => (
            <Button key={t} type="button" size="sm" variant="secondary" onClick={() => setQs((l) => [...l, blank(t)])}>
              <Plus /> {QUESTION_TYPE_LABELS[t]}
            </Button>
          ))}
        </CardBody>
      </Card>
      <QuestionErrors />
    </ActionForm>
  );
}
