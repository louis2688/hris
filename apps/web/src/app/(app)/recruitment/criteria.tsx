"use client";

import * as React from "react";
import { criteriaAction } from "@/server/actions/recruitment";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

/** HR-only: the criteria every interview scorecard asks for. */
export function CriteriaCard({ criteria }: { criteria: string[] }) {
  const [editing, setEditing] = React.useState(false);
  return (
    <Card className="h-fit">
      <CardHeader
        title="Scorecard criteria"
        description="Rated 1 to 5 per interview"
        action={
          editing ? null : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      />
      <div className="px-5 py-4">
        {editing ? (
          <ActionForm
            action={criteriaAction}
            onSuccess={() => setEditing(false)}
            footer={
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            }
          >
            <FormField label="Criteria" name="criteria" hint="One per line, up to 10">
              <Textarea id="criteria" name="criteria" rows={6} defaultValue={criteria.join("\n")} />
            </FormField>
          </ActionForm>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {criteria.map((c) => (
              <li key={c} className="rounded-full bg-bone px-3 py-1 text-xs font-medium text-slate-700">
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
