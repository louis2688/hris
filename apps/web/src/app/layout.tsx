import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Toaster } from "sonner";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ugnayo", template: "%s · Ugnayo" },
  description: "Human resources management",
  applicationName: "Ugnayo",
  appleWebApp: { capable: true, title: "Ugnayo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Explicit choice comes from the cookie; no cookie = follow the OS (decided by the inline script).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const nonce = (await headers()).get("x-nonce") ?? undefined; // set by proxy.ts for the CSP
  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
