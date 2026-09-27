import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@hris/db";
import { gate } from "@/server/auth/session";
import { getSurvey } from "@/server/services/surveys";
import { PageHeader } from "@/components/ui/card";
import { SurveyBuilder } from "../../builder";

export const metadata: Metadata = { title: "Edit survey" };

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const [s, departments] = await Promise.all([getSurvey(id).catch(() => null), prisma.department.findMany({ where: { employees: { some: { deletedAt: null } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  if (!s) notFound();
  if (s.status !== "DRAFT") redirect(`/surveys/${id}/results`);
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm">
        <Link href="/surveys" className="text-slate-500 hover:text-brand-700">Surveys</Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{s.title}</span>
      </p>
      <PageHeader title="Edit survey" description="Drafts can change freely. Once published, questions are locked." />
      <SurveyBuilder
        departments={departments}
        initial={{ id: s.id, title: s.title, description: s.description, anonymous: s.anonymous, departmentIds: s.departmentIds, opensAt: day(s.opensAt), closesAt: day(s.closesAt), questions: s.questionList }}
      />
    </div>
  );
}
