"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// ponytail: browser print-to-PDF; no PDF library needed.
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer /> {label}
    </Button>
  );
}
