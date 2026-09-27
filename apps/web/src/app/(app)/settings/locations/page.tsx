import type { Metadata } from "next";
import { listLocations } from "@/server/services/org";
import { deleteLocationAction, saveLocationAction } from "@/server/actions/org";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const rows = await listLocations();
  return (
    <EntityManager
      title="Locations"
      singular="location"
      columns={["Name", "City", "Country", "Timezone", "Geofence", "People"]}
      rows={rows.map((l) => ({
        id: l.id,
        cells: [l.name, l.city ?? "-", l.country ?? "-", l.timezone ?? "-", l.geofenceRadius ? <Badge key="g" tone="green">{l.geofenceRadius} m</Badge> : "-", l._count.employees],
        values: l,
      }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "address", label: "Address", span: 2 },
        { name: "city", label: "City" },
        { name: "country", label: "Country" },
        { name: "timezone", label: "Timezone", placeholder: "Asia/Manila", span: 2 },
        { name: "latitude", label: "Latitude", type: "number", step: "any", placeholder: "14.5547", hint: "Google Maps: right-click the office, click the coordinates to copy" },
        { name: "longitude", label: "Longitude", type: "number", step: "any", placeholder: "121.0244", hint: "Paste the second number here" },
        { name: "geofenceRadius", label: "Geofence radius (m)", type: "number", min: 25, placeholder: "300", hint: "Web and phone punches must be this close when Settings > Attendance requires it. Leave all three blank for no geofence.", span: 2 },
      ]}
      saveAction={saveLocationAction}
      deleteAction={deleteLocationAction}
    />
  );
}
