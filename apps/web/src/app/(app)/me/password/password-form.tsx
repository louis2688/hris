"use client";

import { changePasswordAction } from "@/server/actions/auth";
import { ActionForm, FormField } from "@/components/action-form";
import { Input } from "@/components/ui/input";

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} submitLabel="Update password" resetOnSuccess>
      <FormField label="Current password" name="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </FormField>
      <FormField label="New password" name="newPassword" required hint="At least 10 characters with upper, lower case and a number">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField label="Confirm new password" name="confirmPassword" required>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </FormField>
    </ActionForm>
  );
}
