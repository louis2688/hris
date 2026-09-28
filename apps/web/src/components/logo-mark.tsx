import { cn } from "@/lib/utils";

/** Ugnayo mark: a person (dot over a U). Same artwork as app/icon.svg; keep them in sync. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#ea2804" />
      <circle cx="16" cy="9" r="3.2" fill="#fff" />
      <path d="M8.5 14.5v3a7.5 7.5 0 0 0 15 0v-3" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
