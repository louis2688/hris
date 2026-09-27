import { KeyRound, Link2 } from "lucide-react";
import { unlinkIdentityAction } from "@/server/actions/auth";
import { ConfirmButton } from "@/components/action-form";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/utils";

const NAMES: Record<string, string> = { google: "Google", microsoft: "Microsoft" };

/** Linked Google / Microsoft identities. Password sign-in always stays available, so any link can be removed. */
export function SignInMethods({ identities }: { identities: { id: string; provider: string; createdAt: Date }[] }) {
  return (
    <Card>
      <CardHeader title="Sign-in methods" description="Your password always works. Google or Microsoft accounts get linked the first time you use them to sign in." />
      <ul className="divide-y divide-slate-100">
        <li className="flex items-center gap-3 px-5 py-3">
          <KeyRound className="size-5 text-slate-400" />
          <p className="flex-1 text-sm font-medium">Email and password</p>
        </li>
        {identities.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-5 py-3">
            <Link2 className="size-5 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{NAMES[i.provider] ?? i.provider}</p>
              <p className="text-xs text-slate-500">Linked {fmtDateTime(i.createdAt)}</p>
            </div>
            <ConfirmButton action={unlinkIdentityAction.bind(null, i.id)} confirm={`Disconnect ${NAMES[i.provider] ?? i.provider}? You can still sign in with your password.`} variant="secondary" size="sm">
              Disconnect
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </Card>
  );
}
