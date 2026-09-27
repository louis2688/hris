import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@hris/db";
import { gate } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { SurveyBuilder } from "../builder";

export const metadata: Metadata = { title: "New survey" };

export default async function NewSurveyPage() {
  await gate("ADMIN", "HR");
  const departments = await prisma.department.findMany({ where: { employees: { some: { deletedAt: null } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm">
        <Link href="/surveys" className="text-slate-500 hover:text-brand-700">Surveys</Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">New</span>
      </p>
      <PageHeader title="New survey" description="Starts from an eNPS pulse. Saved as a draft; publish it from the results page." />
      <SurveyBuilder departments={departments} />
    </div>
  );
}
