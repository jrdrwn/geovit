import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Explorer from "@/components/explorer";
import { db } from "@/lib/db";
import { locations } from "@/lib/schema";
import { seedLocations } from "@/lib/data";
export default async function LocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exists = db
    ? (
        await db
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.id, id))
          .limit(1)
      ).length
    : seedLocations.some((l) => l.id === id);
  if (!exists) notFound();
  return <Explorer locationId={id} />;
}
