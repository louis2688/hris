import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { aiProvider } from "@/server/ai";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "HR assistant" };

export default async function AssistantPage() {
  const user = await gate("ADMIN", "HR", "MANAGER", "EMPLOYEE");
  const provider = aiProvider();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="HR assistant" description="Ask about your own leave, holidays, attendance, payslips, policies and profile." />
      {provider ? (
        <Chat firstName={user.name.split(" ")[0] ?? ""} mock={provider === "mock"} />
      ) : (
        <Card>
          <EmptyState title="AI is not configured" description="Ask an admin to set ANTHROPIC_API_KEY to turn on the HR assistant." />
        </Card>
      )}
    </div>
  );
}
