import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HRIS", template: "%s · HRIS" },
  description: "Human resources management",
  applicationName: "HRIS",
  appleWebApp: { capable: true, title: "HRIS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1b5ef5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
