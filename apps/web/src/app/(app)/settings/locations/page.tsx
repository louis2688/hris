import type { Metadata } from "next";
import { listLocations } from "@/server/services/org";
import { deleteLocationAction, saveLocationAction } from "@/server/actions/org";
import { EntityManager } from "@/components/entity-manager";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const rows = await listLocations();
  return (
    <EntityManager
      title="Locations"
      singular="location"
      columns={["Name", "City", "Country", "Timezone", "People"]}
      rows={rows.map((l) => ({ id: l.id, cells: [l.name, l.city ?? "-", l.country ?? "-", l.timezone ?? "-", l._count.employees], values: l }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "address", label: "Address", span: 2 },
        { name: "city", label: "City" },
        { name: "country", label: "Country" },
        { name: "timezone", label: "Timezone", placeholder: "Asia/Manila", span: 2 },
      ]}
      saveAction={saveLocationAction}
      deleteAction={deleteLocationAction}
    />
  );
}
