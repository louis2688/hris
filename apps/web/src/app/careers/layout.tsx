import { getSetting } from "@/server/services/settings";
import { PublicShell } from "./public-shell";

export default async function CareersLayout({ children }: { children: React.ReactNode }) {
  const company = await getSetting("company");
  return <PublicShell company={company.name}>{children}</PublicShell>;
}
