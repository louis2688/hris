import { cn, initials } from "@/lib/utils";

export function Avatar({ first, last, src, size = "md", className }: { first: string; last: string; src?: string | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" };
  const px = { sm: 28, md: 36, lg: 48, xl: 80 }[size];
  // ponytail: <img> not next/image; avatars are optional external URLs, no need for the optimizer config.
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${first} ${last}`} width={px} height={px} loading="lazy" decoding="async" className={cn("shrink-0 rounded-full object-cover", sizes[size], className)} />
  ) : (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-bone font-semibold text-ink ring-1 ring-hairline", sizes[size], className)} aria-hidden>
      {initials(first, last)}
    </span>
  );
}
