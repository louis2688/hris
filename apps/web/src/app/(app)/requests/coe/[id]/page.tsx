import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileBadge } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { canDecide, canView, getCoe } from "@/server/services/requests";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { DL } from "@/components/profile";
import { fmtDateTime } from "@/lib/utils";
import { ActionsAside, DetailHeader, EmployeeStrip, shortRef } from "../../_ui/shared";

export const metadata: Metadata = { title: "Certificate request" };

export default async function CoeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getCoe(id).catch(() => null);
  if (!r || !canView(user, "coe", r)) notFound();
  const pending = r.status === "PENDING";

  return (
    <div className="mx-auto max-w-4xl">
      <DetailHeader kind="coe" title="Certificate of employment" description={`Requested ${fmtDateTime(r.createdAt)} · Ref. COE-${shortRef(r.id)}`} status={r.status} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <EmployeeStrip e={r.employee} />
          <div className="px-5 py-4">
            <DL
              items={[
                ["Purpose", r.purpose],
                ["Compensation", r.includeCompensation ? "Included" : "Not included"],
                ...(r.decidedAt ? ([["Decided", fmtDateTime(r.decidedAt)], ...(r.note ? [["HR note", r.note]] : [])] as [string, React.ReactNode][]) : []),
              ]}
            />
          </div>
        </Card>
        <ActionsAside kind="coe" id={r.id} decide={pending && canDecide(user, "coe", r)} cancel={pending && (r.employeeId === user.employeeId || isStaff(user))} decideHint="Approving makes the certificate printable.">
          {r.status === "APPROVED" ? (
            <Card>
              <CardHeader title="Certificate" description="Ready to print or save as PDF." />
              <div className="px-5 py-4">
                <Link href={`/requests/coe/${r.id}/certificate`} className={buttonVariants({ className: "w-full" })}>
                  <FileBadge /> View certificate
                </Link>
              </div>
            </Card>
          ) : null}
        </ActionsAside>
      </div>
    </div>
  );
}
