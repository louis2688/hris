import Link from "next/link";
import { Printer } from "lucide-react";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@hris/shared";
import type { SessionUser } from "@hris/shared";
import { myCases } from "@/server/services/cases";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";
import { ExplanationForm } from "../cases/client";

const dt = (d: Date) => d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** The employee's side of a case: the NTE, their explanation, hearing date and the decision. No HR notes. */
export async function MyCases({ user }: { user: SessionUser }) {
  const cases = await myCases(user);
  return (
    <div className="space-y-6">
      {cases.map((c) => {
        const waiting = c.status === "NTE_ISSUED";
        const overdue = waiting && !!c.nteDueAt && c.nteDueAt < new Date();
        return (
          <Card key={c.id} data-case={c.title}>
            <CardHeader
              title={`Notice to Explain: ${c.title}`}
              description={`${CASE_TYPE_LABELS[c.type]} · Served ${c.nteIssuedAt ? fmtDate(c.nteIssuedAt) : ""}`}
              action={
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={waiting ? (overdue ? "red" : "amber") : c.decided ? "green" : "violet"}>
                    {waiting ? (overdue ? "Explanation overdue" : "Explanation needed") : c.decided ? "Decided" : CASE_STATUS_LABELS[c.status]}
                  </Badge>
                </div>
              }
            />
            <CardBody className="space-y-5">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Charges</p>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{c.nteText}</p>
                {c.nteDueAt ? <p className="mt-2 text-sm text-slate-600">Explanation due {dt(c.nteDueAt)}</p> : null}
              </div>
              {waiting ? (
                <ExplanationForm id={c.id} />
              ) : c.explanation ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Your explanation</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{c.explanation}</p>
                </div>
              ) : null}
              {c.hearingAt ? (
                <p className="text-sm text-slate-800">
                  <span className="font-medium">Hearing:</span> {dt(c.hearingAt)}. You may bring a representative.
                </p>
              ) : null}
              {c.decided && c.decision ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Decision · {c.sanction}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{c.decision}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Link href={`/cases/${c.id}/letter/nte`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <Printer /> NTE letter
                </Link>
                {c.decided ? (
                  <Link href={`/cases/${c.id}/letter/decision`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <Printer /> Notice of Decision
                  </Link>
                ) : null}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
