import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { KindListPage } from "../_ui/list-page";

export const metadata: Metadata = { title: "Loans" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <KindListPage user={await requireSession()} kind="loans" tab={(await searchParams).tab} />;
}
