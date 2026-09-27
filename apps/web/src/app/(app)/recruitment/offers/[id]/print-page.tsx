import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";

/** A4 sheet with a back link and print button, same print CSS as the COE certificate. */
export function PrintPage({ back, children }: { back: string; children: React.ReactNode }) {
  return (
    <div>
      <style>{`@page { size: A4; margin: 18mm 20mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft /> Back to candidate
        </Link>
        <PrintButton label="Print / Save as PDF" />
      </div>
      <article className="mx-auto w-full max-w-[210mm] bg-card px-6 py-8 shadow-float sm:min-h-[297mm] sm:px-[20mm] sm:py-[18mm] print:min-h-0 print:max-w-none print:p-0 print:shadow-none">{children}</article>
    </div>
  );
}
