import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">Ask your HR administrator if you think this is a mistake.</p>
      <Link href="/dashboard" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
