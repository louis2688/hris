import type { Metadata } from "next";
import Link from "next/link";
import { listHolidays, listLocations } from "@/server/services/org";
import { deleteHolidayAction, saveHolidayAction } from "@/server/actions/org";
import { EntityManager } from "@/components/entity-manager";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: y } = await searchParams;
  const year = Number(y) || new Date().getUTCFullYear();
  const [holidays, locations] = await Promise.all([listHolidays(year), listLocations()]);
  return (
    <EntityManager
      title={`Public holidays ${year}`}
      description="Excluded from leave day counts. Leave the location blank for company-wide holidays."
      singular="holiday"
      columns={["Name", "Date", "Location"]}
      rows={holidays.map((h) => ({ id: h.id, cells: [h.name, fmtDate(h.date, "EEE, d MMM yyyy"), h.location?.name ?? "All locations"], values: { name: h.name, date: h.date, locationId: h.locationId } }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "locationId", label: "Location", type: "select", options: locations.map((l) => ({ id: l.id, name: l.name })), placeholder: "All locations" },
      ]}
      saveAction={saveHolidayAction}
      deleteAction={deleteHolidayAction}
      extra={
        <div className="flex gap-1">
          <Link href={`/settings/holidays?year=${year - 1}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {year - 1}
          </Link>
          <Link href={`/settings/holidays?year=${year + 1}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {year + 1}
          </Link>
        </div>
      }
    />
  );
}
