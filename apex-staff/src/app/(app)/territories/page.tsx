import { requireStaff } from "@/lib/staff/auth";
import type { Territory } from "@/lib/staff/geo";
import { PageHeader, Card } from "@/components/staff/ui";
import { TerritoryMap } from "@/components/staff/TerritoryMap";

export const metadata = { title: "Territory map | Apex Team" };

export default async function TerritoriesPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.from("territories").select("*").eq("active", true).order("name");
  const territories = ((data ?? []) as Territory[]).map((t) => ({ ...t, lat: Number(t.lat), lng: Number(t.lng) }));

  return (
    <>
      <PageHeader
        title="Territory map"
        subtitle="Each client has an exclusive radius around their postcode. Check a lead's postcode here before booking them in."
      />
      <Card>
        <TerritoryMap territories={territories} />
      </Card>
    </>
  );
}
