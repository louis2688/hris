import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The record may have been removed or you may not have access.</p>
      <Link href="/dashboard" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
