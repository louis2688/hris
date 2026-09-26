"use client";

import * as React from "react";
import { ROLES, ROLE_LABELS, type Role } from "@hris/shared";
import { createUserAccountAction, updateUserAccountAction } from "@/server/actions/employees";
import { ActionForm, FormField } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/utils";

type Account = { id: string; email: string; role: Role; isActive: boolean; lastLoginAt: Date | null } | null;

export function AccountPanel({ employeeId, account, defaultEmail, isSelf, isAdmin }: { employeeId: string; account: Account; defaultEmail: string; isSelf: boolean; isAdmin: boolean }) {
  const [generated, setGenerated] = React.useState<string | null>(null);

  if (!account) {
    return (
      <Card>
        <CardHeader title="Login account" description="This employee cannot sign in yet." />
        <CardBody>
          {!isAdmin ? (
            <p className="text-sm text-slate-500">Only administrators can create accounts.</p>
          ) : (
            <ActionForm action={createUserAccountAction.bind(null, employeeId)} submitLabel="Create account" onSuccess={(d: { initialPassword: string }) => setGenerated(d.initialPassword)}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Login email" name="email" required>
                  <Input id="email" name="email" type="email" defaultValue={defaultEmail} required />
                </FormField>
                <FormField label="Role" name="role">
                  <Select id="role" name="role" defaultValue="EMPLOYEE">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Password" name="password" hint="Blank = generate">
                  <Input id="password" name="password" autoComplete="off" />
                </FormField>
              </div>
            </ActionForm>
          )}
          {generated ? <PasswordReveal pw={generated} /> : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Login account" description={`Last sign-in: ${account.lastLoginAt ? fmtDateTime(account.lastLoginAt) : "never"}`} />
      <CardBody>
        {!isAdmin ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-slate-500">Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Role</dt>
              <dd>{ROLE_LABELS[account.role]}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Status</dt>
              <dd>{account.isActive ? "Active" : "Disabled"}</dd>
            </div>
          </dl>
        ) : (
          <ActionForm action={updateUserAccountAction.bind(null, employeeId)} submitLabel="Update account">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Login email" name="_email">
                <Input value={account.email} disabled />
              </FormField>
              <FormField label="Role" name="role">
                <Select id="role" name="role" defaultValue={account.role} disabled={isSelf}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                {isSelf ? <input type="hidden" name="role" value={account.role} /> : null}
              </FormField>
              <FormField label="Reset password" name="resetPassword" hint="Leave blank to keep">
                <Input id="resetPassword" name="resetPassword" autoComplete="new-password" />
              </FormField>
            </div>
            <Checkbox name="isActive" defaultChecked={account.isActive} disabled={isSelf} label="Account enabled" />
            {isSelf ? <input type="hidden" name="isActive" value="true" /> : null}
          </ActionForm>
        )}
      </CardBody>
    </Card>
  );
}

function PasswordReveal({ pw }: { pw: string }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="font-medium text-amber-800">Account created. Share this temporary password now, it will not be shown again.</p>
      <p className="mt-2 select-all font-mono text-base font-semibold">{pw}</p>
    </div>
  );
}
