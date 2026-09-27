import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { gate } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import attendance" };

export default async function ImportPage() {
  await gate("HR", "ADMIN");
  return (
    <>
      <PageHeader
        title="Import attendance"
        description="Upload a CSV or a ZKTeco ATTLOG export. Check the preview, then import. Punches already on file are skipped."
        actions={
          <Link href="/attendance/team" className={buttonVariants({ variant: "secondary" })}>
            <ChevronLeft /> Team attendance
          </Link>
        }
      />
      <Importer />
    </>
  );
}
