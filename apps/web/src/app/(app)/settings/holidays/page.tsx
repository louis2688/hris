import type { Metadata } from "next";
import Link from "next/link";
import { HOLIDAY_TYPE_LABELS } from "@hris/shared";
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
      description="Excluded from leave day counts. The type sets the holiday pay rule in payroll. Leave the location blank for company-wide holidays."
      singular="holiday"
      columns={["Name", "Date", "Type", "Location"]}
      rows={holidays.map((h) => ({ id: h.id, cells: [h.name, fmtDate(h.date, "EEE, d MMM yyyy"), HOLIDAY_TYPE_LABELS[h.type], h.location?.name ?? "All locations"], values: { name: h.name, date: h.date, type: h.type === "REGULAR" ? "" : h.type, locationId: h.locationId } }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "date", label: "Date", type: "date", required: true },
        // ponytail: EntityManager selects always render an empty option, so it stands for REGULAR.
        { name: "type", label: "Type", type: "select", placeholder: HOLIDAY_TYPE_LABELS.REGULAR, options: [{ id: "SPECIAL_NON_WORKING", name: HOLIDAY_TYPE_LABELS.SPECIAL_NON_WORKING }, { id: "SPECIAL_WORKING", name: HOLIDAY_TYPE_LABELS.SPECIAL_WORKING }] },
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
