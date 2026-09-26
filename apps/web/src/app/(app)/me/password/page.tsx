import type { Metadata } from "next";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" description="Signing out other devices happens automatically." />
      <Card>
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
